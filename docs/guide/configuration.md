---
title: Configuration - idempot-js
description: Configure idempotency middleware with custom TTL, key validation, field exclusions, and circuit breaker resilience settings. Production-ready defaults included.
---

# Configuration

idempot-js ships with production-ready defaults so you can focus on your application, not infrastructure configuration.

## Philosophy: Secure by Default

The library enforces sensible defaults that prioritize security and reliability.

## Configuration Options

### Core Options

| Option          | Type               | Default               | Description                                                                 |
| --------------- | ------------------ | --------------------- | --------------------------------------------------------------------------- |
| `store`         | `IdempotencyStore` | **required**          | Storage backend for persisting idempotency records                          |
| `scope`         | `function`         | `null`                | Resolves the principal that owns a request, isolating records per principal |
| `required`      | `boolean`          | `true`                | Whether requests must include an `Idempotency-Key` header                   |
| `ttlMs`         | `number`           | `86400000` (24 hours) | Time-to-live in milliseconds for idempotency records                        |
| `minKeyLength`  | `number`           | `21`                  | Minimum allowed length for idempotency keys                                 |
| `maxKeyLength`  | `number`           | `255`                 | Maximum allowed length for idempotency keys                                 |
| `excludeFields` | `string[]`         | `[]`                  | Body fields to exclude when generating the request fingerprint              |
| `resilience`    | `object`           | see below             | Circuit breaker and retry configuration                                     |

### Resilience Options

| Option                     | Type     | Default              | Description                                                   |
| -------------------------- | -------- | -------------------- | ------------------------------------------------------------- |
| `timeoutMs`                | `number` | `500`                | Timeout in milliseconds for each store operation              |
| `maxRetries`               | `number` | `3`                  | Maximum retry attempts for failed operations                  |
| `retryDelayMs`             | `number` | `100`                | Delay in milliseconds between retry attempts                  |
| `errorThresholdPercentage` | `number` | `50`                 | Error threshold percentage that triggers circuit breaker      |
| `resetTimeoutMs`           | `number` | `30000` (30 seconds) | Time to wait before attempting to reset the circuit breaker   |
| `volumeThreshold`          | `number` | `10`                 | Minimum number of requests before circuit breaker can trigger |

## Required Idempotency Keys

By default, the middleware rejects requests without an `Idempotency-Key` header:

```javascript
import { idempotency } from "@idempot/hono-middleware";

// Default: keys are required
app.post("/orders", idempotency({ store }), handler);

// Allow requests without keys (not recommended for production)
app.post("/orders", idempotency({ store, required: false }), handler);
```

Setting `required: false` can be helpful during gradual rollout of idempotency protection.

## Key Length Validation

Keys must be 21–255 characters. The 21-character minimum matches nanoid's default length, providing sufficient entropy to prevent collision attacks. The 255-character maximum prevents abuse through oversized keys.

Keys must not contain commas. This restriction exists because:

1. **RFC 7230 Compliance**: HTTP allows multiple headers with the same name to be combined with commas
2. **Structured Field Values**: The IETF draft defines `Idempotency-Key` as an Item Structured Header (RFC 8941)
3. **Practical Indistinguishability**: A key with commas is indistinguishable from multiple headers after HTTP processing

## Record Retention

Idempotency records expire after 24 hours by default. This balances storage costs against the practical usefulness of replay protection—long enough for genuine retries, short enough to avoid indefinite state accumulation.

Adjust for your use case:

```javascript
// High-volume API: shorter retention
idempotency({ store, ttlMs: 60 * 60 * 1000 }); // 1 hour

// Financial operations: longer retention
idempotency({ store, ttlMs: 7 * 24 * 60 * 60 * 1000 }); // 7 days
```

### Expiration Policy

The middleware never replays an expired record. A lookup ignores any record whose `expires_at` is in the past, even when the row is still in the table.

Expired rows are removed during lookup. Most stores remove at most 10 rows per lookup, so removal scales with request traffic and no background job is required. A quiet service can keep expired rows for a long time.

A retry that arrives after its record expired succeeds immediately. The claim reclaims any expired row for the key (clearing the stale response and restarting the TTL), so the retry is processed as a new request and its response is cached again. The same applies whatever the old payload was: an expired key is free.

Before reclaim-on-claim existed, such a retry could receive `409 Conflict` until a purge reached the row. The DynamoDB store has always reclaimed this way, via the expiry predicate in its conditional-write claim.

Expired rows are removed during lookup. Most stores remove at most 10 rows per lookup, so removal scales with request traffic and no background job is required. A quiet service can keep expired rows for a long time; the reclaim above does not depend on it.

The draft specification leaves this policy to the resource. It only requires the resource to define the policy and publish it: see [SPEC section 2.3](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07#section-2.3).

## Field Exclusions

Exclude fields that change on every request but don't affect the outcome:

```javascript
idempotency({
  store,
  excludeFields: [
    "timestamp", // Top-level field
    "$.metadata.requestId" // JSONPath for nested fields
  ]
});
```

This ensures requests with different timestamps but otherwise identical payloads are treated as duplicates.

## Principal Scope

A record is scoped to the request route by default: the method, path and query. If your deployment identifies a principal (a user, tenant, or API client), add a `scope` function so two principals that send the same key and body do not share a record.

The function receives your framework's own request object and returns a string (or a finite number, which is converted to a string), or `undefined` when there is no principal. It must be synchronous:

```javascript
// Hono
idempotency({ store, scope: (c) => c.get("user")?.id });

// Express
idempotency({ store, scope: (req) => req.user?.id });

// Fastify
idempotency({ store, scope: (request) => request.user?.tenantId });

// Bun
idempotency({ store, scope: (req) => req.user?.tenantId });
```

The value must come from a trusted, server-verified source. Never read it from a client-supplied header or body: any caller could then claim another principal and read or poison that principal's records.

The returned value must be stable for the life of a retry. If it changes between the first request and the retry, the retry is treated as a different operation and runs again. Do not use a value that rotates, such as a session token or a timestamp.

A scope function that returns `undefined`, or that throws, leaves the request on the route-only identity. The request is processed normally: it is not refused. A non-string, non-number return, including an async function's Promise, is treated the same way and logs one warning per scope function. The route-only identity is shared by every principal, so a transient failure can let another principal's record answer the request. Keep the function reliable and stable.

## Upgrading From an Unscoped Release

An earlier release did not bind a record to the operation that wrote it. Records written by that release carry no route, principal, or scoped fingerprint. After the upgrade, the middleware looks them up under the pre-scoping identity and honors them for their remaining TTL, so a retry sent during that window replays the stored response instead of running the handler again.

The grace window has these consequences:

- A pre-scoping record is unscoped. A retry with the same key can receive a response that the old release stored for a different request, including a request from another principal.
- A retry with the same key but a different body still returns 422, as it did before the upgrade. A different key with the same body is a miss during the window, not the old 409.
- Any period with old and new instances serving at the same time, such as a rolling upgrade or a canary, re-executes handlers for retries that land on an old instance. New records live under scoped keys, which an old instance cannot read. Drain old instances promptly or accept the duplicates for the TTL.
- Reverting to the earlier release leaves records written by the new release unreadable, so a rollback during the window can run handlers a second time.
- Changing `excludeFields` between releases defeats the fallback: the old record was hashed with the old exclusions, so every retry misses and runs the handler. Keep `excludeFields` unchanged across the upgrade.
- A client key that begins with 16 hexadecimal characters and a colon can collide with a scoped record key, and the two are not distinguishable during the grace window. Avoid that key shape.

Wait for the TTL to pass before rolling back, or drain in-flight retries first.

## Resilience Configuration

The middleware handles store failures gracefully with automatic retries, timeouts, and circuit breaker protection.

### Basic Configuration

```javascript
idempotency({
  store,
  resilience: {
    timeoutMs: 1000, // 1 second per operation
    maxRetries: 5, // More retries for flaky networks
    errorThresholdPercentage: 30, // Trip circuit at 30% errors
    resetTimeoutMs: 60000 // 1 minute recovery time
  }
});
```

### Circuit Breaker Monitoring

Access the circuit breaker state to monitor health:

```javascript
const middleware = idempotency({ store });

// Check circuit state
console.log(middleware.circuit.status); // 'closed', 'open', or 'half-open'

// Check if currently open
if (middleware.circuit.opened) {
  console.warn("Circuit breaker is open - store may be down");
}
```

### Failure Behavior

When the circuit breaker is open or all retries are exhausted:

- Requests return HTTP 503 with `{ "error": "Service temporarily unavailable" }`
- Your application can continue serving read-only operations
- The circuit tests recovery automatically after `resetTimeoutMs`

## Complete Examples

### Basic Configuration

```javascript
import { idempotency } from "@idempot/express-middleware";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

const store = new SqliteIdempotencyStore({ path: "./idempotency.db" });

app.post("/orders", idempotency({ store }), async (req, res) => {
  const order = await createOrder(req.body);
  res.status(201).json(order);
});
```

### High-Volume API

```javascript
import { idempotency } from "@idempot/hono-middleware";
import { RedisIdempotencyStore } from "@idempot/redis-store";

const store = new RedisIdempotencyStore({ host: "redis.internal" });

app.post(
  "/webhooks",
  idempotency({
    store,
    ttlMs: 60 * 60 * 1000, // 1 hour - webhooks retry quickly
    resilience: {
      timeoutMs: 200, // Fast timeout for high throughput
      maxRetries: 2 // Fewer retries, fail fast
    }
  }),
  async (c) => {
    await processWebhook(await c.req.json());
    return c.json({ received: true });
  }
);
```

### Financial Operations

```javascript
import { idempotency } from "@idempot/fastify-middleware";
import { PostgresIdempotencyStore } from "@idempot/postgres-store";

const store = new PostgresIdempotencyStore({
  host: "postgres.internal",
  database: "payments"
});

fastify.post(
  "/payments",
  {
    preHandler: idempotency({
      store,
      ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
      excludeFields: ["timestamp", "$.audit.clientTimestamp"],
      resilience: {
        timeoutMs: 2000, // Allow slower database operations
        maxRetries: 5, // More retries for critical operations
        resetTimeoutMs: 60000 // 1 minute recovery window
      }
    })
  },
  async (request, reply) => {
    const payment = await processPayment(request.body);
    return payment;
  }
);
```

## Choosing a Storage Backend

Use your existing database for idempotency when possible. For high-volume systems or shared backends, use Redis.

**Important:** Idempotency requires _persistent_ storage. Without persistence, the system risks accepting duplicates.

- **Redis**: Enable `AOF` (and `RDB`) for persistence. See [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/).
- **SQLite**: Persist the database between deployments. Use [Litestream](https://litestream.io).

## Runtime Compatibility

All configuration options work across Node.js and Bun runtimes.

| Runtime | All Options Supported |
| ------- | --------------------- |
| Node.js | ✅                    |
| Bun     | ✅                    |
