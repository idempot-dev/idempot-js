# idempot

Idempotency middleware for Hono, Express, and Fastify.

See the [documentation site](https://mroderick.github.io/idempot/) for full details.

## Features

- IETF-compliant with [draft-ietf-httpapi-idempotency-key-header-07](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07)
- Request fingerprinting for conflict detection
- Built-in resilience: retries, timeouts, circuit breaker
- Modular packages reduce install time and dependencies

## Supported Runtimes, Frameworks, and Stores

| Category       | Options                                            |
| -------------- | -------------------------------------------------- |
| **Runtimes**   | Node.js, Bun, Deno, AWS Lambda, Cloudflare Workers |
| **Frameworks** | Express, Hono, Fastify                             |
| **Stores**     | Redis, DynamoDB, Postgres, SQLite, Cloudflare KV   |

## Runtime vs Storage Support

| Store         | Node | Bun | Deno | Lambda | Workers |
| ------------- | ---- | --- | ---- | ------ | ------- |
| Redis         | ✅   | ✅  | ✅   | ✅     | 🔄      |
| DynamoDB      | ✅   | ✅  | ✅   | ✅     | 🔄      |
| Postgres      | ✅   | ✅  | ✅   | ✅     | 🔄      |
| SQLite        | ✅   | ✅  | ✅   | ❌     | ❌      |
| Bun SQLite    | ❌   | ✅  | ❌   | ❌     | ❌      |
| Cloudflare KV | ❌   | ❌  | ❌   | ❌     | ✅      |

✅ = Supported | 🔄 = Untested (contributions welcome) | ❌ = Not supported

## Choosing a Storage Backend

Use your existing database for idempotency if possible. For high-volume systems or shared backends, use Redis, DynamoDB, or Cloudflare KV.

**Important:** Idempotency requires persistent storage. Without it, the system risks accepting duplicates.

- Redis: Enable `AOF` (and `RDB`) for persistence. See [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/).
- SQLite: Persist the database between deployments. Use [Litestream](https://litestream.io).

## Response Headers

Duplicate requests return cached responses with `x-idempotent-replayed: true`.

## Key Requirements

Idempotency keys must be 16–255 characters by default (~95 bits of entropy). This accommodates UUID (36), ULID (26), CUID (25), and KSUID (27).

Customize if needed:

```javascript
idempotency({
  store,
  minKeyLength: 8,
  maxKeyLength: 128
});
```

Keys cannot contain commas (HTTP frameworks combine multiple headers with commas).

## Resilience

The middleware handles store failures gracefully:

1. **Retries** — 3 attempts by default
2. **Timeout** — 500ms per operation
3. **Circuit Breaker** — Opens after 50% failures over 10 requests
4. **Fail-Fast** — Requests fail immediately while circuit is open
5. **Auto-Recovery** — Tests recovery after 30 seconds

```javascript
app.post(
  "/orders",
  idempotency({
    store,
    resilience: {
      timeoutMs: 1000,
      maxRetries: 5,
      errorThresholdPercentage: 30,
      resetTimeoutMs: 60000
    }
  }),
  handler
);
```

Unavailable stores return HTTP 503:

```json
{ "error": "Service temporarily unavailable" }
```

Monitor circuit state:

```javascript
console.log(middleware.circuit.status); // 'closed', 'open', 'half-open'
```

## Quick Start

```bash
npm install @idempot/core @idempot/hono-middleware @idempot/sqlite-store
```

```javascript
import { Hono } from "hono";
import { idempotency } from "@idempot/hono-middleware";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

const app = new Hono();
const store = new SqliteIdempotencyStore({ path: ":memory:" });

app.post("/orders", idempotency({ store }), async (c) => {
  return c.json({ id: "order-123" }, 201);
});
```

## Examples

See the `examples/` directory for complete examples.

## License

BSD-3
