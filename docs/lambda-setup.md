# AWS Lambda Setup Guide

This guide covers deploying hono-idempotency middleware on AWS Lambda.

## Why Lambda?

AWS Lambda offers several advantages for idempotency middleware:

- **Serverless**: No server management, automatic scaling
- **DynamoDB integration**: Native AWS service for persistence
- **Cost-effective**: Pay only for actual requests
- **Global deployment**: Deploy close to users with CloudFront
- **Multiple invocation patterns**: API Gateway, Function URLs, event-driven

## Installation

```bash
npm install hono-idempotency hono
```

Choose your storage backend:

```bash
# For DynamoDB (recommended)
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb

# For Redis/ElastiCache
npm install ioredis
```

## Storage Backend Selection

### DynamoDB (Recommended)

**Best for:**

- Serverless-native deployments
- Variable/unpredictable traffic
- Multi-region applications
- No infrastructure management

**Pros:**

- Serverless (scales automatically)
- No cold start penalty
- Managed service (no patching/upgrades)
- TTL-based automatic cleanup
- Point-in-time recovery

**Cons:**

- Higher latency than Redis (~10-20ms)
- More complex pricing model

### Redis/ElastiCache

**Best for:**

- Existing Redis infrastructure
- Extremely high throughput requirements
- Sub-5ms latency needs
- Shared cache across services

**Pros:**

- Very low latency (~1-3ms)
- Familiar Redis APIs
- Rich data structures

**Cons:**

- Requires VPC configuration
- Cold start latency (connection setup)
- Manual scaling/management
- Additional cost (always running)

## API Gateway Integration

API Gateway provides a managed API layer with features like request validation, throttling, and API keys.

### Example: API Gateway + DynamoDB

```typescript
// lambda-handler.ts
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { idempotency, DynamoDbIdempotencyStore } from "hono-idempotency";

// Initialize OUTSIDE handler for connection reuse
const dynamoDBClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1"
});
const documentClient = DynamoDBDocumentClient.from(dynamoDBClient);

const store = new DynamoDbIdempotencyStore({
  client: documentClient,
  tableName: process.env.IDEMPOTENCY_TABLE || "idempotency-records"
});

const app = new Hono();

app.post("/orders", idempotency({ store }), async (c) => {
  const body = await c.req.json();
  // Your business logic here
  return c.json({ id: "order-123", ...body }, 201);
});

// Lambda handler - Hono adapter handles API Gateway events
export const handler = handle(app);
```

### IAM Permissions

The Lambda execution role needs:

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
      "Resource": "arn:aws:dynamodb:REGION:ACCOUNT:table/idempotency-records"
    }
  ]
}
```

### API Gateway Configuration

**REST API:**

- Create REST API in API Gateway console
- Create resource (e.g., `/orders`)
- Create POST method
- Set integration type to Lambda Function
- Deploy to stage

**HTTP API (simpler, cheaper):**

- Create HTTP API
- Create route: `POST /orders`
- Attach Lambda integration
- Auto-deploy enabled by default

## Function URL Integration

Function URLs provide direct HTTPS access without API Gateway.

### Example: Function URL + DynamoDB

```typescript
// Same handler code as API Gateway example
// The Hono adapter automatically handles both event formats

import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { idempotency, DynamoDbIdempotencyStore } from "hono-idempotency";

const dynamoDBClient = new DynamoDBClient({ region: "us-east-1" });
const documentClient = DynamoDBDocumentClient.from(dynamoDBClient);
const store = new DynamoDbIdempotencyStore({
  client: documentClient,
  tableName: "idempotency-records"
});

const app = new Hono();
app.post("/orders", idempotency({ store }), async (c) => {
  const body = await c.req.json();
  return c.json({ id: "order-123", ...body }, 201);
});

export const handler = handle(app);
```

### Enable Function URL

**AWS Console:**

1. Open Lambda function
2. Configuration → Function URL
3. Click "Create function URL"
4. Auth type: AWS_IAM or NONE
5. CORS: Configure if needed
6. Save

**AWS CLI:**

```bash
aws lambda create-function-url-config \
  --function-name my-function \
  --auth-type NONE \
  --cors '{"AllowOrigins":["*"],"AllowMethods":["POST"]}'
```

## Redis/ElastiCache Configuration

### Example: Lambda + Redis

```typescript
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import Redis from "ioredis";
import { idempotency, RedisIdempotencyStore } from "hono-idempotency";

// Lambda-optimized Redis configuration
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
  // Connection management for serverless
  lazyConnect: true, // Don't connect until first operation
  maxRetriesPerRequest: 3, // Retry failed operations
  enableReadyCheck: false, // Skip ready check
  keepAlive: 30000, // Keep connections alive
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

const store = new RedisIdempotencyStore({ client: redis });

const app = new Hono();
app.post("/orders", idempotency({ store }), async (c) => {
  const body = await c.req.json();
  return c.json({ id: "order-123", ...body }, 201);
});

export const handler = handle(app);
```

### VPC Configuration

Lambda must be in the same VPC as ElastiCache:

1. **Create security group** for Lambda
2. **Configure ElastiCache** security group to allow Lambda SG on port 6379
3. **Attach VPC** to Lambda function
4. **Add IAM permissions** for EC2 network interfaces:

```json
{
  "Effect": "Allow",
  "Action": [
    "ec2:CreateNetworkInterface",
    "ec2:DescribeNetworkInterfaces",
    "ec2:DeleteNetworkInterface"
  ],
  "Resource": "*"
}
```

## Connection Management

### Cold Starts vs Warm Invocations

**Cold start**: First invocation or after idle period

- Lambda creates new execution environment
- Your code initializes (including connections)
- Handler executes

**Warm invocation**: Reusing existing environment

- Execution environment reused
- Global variables preserved
- Connections stay open

### Best Practice: Initialize Outside Handler

```typescript
// ✅ GOOD: Initialize outside handler (reused across invocations)
const dynamoDBClient = new DynamoDBClient({ region: "us-east-1" });
const documentClient = DynamoDBDocumentClient.from(dynamoDBClient);
const store = new DynamoDbIdempotencyStore({
  client: documentClient,
  tableName: "idempotency-records"
});
const app = new Hono();
app.post("/orders", idempotency({ store }), handler);

export const handler = handle(app);
```

```typescript
// ❌ BAD: Initialize inside handler (recreated every invocation)
export const handler = async (event, context) => {
  const dynamoDBClient = new DynamoDBClient({ region: "us-east-1" });
  // ... creates new connection every time!
};
```

## Environment Variables

Set these in Lambda configuration:

**DynamoDB:**

```bash
AWS_REGION=us-east-1
IDEMPOTENCY_TABLE=idempotency-records
```

**Redis:**

```bash
REDIS_HOST=my-cluster.cache.amazonaws.com
REDIS_PORT=6379
REDIS_PASSWORD=my-secret-password  # If AUTH enabled
```

## Deployment

### Using SAM (Serverless Application Model)

```yaml
# template.yaml
AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31

Resources:
  IdempotencyFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: dist/lambda-handler.handler
      Runtime: nodejs20.x
      MemorySize: 512
      Timeout: 30
      Environment:
        Variables:
          IDEMPOTENCY_TABLE: !Ref IdempotencyTable
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref IdempotencyTable
      Events:
        ApiEvent:
          Type: Api
          Properties:
            Path: /orders
            Method: POST

  IdempotencyTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: idempotency-records
      BillingMode: PAY_PER_REQUEST
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
      TimeToLiveSpecification:
        AttributeName: expiresAt
        Enabled: true
```

Deploy:

```bash
sam build
sam deploy --guided
```

### Using AWS CDK

```typescript
// lib/lambda-stack.ts
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as apigateway from "aws-cdk-lib/aws-apigateway";

export class LambdaStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB table
    const table = new dynamodb.Table(this, "IdempotencyTable", {
      partitionKey: { name: "key", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt"
    });

    table.addGlobalSecondaryIndex({
      indexName: "fingerprint-index",
      partitionKey: { name: "fingerprint", type: dynamodb.AttributeType.STRING }
    });

    // Lambda function
    const fn = new lambda.Function(this, "IdempotencyFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "lambda-handler.handler",
      code: lambda.Code.fromAsset("dist"),
      environment: {
        IDEMPOTENCY_TABLE: table.tableName
      }
    });

    table.grantReadWriteData(fn);

    // API Gateway
    new apigateway.LambdaRestApi(this, "IdempotencyApi", {
      handler: fn
    });
  }
}
```

## Performance Optimization

### Memory Configuration

More memory = more CPU = faster execution:

- **128-512MB**: Development/low traffic
- **512-1024MB**: Production (recommended)
- **1024-3008MB**: High throughput/complex logic

Test different memory settings to find cost/performance sweet spot.

### Provisioned Concurrency

Eliminates cold starts by keeping instances warm:

```bash
aws lambda put-provisioned-concurrency-config \
  --function-name my-function \
  --provisioned-concurrent-executions 5
```

**Trade-off**: Higher cost (always running) vs better performance.

### DynamoDB Optimization

**On-Demand vs Provisioned:**

- **On-Demand**: Variable traffic, unpredictable patterns
- **Provisioned**: Consistent traffic, predictable patterns (cheaper)

**Global Secondary Index:**
Required for fingerprint lookups. Ensure it's configured in your table.

### Redis Connection Pooling

Use `lazyConnect` and connection keep-alive for optimal performance:

```typescript
const redis = new Redis({
  lazyConnect: true, // Connect on first use
  keepAlive: 30000, // Keep connections alive 30s
  maxRetriesPerRequest: 3
});
```

## Troubleshooting

### Cold Start Timeouts

**Symptom**: First request times out, subsequent requests work.

**Solutions:**

1. Increase Lambda timeout (default 3s → 30s)
2. Use provisioned concurrency
3. Optimize initialization code
4. For Redis: Use `lazyConnect: true`

### "Table Not Found" Errors

**Symptom**: DynamoDB `ResourceNotFoundException`

**Solutions:**

1. Verify table exists: `aws dynamodb describe-table --table-name idempotency-records`
2. Check environment variable: `IDEMPOTENCY_TABLE`
3. Verify IAM permissions
4. Ensure table is in same region as Lambda

### Redis Connection Timeouts

**Symptom**: First request to Redis times out

**Solutions:**

1. Verify Lambda is in VPC with ElastiCache
2. Check security group rules
3. Use `lazyConnect: true` and `enableReadyCheck: false`
4. Increase Lambda timeout

### High DynamoDB Costs

**Symptom**: Unexpected DynamoDB charges

**Solutions:**

1. Enable TTL for automatic cleanup
2. Monitor read/write capacity units
3. Consider provisioned capacity for predictable traffic
4. Use DynamoDB's cost calculator

## Testing Locally

### Local Lambda Runtime

```bash
# Install SAM CLI
brew install aws-sam-cli

# Start local API
sam local start-api

# Invoke function
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-123" \
  -d '{"item":"widget"}'
```

### DynamoDB Local

```bash
# Start DynamoDB Local
docker run -p 8000:8000 amazon/dynamodb-local

# Set endpoint in code
const client = new DynamoDBClient({
  endpoint: "http://localhost:8000"
});
```

## Monitoring

### CloudWatch Metrics

Monitor these key metrics:

- **Invocations**: Total requests
- **Duration**: Average execution time
- **Errors**: Failed requests
- **Throttles**: Rate-limited requests
- **ConcurrentExecutions**: Active instances

### Custom Metrics

Add application metrics:

```typescript
import { CloudWatch } from "@aws-sdk/client-cloudwatch";

const cloudwatch = new CloudWatch({});

await cloudwatch.putMetricData({
  Namespace: "Idempotency",
  MetricData: [
    {
      MetricName: "CacheHits",
      Value: 1,
      Unit: "Count"
    }
  ]
});
```

## Cost Optimization

### DynamoDB

- Enable TTL for automatic cleanup
- Use on-demand for variable traffic
- Use provisioned for predictable traffic
- Monitor and optimize indexes

### Lambda

- Right-size memory allocation
- Use provisioned concurrency sparingly
- Consider reserved concurrency for cost caps
- Monitor and optimize cold starts

### Redis/ElastiCache

- Use smallest instance that meets needs
- Consider reserved instances (1-3 year commitment)
- Use clustering only if needed
- Enable automatic failover

## Next Steps

- See [README.md](../README.md) for middleware configuration options
- See [examples/](../examples/) for complete working examples
- See [IMPLEMENTATION_SUMMARY.md](../IMPLEMENTATION_SUMMARY.md) for detailed feature documentation
- See [dynamodb-setup.md](./dynamodb-setup.md) for DynamoDB table creation
