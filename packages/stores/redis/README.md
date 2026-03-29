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

Ensure Redis persistence is configured (AOF strongly recommended). See [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/).

## Deno Support

For Deno, use `DenoRedisIdempotencyStore`:

```javascript
import { DenoRedisIdempotencyStore } from "@idempot/redis-store/deno-redis.js";

const store = new DenoRedisIdempotencyStore({
  hostname: "127.0.0.1",
  port: 6379
});
```

## TypeScript Support

This library uses JavaScript with JSDoc comments for type information. Enable `allowJs` in your TypeScript configuration to use these types directly—no separate .d.ts files needed.

To use this library in a TypeScript project:

1. Add these settings to your `tsconfig.json`:

   ```json
   {
     "allowJs": true,
     "checkJs": true
   }
   ```

2. Import the library as you normally would:

   ```typescript
   import { RedisIdempotencyStore } from "@idempot/redis-store";
   ```

3. JSDoc comments provide full type safety: parameter types, return types, and detailed documentation in your IDE.

This approach simplifies maintenance while giving TypeScript users an excellent developer experience.

## License

BSD-3-Clause
