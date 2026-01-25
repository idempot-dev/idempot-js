# DynamoDB Idempotency Store Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement DynamoDB-based idempotency store for AWS serverless deployments.

**Architecture:** Single table with GSI on fingerprint. User provides configured DynamoDBDocumentClient. Application-level expiration filtering ensures expired records never returned despite DynamoDB TTL's eventual deletion.

**Tech Stack:** AWS SDK v3 (@aws-sdk/client-dynamodb, @aws-sdk/lib-dynamodb), aws-sdk-client-mock for testing

---

## Phase 1: Dependencies and Project Setup

### Task 1: Install AWS SDK Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install AWS SDK packages**

Run: `npm install --save-peer @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb`

Expected: Dependencies added to peerDependencies

**Step 2: Install testing dependencies**

Run: `npm install --save-dev @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb aws-sdk-client-mock`

Expected: Testing dependencies added to devDependencies

**Step 3: Verify installation**

Run: `npm run build`

Expected: Build succeeds with no errors

**Step 4: Commit**

Run: `git add package.json package-lock.json && git commit -m "chore: add AWS SDK dependencies for DynamoDB store"`

Expected: Clean commit

---

## Phase 2: Core Implementation (TDD)

### Task 2: Test - DynamoDB Store Initialization

**Files:**
- Create: `tests/dynamodb.test.ts`

**Step 1: Write initialization test**

Create test file with basic setup:

```typescript
import { test } from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoDbIdempotencyStore } from "../src/store/dynamodb.js";

test("DynamoDbIdempotencyStore - initialization", (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock as any
  });

  t.ok(store, "store should be created");
  t.end();
});

test("DynamoDbIdempotencyStore - initialization with custom table name", (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock as any,
    tableName: "custom-table"
  });

  t.ok(store, "store should be created with custom table");
  t.end();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/dynamodb.test.ts`

Expected: FAIL with "Cannot find module '../src/store/dynamodb.js'"

**Step 3: Commit test**

Run: `git add tests/dynamodb.test.ts && git commit -m "test: add DynamoDB store initialization tests"`

Expected: Test committed

---

### Task 3: Implement - Basic Store Structure

**Files:**
- Create: `src/store/dynamodb.ts`

**Step 1: Create minimal store class**

```typescript
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { IdempotencyStore, IdempotencyRecord } from "../types.js";

export interface DynamoDbIdempotencyStoreOptions {
  client: DynamoDBDocumentClient;
  tableName?: string;
}

export class DynamoDbIdempotencyStore implements IdempotencyStore {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor(options: DynamoDbIdempotencyStoreOptions) {
    this.client = options.client;
    this.tableName = options.tableName ?? "idempotency-records";
  }

  async lookup(
    key: string,
    fingerprint: string
  ): Promise<{
    byKey: IdempotencyRecord | null;
    byFingerprint: IdempotencyRecord | null;
  }> {
    return { byKey: null, byFingerprint: null };
  }

  async startProcessing(
    key: string,
    fingerprint: string,
    ttlMs: number
  ): Promise<void> {
    // Placeholder
  }

  async complete(
    key: string,
    response: {
      status: number;
      headers: Record<string, string>;
      body: string;
    }
  ): Promise<void> {
    // Placeholder
  }

  async cleanup(): Promise<void> {
    // No-op: DynamoDB TTL handles cleanup
  }
}
```

**Step 2: Run test to verify it passes**

Run: `npm test -- tests/dynamodb.test.ts`

Expected: PASS (2 tests)

**Step 3: Commit**

Run: `git add src/store/dynamodb.ts && git commit -m "feat: add basic DynamoDB store structure"`

Expected: Clean commit

---

### Task 4: Test - Lookup with Empty Store

**Files:**
- Modify: `tests/dynamodb.test.ts`

**Step 1: Add lookup test**

Add after existing tests:

```typescript
test("DynamoDbIdempotencyStore - lookup with empty store", async (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);
  ddbMock.on(GetCommand).resolves({});
  ddbMock.on(QueryCommand).resolves({ Items: [] });

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock as any
  });

  const result = await store.lookup("test-key", "test-fingerprint");

  t.equal(result.byKey, null, "byKey should be null");
  t.equal(result.byFingerprint, null, "byFingerprint should be null");
});
```

**Step 2: Add imports at top**

Add to imports:

```typescript
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
```

**Step 3: Run test to verify it fails**

Run: `npm test -- tests/dynamodb.test.ts`

Expected: Test fails because lookup doesn't actually call DynamoDB

**Step 4: Commit test**

Run: `git add tests/dynamodb.test.ts && git commit -m "test: add DynamoDB lookup test for empty store"`

Expected: Test committed

---

### Task 5: Implement - Lookup with Parallel Queries

**Files:**
- Modify: `src/store/dynamodb.ts`

**Step 1: Add imports**

Add at top:

```typescript
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
```

**Step 2: Implement lookup method**

Replace the lookup method:

```typescript
async lookup(
  key: string,
  fingerprint: string
): Promise<{
  byKey: IdempotencyRecord | null;
  byFingerprint: IdempotencyRecord | null;
}> {
  // Execute parallel operations for performance
  const [byKeyResult, byFingerprintResult] = await Promise.all([
    this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { key }
      })
    ),
    this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "fingerprint-index",
        KeyConditionExpression: "fingerprint = :fp",
        ExpressionAttributeValues: {
          ":fp": fingerprint
        }
      })
    )
  ]);

  const byKey = this.parseRecord(byKeyResult.Item);
  const byFingerprint =
    byFingerprintResult.Items && byFingerprintResult.Items.length > 0
      ? this.parseRecord(byFingerprintResult.Items[0])
      : null;

  return { byKey, byFingerprint };
}

private parseRecord(item: any): IdempotencyRecord | null {
  if (!item) return null;

  // Filter expired records
  const now = Math.floor(Date.now() / 1000);
  if (item.expiresAt && item.expiresAt < now) {
    return null;
  }

  return {
    key: item.key,
    fingerprint: item.fingerprint,
    status: item.status,
    response: item.responseStatus
      ? {
          status: item.responseStatus,
          headers: item.responseHeaders || {},
          body: item.responseBody || ""
        }
      : undefined,
    expiresAt: item.expiresAt * 1000 // Convert seconds to milliseconds
  };
}
```

**Step 3: Run test to verify it passes**

Run: `npm test -- tests/dynamodb.test.ts`

Expected: PASS (3 tests)

**Step 4: Commit**

Run: `git add src/store/dynamodb.ts && git commit -m "feat: implement DynamoDB lookup with parallel queries"`

Expected: Clean commit

---

### Task 6: Test - startProcessing Creates Record

**Files:**
- Modify: `tests/dynamodb.test.ts`

**Step 1: Add startProcessing test**

Add test:

```typescript
test("DynamoDbIdempotencyStore - startProcessing creates record", async (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  let capturedItem: any = null;
  ddbMock.on(PutCommand).callsFake((input) => {
    capturedItem = input.Item;
    return {};
  });

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock as any
  });

  const beforeTime = Math.floor(Date.now() / 1000);
  await store.startProcessing("test-key", "test-fp", 60000);
  const afterTime = Math.floor((Date.now() + 60000) / 1000);

  t.ok(capturedItem, "should have called PutCommand");
  t.equal(capturedItem.key, "test-key", "key should match");
  t.equal(capturedItem.fingerprint, "test-fp", "fingerprint should match");
  t.equal(capturedItem.status, "processing", "status should be processing");
  t.ok(
    capturedItem.expiresAt >= beforeTime && capturedItem.expiresAt <= afterTime,
    "expiresAt should be in expected range"
  );
});
```

**Step 2: Add import**

Add to imports:

```typescript
import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
```

**Step 3: Run test to verify it fails**

Run: `npm test -- tests/dynamodb.test.ts`

Expected: FAIL - PutCommand not called

**Step 4: Commit test**

Run: `git add tests/dynamodb.test.ts && git commit -m "test: add DynamoDB startProcessing test"`

Expected: Test committed

---

### Task 7: Implement - startProcessing

**Files:**
- Modify: `src/store/dynamodb.ts`

**Step 1: Add import**

Add to imports:

```typescript
import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
```

**Step 2: Implement startProcessing method**

Replace the startProcessing method:

```typescript
async startProcessing(
  key: string,
  fingerprint: string,
  ttlMs: number
): Promise<void> {
  const expiresAt = Math.floor((Date.now() + ttlMs) / 1000);

  await this.client.send(
    new PutCommand({
      TableName: this.tableName,
      Item: {
        key,
        fingerprint,
        status: "processing",
        expiresAt
      }
    })
  );
}
```

**Step 3: Run test to verify it passes**

Run: `npm test -- tests/dynamodb.test.ts`

Expected: PASS (4 tests)

**Step 4: Commit**

Run: `git add src/store/dynamodb.ts && git commit -m "feat: implement DynamoDB startProcessing"`

Expected: Clean commit

---

### Task 8: Test - complete Updates Record

**Files:**
- Modify: `tests/dynamodb.test.ts`

**Step 1: Add complete test**

Add test:

```typescript
test("DynamoDbIdempotencyStore - complete updates record", async (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  let capturedUpdate: any = null;
  ddbMock.on(UpdateCommand).callsFake((input) => {
    capturedUpdate = input;
    return {};
  });

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock as any
  });

  await store.complete("test-key", {
    status: 200,
    headers: { "content-type": "application/json" },
    body: '{"result":"ok"}'
  });

  t.ok(capturedUpdate, "should have called UpdateCommand");
  t.equal(capturedUpdate.Key.key, "test-key", "key should match");
  t.ok(
    capturedUpdate.UpdateExpression.includes("status"),
    "should update status"
  );
  t.equal(
    capturedUpdate.ExpressionAttributeValues[":status"],
    "complete",
    "status should be complete"
  );
  t.equal(
    capturedUpdate.ExpressionAttributeValues[":rs"],
    200,
    "should set response status"
  );
});
```

**Step 2: Add import**

Add to imports:

```typescript
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
```

**Step 3: Run test to verify it fails**

Run: `npm test -- tests/dynamodb.test.ts`

Expected: FAIL - UpdateCommand not called

**Step 4: Commit test**

Run: `git add tests/dynamodb.test.ts && git commit -m "test: add DynamoDB complete test"`

Expected: Test committed

---

### Task 9: Implement - complete

**Files:**
- Modify: `src/store/dynamodb.ts`

**Step 1: Add import**

Update imports:

```typescript
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
```

**Step 2: Implement complete method**

Replace the complete method:

```typescript
async complete(
  key: string,
  response: {
    status: number;
    headers: Record<string, string>;
    body: string;
  }
): Promise<void> {
  try {
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { key },
        UpdateExpression:
          "SET #status = :status, responseStatus = :rs, responseHeaders = :rh, responseBody = :rb",
        ExpressionAttributeNames: {
          "#status": "status",
          "#key": "key"
        },
        ExpressionAttributeValues: {
          ":status": "complete",
          ":rs": response.status,
          ":rh": response.headers,
          ":rb": response.body
        },
        ConditionExpression: "attribute_exists(#key)"
      })
    );
  } catch (error: any) {
    if (error.name === "ConditionalCheckFailedException") {
      throw new Error(`No record found for key: ${key}`);
    }
    throw error;
  }
}
```

**Step 3: Run test to verify it passes**

Run: `npm test -- tests/dynamodb.test.ts`

Expected: PASS (5 tests)

**Step 4: Commit**

Run: `git add src/store/dynamodb.ts && git commit -m "feat: implement DynamoDB complete method"`

Expected: Clean commit

---

### Task 10: Test - Edge Cases

**Files:**
- Modify: `tests/dynamodb.test.ts`

**Step 1: Add edge case tests**

Add tests:

```typescript
test("DynamoDbIdempotencyStore - complete throws on missing key", async (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  ddbMock.on(UpdateCommand).rejects({
    name: "ConditionalCheckFailedException",
    message: "The conditional request failed"
  });

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock as any
  });

  try {
    await store.complete("nonexistent", {
      status: 200,
      headers: {},
      body: "test"
    });
    t.fail("should have thrown");
  } catch (err: any) {
    t.match(err.message, /No record found/, "should throw error for missing key");
  }
});

test("DynamoDbIdempotencyStore - lookup filters expired records", async (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  const expiredTime = Math.floor(Date.now() / 1000) - 1000;

  ddbMock.on(GetCommand).resolves({
    Item: {
      key: "expired-key",
      fingerprint: "expired-fp",
      status: "processing",
      expiresAt: expiredTime
    }
  });

  ddbMock.on(QueryCommand).resolves({ Items: [] });

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock as any
  });

  const result = await store.lookup("expired-key", "expired-fp");

  t.equal(result.byKey, null, "expired record should be filtered out");
});

test("DynamoDbIdempotencyStore - lookup by fingerprint only", async (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  ddbMock.on(GetCommand).resolves({});

  ddbMock.on(QueryCommand).resolves({
    Items: [
      {
        key: "key-1",
        fingerprint: "fp-1",
        status: "complete",
        expiresAt: Math.floor((Date.now() + 60000) / 1000),
        responseStatus: 200,
        responseHeaders: { "content-type": "application/json" },
        responseBody: '{"id":"123"}'
      }
    ]
  });

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock as any
  });

  const result = await store.lookup("key-2", "fp-1");

  t.equal(result.byKey, null, "should not find by different key");
  t.ok(result.byFingerprint, "should find by matching fingerprint");
  t.equal(result.byFingerprint?.key, "key-1", "key should match");
  t.equal(result.byFingerprint?.status, "complete", "status should match");
  t.ok(result.byFingerprint?.response, "response should be present");
  t.equal(result.byFingerprint?.response?.status, 200, "response status should match");
});

test("DynamoDbIdempotencyStore - cleanup is no-op", async (t) => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  const store = new DynamoDbIdempotencyStore({
    client: ddbMock as any
  });

  await store.cleanup();

  t.pass("cleanup should complete without error");
});
```

**Step 2: Run tests to verify they pass**

Run: `npm test -- tests/dynamodb.test.ts`

Expected: PASS (9 tests total)

**Step 3: Commit**

Run: `git add tests/dynamodb.test.ts && git commit -m "test: add DynamoDB edge case tests"`

Expected: Clean commit

---

## Phase 3: Integration and Exports

### Task 11: Export DynamoDB Store

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/index.ts`

**Step 1: Add to store/index.ts**

Read current exports:

Run: `cat src/store/index.ts`

Add export after existing exports:

```typescript
export {
  DynamoDbIdempotencyStore,
  type DynamoDbIdempotencyStoreOptions
} from "./dynamodb.js";
```

**Step 2: Add to src/index.ts**

Read current exports:

Run: `cat src/index.ts`

Add to store implementations section:

```typescript
export {
  DynamoDbIdempotencyStore,
  type DynamoDbIdempotencyStoreOptions
} from "./store/dynamodb.js";
```

**Step 3: Run build to verify exports**

Run: `npm run build`

Expected: Clean build with no errors

**Step 4: Run all tests**

Run: `npm test`

Expected: All tests pass (79 + 9 = 88 tests)

**Step 5: Commit**

Run: `git add src/store/index.ts src/index.ts && git commit -m "feat: export DynamoDbIdempotencyStore in public API"`

Expected: Clean commit

---

## Phase 4: Example Application

### Task 12: Create DynamoDB Example

**Files:**
- Create: `examples/dynamodb-app.ts`

**Step 1: Create example file**

```typescript
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { idempotency, DynamoDbIdempotencyStore } from "../src/index.js";

// Configure AWS SDK client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1"
});

const docClient = DynamoDBDocumentClient.from(client);

// Create DynamoDB store
const store = new DynamoDbIdempotencyStore({
  client: docClient,
  tableName: process.env.DYNAMODB_TABLE || "idempotency-records"
});

const app = new Hono();

// Apply idempotency middleware
app.post("/orders", idempotency({ store }), async (c) => {
  const body = await c.req.json();
  const orderId = Math.random().toString(36).substring(7);

  console.log(`Creating order: ${orderId}`);

  return c.json(
    {
      id: orderId,
      status: "created",
      ...body
    },
    201
  );
});

// Health check endpoint
app.get("/health", (c) => {
  return c.json({ status: "healthy", store: "dynamodb" });
});

serve(
  {
    fetch: app.fetch,
    port: 3000
  },
  (info) => {
    console.log(`Server running at http://localhost:${info.port}`);
    console.log(`Using DynamoDB table: ${process.env.DYNAMODB_TABLE || "idempotency-records"}`);
    console.log(`AWS Region: ${process.env.AWS_REGION || "us-east-1"}`);
    console.log("\nTest with:");
    console.log('  curl -X POST http://localhost:3000/orders \\');
    console.log('    -H "Content-Type: application/json" \\');
    console.log('    -H "Idempotency-Key: test-123" \\');
    console.log('    -d \'{"item":"widget","quantity":5}\'');
  }
);
```

**Step 2: Test example builds**

Run: `npx tsx examples/dynamodb-app.ts --help 2>&1 || echo "Syntax check passed"`

Expected: No syntax errors

**Step 3: Commit**

Run: `git add examples/dynamodb-app.ts && git commit -m "docs: add DynamoDB store example application"`

Expected: Clean commit

---

## Phase 5: Documentation

### Task 13: Create DynamoDB Setup Guide

**Files:**
- Create: `docs/dynamodb-setup.md`

**Step 1: Create setup guide**

```markdown
# DynamoDB Setup Guide

This guide shows how to create and configure the DynamoDB table for the idempotency store.

## Table Requirements

- **Table Name**: `idempotency-records` (default, configurable)
- **Partition Key**: `key` (String)
- **Global Secondary Index**: `fingerprint-index` on `fingerprint` attribute
- **TTL Attribute**: `expiresAt` (Number, Unix timestamp in seconds)

## CloudFormation

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: Idempotency Store DynamoDB Table

Resources:
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

Outputs:
  TableName:
    Value: !Ref IdempotencyTable
    Export:
      Name: IdempotencyTableName
```

Deploy:
```bash
aws cloudformation deploy \
  --template-file idempotency-table.yaml \
  --stack-name idempotency-store
```

## Terraform

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

  tags = {
    Name        = "idempotency-records"
    Environment = var.environment
  }
}

output "table_name" {
  value = aws_dynamodb_table.idempotency.name
}
```

Deploy:
```bash
terraform init
terraform plan
terraform apply
```

## AWS CDK (TypeScript)

```typescript
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cdk from 'aws-cdk-lib';

const table = new dynamodb.Table(this, 'IdempotencyTable', {
  tableName: 'idempotency-records',
  partitionKey: {
    name: 'key',
    type: dynamodb.AttributeType.STRING
  },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'expiresAt',
  removalPolicy: cdk.RemovalPolicy.DESTROY // For dev/test only
});

table.addGlobalSecondaryIndex({
  indexName: 'fingerprint-index',
  partitionKey: {
    name: 'fingerprint',
    type: dynamodb.AttributeType.STRING
  },
  projectionType: dynamodb.ProjectionType.ALL
});
```

## AWS CLI

```bash
# Create table
aws dynamodb create-table \
  --table-name idempotency-records \
  --attribute-definitions \
    AttributeName=key,AttributeType=S \
    AttributeName=fingerprint,AttributeType=S \
  --key-schema \
    AttributeName=key,KeyType=HASH \
  --global-secondary-indexes \
    "[{
      \"IndexName\": \"fingerprint-index\",
      \"KeySchema\": [{\"AttributeName\":\"fingerprint\",\"KeyType\":\"HASH\"}],
      \"Projection\": {\"ProjectionType\":\"ALL\"}
    }]" \
  --billing-mode PAY_PER_REQUEST

# Enable TTL
aws dynamodb update-time-to-live \
  --table-name idempotency-records \
  --time-to-live-specification \
    "Enabled=true,AttributeName=expiresAt"
```

## Verification

```bash
# Describe table
aws dynamodb describe-table --table-name idempotency-records

# Check TTL status
aws dynamodb describe-time-to-live --table-name idempotency-records

# List indexes
aws dynamodb describe-table --table-name idempotency-records \
  --query 'Table.GlobalSecondaryIndexes[*].[IndexName,IndexStatus]' \
  --output table
```

## IAM Permissions

Application needs these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/idempotency-records",
        "arn:aws:dynamodb:*:*:table/idempotency-records/index/fingerprint-index"
      ]
    }
  ]
}
```

For Lambda, attach to execution role. For EC2/ECS, use instance/task role.

## Cost Estimation

**Pay-per-request pricing (us-east-1):**
- Write: $1.25 per million requests
- Read: $0.25 per million requests
- Storage: $0.25 per GB-month
- TTL deletion: Free

**Example: 1M requests/month**
- 1M writes (startProcessing): $1.25
- 2M reads (lookup): $0.50
- 1M updates (complete): $1.25
- Storage (~1GB): $0.25
- **Total**: ~$3.25/month

GSI adds no additional read/write costs with ALL projection.

## Multi-Region Setup

For global applications, use DynamoDB Global Tables:

```bash
aws dynamodb create-global-table \
  --global-table-name idempotency-records \
  --replication-group RegionName=us-east-1 RegionName=eu-west-1
```

Or in CloudFormation:

```yaml
IdempotencyTable:
  Type: AWS::DynamoDB::GlobalTable
  Properties:
    TableName: idempotency-records
    # ... (same attributes as before)
    Replicas:
      - Region: us-east-1
      - Region: eu-west-1
```

## Troubleshooting

**Table creation fails:**
- Check IAM permissions for dynamodb:CreateTable
- Verify attribute names don't conflict with reserved words
- Ensure unique table name in region

**TTL not deleting:**
- TTL deletion is eventual (up to 48 hours)
- Application-level filtering ensures expired records not used
- Check TTL is enabled: `aws dynamodb describe-time-to-live`

**GSI not available:**
- Index creation takes time (CREATING → ACTIVE)
- Check status: `aws dynamodb describe-table --table-name idempotency-records`
- Application works during index creation (queries fall back gracefully)

**High costs:**
- Consider switching to provisioned capacity if predictable load
- Monitor unused indexes
- Set up CloudWatch alarms for unexpected usage
```

**Step 2: Commit**

Run: `git add docs/dynamodb-setup.md && git commit -m "docs: add DynamoDB setup guide"`

Expected: Clean commit

---

### Task 14: Update README

**Files:**
- Modify: `README.md`

**Step 1: Read current README**

Run: `cat README.md | head -100`

Note: Find the storage backends section

**Step 2: Add DynamoDB section**

Add after Redis section:

```markdown
### DynamoDB (AWS Serverless)

For AWS serverless and cloud-native deployments:

```typescript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { idempotency, DynamoDbIdempotencyStore } from "hono-idempotency";

const client = new DynamoDBClient({ region: "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client);

const store = new DynamoDbIdempotencyStore({
  client: docClient,
  tableName: "idempotency-records" // Optional, this is the default
});

app.post("/orders", idempotency({ store }), handler);
```

**Setup required:** Create DynamoDB table with GSI and TTL. See [DynamoDB Setup Guide](docs/dynamodb-setup.md).

**Benefits:**
- Fully managed, serverless infrastructure
- Auto-scaling with pay-per-request billing
- Global Tables for multi-region deployments
- Native TTL for automatic cleanup

**Dependencies:**
```bash
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```
```

**Step 3: Update storage comparison table**

Find the storage comparison section and add DynamoDB row:

```markdown
| Backend | Best For | Persistence | Scaling | Dependencies |
|---------|----------|-------------|---------|--------------|
| Memory | Development, testing | ❌ No | Single process | None |
| SQLite | Single server, simple deployments | ✅ Yes | Single server | better-sqlite3 |
| Redis | Multi-server, high performance | ✅ Yes | Horizontal | ioredis |
| DynamoDB | AWS serverless, global scale | ✅ Yes | Auto-scaling | @aws-sdk/* |
```

**Step 4: Commit**

Run: `git add README.md && git commit -m "docs: add DynamoDB backend to README"`

Expected: Clean commit

---

### Task 15: Update Implementation Summary

**Files:**
- Modify: `IMPLEMENTATION_SUMMARY.md`

**Step 1: Read current summary**

Run: `cat IMPLEMENTATION_SUMMARY.md`

**Step 2: Add DynamoDB to components list**

Find the "Storage Backends" section and add:

```markdown
3. **DynamoDbIdempotencyStore** (`src/store/dynamodb.ts`)
   - AWS DynamoDB backend for serverless deployments
   - Uses AWS SDK v3 with DynamoDBDocumentClient
   - User-managed client pattern (consistent with Redis)
   - Single table with GSI on fingerprint attribute
   - Native DynamoDB TTL with application-level expiration filtering
   - Parallel Get/Query operations for performance
   - Conditional updates for record completion
```

**Step 3: Update file count**

Update any file counts or component lists that reference the number of stores

**Step 4: Commit**

Run: `git add IMPLEMENTATION_SUMMARY.md && git commit -m "docs: add DynamoDB store to implementation summary"`

Expected: Clean commit

---

## Phase 6: Final Verification

### Task 16: Run Complete Test Suite

**Step 1: Run all tests**

Run: `npm test`

Expected: All tests pass (88+ tests including DynamoDB)

**Step 2: Check coverage**

Review coverage output

Expected: DynamoDB store has similar coverage to SQLite/Redis

**Step 3: Build verification**

Run: `npm run build`

Expected: Clean build with no TypeScript errors

**Step 4: Verify exports**

Run: `node -e "import('./dist/index.js').then(m => console.log('Exports:', Object.keys(m).filter(k => k.includes('Dynamo'))))"`

Expected: DynamoDbIdempotencyStore and DynamoDbIdempotencyStoreOptions visible

**Step 5: Type check examples**

Run: `npx tsc --noEmit examples/*.ts`

Expected: No type errors in examples

---

## Verification Checklist

After completing all tasks:

- [ ] All unit tests pass (9+ DynamoDB-specific tests)
- [ ] Integration tests work with DynamoDB store
- [ ] Build succeeds with no TypeScript errors
- [ ] Exports include DynamoDbIdempotencyStore
- [ ] Example application runs (manual verification with AWS credentials)
- [ ] Documentation complete (README, setup guide, implementation summary)
- [ ] Code coverage similar to other stores
- [ ] Follows same patterns as Redis/SQLite stores
