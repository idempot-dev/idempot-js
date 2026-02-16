# hono-idempotency

IETF-compliant idempotency middleware for Hono with multiple storage backends.

## Installation

```bash
npm install hono-idempotency
```

Choose a storage backend from the sections below.

## Storage Backends

Choose the backend that best fits your deployment:

| Backend      | Best For                        | Setup Complexity | Node.js | Bun | Lambda | Deno | Workers |
| ------------ | ------------------------------- | ---------------- | ------- | --- | ------ | ---- | ------- |
| **SQLite**   | Single-server, development      | Easy             | ✅      | ✅  | ❌     | 🔄   | ❌      |
| **Redis**    | Multi-server, high performance  | Medium           | ✅      | ✅  | ✅     | 🔄   | 🔄      |
| **DynamoDB** | AWS-native, serverless, managed | Medium           | ✅      | ✅  | ✅     | 🔄   | 🔄      |

**Runtime Support:**

- ✅ Fully supported and tested
- 🔄 Not yet tested (contributions welcome)
- ❌ Not supported

## Quick Start - SQLite

For local development:

```bash
npm install hono-idempotency better-sqlite3
```

```javascript
import { Hono } from "hono";
import { idempotency, SqliteIdempotencyStore } from "hono-idempotency";

const app = new Hono();
const store = new SqliteIdempotencyStore({ path: ":memory:" });

app.post("/orders", idempotency({ store }), async (c) => {
  // Your handler - protected from duplicate requests
  return c.json({ id: "order-123" }, 201);
});
```

### Redis

For production with multiple server instances:

```bash
npm install hono-idempotency ioredis
```

```javascript
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

- Shared state across app instances
- Native clustering and sentinel support via ioredis
- Auto-expiration via Redis TTL
- User controls Redis configuration (TLS, retry logic, connection pooling)

### DynamoDB

For AWS-native serverless deployments:

```bash
npm install hono-idempotency @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

```javascript
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
- Automatic serverless scaling
- Global secondary index for efficient fingerprint lookups
- TTL-based automatic cleanup of expired records
- Point-in-time recovery and backups
- IAM access control

See [docs/dynamodb-setup.md](./docs/dynamodb-setup.md) for complete setup instructions using CloudFormation, Terraform, AWS CDK, or AWS CLI.

## Using with Bun

Install and run with Bun:

```bash
bun add hono-idempotency
```

```javascript
import { Hono } from "hono";
import { BunSqliteIdempotencyStore } from "hono-idempotency/store/bun-sqlite";
import { idempotency } from "hono-idempotency";

const app = new Hono();
const store = new BunSqliteIdempotencyStore({ path: ":memory:" });

app.post("/orders", idempotency({ store }), async (c) => {
  return c.json({ id: "order-123" }, 201);
});

export default {
  port: 3000,
  fetch: app.fetch
};
```

**Features:**

- Native `bun:sqlite` integration (2-3x faster than better-sqlite3)
- No `better-sqlite3` dependency needed
- Works with Bun's native HTTP server
- Full test coverage with Bun's test runner

**Store Selection:**

- **Node.js**: Use `SqliteIdempotencyStore` (better-sqlite3)
- **Bun**: Use `BunSqliteIdempotencyStore` (native bun:sqlite)
- **Redis/DynamoDB**: Use same stores across runtimes (runtime-agnostic)

See [docs/bun-setup.md](./docs/bun-setup.md) for complete Bun setup guide.

## Using with AWS Lambda

Deploy on AWS Lambda with API Gateway or Function URLs:

```bash
npm install hono-idempotency @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

```javascript
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
- DynamoDB for serverless persistence
- Redis/ElastiCache for existing infrastructure
- Connection reuse across warm invocations

**Recommended Storage:**

- **DynamoDB**: Best for Lambda (serverless, no cold start penalty, scales automatically)
- **Redis/ElastiCache**: For users with existing Redis infrastructure

See [docs/lambda-setup.md](./docs/lambda-setup.md) for complete Lambda setup guide.

## Core Features

- IETF-compliant idempotency key handling
- SQLite storage (in-memory or file-based)
- Request fingerprinting for conflict detection
- Automatic response caching and replay
- Full TypeScript type definitions

## Resilience

The middleware includes built-in resilience features using [opossum](https://nodeshift.dev/opossum/) circuit breaker to handle store failures gracefully.

### How It Works

When the backing store (Redis, DynamoDB, SQLite) experiences failures:

1. **Retries** - Failed operations are automatically retried up to 3 times
2. **Timeout** - Each operation times out after 1 second to prevent hanging
3. **Circuit Breaker** - After 50% failure rate over 10 requests, the circuit opens
4. **Fail-Fast** - While the circuit is open, requests fail immediately without calling the store
5. **Auto-Recovery** - After 30 seconds, the circuit allows test requests through

### Configuration

Customize resilience behavior via the `resilience` option:

```javascript
app.post(
  "/orders",
  idempotency({
    store,
    resilience: {
      timeout: 1000, // Operation timeout in ms (default: 500)
      maxRetries: 3, // Retry attempts (default: 3)
      retryDelay: 100, // Delay between retries in ms (default: 100)
      errorThresholdPercentage: 50, // % failures to open circuit (default: 50)
      resetTimeout: 30000, // ms before attempting reset (default: 30000)
      volumeThreshold: 10 // min requests before evaluating (default: 10)
    }
  }),
  handler
);
```

### Error Handling

When the store is unavailable, the middleware returns HTTP 503 with:

```json
{ "error": "Service temporarily unavailable" }
```

### Monitoring

The circuit breaker state is exposed on the middleware function for monitoring:

```javascript
const middleware = idempotency({ store });

console.log(middleware.circuit.status); // 'closed', 'open', or 'half-open'
console.log(middleware.circuit.stats); // { failures, successes, rejects, ... }
```

### Defaults

| Option                   | Default | Description                          |
| ------------------------ | ------- | ------------------------------------ |
| timeout                  | 500ms   | Max time to wait for store operation |
| maxRetries               | 3       | Number of retry attempts             |
| retryDelay               | 100ms   | Delay between retries                |
| errorThresholdPercentage | 50%     | Failures to open circuit             |
| resetTimeout             | 30s     | Time before attempting reset         |
| volumeThreshold          | 10      | Requests before circuit evaluates    |

## Development Setup

Enable the pre-commit hook that checks for 100% test coverage:

```bash
npx husky install
```

## Examples

See `examples/` directory for complete usage examples:

**Node.js:**

- `basic-app.js` - In-memory development setup
- `sqlite-app.js` - Production file-based persistence
- `redis-app.js` - Multi-server production setup
- `dynamodb-app.js` - AWS DynamoDB backend setup

**Bun:**

- `bun-basic-app.js` - In-memory development with Bun
- `bun-sqlite-app.js` - File-based persistence with Bun

**AWS Lambda:**

- `lambda-apigateway-dynamodb.js` - API Gateway with DynamoDB
- `lambda-apigateway-redis.js` - API Gateway with Redis/ElastiCache
- `lambda-url-dynamodb.js` - Function URL with DynamoDB
- `lambda-url-redis.js` - Function URL with Redis/ElastiCache

## License

MIT
