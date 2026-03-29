# @idempot/redis-store

Redis storage backend for idempotency.

## Installation

```bash
npm install @idempot/redis-store ioredis
```

## Usage

```javascript
import { RedisIdempotencyStore } from "@idempot/redis-store";
import Redis from "ioredis";

const redis = new Redis();
const store = new RedisIdempotencyStore({ client: redis });

// Or with prefix
const store = new RedisIdempotencyStore({
  client: redis,
  prefix: "myapp:idempotency:"
});

// Close on shutdown
process.on("SIGINT", async () => {
  await store.close();
  process.exit(0);
});
```

## API

### `new RedisIdempotencyStore(options)`

Creates a new Redis store.

**Options:**

- `client`: Redis client instance (ioredis)
- `prefix`: Key prefix (default: `"idempotency:"`)

### `store.lookup(key, fingerprint)`

Look up an idempotency record by key and fingerprint. Returns `{byKey, byFingerprint}`.

### `store.startProcessing(key, fingerprint, ttlMs)`

Mark a request as being processed. Creates a new record with status `'processing'`.

### `store.complete(key, response)`

Mark a request as complete with its response data. Updates the record with status `'complete'`.

### `store.close()`

Close the Redis connection.

## Persistence

Ensure Redis persistence is configured (AOF recommended). See [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/).

## Deno Support

For Deno, use `DenoRedisIdempotencyStore`:

```javascript
import { DenoRedisIdempotencyStore } from "@idempot/redis-store/deno-redis.js";

const store = new DenoRedisIdempotencyStore({
  hostname: "127.0.0.1",
  port: 6379
});
```

## License

BSD-3-Clause
