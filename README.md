# hono-idempotency

Idempotency middleware for Hono with multiple storage backends, compliant with [draft-ietf-httpapi-idempotency-key-header-07](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07) spec.

## Installation

```bash
npm install hono-idempotency
```

Choose a storage backend from the sections below.

## Storage Backends

The library supports several storage backends.

**Choosing a storage backend:**

If you're running high volume systems or want to share a storage backend among several services, it would make sense to have a dedicated data store for idempotency. Otherwise, you can easily use your existing database for your application.

| Backend           | Best For                        | Setup Complexity | Node | Bun | Deno | Lambda | Workers |
| ----------------- | ------------------------------- | ---------------- | ---- | --- | ---- | ------ | ------- |
| **Redis**         | High performance                | Medium           | ✅   | ✅  | ✅   | ✅     | 🔄      |
| **DynamoDB**      | AWS-native, serverless, managed | Medium           | ✅   | ✅  | ✅   | ✅     | 🔄      |
| **Postgres**      | Multi-server                    | Medium           | ✅   | ✅  | ✅   | ✅     | 🔄      |
| **SQLite**        | Single-server, development      | Easy             | ✅   | ✅  | ✅   | ❌     | ❌      |
| **Bun SQLite**    | Bun runtime, best performance   | Easy             | ❌   | ✅  | ❌   | ❌     | ❌      |
| **Cloudflare KV** | Cloudflare Workers              | Easy             | ❌   | ❌  | ❌   | ❌     | ✅      |

**Runtime Support:**

- ✅ Fully supported and tested
- 🔄 Not yet tested (contributions welcome)
- ❌ Not supported

**Important:**

The idempotency promise only works with persistence. If the storage backend doesn't have reliable persistence, the system is not idempotent and is at risk of accepting duplicate requests.

- For Redis this means configuring `AOF` (and maybe also `RDB`). See [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/).
- For SQLite it means making sure your database is persisted between deployments. You could use [litestream](https://litestream.io).

## Quick Start - SQLite

For local development

```bash
npm install hono-idempotency
# TODO: do we need to install better-sqlite3, or will it get pulled in as a devDependency automatically?
npm install -D better-sqlite3
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

**Recommended Storage:**

- **Redis/ElastiCache**: For users with existing Redis infrastructure or high volume
- **DynamoDB**: Best for Lambda (serverless, no cold start penalty, scales automatically)
- **Postgres**: For users with existing Postgres infrastructure
- **SQLite**: For single server and light weight local development

See [docs/lambda-setup.md](./docs/lambda-setup.md) for complete Lambda setup guide.

## Core Features

- IETF-compliant idempotency key handling
- Request fingerprinting for conflict detection
- Automatic response caching and replay
- Supports multiple storage backends

## Resilience

The middleware includes built-in resilience features using [opossum](https://nodeshift.dev/opossum/) circuit breaker to handle store failures gracefully.

### How It Works

When the backing store (Redis, DynamoDB, SQLite) experiences failures:

1. **Retries** - Failed operations are automatically retried up to 3 times
2. **Timeout** - Each operation times out (`500ms` default) to prevent hanging
3. **Circuit Breaker** - After 50% failure rate over 10 requests, the circuit opens
4. **Fail-Fast** - While the circuit is open, requests fail immediately without calling the store
5. **Auto-Recovery** - After 30 seconds, the circuit breaker allows test requests through

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

See [DEVELOPMENT.md](DEVELOPMENT.md)

## Examples

See `examples/` directory for complete usage examples

## License

BSD-3
TODO: Find the exact license abbreviation and regenerate the text
