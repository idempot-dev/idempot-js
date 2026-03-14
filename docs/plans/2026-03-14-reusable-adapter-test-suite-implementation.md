# Reusable Framework Adapter Test Suite Implementation Plan (Updated)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a comprehensive reusable test suite in `@idempot/core` that can test any framework adapter, reducing each adapter's test file from ~500 lines to ~30 lines.

**Architecture:** Implement a test harness that exports test definitions. Each adapter test file imports the suite and runs it with framework-specific adapter implementation. This avoids tap's nested test limitation while maintaining clean separation.

**Tech Stack:** JavaScript, tap testing framework, Hono v4.11.5, Fastify, Express

**Key Fixes from Review:**
1. Exports test factory function instead of running tests directly (tap compatibility)
2. Added `createMemoryStore()` helper to avoid external store imports in tests
3. Fixed adapter interface: `mount(method, path, middleware, handler)` for GET/POST/PATCH support
4. Fixed concurrent test: Uses explicit store state instead of timing-dependent delays
5. Added adapter validation to fail fast on misconfiguration

---

## Task 1: Create Test Harness with Helper Utilities

**Files:**
- Create: `packages/core/tests/framework-adapter-suite.js`

**Step 1: Write helper utilities and test factory**

```javascript
import { test } from "tap";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

/**
 * Create an in-memory store for testing
 * @returns {SqliteIdempotencyStore}
 */
export function createMemoryStore() {
  return new SqliteIdempotencyStore({ path: ":memory:" });
}

/**
 * Validates adapter interface
 * @param {Object} adapter
 * @throws {Error} if adapter is invalid
 */
function validateAdapter(adapter) {
  if (!adapter.name || typeof adapter.name !== "string") {
    throw new Error("Adapter must have a 'name' string property");
  }
  if (typeof adapter.setup !== "function") {
    throw new Error("Adapter must have a 'setup' function");
  }
  if (typeof adapter.createMiddleware !== "function") {
    throw new Error("Adapter must have a 'createMiddleware' function");
  }
}

/**
 * Normalizes response format across frameworks
 * @param {Object} response
 * @returns {Object}
 */
function normalizeResponse(response) {
  if (!response || typeof response !== "object") {
    throw new Error("Adapter request() must return an object");
  }
  
  return {
    status: response.status ?? response.statusCode,
    headers: response.headers || {},
    body: response.body
  };
}
```

**Step 2: Write test factory function**

```javascript
/**
 * Generate framework adapter tests
 * Call this in your adapter test file to run the full test suite
 * 
 * @param {Object} adapter
 * @param {string} adapter.name - Framework name (e.g., "hono")
 * @param {Function} adapter.setup - Returns { mount, request, teardown }
 * @param {Function} adapter.createMiddleware - (options) => middleware
 */
export function runAdapterTests(adapter) {
  validateAdapter(adapter);

  // Test: GET pass-through
  test(`${adapter.name} - GET requests pass through without idempotency processing`, async (t) => {
    const store = createMemoryStore();
    const { mount, request, teardown } = await adapter.setup();
    
    const middleware = adapter.createMiddleware({ store });
    let handlerCalled = false;
    
    mount("GET", "/test", middleware, async (req, res) => {
      handlerCalled = true;
      return res.send({ ok: true });
    });
    
    const response = normalizeResponse(await request({
      method: "GET",
      path: "/test",
      headers: {},
      body: null
    }));
    
    t.ok(handlerCalled, "handler should be called");
    t.equal(response.status, 200, "should return 200");
    
    await teardown();
  });
}
```

**Step 3: Verify file is created**

Run: `ls -la packages/core/tests/framework-adapter-suite.js`
Expected: File exists

**Step 4: Commit**

```bash
git add packages/core/tests/framework-adapter-suite.js
git commit -m "feat(core): add framework adapter test harness with helpers"
```

---

## Task 2: Add Key Validation Tests

**Files:**
- Modify: `packages/core/tests/framework-adapter-suite.js`

**Step 1: Add validation tests after GET test**

```javascript
  // Test: Optional key without header
  test(`${adapter.name} - POST without key when optional`, async (t) => {
    const store = createMemoryStore();
    const { mount, request, teardown } = await adapter.setup();
    
    const middleware = adapter.createMiddleware({ store, required: false });
    let handlerCalled = false;
    
    mount("POST", "/test", middleware, async (req, res) => {
      handlerCalled = true;
      return res.send({ ok: true });
    });
    
    const response = normalizeResponse(await request({
      method: "POST",
      path: "/test",
      headers: {},
      body: { foo: "bar" }
    }));
    
    t.ok(handlerCalled, "handler should be called");
    t.equal(response.status, 200, "should return 200");
    
    await teardown();
  });

  // Test: Required key missing
  test(`${adapter.name} - POST without key when required returns 400`, async (t) => {
    const store = createMemoryStore();
    const { mount, request, teardown } = await adapter.setup();
    
    const middleware = adapter.createMiddleware({ store, required: true });
    
    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });
    
    const response = normalizeResponse(await request({
      method: "POST",
      path: "/test",
      headers: {},
      body: { foo: "bar" }
    }));
    
    t.equal(response.status, 400, "should return 400");
    t.match(response.body?.error || JSON.stringify(response.body), /required/i);
    
    await teardown();
  });

  // Test: Key too long
  test(`${adapter.name} - rejects keys longer than 255 characters`, async (t) => {
    const store = createMemoryStore();
    const { mount, request, teardown } = await adapter.setup();
    
    const middleware = adapter.createMiddleware({ store });
    
    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });
    
    const longKey = "a".repeat(256);
    const response = normalizeResponse(await request({
      method: "POST",
      path: "/test",
      headers: { "idempotency-key": longKey },
      body: { foo: "bar" }
    }));
    
    t.equal(response.status, 400, "should return 400");
    t.match(response.body?.error || JSON.stringify(response.body), /255|too long|maximum/i);
    
    await teardown();
  });

  // Test: Key with comma
  test(`${adapter.name} - rejects keys containing commas`, async (t) => {
    const store = createMemoryStore();
    const { mount, request, teardown } = await adapter.setup();
    
    const middleware = adapter.createMiddleware({ store });
    
    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });
    
    const response = normalizeResponse(await request({
      method: "POST",
      path: "/test",
      headers: { "idempotency-key": "key-with,comma-16chars" },
      body: { foo: "bar" }
    }));
    
    t.equal(response.status, 400, "should return 400");
    t.match(response.body?.error || JSON.stringify(response.body), /comma/i);
    
    await teardown();
  });

  // Test: Empty key
  test(`${adapter.name} - rejects empty key`, async (t) => {
    const store = createMemoryStore();
    const { mount, request, teardown } = await adapter.setup();
    
    const middleware = adapter.createMiddleware({ store });
    
    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });
    
    const response = normalizeResponse(await request({
      method: "POST",
      path: "/test",
      headers: { "idempotency-key": "" },
      body: { foo: "bar" }
    }));
    
    t.equal(response.status, 400, "should return 400");
    
    await teardown();
  });
```

**Step 2: Verify syntax**

Run: `cd packages/core && node --check tests/framework-adapter-suite.js`
Expected: No syntax errors

**Step 3: Commit**

```bash
git add packages/core/tests/framework-adapter-suite.js
git commit -m "feat(core): add key validation tests"
```

---

## Task 3: Add Caching and Conflict Detection Tests

**Files:**
- Modify: `packages/core/tests/framework-adapter-suite.js`

**Step 1: Add caching tests**

```javascript
  // Test: First request caches
  test(`${adapter.name} - caches response on first request`, async (t) => {
    const store = createMemoryStore();
    const { mount, request, teardown } = await adapter.setup();
    
    const middleware = adapter.createMiddleware({ store });
    let callCount = 0;
    
    mount("POST", "/test", middleware, async (req, res) => {
      callCount++;
      return res.send({ id: "order-123", count: callCount });
    });
    
    const response = normalizeResponse(await request({
      method: "POST",
      path: "/test",
      headers: { "idempotency-key": "cache-key-12345678901" },
      body: { foo: "bar" }
    }));
    
    t.equal(response.status, 200);
    t.equal(callCount, 1);
    t.equal(response.body?.id, "order-123");
    
    await teardown();
  });

  // Test: Replay cached response
  test(`${adapter.name} - replays cached response on duplicate request`, async (t) => {
    const store = createMemoryStore();
    const { mount, request, teardown } = await adapter.setup();
    
    const middleware = adapter.createMiddleware({ store });
    let callCount = 0;
    
    mount("POST", "/test", middleware, async (req, res) => {
      callCount++;
      return res.send({ id: "order-123", count: callCount, ts: Date.now() });
    });
    
    await request({
      method: "POST",
      path: "/test",
      headers: { "idempotency-key": "replay-key-12345678901" },
      body: { foo: "bar" }
    });
    
    const response2 = normalizeResponse(await request({
      method: "POST",
      path: "/test",
      headers: { "idempotency-key": "replay-key-12345678901" },
      body: { foo: "bar" }
    }));
    
    t.equal(response2.status, 200);
    t.equal(callCount, 1, "handler should not be called again");
    t.equal(response2.body?.count, 1);
    
    const replayHeader = response2.headers["x-idempotent-replayed"] || 
                         response2.headers["X-Idempotent-Replayed"];
    t.equal(replayHeader, "true", "should have replay header");
    
    await teardown();
  });
```

**Step 2: Add conflict tests with explicit store state**

```javascript
  // Test: Concurrent processing (explicit state, no timing)
  test(`${adapter.name} - detects concurrent processing with 409`, async (t) => {
    const store = createMemoryStore();
    const { mount, request, teardown } = await adapter.setup();
    
    // Pre-populate store with "processing" state
    const fingerprint = "test-fingerprint-123";
    await store.startProcessing("concurrent-key-12345678901", fingerprint, 60000);
    
    const middleware = adapter.createMiddleware({ store });
    
    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });
    
    const response = normalizeResponse(await request({
      method: "POST",
      path: "/test",
      headers: { "idempotency-key": "concurrent-key-12345678901" },
      body: { foo: "bar" }
    }));
    
    t.equal(response.status, 409, "should return 409");
    t.match(response.body?.error || JSON.stringify(response.body), /already being processed/i);
    
    await teardown();
  });

  // Test: Payload mismatch
  test(`${adapter.name} - detects same key with different payload returns 422`, async (t) => {
    const store = createMemoryStore();
    const { mount, request, teardown } = await adapter.setup();
    
    const middleware = adapter.createMiddleware({ store });
    
    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });
    
    await request({
      method: "POST",
      path: "/test",
      headers: { "idempotency-key": "mismatch-key-12345678901" },
      body: { foo: "bar" }
    });
    
    const response = normalizeResponse(await request({
      method: "POST",
      path: "/test",
      headers: { "idempotency-key": "mismatch-key-12345678901" },
      body: { foo: "different" }
    }));
    
    t.equal(response.status, 422);
    t.match(response.body?.error || JSON.stringify(response.body), /different.*payload/i);
    
    await teardown();
  });

  // Test: Fingerprint collision
  test(`${adapter.name} - detects different key with same fingerprint returns 409`, async (t) => {
    const store = createMemoryStore();
    const { mount, request, teardown } = await adapter.setup();
    
    const middleware = adapter.createMiddleware({ store });
    
    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });
    
    await request({
      method: "POST",
      path: "/test",
      headers: { "idempotency-key": "key-1-16-chars-longxx" },
      body: { foo: "bar" }
    });
    
    const response = normalizeResponse(await request({
      method: "POST",
      path: "/test",
      headers: { "idempotency-key": "key-2-16-chars-longxx" },
      body: { foo: "bar" }
    }));
    
    t.equal(response.status, 409);
    t.match(response.body?.error || JSON.stringify(response.body), /different.*key/i);
    
    await teardown();
  });
```

**Step 3: Commit**

```bash
git add packages/core/tests/framework-adapter-suite.js
git commit -m "feat(core): add caching and conflict detection tests"
```

---

## Task 4: Add Error Handling and Configuration Tests

**Files:**
- Modify: `packages/core/tests/framework-adapter-suite.js`

**Step 1: Add error handling tests**

```javascript
  // Test: Lookup failure
  test(`${adapter.name} - returns 503 when lookup fails`, async (t) => {
    const store = createMemoryStore();
    store.lookup = async () => {
      throw new Error("Store unavailable");
    };
    
    const { mount, request, teardown } = await adapter.setup();
    const middleware = adapter.createMiddleware({ store });
    
    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });
    
    const response = normalizeResponse(await request({
      method: "POST",
      path: "/test",
      headers: { "idempotency-key": "test-key-123456789012" },
      body: { foo: "bar" }
    }));
    
    t.equal(response.status, 503);
    
    await teardown();
  });

  // Test: startProcessing failure
  test(`${adapter.name} - returns 503 when startProcessing fails`, async (t) => {
    const store = createMemoryStore();
    store.startProcessing = async () => {
      throw new Error("Store unavailable");
    };
    
    const { mount, request, teardown } = await adapter.setup();
    const middleware = adapter.createMiddleware({ store });
    
    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });
    
    const response = normalizeResponse(await request({
      method: "POST",
      path: "/test",
      headers: { "idempotency-key": "test-key-123456789012" },
      body: { foo: "bar" }
    }));
    
    t.equal(response.status, 503);
    
    await teardown();
  });

  // Test: complete failure (should not fail request)
  test(`${adapter.name} - continues when complete fails`, async (t) => {
    const store = createMemoryStore();
    store.complete = async () => {
      throw new Error("Connection failed");
    };
    
    const { mount, request, teardown } = await adapter.setup();
    const middleware = adapter.createMiddleware({ store });
    
    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });
    
    const response = normalizeResponse(await request({
      method: "POST",
      path: "/test",
      headers: { "idempotency-key": "test-key-123456789012" },
      body: { foo: "bar" }
    }));
    
    t.equal(response.status, 200, "should return 200 even if complete fails");
    
    await teardown();
  });
```

**Step 2: Add configuration tests**

```javascript
  // Test: Field exclusion
  test(`${adapter.name} - field exclusion works correctly`, async (t) => {
    const store = createMemoryStore();
    const { mount, request, teardown } = await adapter.setup();
    
    const middleware = adapter.createMiddleware({ 
      store, 
      excludeFields: ["timestamp"] 
    });
    let callCount = 0;
    
    mount("POST", "/test", middleware, async (req, res) => {
      callCount++;
      return res.send({ ok: true });
    });
    
    await request({
      method: "POST",
      path: "/test",
      headers: { "idempotency-key": "exclude-key-12345678901" },
      body: { data: "test", timestamp: "2024-01-01" }
    });
    
    const response = normalizeResponse(await request({
      method: "POST",
      path: "/test",
      headers: { "idempotency-key": "exclude-key-12345678901" },
      body: { data: "test", timestamp: "2024-01-02" }
    }));
    
    t.equal(response.status, 200);
    t.equal(callCount, 1);
    
    await teardown();
  });

  // Test: PATCH method
  test(`${adapter.name} - PATCH method is protected`, async (t) => {
    const store = createMemoryStore();
    const { mount, request, teardown } = await adapter.setup();
    
    const middleware = adapter.createMiddleware({ store });
    let callCount = 0;
    
    mount("PATCH", "/test", middleware, async (req, res) => {
      callCount++;
      return res.send({ updated: true });
    });
    
    await request({
      method: "PATCH",
      path: "/test",
      headers: { "idempotency-key": "patch-key-12345678901" },
      body: { data: "test" }
    });
    
    const response = normalizeResponse(await request({
      method: "PATCH",
      path: "/test",
      headers: { "idempotency-key": "patch-key-12345678901" },
      body: { data: "test" }
    }));
    
    t.equal(response.status, 200);
    t.equal(callCount, 1);
    
    await teardown();
  });

  // Test: Empty body
  test(`${adapter.name} - handles empty body`, async (t) => {
    const store = createMemoryStore();
    const { mount, request, teardown } = await adapter.setup();
    
    const middleware = adapter.createMiddleware({ store });
    
    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ ok: true });
    });
    
    const response = normalizeResponse(await request({
      method: "POST",
      path: "/test",
      headers: { "idempotency-key": "empty-body-key-123456" },
      body: null
    }));
    
    t.equal(response.status, 200);
    
    await teardown();
  });

  // Test: String body
  test(`${adapter.name} - handles string body`, async (t) => {
    const store = createMemoryStore();
    const { mount, request, teardown } = await adapter.setup();
    
    const middleware = adapter.createMiddleware({ store });
    
    mount("POST", "/test", middleware, async (req, res) => {
      return res.send({ received: req.body });
    });
    
    const response = normalizeResponse(await request({
      method: "POST",
      path: "/test",
      headers: { 
        "idempotency-key": "string-body-key-123456",
        "content-type": "text/plain"
      },
      body: "plain text body"
    }));
    
    t.equal(response.status, 200);
    
    await teardown();
  });
```

**Step 3: Close the runAdapterTests function**

Make sure the function closes properly with all tests inside.

**Step 4: Commit**

```bash
git add packages/core/tests/framework-adapter-suite.js
git commit -m "feat(core): add error handling and configuration tests"
```

---

## Task 5: Refactor Hono Adapter Tests

**Files:**
- Modify: `packages/frameworks/hono/tests/hono-middleware.test.js`

**Step 1: Replace with adapter pattern**

```javascript
import { test } from "tap";
import { Hono } from "hono";
import { runAdapterTests, createMemoryStore } from "@idempot/core/tests/framework-adapter-suite.js";
import { idempotency } from "../index.js";
import { withResilience } from "@idempot/core";

// Run shared adapter test suite
runAdapterTests({
  name: "hono",
  setup: async () => {
    const app = new Hono();
    
    return {
      mount: (method, path, middleware, handler) => {
        app[method.toLowerCase()](path, middleware, handler);
      },
      request: async (options) => {
        const url = new URL(options.path, "http://localhost");
        const headers = new Headers(options.headers);
        
        const res = await app.request(url.toString(), {
          method: options.method,
          headers,
          body: options.body ? JSON.stringify(options.body) : options.body
        });
        
        const contentType = res.headers.get("content-type") || "";
        let body;
        
        if (contentType.includes("json")) {
          body = await res.json();
        } else {
          const text = await res.text();
          body = text ? text : undefined;
        }
        
        return {
          status: res.status,
          headers: Object.fromEntries(res.headers.entries()),
          body
        };
      },
      teardown: async () => {}
    };
  },
  createMiddleware: (options) => idempotency(options)
});

// Hono-specific tests
test("hono - withResilience retries until success", async (t) => {
  let attempts = 0;
  const flakyStore = {
    lookup: () => {
      attempts++;
      if (attempts < 3) throw new Error("Transient error");
      return Promise.resolve({ byKey: null, byFingerprint: null });
    },
    startProcessing: () => Promise.resolve(),
    complete: () => Promise.resolve()
  };

  const { store } = withResilience(flakyStore, { maxRetries: 3 });
  await store.lookup("key", "fp");

  t.equal(attempts, 3);
});
```

**Step 2: Run Hono tests**

Run: `cd packages/frameworks/hono && npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add packages/frameworks/hono/tests/hono-middleware.test.js
git commit -m "refactor(hono): use shared adapter test suite"
```

---

## Task 6: Refactor Fastify Adapter Tests

**Files:**
- Modify: `packages/frameworks/fastify/tests/fastify-middleware.test.js`

**Step 1: Replace with adapter pattern**

```javascript
import { test } from "tap";
import Fastify from "fastify";
import { runAdapterTests } from "@idempot/core/tests/framework-adapter-suite.js";
import { idempotency } from "../index.js";

// Run shared adapter test suite
runAdapterTests({
  name: "fastify",
  setup: async () => {
    const app = Fastify();
    
    return {
      mount: (method, path, middleware, handler) => {
        app[method.toLowerCase()](path, { preHandler: middleware }, handler);
      },
      request: async (options) => {
        const res = await app.inject({
          method: options.method,
          url: options.path,
          payload: options.body,
          headers: options.headers
        });
        
        const contentType = res.headers["content-type"] || "";
        let body;
        
        if (contentType.includes("json")) {
          body = res.json();
        } else {
          body = res.body || res.payload;
        }
        
        return {
          status: res.statusCode,
          headers: res.headers,
          body
        };
      },
      teardown: async () => {}
    };
  },
  createMiddleware: (options) => idempotency(options)
});

// Fastify-specific tests
test("fastify - exposes circuit breaker", async (t) => {
  const store = { lookup: () => {}, startProcessing: () => {}, complete: () => {} };
  const middleware = idempotency({ store });
  t.ok(middleware.circuit);
});
```

**Step 2: Run Fastify tests**

Run: `cd packages/frameworks/fastify && npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add packages/frameworks/fastify/tests/fastify-middleware.test.js
git commit -m "refactor(fastify): use shared adapter test suite"
```

---

## Task 7: Refactor Express Adapter Tests

**Files:**
- Modify: `packages/frameworks/express/tests/express-middleware.test.js`

**Step 1: Replace with adapter pattern**

```javascript
import { test } from "tap";
import express from "express";
import http from "http";
import { runAdapterTests } from "@idempot/core/tests/framework-adapter-suite.js";
import { idempotency } from "../index.js";

// Run shared adapter test suite
runAdapterTests({
  name: "express",
  setup: async () => {
    const app = express();
    app.use(express.json());
    app.use(express.text({ type: "text/plain" }));
    
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    
    return {
      mount: (method, path, middleware, handler) => {
        app[method.toLowerCase()](path, middleware, handler);
      },
      request: async (options) => {
        return new Promise((resolve, reject) => {
          const reqOptions = {
            hostname: "localhost",
            port,
            path: options.path,
            method: options.method,
            headers: options.headers || {}
          };
          
          if (options.body && typeof options.body === "object") {
            reqOptions.headers["Content-Type"] = "application/json";
          }
          
          const req = http.request(reqOptions, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              const contentType = res.headers["content-type"] || "";
              let body;
              
              if (contentType.includes("json")) {
                try {
                  body = JSON.parse(data);
                } catch {
                  body = data;
                }
              } else {
                body = data;
              }
              
              resolve({
                status: res.statusCode,
                headers: res.headers,
                body
              });
            });
          });
          
          req.on("error", reject);
          
          if (options.body) {
            const body = typeof options.body === "string" 
              ? options.body 
              : JSON.stringify(options.body);
            req.write(body);
          }
          req.end();
        });
      },
      teardown: async () => {
        server.close();
      }
    };
  },
  createMiddleware: (options) => idempotency(options)
});
```

**Step 2: Run Express tests**

Run: `cd packages/frameworks/express && npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add packages/frameworks/express/tests/express-middleware.test.js
git commit -m "refactor(express): use shared adapter test suite"
```

---

## Task 8: Verify Full Test Suite

**Files:**
- All test files

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 2: Run coverage verification**

Run: `npm run test:verify-coverage`
Expected: PASS

**Step 3: Build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(core): complete reusable framework adapter test suite"
```

---

## Summary of Changes

**Files Created:**
- `packages/core/tests/framework-adapter-suite.js` (~350 lines) - Shared test harness with helpers

**Files Modified:**
- `packages/frameworks/hono/tests/hono-middleware.test.js` (~60 lines, down from 471)
- `packages/frameworks/fastify/tests/fastify-middleware.test.js` (~50 lines, down from 524)
- `packages/frameworks/express/tests/express-middleware.test.js` (~90 lines, down from 827)

**Key Improvements:**
1. **Tap Compatibility**: Tests are registered at module level, not nested
2. **Helper Exports**: `createMemoryStore()` for easy store creation
3. **Adapter Validation**: Fails fast with clear errors on misconfiguration
4. **Response Normalization**: Handles framework differences (status vs statusCode)
5. **Explicit Concurrent Test**: No timing-dependent delays, uses explicit store state
6. **Method Parameter**: `mount(method, path, middleware, handler)` supports all HTTP methods

**Lines of Code Reduced:** ~1,700 → ~500 (70% reduction in test code)
**Test Coverage:** Maintains 100% coverage across all adapters
