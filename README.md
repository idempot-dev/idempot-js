# idempot

Idempotency middleware for Hono, Express, and Fastify with multiple storage backends, compliant with [draft-ietf-httpapi-idempotency-key-header-07](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07) spec.

## Installation

```bash
npm install idempot
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
npm install idempot
npm install -D better-sqlite3
```

```javascript
import { Hono } from "hono";
import { idempotency, SqliteIdempotencyStore } from "idempot";

const app = new Hono();
const store = new SqliteIdempotencyStore({ path: ":memory:" });

app.post("/orders", idempotency({ store }), async (c) => {
  // Your handler - protected from duplicate requests
  return c.json({ id: "order-123" }, 201);
});
```

## Quick Start - Fastify

```bash
npm install idempot fastify
npm install -D better-sqlite3
```

```javascript
import Fastify from "fastify";
import { idempotency, SqliteIdempotencyStore } from "idempot";

const fastify = Fastify();
const store = new SqliteIdempotencyStore({ path: ":memory:" });

fastify.post(
  "/orders",
  { preHandler: idempotency({ store }) },
  async (request, reply) => {
    // Your handler - protected from duplicate requests
    return reply.code(201).send({ id: "order-123" });
  }
);
```

## Core Features

- IETF-compliant idempotency key handling
- Request fingerprinting for conflict detection
- Automatic response caching and replay
- Supports multiple storage backends

## Response Headers

When a duplicate request is detected (same idempotency key), the middleware replays the cached response instead of executing the handler. In this case, the response includes the `x-idempotent-replayed: true` header to indicate that the response was replayed from cache.

## Key Length Requirements

By default, idempotency keys must be between **16 and 255 characters**. This provides sufficient entropy (~95 bits with base64) to prevent key exhaustion and collision attacks.

### Why 16 characters?

- Matches industry standards (NanoID default)
- Provides ~95 bits of entropy
- Accommodates all major ID generators: UUID (36), ULID (26), CUID (25), KSUID (27)
- Prevents exhaustion with just 62 possible values (1 char = only a-z, A-Z, 0-9)

### Customizing Key Length

If you need shorter keys (not recommended for production):

```javascript
idempotency({
  store,
  minKeyLength: 8, // Reduce minimum (1-255 allowed)
  maxKeyLength: 128 // Reduce maximum if needed
});
```

**Note:** The IETF draft spec recommends 1-255 characters. We default to 16+ for security.

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
      timeoutMs: 1000, // Operation timeout in ms (default: 500)
      maxRetries: 3, // Retry attempts (default: 3)
      retryDelayMs: 100, // Delay between retries in ms (default: 100)
      errorThresholdPercentage: 50, // % failures to open circuit (default: 50)
      resetTimeoutMs: 30000, // ms before attempting reset (default: 30000)
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
| timeoutMs                | 500ms   | Max time to wait for store operation |
| maxRetries               | 3       | Number of retry attempts             |
| retryDelayMs             | 100ms   | Delay between retries                |
| errorThresholdPercentage | 50%     | Failures to open circuit             |
| resetTimeoutMs           | 30s     | Time before attempting reset         |
| volumeThreshold          | 10      | Requests before circuit evaluates    |

## Development Setup

See [DEVELOPMENT.md](DEVELOPMENT.md)

## Examples

See `examples/` directory for complete usage examples

## License

BSD-3
TODO: Find the exact license abbreviation and regenerate the text
