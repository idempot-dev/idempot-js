# Fastify Adapter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Fastify framework support with full feature parity to existing Hono and Express adapters.

**Architecture:** Fastify middleware returns a preHandler hook function, matching the Express pattern. Uses Fastify's `onSend` hook to capture responses for caching.

**Tech Stack:** Fastify, existing idempotency core (fingerprint, resilience, store interface)

---

### Task 1: Add Fastify to devDependencies

**Files:**
- Modify: `package.json`

**Step 1: Add Fastify dependency**

Add `"fastify": "^5.0.0"` to devDependencies in package.json.

**Step 2: Install dependencies**

Run: `npm install`

**Step 3: Verify install**

Run: `npm list fastify`

---

### Task 2: Write first failing test - idempotency key required

**Files:**
- Create: `tests/fastify-middleware.test.js`

**Step 1: Write test**

```javascript
import { test } from 'tap';
import Fastify from 'fastify';
import { idempotency } from '../src/fastify-middleware.js';
import { SqliteIdempotencyStore } from '../src/store/sqlite.js';

test('returns 400 if idempotency-key is missing and required', async (t) => {
  const store = new SqliteIdempotencyStore({ path: ':memory:' });
  const fastify = Fastify();

  fastify.post('/test', idempotency({ store, required: true }), async (request, reply) => {
    return reply.send({ ok: true });
  });

  const response = await fastify.inject({
    method: 'POST',
    url: '/test',
    payload: { foo: 'bar' }
  });

  t.equal(response.statusCode, 400);
  t.match(response.json(), { error: /Idempotency-Key header is required/ });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/fastify-middleware.test.js`

Expected: FAIL with "Cannot find module '../src/fastify-middleware.js'"

**Step 3: Commit**

```bash
git add tests/fastify-middleware.test.js package.json
git commit -m "test: add failing test for idempotency-key required"
```

---

### Task 3: Write minimal middleware - returns 400 when key missing

**Files:**
- Create: `src/fastify-middleware.js`

**Step 1: Write minimal implementation**

```javascript
import { DEFAULT_OPTIONS } from './default-options.js';

const HEADER_NAME = 'idempotency-key';

export function idempotency(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (request, reply) => {
    const key = request.headers[HEADER_NAME];
    if (!key) {
      return reply.code(400).send({ error: 'Idempotency-Key header is required' });
    }
  };
}
```

**Step 2: Run test to verify it passes**

Run: `npm test -- tests/fastify-middleware.test.js`

Expected: PASS

**Step 3: Commit**

```bash
git add src/fastify-middleware.js
git commit -m "feat: add minimal Fastify middleware - returns 400 when key missing"
```

---

### Task 4: Write test - passes through when key provided

**Step 1: Write test**

```javascript
test('passes through when idempotency-key is provided', async (t) => {
  const store = new SqliteIdempotencyStore({ path: ':memory:' });
  const fastify = Fastify();

  fastify.post('/test', idempotency({ store }), async (request, reply) => {
    return reply.code(201).send({ id: 'order-123' });
  });

  const response = await fastify.inject({
    method: 'POST',
    url: '/test',
    payload: { foo: 'bar' },
    headers: { 'idempotency-key': 'test-key-123' }
  });

  t.equal(response.statusCode, 201);
  t.equal(response.json().id, 'order-123');
});
```

**Step 2: Run test to verify it fails**

Expected: FAIL - request hangs or returns wrong status

**Step 3: Update implementation to call handler**

The middleware needs to NOT short-circuit when key is provided. For now, just add `/* TODO: actually check idempotency */` and pass through.

**Step 4: Run test to verify it passes**

**Step 5: Commit**

---

### Task 5: Write test - POST/PATCH only, other methods pass through

**Step 1: Write test**

```javascript
test('GET requests pass through without idempotency processing', async (t) => {
  const store = new SqliteIdempotencyStore({ path: ':memory:' });
  const fastify = Fastify();

  let handlerCalled = false;
  fastify.get('/test', idempotency({ store }), async (request, reply) => {
    handlerCalled = true;
    return reply.send({ ok: true });
  });

  const response = await fastify.inject({
    method: 'GET',
    url: '/test'
  });

  t.ok(handlerCalled);
  t.equal(response.statusCode, 200);
});
```

**Step 2: Run test to verify it fails**

**Step 3: Update implementation to check method**

```javascript
const method = request.method;
if (method !== 'POST' && method !== 'PATCH') {
  return; // Let request continue
}
```

**Step 4: Run test to verify it passes**

**Step 5: Commit**

---

### Task 6: Write test - validates key length

**Step 1: Write test**

```javascript
test('returns 400 if idempotency-key is too long', async (t) => {
  const store = new SqliteIdempotencyStore({ path: ':memory:' });
  const fastify = Fastify();

  fastify.post('/test', idempotency({ store }), async (request, reply) => {
    return reply.send({ ok: true });
  });

  const longKey = 'a'.repeat(256);
  const response = await fastify.inject({
    method: 'POST',
    url: '/test',
    payload: { foo: 'bar' },
    headers: { 'idempotency-key': longKey }
  });

  t.equal(response.statusCode, 400);
  t.match(response.json(), { error: /between 1-/ });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Update implementation to check key length**

**Step 4: Run test to verify it passes**

**Step 5: Commit**

---

### Task 7: Write test - caches response on first request

**Step 1: Write test**

```javascript
test('caches response on first request with idempotency key', async (t) => {
  const store = new SqliteIdempotencyStore({ path: ':memory:' });
  const fastify = Fastify();
  let handlerCallCount = 0;

  fastify.post('/test', idempotency({ store }), async (request, reply) => {
    handlerCallCount++;
    return reply.code(201).send({ id: 'order-123' });
  });

  // First request
  const response1 = await fastify.inject({
    method: 'POST',
    url: '/test',
    payload: { foo: 'bar' },
    headers: { 'idempotency-key': 'unique-key-1' }
  });

  t.equal(response1.statusCode, 201);
  t.equal(handlerCallCount, 1);

  // Second request with same key should replay cached response
  const response2 = await fastify.inject({
    method: 'POST',
    url: '/test',
    payload: { foo: 'bar' },
    headers: { 'idempotency-key': 'unique-key-1' }
  });

  t.equal(response2.statusCode, 201);
  t.equal(response2.headers['x-idempotent-replayed'], 'true');
  t.equal(handlerCallCount, 1); // Handler should NOT be called again
});
```

**Step 2: Run test to verify it fails**

**Step 3: Update implementation to handle caching**

Need to:
- Generate fingerprint from body
- Use store.lookup() to check for existing entry
- Use onSend hook to capture response
- Store complete() after response sent

**Step 4: Run test to verify it passes**

**Step 5: Commit**

---

### Task 8: Write test - returns 409 when same key is processing

**Step 1: Write test**

```javascript
test('returns 409 when same idempotency key is already processing', async (t) => {
  const store = new SqliteIdempotencyStore({ path: ':memory:' });
  const fastify = Fastify();

  // Start processing but don't complete
  await store.startProcessing('processing-key', 'fp1', 60000);

  fastify.post('/test', idempotency({ store }), async (request, reply) => {
    return reply.send({ ok: true });
  });

  const response = await fastify.inject({
    method: 'POST',
    url: '/test',
    payload: { foo: 'bar' },
    headers: { 'idempotency-key': 'processing-key' }
  });

  t.equal(response.statusCode, 409);
  t.match(response.json(), { error: /already being processed/ });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Update implementation to check processing status**

**Step 4: Run test to verify it passes**

**Step 5: Commit**

---

### Task 9: Write test - returns 409 when fingerprint conflicts with different key

**Step 1: Write test**

```javascript
test('returns 409 when same fingerprint was used with different key', async (t) => {
  const store = new SqliteIdempotencyStore({ path: ':memory:' });
  const fastify = Fastify();

  // Complete a request with one key
  await store.startProcessing('key-1', 'fingerprint-abc', 60000);
  await store.complete('key-1', { status: 201, headers: {}, body: '{"id":"order-1"}' });

  fastify.post('/test', idempotency({ store }), async (request, reply) => {
    return reply.send({ ok: true });
  });

  // New request with same body but different key
  const response = await fastify.inject({
    method: 'POST',
    url: '/test',
    payload: { foo: 'bar' }, // Same fingerprint
    headers: { 'idempotency-key': 'key-2' } // Different key
  });

  t.equal(response.statusCode, 409);
  t.match(response.json(), { error: /different idempotency key/ });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Update implementation to check fingerprint conflicts**

**Step 4: Run test to verify it passes**

**Step 5: Commit**

---

### Task 10: Write test - returns 422 when same key used with different body

**Step 1: Write test**

```javascript
test('returns 422 when idempotency key reused with different payload', async (t) => {
  const store = new SqliteIdempotencyStore({ path: ':memory:' });
  const fastify = Fastify();

  // Complete a request with one key
  await store.startProcessing('same-key', 'fingerprint-1', 60000);
  await store.complete('same-key', { status: 201, headers: {}, body: '{"id":"order-1"}' });

  fastify.post('/test', idempotency({ store }), async (request, reply) => {
    return reply.send({ ok: true });
  });

  // New request with same key but different body
  const response = await fastify.inject({
    method: 'POST',
    url: '/test',
    payload: { foo: 'different' }, // Different fingerprint
    headers: { 'idempotency-key': 'same-key' }
  });

  t.equal(response.statusCode, 422);
  t.match(response.json(), { error: /different request payload/ });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Update implementation to check fingerprint match**

**Step 4: Run test to verify it passes**

**Step 5: Commit**

---

### Task 11: Add resilience layer and circuit breaker

**Step 1: Write test**

```javascript
test('exposes circuit breaker', async (t) => {
  const store = new SqliteIdempotencyStore({ path: ':memory:' });
  const fastify = Fastify();

  const middleware = idempotency({ store });
  fastify.post('/test', middleware, async (request, reply) => {
    return reply.send({ ok: true });
  });

  t.ok(middleware.circuit);
});
```

**Step 2: Run test to verify it fails**

**Step 3: Update implementation to include withResilience**

**Step 4: Run test to verify it passes**

**Step 5: Commit**

---

### Task 12: Run full test suite with coverage

**Step 1: Run coverage**

Run: `npm run test:verify-coverage`

Expected: 100% coverage

**Step 2: Fix any coverage gaps**

---

### Task 13: Update documentation

**Files:**
- Modify: `README.md`

**Step 1: Add Fastify to header and example**

Add Fastify usage example matching Hono/Express patterns.

**Step 2: Commit**

---

### Task 14: Final commit

**Step 1: Commit all changes**

```bash
git add .
git commit -m "feat: add Fastify adapter"
```
