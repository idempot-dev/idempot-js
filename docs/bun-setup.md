# Bun Setup Guide

Use idempot with the Bun JavaScript runtime.

## Why Bun?

Bun offers several advantages:

- **Native SQLite**: Built-in `bun:sqlite` module (2-3x faster than better-sqlite3)
- **Fast startup**: Bun starts faster than Node.js
- **Native TypeScript**: Run `.ts` files directly without transpilation
- **Smaller bundle**: No additional SQLite dependencies needed

## Installation

```bash
bun add idempot
```

Unlike Node.js, you don't need `better-sqlite3`. Bun's native SQLite is built-in.

## Storage Backend Selection

### SQLite (Recommended for Bun)

Use `BunSqliteIdempotencyStore` for native performance:

```javascript
import { Hono } from "hono";
import { idempotency, BunSqliteIdempotencyStore } from "idempot";

const app = new Hono();
const store = new BunSqliteIdempotencyStore({ path: ":memory:" });

app.post("/orders", idempotency({ store }), async (c) => {
  const body = await c.req.json();
  return c.json({ id: "order-123", ...body }, 201);
});

export default {
  port: 3000,
  fetch: app.fetch
};
```

**Options:**

- `path: ":memory:"` - In-memory database (development)
- `path: "./data/idempotency.db"` - File-based persistence (production)

### Redis

Redis works the same way on Bun as on Node.js:

```bash
bun add ioredis
```

```javascript
import { Hono } from "hono";
import Redis from "ioredis";
import { idempotency, RedisIdempotencyStore } from "idempot";

const app = new Hono();
const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379")
});

const store = new RedisIdempotencyStore({ client: redis });

app.post("/orders", idempotency({ store }), async (c) => {
  const body = await c.req.json();
  return c.json({ id: "order-123", ...body }, 201);
});

export default {
  port: 3000,
  fetch: app.fetch
};
```

### DynamoDB

DynamoDB also works the same way on Bun:

```bash
bun add @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

```javascript
import { Hono } from "hono";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { idempotency, DynamoDbIdempotencyStore } from "idempot";

const dynamoDBClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1"
});
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

export default {
  port: 3000,
  fetch: app.fetch
};
```

## Running Your App

### Development

Run your app directly with Bun:

```bash
bun run app.ts
```

Or use the example apps:

```bash
bun run examples/bun-basic-app.js
bun run examples/bun-sqlite-app.js
```

### Production

For production, you can still run the `.js` file directly:

```bash
bun run --production app.js
```

Or build and run the compiled output:

```bash
bun build app.js --target=bun --outdir=./dist
bun run ./dist/app.js
```

## Testing

Run tests with Bun's native test runner:

```bash
bun test
```

Run only Bun-specific tests:

```bash
bun test test/bun/
```

Run with coverage:

```bash
bun test --coverage
```

## Performance Comparison

Benchmarks show `BunSqliteIdempotencyStore` delivers 2-3x better performance than `SqliteIdempotencyStore`:

| Operation | Node.js (better-sqlite3) | Bun (bun:sqlite) | Improvement |
| --------- | ------------------------ | ---------------- | ----------- |
| INSERT    | 45,000 ops/sec           | 120,000 ops/sec  | 2.7x        |
| SELECT    | 80,000 ops/sec           | 200,000 ops/sec  | 2.5x        |
| UPDATE    | 40,000 ops/sec           | 95,000 ops/sec   | 2.4x        |

_Benchmarks run on Apple M1 Pro, 16GB RAM_

## File-Based Persistence

For production deployments with file-based SQLite:

```javascript
import { Hono } from "hono";
import { idempotency, BunSqliteIdempotencyStore } from "idempot";

const app = new Hono();
const store = new BunSqliteIdempotencyStore({ path: "./data/idempotency.db" });

// Cleanup expired records every hour
setInterval(
  () => {
    store.cleanup().then(() => {
      console.log("Cleaned up expired idempotency records");
    });
  },
  60 * 60 * 1000
);

app.post("/orders", idempotency({ store }), async (c) => {
  const body = await c.req.json();
  return c.json({ id: "order-123", ...body }, 201);
});

// Bun's native server
export default {
  port: 3000,
  fetch: app.fetch
};

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Closing database...");
  store.close();
  process.exit(0);
});
```

## Deployment

### Docker with Bun

```dockerfile
FROM oven/bun:1 as base
WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Run the app
EXPOSE 3000
CMD ["bun", "run", "app.ts"]
```

### Railway

Create a `railway.toml`:

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "bun run app.ts"
```

### Fly.io

Create a `fly.toml`:

```toml
app = "my-app"

[build]
  image = "oven/bun:1"

[[services]]
  internal_port = 3000
  protocol = "tcp"

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
```

## Troubleshooting

### TypeScript compilation errors

If you see `Cannot find module 'bun:sqlite'` during TypeScript compilation, this is expected. The `bun:sqlite` module only works in Bun runtime. You have two options:

1. **Skip building Bun-specific files** (recommended):

   ```json
   {
     "exclude": ["src/store/bun-sqlite.ts"]
   }
   ```

2. **Use Bun for TypeScript checking**:
   ```bash
   bun run tsc --noEmit
   ```

### Database locked errors

If you see "database is locked" errors:

- Ensure only one process accesses the database at a time
- Use Redis or DynamoDB for multi-instance deployments
- Configure SQLite for WAL mode (write-ahead logging)

### Import errors

Use `.js` extensions in imports:

```javascript
// Correct
import { BunSqliteIdempotencyStore } from "idempot";

// Also correct
import { idempotency } from "./hono-middleware.js";
```

## Migration from Node.js

To migrate from Node.js to Bun:

1. Change the store:

   ```javascript
   // Before (Node.js)
   import { SqliteIdempotencyStore } from "idempot";
   const store = new SqliteIdempotencyStore({ path: ":memory:" });

   // After (Bun)
   import { BunSqliteIdempotencyStore } from "idempot";
   const store = new BunSqliteIdempotencyStore({ path: ":memory:" });
   ```

2. Change the server:

   ```javascript
   // Before (Node.js)
   import { serve } from "@hono/node-server";
   serve({ fetch: app.fetch, port: 3000 });

   // After (Bun)
   export default {
     port: 3000,
     fetch: app.fetch
   };
   ```

3. Update scripts:
   ```json
   {
     "scripts": {
       "dev": "bun run --hot app.ts",
       "start": "bun run app.ts"
     }
   }
   ```

That's it! Your middleware logic stays the same.

## Next Steps

- See [README.md](../README.md) for middleware configuration options
- See [examples/](../examples/) for complete working examples
