# DynamoDB Idempotency Store Design

## Purpose

Add DynamoDB as a storage backend for AWS serverless deployments. SQLite serves single-server deployments, Redis serves multi-server deployments, and DynamoDB serves AWS cloud-native applications needing serverless scale and global reach.

## Use Cases

- **Serverless deployments**: AWS Lambda functions requiring idempotency without managing infrastructure
- **Global applications**: DynamoDB Global Tables for multi-region active-active deployments
- **AWS-native stacks**: Teams already using DynamoDB wanting consistency across services
- **Auto-scaling workloads**: Applications needing pay-per-request billing and automatic scaling

## Architecture

**DynamoDbIdempotencyStore** implements the `IdempotencyStore` interface using AWS SDK v3. Users create and configure DynamoDBDocumentClient, then pass it to the store. This gives users full control over credentials, region, endpoint configuration, and client settings.

### Data Model

**Table Structure:**
```
Table Name: idempotency-records (default, configurable)

Primary Key:
  key (String, Partition Key)

Attributes:
  key (String) - Idempotency key
  fingerprint (String) - Request fingerprint for duplicate detection
  status (String) - "processing" or "complete"
  responseStatus (Number) - HTTP status code (optional)
  responseHeaders (Map) - Response headers (optional)
  responseBody (String) - Response body (optional)
  expiresAt (Number) - Unix timestamp in seconds (TTL attribute)

Global Secondary Index:
  Name: fingerprint-index
  Partition Key: fingerprint (String)
  Projection: ALL
```

### TTL Strategy

DynamoDB native TTL deletes expired items automatically (within 48 hours). The store filters expired records during lookup by checking the `expiresAt` timestamp, ensuring expired records are never returned even if not yet deleted by DynamoDB.

**Cleanup method**: No-op. DynamoDB TTL handles deletion automatically.

## API Design

### Constructor

```typescript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

interface DynamoDbIdempotencyStoreOptions {
  client: DynamoDBDocumentClient;
  tableName?: string; // Default: "idempotency-records"
}

const client = new DynamoDBClient({ region: "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client);

const store = new DynamoDbIdempotencyStore({
  client: docClient,
  tableName: "my-idempotency-table"
});
```

Users manage the DynamoDB client lifecycle. The store does not call cleanup methods. No `close()` method needed (or make it a no-op for parity with other stores).

### Operations

**lookup(key, fingerprint)**

Executes parallel operations for performance:
```typescript
const [byKeyResult, byFingerprintResult] = await Promise.all([
  docClient.get({
    TableName: this.tableName,
    Key: { key }
  }),
  docClient.query({
    TableName: this.tableName,
    IndexName: "fingerprint-index",
    KeyConditionExpression: "fingerprint = :fp",
    ExpressionAttributeValues: { ":fp": fingerprint }
  })
]);
```

Filters expired records by checking `expiresAt < Date.now()`. Returns both parsed records or null.

**startProcessing(key, fingerprint, ttlMs)**

Creates record with TTL:
```typescript
const expiresAt = Math.floor((Date.now() + ttlMs) / 1000); // DynamoDB uses seconds

await docClient.put({
  TableName: this.tableName,
  Item: {
    key,
    fingerprint,
    status: "processing",
    expiresAt
  }
});
```

**complete(key, response)**

Updates existing record using conditional update:
```typescript
await docClient.update({
  TableName: this.tableName,
  Key: { key },
  UpdateExpression: "SET #status = :status, responseStatus = :rs, responseHeaders = :rh, responseBody = :rb",
  ExpressionAttributeNames: { "#status": "status", "#key": "key" },
  ExpressionAttributeValues: {
    ":status": "complete",
    ":rs": response.status,
    ":rh": response.headers,
    ":rb": response.body
  },
  ConditionExpression: "attribute_exists(#key)"
});
```

Throws error if condition fails (record missing).

**cleanup()**

No-op. DynamoDB TTL handles cleanup automatically.

## Error Handling

- **Missing key on complete()**: Catch `ConditionalCheckFailedException`, throw explicit error matching SQLite/Redis behavior: `throw new Error('No record found for key: ${key}')`
- **Network failures**: SDK errors bubble up for middleware to handle
- **Table doesn't exist**: `ResourceNotFoundException` bubbles up - user must create table
- **Expired records**: Application-level filtering checks `expiresAt < Date.now()` during lookup

Users handle client errors (credentials, throttling, retries) through DynamoDB client configuration.

## Dependencies

**package.json changes:**
```json
"peerDependencies": {
  "hono": ">=4.0.0",
  "ioredis": ">=5.0.0",
  "@aws-sdk/client-dynamodb": ">=3.0.0",
  "@aws-sdk/lib-dynamodb": ">=3.0.0"
},
"peerDependenciesMeta": {
  "ioredis": { "optional": true },
  "@aws-sdk/client-dynamodb": { "optional": true },
  "@aws-sdk/lib-dynamodb": { "optional": true }
}
```

**devDependencies:**
- Add `@aws-sdk/client-dynamodb` for testing
- Add `@aws-sdk/lib-dynamodb` for testing
- Add `aws-sdk-client-mock` for unit tests without real DynamoDB

## Testing Strategy

Use `aws-sdk-client-mock` for unit tests. No real DynamoDB or Docker required.

**Test coverage:**
- Initialization with user client and table name
- Lookup (empty, by key, by fingerprint, both)
- startProcessing creates record with TTL
- complete updates record
- complete throws on missing key (ConditionalCheckFailedException)
- Expiration filtering (records with expiresAt in past are filtered out)
- GSI query for fingerprint lookup
- Custom table name configuration

**Example test:**
```typescript
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, GetCommand, QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

test("DynamoDbIdempotencyStore - startProcessing creates record", async (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);
  ddbMock.on(PutCommand).resolves({});
  ddbMock.on(GetCommand).resolves({
    Item: {
      key: "test-key",
      fingerprint: "test-fp",
      status: "processing",
      expiresAt: Math.floor((Date.now() + 60000) / 1000)
    }
  });

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock as any,
    tableName: "test-table"
  });

  await store.startProcessing("test-key", "test-fp", 60000);
  const result = await store.lookup("test-key", "test-fp");

  t.ok(result.byKey);
  t.equal(result.byKey.status, "processing");
});
```

## Table Setup

Users must create the DynamoDB table before use. The store does not auto-create tables (requires permissions and has cost implications).

**CloudFormation example:**
```yaml
IdempotencyTable:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: idempotency-records
    AttributeDefinitions:
      - AttributeName: key
        AttributeType: S
      - AttributeName: fingerprint
        AttributeType: S
    KeySchema:
      - AttributeName: key
        KeyType: HASH
    GlobalSecondaryIndexes:
      - IndexName: fingerprint-index
        KeySchema:
          - AttributeName: fingerprint
            KeyType: HASH
        Projection:
          ProjectionType: ALL
    BillingMode: PAY_PER_REQUEST
    TimeToLiveSpecification:
      AttributeName: expiresAt
      Enabled: true
```

**Terraform example:**
```hcl
resource "aws_dynamodb_table" "idempotency" {
  name           = "idempotency-records"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "key"

  attribute {
    name = "key"
    type = "S"
  }

  attribute {
    name = "fingerprint"
    type = "S"
  }

  global_secondary_index {
    name            = "fingerprint-index"
    hash_key        = "fingerprint"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
}
```

## Example Application

```typescript
// examples/dynamodb-app.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { Hono } from "hono";
import { idempotency, DynamoDbIdempotencyStore } from "hono-idempotency";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1"
});
const docClient = DynamoDBDocumentClient.from(client);

const store = new DynamoDbIdempotencyStore({
  client: docClient,
  tableName: process.env.DYNAMODB_TABLE || "idempotency-records"
});

const app = new Hono();

app.post("/orders", idempotency({ store }), async (c) => {
  const body = await c.req.json();
  const orderId = Math.random().toString(36).substring(7);

  return c.json({ id: orderId, status: "created", ...body }, 201);
});

export default app;
```

## Documentation Updates

**README.md**: Add DynamoDB section after Redis showing serverless AWS setup with SDK v3.

**IMPLEMENTATION_SUMMARY.md**: Add DynamoDbIdempotencyStore to components list.

**New file: docs/dynamodb-setup.md**: Detailed guide with CloudFormation, Terraform, CDK, and AWS CLI examples for table creation and TTL configuration.

## Trade-offs

**Pros:**
- Fully managed, serverless infrastructure
- Auto-scaling with pay-per-request billing
- Global Tables for multi-region deployments
- Native TTL for automatic cleanup (no application code needed)
- GSI provides efficient fingerprint lookups
- DocumentClient eliminates marshalling code

**Cons:**
- Requires AWS account and credentials
- TTL deletion is eventual (up to 48 hours delay)
- GSI increases storage costs (2x data for projected attributes)
- Network latency vs. SQLite's local storage
- Must manually create table and enable TTL

**Cost Considerations:**
- Pay-per-request: $1.25 per million write requests, $0.25 per million read requests
- GSI adds storage costs but no additional read/write costs with ALL projection
- TTL deletion is free

## Non-Goals

- No automatic table creation (requires permissions, can be expensive)
- No table migration utilities (users manage via IaC)
- No DynamoDB Streams integration (YAGNI)
- No support for provisioned capacity mode (pay-per-request is simpler)
- No cross-region replication setup (users configure Global Tables separately)
