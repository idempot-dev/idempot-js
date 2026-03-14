# idempot

Idempotency middleware for Hono, Express, and Fastify.

## Why Idempotency Matters

Duplicate requests happen often:

| Cause            | Example                            |
| ---------------- | ---------------------------------- |
| User behavior    | Double-clicking submit             |
| Client retries   | Automatic retry on timeout         |
| Network issues   | Request succeeds, response lost    |
| Load balancer    | Backend timeout triggers retry     |
| Webhook delivery | Provider retries failed deliveries |

Without idempotency protection, these cause duplicate payments, orders, or records.

## The Key Pattern

Stripe, PayPal, and major APIs use this standard approach:

1. **Client generates a unique key** — typically a UUID for each unique operation
2. **Sends as header** — `Idempotency-Key: <uuid>`
3. **Server stores key + response** — in your database or Redis
4. **On duplicate request** — returns cached response instead of reprocessing

## Request Flow

```
Client                      Server
   │                          │
   ├── POST + Idempotency-Key ──→ │
   │                          ├── Generate fingerprint from request
   │                          ├── Check: key exists?
   │                          │    ├── No: Process request, store response
   │                          │    └── Yes: Check fingerprint
   │                          │         ├── Match: Return cached response
   │                          │         └── Conflict: Return 409
   │                          ←── 201 Created (+ x-idempotent-replayed: false)
   │                          │
   ├── POST + same Key ──→    │
   │                          ├── Generate fingerprint
   │                          ├── Key exists + fingerprint matches
   │                          ←── 201 Created (+ x-idempotent-replayed: true)
```

This library adds **request fingerprinting** to detect conflicts when the same idempotency key is used with different request payloads — a common source of bugs.

## Features

- IETF-compliant with [draft-ietf-httpapi-idempotency-key-header-07](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07)
- Request fingerprinting for conflict detection
- Built-in resilience: retries, timeouts, circuit breaker
- Modular packages reduce install time and dependencies

## Supported Runtimes, Frameworks, and Stores

| Category       | Options                                                      |
| -------------- | ------------------------------------------------------------ |
| **Runtimes**   | Node.js, Bun, Deno (Lambda & Cloudflare Workers planned)     |
| **Frameworks** | Express, Hono, Fastify                                       |
| **Stores**     | Redis, PostgreSQL, SQLite (DynamoDB & Cloudflare KV planned) |

## Runtime vs Storage Support

| Store      | Node | Bun | Deno |
| ---------- | ---- | --- | ---- |
| Redis      | ✅   | ✅  | ✅   |
| Postgres   | ✅   | ✅  | ✅   |
| SQLite     | ✅   | ✅  | ✅   |
| Bun SQLite | ❌   | ✅  | ❌   |

✅ = Supported | 🔄 = Untested (contributions welcome) | ❌ = Not supported

## Choosing a Storage Backend

Use your existing database for idempotency when possible. For high-volume systems or shared backends, use Redis.

**Important:** Idempotency requires _persistent_ storage. Without persistence, the system risks accepting duplicates.

- Redis: Enable `AOF` (and `RDB`) for persistence. See [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/).
- SQLite: Persist the database between deployments. Use [Litestream](https://litestream.io).

## Response Headers

Duplicate requests return cached responses with `x-idempotent-replayed: true`.

## Key Requirements

Idempotency keys must be 21–255 characters by default (~126 bits of entropy). This accommodates popular key generators like UUID (36), ULID (26), CUID (25), KSUID (27) and nanoid (21).

The minimum of 21 is enforced — values below 21 throw an error:

```javascript
idempotency({
  store,
  minKeyLength: 21, // default, must be at least 21
  maxKeyLength: 128
});
```

Keys must not contain commas. This restriction exists because:

1. **RFC 7230 Compliance**: HTTP allows multiple headers with the same name to be combined with commas. When multiple `Idempotency-Key` headers are sent, frameworks combine them into a single comma-separated value.

2. **Structured Field Values**: The IETF draft defines `Idempotency-Key` as an Item Structured Header (RFC 8941), which allows only a single value. Commas are used as list delimiters in Structured Fields.

3. **Practical Indistinguishability**: A key containing a comma (e.g., `key,with,commas`) is indistinguishable from multiple headers (e.g., `key`, `with`, `commas`) after HTTP processing.

If a key contains commas, the middleware returns HTTP 400:

```json
{
  "error": "Idempotency-Key cannot contain commas (multiple keys not allowed)"
}
```

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
