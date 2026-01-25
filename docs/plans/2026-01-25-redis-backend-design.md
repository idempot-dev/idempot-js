# Redis Idempotency Store Design

## Purpose

Add Redis as a storage backend for multi-server production deployments. SQLite serves single-server and development use cases. Redis provides shared state across multiple app instances with built-in clustering and sentinel support.

## Use Cases

- **Production**: Multi-server deployments needing shared idempotency state
- **High throughput**: APIs where SQLite cannot handle request volume
- **Cloud-native**: Teams already running Redis for caching or sessions

## Architecture

**RedisIdempotencyStore** implements the `IdempotencyStore` interface using ioredis. Users create and configure the Redis client, then pass it to the store. This gives users full control over clustering, sentinels, TLS, retry logic, and connection pooling.

### Data Model

**Key Format:**
```
idempotency:{key}            → JSON string (complete record)
fingerprint:{fingerprint}    → String (stores the key)
```

**Example:**
```
idempotency:req-123          → '{"key":"req-123","fingerprint":"abc","status":"complete",...}'
fingerprint:abc              → "req-123"
```

### TTL Strategy

Redis handles expiration natively. Both keys receive the same TTL. Redis auto-deletes expired keys. The `cleanup()` method becomes a no-op (exists for interface compatibility only).

## API Design

### Constructor

```typescript
interface RedisIdempotencyStoreOptions {
  client: Redis;  // User-configured ioredis client
}

const store = new RedisIdempotencyStore({ client: redisClient });
```

Users manage the Redis client lifecycle. The store does not call `quit()` or `disconnect()`. No `close()` method needed (or make it a no-op for parity with SQLite).

### Operations

**lookup(key, fingerprint)**

Pipelines two GET operations for parallel execution:
```typescript
pipeline.get(`idempotency:${key}`);
pipeline.get(`fingerprint:${fingerprint}`);
```

If the fingerprint lookup returns a key, fetches that record. Returns both parsed records or null.

**startProcessing(key, fingerprint, ttlMs)**

Creates both keys with TTL:
```typescript
const record = {
  key,
  fingerprint,
  status: 'processing',
  expiresAt: Date.now() + ttlMs
};

const ttlSeconds = Math.ceil(ttlMs / 1000);

pipeline.setex(`idempotency:${key}`, ttlSeconds, JSON.stringify(record));
pipeline.setex(`fingerprint:${fingerprint}`, ttlSeconds, key);
```

**complete(key, response)**

Fetches existing record, updates status and response, preserves remaining TTL:
```typescript
const existing = await client.get(`idempotency:${key}`);
if (!existing) {
  throw new Error(`No record found for key: ${key}`);
}

const record = JSON.parse(existing);
record.status = 'complete';
record.response = response;

const ttl = await client.ttl(`idempotency:${key}`);
if (ttl > 0) {
  await client.setex(`idempotency:${key}`, ttl, JSON.stringify(record));
}
```

**cleanup()**

No-op. Redis TTL handles cleanup automatically.

## Error Handling

- **Pipeline failures**: Bubble up ioredis errors (connection, auth, timeout)
- **Missing key on complete()**: Throw explicit error matching SQLite behavior
- **Expired key during complete()**: Throw error when TTL ≤ 0 or key missing

Users handle Redis client errors (connection failures, reconnection logic) through ioredis configuration.

## Dependencies

**package.json changes:**
```json
"peerDependencies": {
  "hono": ">=4.0.0",
  "ioredis": ">=5.0.0"
},
"peerDependenciesMeta": {
  "ioredis": { "optional": true }
}
```

**devDependencies:**
- Add `ioredis` for testing
- Add `@types/ioredis` for TypeScript
- Add `ioredis-mock` for unit tests without real Redis

## Testing Strategy

Use `ioredis-mock` for unit tests. No real Redis instance required.

**Test coverage:**
- Initialization with user client
- Lookup (empty, by key, by fingerprint, both)
- startProcessing creates both keys with TTL
- complete updates record and preserves TTL
- complete throws on missing key
- TTL expiration (mock time advancement)
- Pipeline error handling

**Example test:**
```typescript
import RedisMock from 'ioredis-mock';

test("RedisIdempotencyStore - startProcessing creates keys", async (t) => {
  const redis = new RedisMock();
  const store = new RedisIdempotencyStore({ client: redis });

  await store.startProcessing("test-key", "test-fp", 60000);

  const result = await store.lookup("test-key", "test-fp");

  t.ok(result.byKey);
  t.equal(result.byKey.status, "processing");
  t.ok(result.byFingerprint);
});
```

## Example Application

```typescript
// examples/redis-app.ts
import Redis from 'ioredis';
import { Hono } from 'hono';
import { idempotency, RedisIdempotencyStore } from 'hono-idempotency';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

const store = new RedisIdempotencyStore({ client: redis });
const app = new Hono();

app.post('/orders', idempotency({ store }), async (c) => {
  const body = await c.req.json();
  const orderId = Math.random().toString(36).substring(7);

  return c.json({ id: orderId, status: 'created', ...body }, 201);
});

// Graceful shutdown
process.on('SIGINT', () => {
  redis.quit();
  process.exit(0);
});
```

## Documentation Updates

**README.md**: Add Redis section after SQLite quick start showing multi-server production setup.

**IMPLEMENTATION_SUMMARY.md**: Add RedisIdempotencyStore to components list.

## Trade-offs

**Pros:**
- Native clustering and sentinel support via ioredis
- Auto-expiration through Redis TTL (no manual cleanup)
- User controls Redis configuration (TLS, retry, pooling)
- Pipelined operations minimize network round-trips

**Cons:**
- Requires Redis infrastructure (operational complexity)
- Optional peer dependency increases setup steps
- Network latency vs. SQLite's local storage
- Additional testing complexity with mock

## Non-Goals

- No built-in Redis client creation (users configure ioredis)
- No connection pooling management (ioredis handles it)
- No fallback to SQLite (users choose store explicitly)
- No RedisJSON or RediSearch modules (YAGNI)
