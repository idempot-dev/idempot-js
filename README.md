# hono-idempotency

IETF-compliant idempotency middleware for Hono with multiple storage backends.

## Installation

```bash
npm install hono-idempotency
```

Then choose a storage backend (see sections below).

## Storage Backends

Choose the backend that best fits your deployment:

| Backend | Best For | Setup Complexity | Node.js | Bun | Lambda | Deno | Workers |
|---------|----------|------------------|---------|-----|--------|------|---------|
| **SQLite** | Single-server, development | Easy | ✅ | ✅ | ❌ | 🔄 | ❌ |
| **Redis** | Multi-server, high performance | Medium | ✅ | ✅ | ✅ | 🔄 | 🔄 |
| **DynamoDB** | AWS-native, serverless, managed | Medium | ✅ | ✅ | ✅ | 🔄 | 🔄 |

**Runtime Support:**
- ✅ Fully supported and tested
- 🔄 Not yet tested (contributions welcome)
- ❌ Not supported

## Quick Start - SQLite (Development)

For local development with simple file-based persistence:

```bash
npm install hono-idempotency better-sqlite3
```

```typescript
import { Hono } from "hono";
import { idempotency, SqliteIdempotencyStore } from "hono-idempotency";

const app = new Hono();
const store = new SqliteIdempotencyStore({ path: ":memory:" });

app.post("/orders", idempotency({ store }), async (c) => {
  // Your handler - protected from duplicate requests
  return c.json({ id: "order-123" }, 201);
});
```

### Redis (Production - Multi-Server)

For production deployments with multiple server instances:

```bash
npm install hono-idempotency ioredis
```

```typescript
import { Hono } from "hono";
import Redis from "ioredis";
import { idempotency, RedisIdempotencyStore } from "hono-idempotency";

const app = new Hono();

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

const store = new RedisIdempotencyStore({ client: redis });

app.post("/orders", idempotency({ store }), async (c) => {
  return c.json({ id: "order-123" }, 201);
});

// Graceful shutdown
process.on("SIGINT", () => {
  redis.quit();
  process.exit(0);
});
```

**Features:**

- Shared state across multiple app instances
- Native clustering and sentinel support via ioredis
- Auto-expiration through Redis TTL
- User controls Redis configuration (TLS, retry logic, connection pooling)

### DynamoDB (AWS-Native, Serverless)

For AWS-native deployments with serverless scaling:

```bash
npm install hono-idempotency @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

```typescript
import { Hono } from "hono";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { idempotency, DynamoDbIdempotencyStore } from "hono-idempotency";

const dynamoDBClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1"
});

const documentClient = DynamoDBDocumentClient.from(dynamoDBClient);

const store = new DynamoDbIdempotencyStore({
  client: documentClient,
  tableName: "idempotency-records" // Created via CloudFormation, Terraform, or AWS CLI
});

const app = new Hono();

app.post("/orders", idempotency({ store }), async (c) => {
  return c.json({ id: "order-123" }, 201);
});
```

**Features:**

- AWS-managed, no infrastructure to maintain
- Automatic serverless scaling on-demand
- Global secondary index for efficient fingerprint lookups
- TTL-based automatic cleanup of expired records
- Point-in-time recovery and backups
- Access control via IAM

See [docs/dynamodb-setup.md](./docs/dynamodb-setup.md) for complete setup instructions using CloudFormation, Terraform, AWS CDK, or AWS CLI.

## Using with Bun

Install and run with Bun's native performance:

```bash
bun add hono-idempotency
```

```typescript
import { Hono } from "hono";
import { idempotency, BunSqliteIdempotencyStore } from "hono-idempotency";

const app = new Hono();
const store = new BunSqliteIdempotencyStore({ path: ":memory:" });

app.post("/orders", idempotency({ store }), async (c) => {
  return c.json({ id: "order-123" }, 201);
});

export default {
  port: 3000,
  fetch: app.fetch,
};
```

**Features:**
- Native `bun:sqlite` integration (2-3x faster than better-sqlite3)
- No need to install `better-sqlite3` dependency
- Works with Bun's native HTTP server
- Full test coverage with Bun's test runner

**Store Selection:**
- **Node.js**: Use `SqliteIdempotencyStore` (better-sqlite3)
- **Bun**: Use `BunSqliteIdempotencyStore` (native bun:sqlite)
- **Redis/DynamoDB**: Use same stores across runtimes (runtime-agnostic)

See [docs/bun-setup.md](./docs/bun-setup.md) for complete Bun setup guide.

## Using with AWS Lambda

Deploy idempotency middleware on AWS Lambda with API Gateway or Function URLs:

```bash
npm install hono-idempotency @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

```typescript
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
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
```

**Features:**
- Works with API Gateway (REST/HTTP API) and Lambda Function URLs
- DynamoDB for serverless-native persistence
- Redis/ElastiCache for existing infrastructure
- Proper connection reuse across warm invocations

**Recommended Storage:**
- **DynamoDB**: Best for Lambda (serverless, no cold start penalty, scales automatically)
- **Redis/ElastiCache**: For users with existing Redis infrastructure

See [docs/lambda-setup.md](./docs/lambda-setup.md) for complete Lambda setup guide.

## Core Features

- IETF-compliant idempotency key handling
- SQLite storage (in-memory for dev, file-based for production)
- Request fingerprinting for conflict detection
- Automatic response caching and replay
- TypeScript support with full type definitions

## Examples

See `examples/` directory for complete usage examples:

**Node.js:**
- `basic-app.ts` - In-memory development setup
- `sqlite-app.ts` - Production file-based persistence
- `redis-app.ts` - Multi-server production setup
- `dynamodb-app.ts` - AWS DynamoDB backend setup

**Bun:**
- `bun-basic-app.ts` - In-memory development with Bun
- `bun-sqlite-app.ts` - File-based persistence with Bun

**AWS Lambda:**
- `lambda-apigateway-dynamodb.ts` - API Gateway with DynamoDB
- `lambda-apigateway-redis.ts` - API Gateway with Redis/ElastiCache
- `lambda-url-dynamodb.ts` - Function URL with DynamoDB
- `lambda-url-redis.ts` - Function URL with Redis/ElastiCache

## Documentation

See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) for complete feature documentation.

## License

MIT
