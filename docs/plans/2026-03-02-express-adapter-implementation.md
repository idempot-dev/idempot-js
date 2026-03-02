# Express Adapter Implementation Plan (Simplified)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Express.js v5 support with minimal abstraction - thin adapters that map Express req/res to the same patterns used by Hono

**Architecture:** Create Express-specific middleware that mirrors the Hono implementation, extracting only what's needed for adaptation. Skip the framework-agnostic core for now - YAGNI.

**Tech Stack:** JavaScript (ESM), Express v5, Hono v4

---

## Task 1: Create adapters/express.js

Simple request/response adapters that normalize Express objects.

**Files:**
- Create: `src/adapters/express.js`
- Test: `tests/adapters/express.test.js`

**Step 1: Write the failing test**

```js
import { test } from "tap";
import { createRequestAdapter, createResponseAdapter } from "../../src/adapters/express.js";

test("express adapter - createRequestAdapter returns method", async (t) => {
  const mockReq = { method: "POST" };
  const adapter = createRequestAdapter(mockReq);
  t.equal(adapter.method, "POST");
});

test("express adapter - createRequestAdapter returns header", async (t) => {
  const mockReq = {
    method: "POST",
    headers: { "idempotency-key": "test-key" }
  };
  const adapter = createRequestAdapter(mockReq);
  t.equal(adapter.header("Idempotency-Key"), "test-key");
});

test("express adapter - createRequestAdapter returns body", async (t) => {
  const mockReq = {
    method: "POST",
    headers: {},
    body: JSON.stringify({ foo: "bar" })
  };
  const adapter = createRequestAdapter(mockReq);
  const body = await adapter.body();
  t.equal(body, '{"foo":"bar"}');
});

test("express adapter - createResponseAdapter returns status", async (t) => {
  const mockRes = { statusCode: 201, getHeaders: () => ({}) };
  const adapter = createResponseAdapter(mockRes);
  t.equal(adapter.status, 201);
});

test("express adapter - createResponseAdapter returns headers", async (t) => {
  const mockRes = {
    statusCode: 200,
    getHeaders: () => ({ "content-type": "application/json" })
  };
  const adapter = createResponseAdapter(mockRes);
  t.equal(adapter.headers.get("content-type"), "application/json");
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/adapters/express.test.js
```
Expected: FAIL - file does not exist

**Step 3: Write implementation**

```js
/**
 * @typedef {Object} RequestAdapter
 * @property {string} method
 * @property {(name: string) => string | undefined} header
 * @property {() => Promise<string>} body
 */

/**
 * @typedef {Object} ResponseAdapter
 * @property {number} status
 * @property {Headers} headers
 */

/**
 * Creates a request adapter for Express
 * @param {import("express").Request} req
 * @returns {RequestAdapter}
 */
export function createRequestAdapter(req) {
  return {
    method: req.method,
    header: (name) => {
      const lowerName = name.toLowerCase();
      return req.headers[lowerName];
    },
    body: async () => {
      if (req.body === undefined) {
        return "";
      }
      if (typeof req.body === "string") {
        return req.body;
      }
      return JSON.stringify(req.body);
    }
  };
}

/**
 * Creates a response adapter for Express
 * @param {import("express").Response} res
 * @returns {ResponseAdapter}
 */
export function createResponseAdapter(res) {
  return {
    get status() {
      return res.statusCode;
    },
    get headers() {
      const headers = new Headers();
      const expressHeaders = res.getHeaders();
      for (const [key, value] of Object.entries(expressHeaders)) {
        headers.set(key, /** @type {string} */ (value));
      }
      return headers;
    }
  };
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- tests/adapters/express.test.js
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/adapters/express.js tests/adapters/express.test.js
git commit -m "feat: add Express request/response adapters"
```

---

## Task 2: Create middleware-express.js

Express middleware that follows the same logic pattern as the Hono version.

**Files:**
- Create: `src/middleware-express.js`
- Test: `tests/middleware-express.test.js`

**Step 1: Write the failing test**

```js
import { test } from "tap";
import { idempotency } from "../../src/middleware-express.js";

test("middleware-express - exports idempotency function", async (t) => {
  t.type(idempotency, "function");
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/middleware-express.test.js
```
Expected: FAIL - file does not exist

**Step 3: Write implementation**

```js
import { generateFingerprint } from "./fingerprint.js";
import { validateExcludeFields } from "./validation.js";
import { withResilience } from "./resilience.js";
import { createRequestAdapter, createResponseAdapter } from "./adapters/express.js";

/**
 * @typedef {import("./store/interface.js").IdempotencyStore} IdempotencyStore
 * @typedef {import("./resilience.js").ResilienceOptions} ResilienceOptions
 */

/**
 * @typedef {Object} ExpressIdempotencyOptions
 * @property {boolean} [required]
 * @property {number} [ttlMs]
 * @property {string[]} [excludeFields]
 * @property {IdempotencyStore} [store]
 * @property {number} [maxKeyLength]
 * @property {ResilienceOptions} [resilience]
 */

/** @type {Required<ExpressIdempotencyOptions>} */
const DEFAULT_OPTIONS = {
  required: false,
  ttlMs: 86400000,
  excludeFields: [],
  store: /** @type {any} */ (null),
  maxKeyLength: 255,
  resilience: {
    timeout: 500,
    maxRetries: 3,
    retryDelay: 100,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    volumeThreshold: 10
  }
};

/**
 * Express middleware for idempotency
 * @param {ExpressIdempotencyOptions} [options]
 * @returns {(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => Promise<void>}
 */
export function idempotency(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  if (!opts.store) {
    throw new Error(
      "IdempotencyStore must be provided. " +
        "Use SqliteIdempotencyStore({ path: ':memory:' }) for development"
    );
  }
  validateExcludeFields(opts.excludeFields);
  const store = opts.store;
  const { store: resilientStore, circuit } = withResilience(
    store,
    opts.resilience
  );

  return async (req, res, next) => {
    const request = createRequestAdapter(req);
    const response = createResponseAdapter(res);
    const method = req.method;

    if (method !== "POST" && method !== "PATCH") {
      next();
      return;
    }

    const HEADER_NAME = "Idempotency-Key";
    const key = req.headers[HEADER_NAME.toLowerCase()];

    if (key !== undefined) {
      if (key.length === 0 || key.length > opts.maxKeyLength) {
        res.status(400).json({
          error: `Idempotency-Key must be between 1-${opts.maxKeyLength} characters`
        });
        return;
      }

      const body = await request.body();
      const fingerprint = await generateFingerprint(body, opts.excludeFields);

      let lookup;
      try {
        lookup = await resilientStore.lookup(key, fingerprint);
      } catch {
        res.status(503).json({ error: "Service temporarily unavailable" });
        return;
      }

      if (lookup.byKey?.status === "processing") {
        res.status(409).json({
          error: "A request with this idempotency key is already being processed"
        });
        return;
      }

      if (lookup.byFingerprint && lookup.byFingerprint.key !== key) {
        res.status(409).json({
          error: "This request was already processed with a different idempotency key"
        });
        return;
      }

      if (lookup.byKey && lookup.byKey.fingerprint !== fingerprint) {
        res.status(422).json({
          error: "Idempotency key reused with different request payload"
        });
        return;
      }

      if (lookup.byKey?.status === "complete" && lookup.byKey.response) {
        const cached = lookup.byKey.response;
        res.status(cached.status);
        for (const [key, value] of Object.entries(cached.headers)) {
          res.set(key, value);
        }
        res.set("x-idempotent-replayed", "true");
        res.send(cached.body);
        return;
      }

      if (!lookup.byKey && !lookup.byFingerprint) {
        try {
          await resilientStore.startProcessing(key, fingerprint, opts.ttlMs);
        } catch {
          res.status(503).json({ error: "Service temporarily unavailable" });
          return;
        }

        const originalSend = res.send.bind(res);
        /** @type {string} */
        let capturedBody = "";

        res.send = (/** @type {any} */ body) => {
          capturedBody = typeof body === "string" ? body : JSON.stringify(body);
          return originalSend(body);
        };

        next();

        res.on("finish", async () => {
          try {
            await resilientStore.complete(key, {
              status: res.statusCode,
              headers: Object.fromEntries(
                Object.entries(res.getHeaders()).map(([k, v]) => [k, /** @type {string} */ (v)])
              ),
              body: capturedBody
            });
          } catch (err) {
            console.error("Failed to cache response:", err);
          }
        });
        return;
      }

      next();
      return;
    }

    if (opts.required) {
      res.status(400).json({ error: "Idempotency-Key header is required" });
      return;
    }

    next();
  };
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- tests/middleware-express.test.js
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/middleware-express.js tests/middleware-express.test.js
git commit -m "feat: add Express idempotency middleware"
```

---

## Task 3: Update index.js to export Express middleware

**Files:**
- Modify: `src/index.js`

**Step 1: Add Express export**

```js
// Main middleware
export { idempotency } from "./middleware.js";
export { idempotency } from "./middleware-express.js";
```

**Step 2: Run tests**

```bash
npm test
```
Expected: All pass

**Step 3: Commit**

```bash
git add src/index.js
git commit -m "feat: export Express idempotency middleware"
```

---

## Task 4: Verify 100% coverage

**Step 1: Run coverage**

```bash
npm run test:verify-coverage
```

**Step 2: Fix any uncovered lines**

Add tests for edge cases until 100% coverage is achieved.

**Step 3: Commit**

```bash
git add . && git commit -m "test: add Express adapter tests for full coverage"
```

---

## Task 5: Add integration test with actual Express app

**Files:**
- Create: `tests/middleware-express-integration.test.js`

**Step 1: Write integration test**

```js
import { test } from "tap";
import express from "express";
import { idempotency } from "../../src/middleware-express.js";
import { SqliteIdempotencyStore } from "../../src/store/sqlite.js";

test("middleware-express integration - replays cached response", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = express();
  
  app.use(express.json());
  
  let handlerCallCount = 0;
  
  app.post("/test",
    idempotency({ store, ttlMs: 5000 }),
    (req, res) => {
      handlerCallCount++;
      res.json({ created: true, timestamp: Date.now() });
    }
  );
  
  // Make first request
  const firstResponse = await makeRequest(app, "/test", "key-1");
  t.equal(firstResponse.status, 200);
  t.equal(handlerCallCount, 1);
  
  // Make second request with same key
  const secondResponse = await makeRequest(app, "/test", "key-1");
  t.equal(secondResponse.status, 200);
  t.equal(handlerCallCount, 1); // Should not call handler
  t.equal(secondResponse.headers["x-idempotent-replayed"], "true");
});

async function makeRequest(app, path, idempotencyKey) {
  // Use supertest or node's http module
  // ... implementation
}
```

**Step 2: Run test**

```bash
npm test -- tests/middleware-express-integration.test.js
```

**Step 3: Commit**

```bash
git add tests/middleware-express-integration.test.js
git commit -m "test: add Express middleware integration tests"
```
