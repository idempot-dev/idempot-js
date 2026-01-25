# AWS Lambda Runtime Support Design

**Date**: 2026-01-25
**Status**: Approved
**Goal**: Enable production users to deploy hono-idempotency middleware on AWS Lambda with proper connection management and serverless-native patterns.

## Overview

This design adds AWS Lambda runtime support to hono-idempotency middleware. Unlike Bun support (which required runtime-specific store implementations), Lambda support focuses on integration patterns and examples. The existing DynamoDB and Redis stores work on Lambda's Node.js runtime - users need guidance on using them correctly in Lambda's stateless execution model.

## Scope

**In Scope**:
- Example apps for API Gateway integration
- Example apps for Lambda Function URLs
- DynamoDB store examples with proper AWS SDK initialization
- Redis (ElastiCache) store examples with connection pooling
- Unit tests mocking Lambda events/context
- Lambda-specific documentation (README section + detailed guide)
- Best practices for connection reuse across warm invocations

**Out of Scope**:
- Lambda-specific store implementations (existing stores work fine)
- Infrastructure-as-code templates (users choose SAM/CDK/Terraform/Serverless)
- SQLite support (not recommended for Lambda due to /tmp limitations)
- Actual Lambda deployment tests (too complex, slow, costly)

## Architecture

### Core Principle

No new store implementations needed. The core middleware and existing stores (DynamoDB, Redis) work on Lambda. This design shows proper Lambda integration patterns.

### Example Apps Structure

```
examples/
  # API Gateway examples
  lambda-apigateway-dynamodb.ts   # REST API with DynamoDB
  lambda-apigateway-redis.ts      # REST API with Redis/ElastiCache

  # Function URL examples
  lambda-url-dynamodb.ts          # Direct HTTP with DynamoDB
  lambda-url-redis.ts             # Direct HTTP with Redis
```

### Connection Reuse Pattern

Key pattern for Lambda efficiency - initialize clients outside the handler:

```typescript
// Initialize OUTSIDE handler (reused across warm invocations)
const dynamoDBClient = new DynamoDBClient({ region: "us-east-1" });
const documentClient = DynamoDBDocumentClient.from(dynamoDBClient);
const store = new DynamoDbIdempotencyStore({
  client: documentClient,
  tableName: "idempotency-records"
});
const app = new Hono();
app.post("/orders", idempotency({ store }), handler);

// Lambda handler (new invocation)
export const handler = async (event, context) => {
  return await handle(app)(event, context);
};
```

## Implementation Details

### Hono Lambda Integration

Use Hono's official Lambda adapter from `@hono/aws-lambda` package. This adapter handles both API Gateway and Function URL event formats transparently.

**API Gateway Example Pattern**:
```typescript
import { handle } from '@hono/aws-lambda';

// App setup (outside handler)
const app = new Hono();
const store = new DynamoDbIdempotencyStore({ /* ... */ });
app.post("/orders", idempotency({ store }), async (c) => {
  return c.json({ id: "order-123" }, 201);
});

// Lambda handler for API Gateway events
export const handler = handle(app);
```

**Function URL Example Pattern**:
```typescript
import { handle } from '@hono/aws-lambda';

// Same app setup
const app = new Hono();
// ... middleware setup ...

// Lambda handler for Function URL (uses same adapter)
export const handler = handle(app);
```

**Key Difference**: API Gateway wraps requests/responses differently than Function URLs, but Hono's adapter handles both transparently. Users configure the Lambda trigger type in their infrastructure.

### DynamoDB Store Example

```typescript
import { Hono } from "hono";
import { handle } from "@hono/aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { idempotency, DynamoDbIdempotencyStore } from "hono-idempotency";

// Initialize outside handler for connection reuse
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
  const orderId = Math.random().toString(36).substring(7);

  return c.json({
    id: orderId,
    status: "created",
    ...body
  }, 201);
});

export const handler = handle(app);
```

### Redis Store Example

```typescript
import { Hono } from "hono";
import { handle } from "@hono/aws-lambda";
import Redis from "ioredis";
import { idempotency, RedisIdempotencyStore } from "hono-idempotency";

// Initialize outside handler for connection reuse
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
  // Lambda-specific: aggressive connection management
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: false
});

const store = new RedisIdempotencyStore({ client: redis });

const app = new Hono();

app.post("/orders", idempotency({ store }), async (c) => {
  const body = await c.req.json();
  const orderId = Math.random().toString(36).substring(7);

  return c.json({
    id: orderId,
    status: "created",
    ...body
  }, 201);
});

export const handler = handle(app);
```

## Testing Strategy

### Unit Tests with Mocked Events

Create tests that mock Lambda event structures without deploying to actual Lambda:

```typescript
// test/lambda/lambda-apigateway.test.ts
import { describe, test, expect } from "bun:test";
import { handler } from "../../examples/lambda-apigateway-dynamodb.js";

describe("Lambda API Gateway Integration", () => {
  test("handles POST request with idempotency key", async () => {
    const event = {
      httpMethod: "POST",
      path: "/orders",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "test-key-123"
      },
      body: JSON.stringify({ item: "widget", quantity: 5 })
    };

    const response = await handler(event, {});

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("created");
  });

  test("returns cached response for duplicate request", async () => {
    const event = {
      httpMethod: "POST",
      path: "/orders",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "duplicate-key"
      },
      body: JSON.stringify({ item: "gadget", quantity: 3 })
    };

    const response1 = await handler(event, {});
    const response2 = await handler(event, {});

    const body1 = JSON.parse(response1.body);
    const body2 = JSON.parse(response2.body);

    expect(body1.id).toBe(body2.id);
  });
});
```

**Test Coverage**:
- API Gateway event structure handling
- Function URL event structure handling
- Idempotency key extraction from different event formats
- Response format compliance (API Gateway expects specific structure)
- DynamoDB and Redis connection patterns (using mocks)

**No Deployment Tests**: Too slow, complex, and costly. Example apps serve as integration validation that users can deploy themselves.

## Documentation Updates

### README Changes

**Add Lambda to runtime compatibility table**:
| Backend | Best For | Node.js | Bun | Lambda | Deno | Workers |
|---------|----------|---------|-----|--------|------|---------|
| **SQLite** | Single-server, development | ✅ | ✅ | ❌ | 🔄 | ❌ |
| **Redis** | Multi-server, high performance | ✅ | ✅ | ✅ | 🔄 | 🔄 |
| **DynamoDB** | AWS-native, serverless, managed | ✅ | ✅ | ✅ | 🔄 | 🔄 |

**Add Lambda section**:
```markdown
## Using with AWS Lambda

Deploy idempotency middleware on AWS Lambda with API Gateway or Function URLs:

\`\`\`bash
npm install hono-idempotency @hono/aws-lambda @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
\`\`\`

\`\`\`typescript
import { Hono } from "hono";
import { handle } from "@hono/aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { idempotency, DynamoDbIdempotencyStore } from "hono-idempotency";

// Initialize outside handler for connection reuse
const dynamoDBClient = new DynamoDBClient({ region: "us-east-1" });
const documentClient = DynamoDBDocumentClient.from(dynamoDBClient);
const store = new DynamoDbIdempotencyStore({
  client: documentClient,
  tableName: "idempotency-records"
});

const app = new Hono();
app.post("/orders", idempotency({ store }), async (c) => {
  return c.json({ id: "order-123" }, 201);
});

export const handler = handle(app);
\`\`\`

**Features:**
- Works with API Gateway (REST/HTTP API) and Lambda Function URLs
- DynamoDB for serverless-native persistence
- Redis/ElastiCache for existing infrastructure
- Proper connection reuse across warm invocations

**Recommended Storage**:
- **DynamoDB**: Best for Lambda (serverless, no cold start penalty, scales automatically)
- **Redis/ElastiCache**: For users with existing Redis infrastructure

See [docs/lambda-setup.md](./docs/lambda-setup.md) for complete Lambda setup guide.
```

### New Documentation File

**docs/lambda-setup.md**:
- Installation and dependencies (@hono/aws-lambda, AWS SDK)
- API Gateway setup example with SAM/CDK snippets
- Function URL setup example
- DynamoDB table configuration and IAM permissions
- Redis/ElastiCache configuration and VPC setup
- Connection management patterns (warm vs cold starts)
- Environment variables and configuration best practices
- Deployment considerations (memory, timeout, reserved concurrency)
- Troubleshooting common issues (cold starts, timeouts, connection pooling)
- Performance optimization tips (provisioned concurrency, connection pooling)

### Package Scripts

```json
{
  "scripts": {
    "example:lambda:apigateway": "tsx examples/lambda-apigateway-dynamodb.ts",
    "example:lambda:url": "tsx examples/lambda-url-dynamodb.ts"
  }
}
```

## Dependencies

**New Dependencies (dev)**:
- `@hono/aws-lambda` - Hono's official Lambda adapter
- No other dependencies needed (AWS SDK, ioredis already available)

**Peer Dependencies**:
Document that Lambda deployments should include:
- `@hono/aws-lambda` (required)
- `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` (for DynamoDB)
- `ioredis` (for Redis/ElastiCache)

## Example Apps

### 1. lambda-apigateway-dynamodb.ts
- API Gateway integration
- DynamoDB store
- Demonstrates proper AWS SDK initialization
- Shows connection reuse pattern
- Includes IAM permission requirements in comments

### 2. lambda-apigateway-redis.ts
- API Gateway integration
- Redis/ElastiCache store
- Demonstrates connection pooling
- Shows VPC configuration requirements in comments

### 3. lambda-url-dynamodb.ts
- Lambda Function URL integration
- DynamoDB store
- Simpler than API Gateway (direct HTTP)
- Same connection reuse patterns

### 4. lambda-url-redis.ts
- Lambda Function URL integration
- Redis/ElastiCache store
- Direct HTTP with connection pooling

## Success Criteria

1. ✅ 4 Lambda example apps (API Gateway + Function URLs × DynamoDB + Redis)
2. ✅ Unit tests validating event handling and response formats
3. ✅ README updated with Lambda section and runtime table
4. ✅ Comprehensive Lambda setup guide created (docs/lambda-setup.md)
5. ✅ Examples demonstrate proper connection reuse patterns
6. ✅ Documentation covers deployment and troubleshooting
7. ✅ Example comments include IAM permissions and infrastructure notes

## Open Questions

None. All questions resolved during design phase.

## Future Work

- CloudFormation/CDK/Terraform templates (optional, separate repository)
- Performance benchmarks comparing DynamoDB vs Redis on Lambda
- Advanced patterns (Step Functions integration, EventBridge triggers)
- Cost optimization guide
