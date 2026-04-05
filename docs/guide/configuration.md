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

| Option          | Type               | Default               | Description                                                    |
| --------------- | ------------------ | --------------------- | -------------------------------------------------------------- |
| `store`         | `IdempotencyStore` | **required**          | Storage backend for persisting idempotency records             |
| `required`      | `boolean`          | `true`                | Whether requests must include an `Idempotency-Key` header      |
| `ttlMs`         | `number`           | `86400000` (24 hours) | Time-to-live in milliseconds for idempotency records           |
| `minKeyLength`  | `number`           | `21`                  | Minimum allowed length for idempotency keys                    |
| `maxKeyLength`  | `number`           | `255`                 | Maximum allowed length for idempotency keys                    |
| `excludeFields` | `string[]`         | `[]`                  | Body fields to exclude when generating the request fingerprint |
| `resilience`    | `object`           | see below             | Circuit breaker and retry configuration                        |

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

All configuration options work across Node.js, Bun, and Deno runtimes.

| Runtime | All Options Supported |
| ------- | --------------------- |
| Node.js | ✅                    |
| Bun     | ✅                    |
| Deno    | ✅                    |
