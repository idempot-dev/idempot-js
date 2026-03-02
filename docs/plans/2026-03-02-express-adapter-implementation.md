# Express Adapter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Express.js v5 support using an adapter pattern with shared core logic

**Architecture:** Extract framework-agnostic core logic from middleware.js into core.js, create adapters for Hono and Express, refactor existing middleware to use the Hono adapter

**Tech Stack:** JavaScript (ESM), Express v5, Hono v4

---

## Task 1: Create core.js (framework-agnostic logic)

**Files:**
- Create: `src/core.js`

**Step 1: Write the failing test**

Create `tests/core.test.js` with basic structure (will expand after core is defined):

```js
import { test } from "tap";
import { idempotencyCore } from "../../src/core.js";

test("core - exports idempotencyCore function", async (t) => {
  t.type(idempotencyCore, "function");
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/core.test.js
```
Expected: FAIL with "idempotencyCore is not a function"

**Step 3: Write minimal implementation**

```js
/**
 * @typedef {import("./store/interface.js").IdempotencyStore} IdempotencyStore
 * @typedef {import("./resilience.js").ResilienceOptions} ResilienceOptions
 */

import { generateFingerprint } from "./fingerprint.js";
import { validateExcludeFields } from "./validation.js";
import { withResilience } from "./resilience.js";

/**
 * @typedef {Object} IdempotencyOptions
 * @property {boolean} [required]
 * @property {number} [ttlMs]
 * @property {string[]} [excludeFields]
 * @property {IdempotencyStore} [store]
 * @property {number} [maxKeyLength]
 * @property {ResilienceOptions} [resilience]
 */

/** @type {Required<IdempotencyOptions>} */
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
 * Framework-agnostic idempotency core
 * @param {IdempotencyOptions} options
 * @returns {(context: {request: {method: string, header: (name: string) => string | undefined, body: () => Promise<string>}, response: {get status(): number, get headers(): Headers, getBody: () => Promise<string>, setBody: (body: string, status: number, headers: Record<string, string>) => void}, store: IdempotencyStore}) => Promise<void>}
 */
export function idempotencyCore(options = {}) {
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

  return async ({ request, response, setResponse }) => {
    const method = request.method;

    // Only intercept POST and PATCH
    if (method !== "POST" && method !== "PATCH") {
      return;
    }

    const HEADER_NAME = "Idempotency-Key";
    const key = request.header(HEADER_NAME);

    // Check if key provided and validate
    if (key !== undefined) {
      // Key was provided, must be valid
      if (key.length === 0 || key.length > opts.maxKeyLength) {
        setResponse({
          status: 400,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            error: `Idempotency-Key must be between 1-${opts.maxKeyLength} characters`
          })
        });
        return;
      }
      // Key is valid, implement idempotency logic

      // Read body and generate fingerprint
      const body = await request.body();
      const fingerprint = await generateFingerprint(body, opts.excludeFields);

      // Lookup in store
      let lookup;
      try {
        lookup = await resilientStore.lookup(key, fingerprint);
      } catch {
        setResponse({
          status: 503,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "Service temporarily unavailable" })
        });
        return;
      }

      // Existing record being processed - reject concurrent request
      if (lookup.byKey?.status === "processing") {
        setResponse({
          status: 409,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            error:
              "A request with this idempotency key is already being processed"
          })
        });
        return;
      }

      // Same fingerprint, different key - duplicate operation
      if (lookup.byFingerprint && lookup.byFingerprint.key !== key) {
        setResponse({
          status: 409,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            error:
              "This request was already processed with a different idempotency key"
          })
        });
        return;
      }

      // Same key, different fingerprint - payload mismatch
      if (lookup.byKey && lookup.byKey.fingerprint !== fingerprint) {
        setResponse({
          status: 422,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            error: "Idempotency key reused with different request payload"
          })
        });
        return;
      }

      // Existing complete record - replay
      if (lookup.byKey?.status === "complete" && lookup.byKey.response) {
        const cached = lookup.byKey.response;
        setResponse({
          status: cached.status,
          headers: {
            ...cached.headers,
            "x-idempotent-replayed": "true"
          },
          body: cached.body,
          replay: true
        });
        return;
      }

      // No existing record - process new request
      if (!lookup.byKey && !lookup.byFingerprint) {
        try {
          await resilientStore.startProcessing(key, fingerprint, opts.ttlMs);
        } catch {
          setResponse({
            status: 503,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ error: "Service temporarily unavailable" })
          });
          return;
        }

        // Signal to caller that they should process the request
        // Response will be captured by the adapter
        return "process";
      }

      // TODO: Handle other conflict cases
      return;
    }

    // Key not provided
    if (opts.required) {
      setResponse({
        status: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Idempotency-Key header is required" })
      });
      return;
    }

    // Optional and not provided, pass through
    return;
  };
}

export { DEFAULT_OPTIONS };
```

**Step 4: Run test to verify it passes**

```bash
npm test -- tests/core.test.js
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/core.js tests/core.test.js
git commit -m "feat: add framework-agnostic core logic"
```

---

## Task 2: Create adapters/express.js

**Files:**
- Create: `src/adapters/express.js`
- Test: `tests/adapters/express.test.js`

**Step 1: Write the failing test**

```js
import { test } from "tap";
import { createRequestAdapter, createResponseAdapter } from "../../src/adapters/express.js";

test("express adapter - createRequestAdapter", async (t) => {
  const mockReq = {
    method: "POST",
    headers: { "idempotency-key": "test-key" },
    body: JSON.stringify({ foo: "bar" })
  };
  
  const adapter = createRequestAdapter(mockReq);
  
  t.equal(adapter.method, "POST");
  t.equal(adapter.header("Idempotency-Key"), "test-key");
  t.equal(adapter.header("idempotency-key"), "test-key");
});

test("express adapter - createResponseAdapter", async (t) => {
  const mockRes = {
    statusCode: 200,
    getHeaders: () => ({ "content-type": "application/json" }),
    setHeader: () => {},
    send: () => {}
  };
  
  const adapter = createResponseAdapter(mockRes);
  
  t.equal(adapter.status, 200);
  t.type(adapter.headers, Headers);
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/adapters/express.test.js
```
Expected: FAIL with "createRequestAdapter is not a function"

**Step 3: Write minimal implementation**

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
 * @property {() => Promise<string>} getBody
 * @property {(body: string, status: number, headers: Record<string, string>) => void} setBody
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
    },
    getBody: async () => {
      // Will be implemented with response capture
      return "";
    },
    setBody: (body, status, headers) => {
      res.status(status);
      for (const [key, value] of Object.entries(headers)) {
        res.set(key, value);
      }
      res.send(body);
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

## Task 3: Create adapters/hono.js

**Files:**
- Create: `src/adapters/hono.js`
- Test: `tests/adapters/hono.test.js`

**Step 1: Write the failing test**

```js
import { test } from "tap";
import { createRequestAdapter, createResponseAdapter } from "../../src/adapters/hono.js";

test("hono adapter - createRequestAdapter", async (t) => {
  const mockReq = {
    method: "POST",
    _headers: new Map([["idempotency-key", "test-key"]])
  };
  
  const adapter = createRequestAdapter(mockReq);
  
  t.equal(adapter.method, "POST");
  t.equal(adapter.header("Idempotency-Key"), "test-key");
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/adapters/hono.test.js
```
Expected: FAIL with "createRequestAdapter is not a function"

**Step 3: Write minimal implementation**

```js
/**
 * Creates a request adapter for Hono
 * @param {import("hono").Context} c
 * @returns {RequestAdapter}
 */
export function createRequestAdapter(c) {
  return {
    method: c.req.method,
    header: (name) => c.req.header(name),
    body: () => c.req.text()
  };
}

/**
 * Creates a response adapter for Hono
 * @param {import("hono").Context} c
 * @returns {ResponseAdapter}
 */
export function createResponseAdapter(c) {
  return {
    get status() {
      return c.res.status;
    },
    get headers() {
      return c.res.headers;
    },
    getBody: async () => {
      return await c.res.text();
    },
    setBody: (body, status, headers) => {
      c.status = status;
      for (const [key, value] of Object.entries(headers)) {
        c.header(key, value);
      }
      return c.body(body);
    }
  };
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- tests/adapters/hono.test.js
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/adapters/hono.js tests/adapters/hono.test.js
git commit -m "feat: add Hono request/response adapters"
```

---

## Task 4: Create middleware-express.js

**Files:**
- Create: `src/middleware-express.js`
- Test: `tests/middleware-express.test.js`

**Step 1: Write the failing test**

```js
import { test } from "tap";
import express from "express";
import { idempotency } from "../../src/middleware-express.js";

test("middleware-express - exports idempotency function", async (t) => {
  t.type(idempotency, "function");
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/middleware-express.test.js
```
Expected: FAIL with "idempotency is not a function"

**Step 3: Write minimal implementation**

```js
import { idempotencyCore } from "./core.js";
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

/**
 * Express middleware for idempotency
 * @param {ExpressIdempotencyOptions} options
 * @returns {import("express").RequestHandler}
 */
export function idempotency(options = {}) {
  const core = idempotencyCore(options);

  return async (req, res, next) => {
    const request = createRequestAdapter(req);
    let responseBody = "";
    let responseStatus = 200;
    /** @type {Record<string, string>} */
    let responseHeaders = {};

    const response = {
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
      },
      getBody: async () => responseBody,
      setBody: (body, status, headers) => {
        responseBody = body;
        responseStatus = status;
        responseHeaders = headers;
      }
    };

    const result = await core({ request, response });

    if (result === "process") {
      // Store original send to intercept
      const originalSend = res.send.bind(res);
      
      /** @type {string} */
      let capturedBody = "";
      
      res.send = (/** @type {any} */ body) => {
        capturedBody = typeof body === "string" ? body : JSON.stringify(body);
        return originalSend(body);
      };

      // Let the request proceed
      next();

      // After response is complete, store result
      res.on("finish", async () => {
        const store = options.store;
        if (!store) return;

        const key = req.headers["idempotency-key"];
        if (!key) return;

        const fingerprint = require("./fingerprint.js").generateFingerprint(
          typeof req.body === "string" ? req.body : JSON.stringify(req.body),
          options.excludeFields || []
        );

        try {
          await store.complete(key, {
            status: res.statusCode,
            headers: responseHeaders,
            body: capturedBody
          });
        } catch (err) {
          console.error("Failed to cache response:", err);
        }
      });
      return;
    }

    // If core returned a response, send it
    if (responseBody) {
      res.status(responseStatus);
      for (const [key, value] of Object.entries(responseHeaders)) {
        res.set(key, value);
      }
      res.send(responseBody);
    }
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
git commit -m "feat: add Express middleware"
```

---

## Task 5: Update index.js to export Express middleware

**Files:**
- Modify: `src/index.js`

**Step 1: Add Express export**

```js
// Main middleware
export { idempotency } from "./middleware.js";
export { idempotency as idempotencyExpress } from "./middleware-express.js";
```

**Step 2: Run tests to verify nothing broke**

```bash
npm test
```
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/index.js
git commit -m "feat: export Express idempotency middleware"
```

---

## Task 6: Verify 100% coverage

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
