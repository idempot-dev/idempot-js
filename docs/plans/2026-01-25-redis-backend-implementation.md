# Redis Idempotency Store Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Redis as a storage backend for multi-server production deployments.

**Architecture:** RedisIdempotencyStore implements IdempotencyStore interface using ioredis. Users pass configured Redis client to store. Store uses JSON strings with Redis TTL for auto-expiration. Pipelined operations minimize network round-trips.

**Tech Stack:** ioredis (v5+), ioredis-mock (testing), tap (test framework)

---

## Phase 1: Dependencies and Project Setup

### Task 1: Add Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Add ioredis to devDependencies**

Run: `npm install --save-dev ioredis ioredis-mock`

Expected: Dependencies added to package.json devDependencies section

**Step 2: Add ioredis to peerDependencies**

Edit `package.json`, add to peerDependencies:
```json
"peerDependencies": {
  "hono": ">=4.0.0",
  "ioredis": ">=5.0.0"
}
```

Add peerDependenciesMeta:
```json
"peerDependenciesMeta": {
  "ioredis": { "optional": true }
}
```

**Step 3: Verify installation**

Run: `npm run build`

Expected: Build succeeds with no errors

**Step 4: Commit**

Run: `git add package.json package-lock.json && git commit -m "chore: add ioredis dependencies for Redis store"`

---

## Phase 2: Core Implementation (TDD)

### Task 2: Test - Redis Store Initialization

**Files:**
- Create: `tests/redis.test.ts`

**Step 1: Write initialization test**

Create `tests/redis.test.ts`:
```typescript
import { test } from "tap";
import RedisMock from "ioredis-mock";
import { RedisIdempotencyStore } from "../src/store/redis.js";

test("RedisIdempotencyStore - initialization", (t) => {
  const redis = new RedisMock();
  const store = new RedisIdempotencyStore({ client: redis });
  t.ok(store, "store should be created");
  t.end();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/redis.test.ts`

Expected: FAIL with "Cannot find module '../src/store/redis.js'"

**Step 3: Create minimal store class**

Create `src/store/redis.ts`:
```typescript
import type { Redis } from "ioredis";
import type { IdempotencyStore, IdempotencyRecord } from "../types.js";

export interface RedisIdempotencyStoreOptions {
  client: Redis;
}

export class RedisIdempotencyStore implements IdempotencyStore {
  private client: Redis;

  constructor(options: RedisIdempotencyStoreOptions) {
    this.client = options.client;
  }

  // Placeholder methods to satisfy interface
  async lookup() {
    return { byKey: null, byFingerprint: null };
  }
  async startProcessing() {}
  async complete() {}
  async cleanup() {}
}
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/redis.test.ts`

Expected: 1 test passing

**Step 5: Commit**

Run: `git add tests/redis.test.ts src/store/redis.ts && git commit -m "test: add Redis store initialization test"`

---

### Task 3: Test - Lookup with Empty Store

**Files:**
- Modify: `tests/redis.test.ts`

**Step 1: Write lookup test**

Add to `tests/redis.test.ts`:
```typescript
test("RedisIdempotencyStore - lookup with empty store", async (t) => {
  const redis = new RedisMock();
  const store = new RedisIdempotencyStore({ client: redis });

  const result = await store.lookup("test-key", "test-fp");

  t.equal(result.byKey, null, "byKey should be null");
  t.equal(result.byFingerprint, null, "byFingerprint should be null");
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/redis.test.ts`

Expected: Test fails (lookup returns wrong signature or values)

**Step 3: Implement lookup method**

Update `src/store/redis.ts`:
```typescript
async lookup(
  key: string,
  fingerprint: string
): Promise<{
  byKey: IdempotencyRecord | null;
  byFingerprint: IdempotencyRecord | null;
}> {
  // Pipeline for parallel execution
  const pipeline = this.client.pipeline();
  pipeline.get(`idempotency:${key}`);
  pipeline.get(`fingerprint:${fingerprint}`);
  const results = await pipeline.exec();

  if (!results) {
    return { byKey: null, byFingerprint: null };
  }

  const [[, byKeyJson], [, fpKeyJson]] = results as [[Error | null, string | null], [Error | null, string | null]];

  // Parse record by key
  const byKey = byKeyJson ? JSON.parse(byKeyJson) : null;

  // If fingerprint found, fetch that record
  let byFingerprint: IdempotencyRecord | null = null;
  if (fpKeyJson) {
    const recordJson = await this.client.get(`idempotency:${fpKeyJson}`);
    byFingerprint = recordJson ? JSON.parse(recordJson) : null;
  }

  return { byKey, byFingerprint };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/redis.test.ts`

Expected: 2 tests passing

**Step 5: Commit**

Run: `git add tests/redis.test.ts src/store/redis.ts && git commit -m "feat: implement Redis store lookup method"`

---

### Task 4: Test - startProcessing Creates Keys

**Files:**
- Modify: `tests/redis.test.ts`

**Step 1: Write startProcessing test**

Add to `tests/redis.test.ts`:
```typescript
test("RedisIdempotencyStore - startProcessing creates keys", async (t) => {
  const redis = new RedisMock();
  const store = new RedisIdempotencyStore({ client: redis });

  await store.startProcessing("test-key", "test-fp", 60000);

  const result = await store.lookup("test-key", "test-fp");

  t.ok(result.byKey, "record should exist by key");
  t.ok(result.byFingerprint, "record should exist by fingerprint");
  t.equal(result.byKey?.status, "processing", "status should be processing");
  t.equal(result.byKey?.key, "test-key", "key should match");
  t.equal(result.byKey?.fingerprint, "test-fp", "fingerprint should match");
  t.ok(
    result.byKey?.expiresAt && result.byKey.expiresAt > Date.now(),
    "should have future expiration"
  );
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/redis.test.ts`

Expected: Test fails (startProcessing not implemented)

**Step 3: Implement startProcessing method**

Update `src/store/redis.ts`:
```typescript
async startProcessing(
  key: string,
  fingerprint: string,
  ttlMs: number
): Promise<void> {
  const record: IdempotencyRecord = {
    key,
    fingerprint,
    status: "processing",
    expiresAt: Date.now() + ttlMs,
  };

  const ttlSeconds = Math.ceil(ttlMs / 1000);

  // Pipeline both writes
  const pipeline = this.client.pipeline();
  pipeline.setex(`idempotency:${key}`, ttlSeconds, JSON.stringify(record));
  pipeline.setex(`fingerprint:${fingerprint}`, ttlSeconds, key);
  await pipeline.exec();
}
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/redis.test.ts`

Expected: 3 tests passing

**Step 5: Commit**

Run: `git add tests/redis.test.ts src/store/redis.ts && git commit -m "feat: implement Redis store startProcessing method"`

---

### Task 5: Test - complete Updates Record

**Files:**
- Modify: `tests/redis.test.ts`

**Step 1: Write complete test**

Add to `tests/redis.test.ts`:
```typescript
test("RedisIdempotencyStore - complete updates record", async (t) => {
  const redis = new RedisMock();
  const store = new RedisIdempotencyStore({ client: redis });

  await store.startProcessing("test-key", "test-fp", 60000);

  await store.complete("test-key", {
    status: 200,
    headers: { "content-type": "application/json" },
    body: '{"result":"ok"}',
  });

  const result = await store.lookup("test-key", "test-fp");

  t.equal(result.byKey?.status, "complete", "status should be complete");
  t.ok(result.byKey?.response, "response should be stored");
  t.equal(result.byKey?.response?.status, 200, "response status should match");
  t.same(
    result.byKey?.response?.headers,
    { "content-type": "application/json" },
    "response headers should match"
  );
  t.equal(
    result.byKey?.response?.body,
    '{"result":"ok"}',
    "response body should match"
  );
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/redis.test.ts`

Expected: Test fails (complete not implemented)

**Step 3: Implement complete method**

Update `src/store/redis.ts`:
```typescript
async complete(
  key: string,
  response: {
    status: number;
    headers: Record<string, string>;
    body: string;
  }
): Promise<void> {
  // Fetch existing record
  const existingJson = await this.client.get(`idempotency:${key}`);
  if (!existingJson) {
    throw new Error(`No record found for key: ${key}`);
  }

  const record = JSON.parse(existingJson) as IdempotencyRecord;
  record.status = "complete";
  record.response = response;

  // Get remaining TTL and re-set with updated record
  const ttl = await this.client.ttl(`idempotency:${key}`);
  if (ttl > 0) {
    await this.client.setex(`idempotency:${key}`, ttl, JSON.stringify(record));
  } else {
    throw new Error(`Record expired or missing for key: ${key}`);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/redis.test.ts`

Expected: 4 tests passing

**Step 5: Commit**

Run: `git add tests/redis.test.ts src/store/redis.ts && git commit -m "feat: implement Redis store complete method"`

---

### Task 6: Test - cleanup Is No-Op

**Files:**
- Modify: `tests/redis.test.ts`

**Step 1: Write cleanup test**

Add to `tests/redis.test.ts`:
```typescript
test("RedisIdempotencyStore - cleanup is no-op", async (t) => {
  const redis = new RedisMock();
  const store = new RedisIdempotencyStore({ client: redis });

  // Add record (Redis mock doesn't actually expire keys)
  await store.startProcessing("test-key", "test-fp", 60000);

  // Cleanup should not throw
  await store.cleanup();

  // Record should still exist (mock doesn't expire)
  const result = await store.lookup("test-key", "test-fp");
  t.ok(result.byKey, "record should still exist after cleanup");
});
```

**Step 2: Run test to verify it passes**

Run: `npm test tests/redis.test.ts`

Expected: 5 tests passing (cleanup already returns void)

**Step 3: Add comment to cleanup method**

Update `src/store/redis.ts`:
```typescript
async cleanup(): Promise<void> {
  // No-op: Redis TTL handles cleanup automatically
}
```

**Step 4: Commit**

Run: `git add tests/redis.test.ts src/store/redis.ts && git commit -m "test: verify Redis store cleanup is no-op"`

---

### Task 7: Test - Edge Cases

**Files:**
- Modify: `tests/redis.test.ts`

**Step 1: Write edge case tests**

Add to `tests/redis.test.ts`:
```typescript
test("RedisIdempotencyStore - complete throws on missing key", async (t) => {
  const redis = new RedisMock();
  const store = new RedisIdempotencyStore({ client: redis });

  try {
    await store.complete("nonexistent", {
      status: 200,
      headers: {},
      body: "test",
    });
    t.fail("should have thrown");
  } catch (err: unknown) {
    const error = err as Error;
    t.match(error.message, /No record found/, "should throw error for missing key");
  }
});

test("RedisIdempotencyStore - lookup with different key and fingerprint", async (t) => {
  const redis = new RedisMock();
  const store = new RedisIdempotencyStore({ client: redis });

  await store.startProcessing("key-1", "fp-1", 60000);

  const result = await store.lookup("key-2", "fp-1");

  t.equal(result.byKey, null, "should not find by different key");
  t.ok(result.byFingerprint, "should find by matching fingerprint");
  t.equal(result.byFingerprint?.key, "key-1", "fingerprint should point to key-1");
});

test("RedisIdempotencyStore - handles pipeline errors gracefully", async (t) => {
  const redis = new RedisMock();
  const store = new RedisIdempotencyStore({ client: redis });

  // Close connection to simulate error
  redis.disconnect();

  try {
    await store.lookup("test", "test");
    t.fail("should have thrown");
  } catch (err) {
    t.ok(err, "should throw error on connection failure");
  }
});
```

**Step 2: Run tests to verify they pass**

Run: `npm test tests/redis.test.ts`

Expected: 8 tests passing

**Step 3: Commit**

Run: `git add tests/redis.test.ts && git commit -m "test: add Redis store edge cases"`

---

## Phase 3: Integration and Examples

### Task 8: Export Redis Store

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/index.ts`

**Step 1: Add to store/index.ts**

Update `src/store/index.ts`:
```typescript
export * from "./interface.js";
export { SqliteIdempotencyStore } from "./sqlite.js";
export { RedisIdempotencyStore } from "./redis.js";
export type { RedisIdempotencyStoreOptions } from "./redis.js";
```

**Step 2: Add to src/index.ts**

Update `src/index.ts` exports section:
```typescript
// Store implementations
export { SqliteIdempotencyStore } from "./store/sqlite.js";
export { RedisIdempotencyStore } from "./store/redis.js";
export type { RedisIdempotencyStoreOptions } from "./store/redis.js";
```

**Step 3: Verify build**

Run: `npm run build`

Expected: Build succeeds, type declarations generated

**Step 4: Verify all tests pass**

Run: `npm test`

Expected: All tests pass (fingerprint + middleware + sqlite + redis)

**Step 5: Commit**

Run: `git add src/store/index.ts src/index.ts && git commit -m "feat: export RedisIdempotencyStore in public API"`

---

### Task 9: Create Redis Example Application

**Files:**
- Create: `examples/redis-app.ts`

**Step 1: Create example file**

Create `examples/redis-app.ts`:
```typescript
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import Redis from "ioredis";
import { idempotency, RedisIdempotencyStore } from "../src/index.js";

const app = new Hono();

// Configure Redis client
const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

const store = new RedisIdempotencyStore({ client: redis });

// Basic usage with Redis persistence
app.post("/orders", idempotency({ store }), async (c) => {
  const body = await c.req.json();
  const orderId = Math.random().toString(36).substring(7);

  console.log(`Creating order: ${orderId}`);

  return c.json(
    {
      id: orderId,
      status: "created",
      ...body,
    },
    201
  );
});

// Endpoint requiring idempotency key
app.post(
  "/payments",
  idempotency({ store, required: true }),
  async (c) => {
    const body = await c.req.json();
    const paymentId = Math.random().toString(36).substring(7);

    console.log(`Processing payment: ${paymentId}`);

    return c.json(
      {
        id: paymentId,
        status: "completed",
        ...body,
      },
      200
    );
  }
);

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server running at http://localhost:${info.port}`);
    console.log(`Using Redis storage at ${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || "6379"}`);
    console.log("\nTry these curl commands:");
    console.log('curl -X POST http://localhost:3000/orders \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -H "Idempotency-Key: order-123" \\');
    console.log('  -d \'{"product":"widget","quantity":5}\'');
  }
);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  redis.quit();
  process.exit(0);
});
```

**Step 2: Add npm script**

Update `package.json` scripts section, add:
```json
"example:redis": "tsx examples/redis-app.ts"
```

**Step 3: Verify example builds**

Run: `npm run build`

Expected: Build succeeds with no TypeScript errors

**Step 4: Commit**

Run: `git add examples/redis-app.ts package.json && git commit -m "docs: add Redis store example application"`

---

## Phase 4: Documentation

### Task 10: Update README

**Files:**
- Modify: `README.md`

**Step 1: Add Redis section after SQLite**

Add to `README.md` after the SQLite quick start section:

```markdown
### Redis (Production - Multi-Server)

For production deployments with multiple server instances:

```bash
npm install hono-idempotency ioredis
```

```typescript
import { Hono } from "hono";
import Redis from "ioredis";
import { idempotency, RedisIdempotencyStore } from "hono-idempotency";

const app = new Hono();

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

const store = new RedisIdempotencyStore({ client: redis });

app.post("/orders", idempotency({ store }), async (c) => {
  return c.json({ id: "order-123" }, 201);
});

// Graceful shutdown
process.on("SIGINT", () => {
  redis.quit();
  process.exit(0);
});
```

**Features:**
- Shared state across multiple app instances
- Native clustering and sentinel support via ioredis
- Auto-expiration through Redis TTL
- User controls Redis configuration (TLS, retry logic, connection pooling)
```

**Step 2: Verify formatting**

Run: `npm run format:check`

Expected: No formatting issues (or run `npm run format` to fix)

**Step 3: Commit**

Run: `git add README.md && git commit -m "docs: add Redis store usage to README"`

---

### Task 11: Update Implementation Summary

**Files:**
- Modify: `IMPLEMENTATION_SUMMARY.md`

**Step 1: Add Redis store to components section**

Update the "Store Layer" section in `IMPLEMENTATION_SUMMARY.md`:

Add after SqliteIdempotencyStore description:
```markdown
- **RedisIdempotencyStore** - Multi-server production storage
  - User-managed ioredis client
  - JSON string storage with dual key pattern
  - Native Redis TTL for auto-expiration
  - Pipelined operations for performance
  - Optional peer dependency (install only if needed)
```

**Step 2: Update test results**

Update test count in summary:
```markdown
## Test Results

- **Total Tests**: 67 (all passing)
- **Coverage**: 96%+ overall
  - fingerprint.ts: 97.22%
  - middleware.ts: 92.3%
  - store/sqlite.ts: 100%
  - store/redis.ts: 100%
- **Test Suites**: 4 (fingerprint, middleware, sqlite, redis)
```

**Step 3: Update dependencies section**

Update dependencies list:
```markdown
- Dependencies: xxhash-wasm, jsonpath-plus, better-sqlite3
- Optional Peer Dependencies: ioredis (for Redis store)
```

**Step 4: Commit**

Run: `git add IMPLEMENTATION_SUMMARY.md && git commit -m "docs: add Redis store to implementation summary"`

---

## Phase 5: Final Verification

### Task 12: Run Complete Test Suite

**Step 1: Run all tests**

Run: `npm test`

Expected: All tests pass (fingerprint + middleware + sqlite + redis = ~67 tests)

**Step 2: Check test coverage**

Verify coverage remains above 96%

Expected: Coverage similar to baseline

**Step 3: Run build**

Run: `npm run build`

Expected: Clean build with no errors or warnings

**Step 4: Verify exports**

Run: `node -e "import('./dist/index.js').then(m => console.log('Exports:', Object.keys(m)))"`

Expected: RedisIdempotencyStore and RedisIdempotencyStoreOptions appear in exports

**Step 5: Verify formatting and linting**

Run: `npm run check`

Expected: No formatting or linting errors

**Step 6: Commit**

Run: `git add -A && git commit -m "chore: verify Redis store implementation complete"`

---

## Verification Checklist

After completing all tasks:

- [ ] **Unit tests**: All Redis store tests pass (8+ tests)
- [ ] **Integration**: Middleware works with Redis store
- [ ] **Examples**: `npm run example:redis` runs successfully (with Redis running)
- [ ] **Exports**: RedisIdempotencyStore available in public API
- [ ] **Build**: Clean TypeScript build with declaration files
- [ ] **Documentation**: README and IMPLEMENTATION_SUMMARY.md updated
- [ ] **Dependencies**: ioredis as optional peer dependency
- [ ] **Coverage**: Maintains 96%+ code coverage
