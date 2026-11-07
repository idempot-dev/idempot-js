---
title: Redis Store - idempot-js
description: Redis-backed storage for idempotency middleware. High-performance caching with configurable key prefixes. Supports Node.js and Bun runtimes.
---

# Redis Store

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
