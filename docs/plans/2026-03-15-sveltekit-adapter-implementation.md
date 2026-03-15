# SvelteKit Adapter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create `@idempot/sveltekit-middleware` - an idempotency adapter for SvelteKit's server hooks.

**Architecture:** The adapter exports a `handle` function compatible with SvelteKit's server hooks. Users add it to their `src/hooks.server.ts`. The middleware intercepts POST/PATCH requests, validates idempotency keys, and caches responses using the Web Response API.

**Tech Stack:** JavaScript ESM, `@idempot/core`, SvelteKit hooks

---

## Task 1: Create package.json

**Files:**
- Create: `packages/frameworks/sveltekit/package.json`

**Step 1: Create the package.json file**

```json
{
  "name": "@idempot/sveltekit-middleware",
  "version": "0.1.0",
  "description": "SvelteKit middleware for idempotency",
  "type": "module",
  "main": "./index.js",
  "exports": {
    ".": {
      "import": "./index.js"
    }
  },
  "files": [
    "index.js",
    "README.md",
    "LICENSE"
  ],
  "keywords": [
    "sveltekit",
    "middleware",
    "idempotency",
    "idempotent",
    "ietf"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/mroderick/idempot"
  },
  "license": "MIT",
  "scripts": {
    "test": "tap sveltekit-middleware.test.js"
  },
  "peerDependencies": {
    "@sveltejs/kit": ">=2.0.0"
  },
  "dependencies": {
    "@idempot/core": "workspace:*"
  },
  "devDependencies": {
    "@idempot/sqlite-store": "workspace:*"
  }
}
```

**Step 2: Commit**

```bash
git add packages/frameworks/sveltekit/package.json
git commit -m "feat: scaffold sveltekit middleware package"
```

---

## Task 2: Create test file for SvelteKit adapter

**Files:**
- Create: `packages/frameworks/sveltekit/tests/sveltekit-middleware.test.js`

**Step 1: Write the failing test**

Write a focused test file that directly tests the adapter without the framework-adapter-suite:

```javascript
import { test } from "tap";
import { idempotency, handle } from "../index.js";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

test("sveltekit - throws when store is not provided", (t) => {
  t.throws(
    () => idempotency({}),
    /IdempotencyStore must be provided/i,
    "should throw error about store"
  );
  t.end();
});

test("sveltekit - exports both idempotency and handle", (t) => {
  t.equal(typeof idempotency, "function", "idempotency should be a function");
  t.equal(typeof handle, "function", "handle should be a function");
  t.equal(idempotency, handle, "handle should be an alias for idempotency");
  t.end();
});

test("sveltekit - GET requests pass through without idempotency processing", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const middleware = idempotency({ store });

  let handlerCalled = false;
  const handler = async () => {
    handlerCalled = true;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const event = {
    request: new Request("http://localhost/test", { method: "GET" }),
    url: new URL("http://localhost/test"),
    params: {},
    locals: {}
  };

  const response = await middleware({ event, resolve: handler });

  t.ok(handlerCalled, "handler should be called");
  t.equal(response.status, 200, "should return 200");
  t.same(await response.json(), { ok: true });

  await store.close();
  t.end();
});

test("sveltekit - POST without key when optional", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const middleware = idempotency({ store, required: false });

  let handlerCalled = false;
  const handler = async () => {
    handlerCalled = true;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const event = {
    request: new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify({ foo: "bar" })
    }),
    url: new URL("http://localhost/test"),
    params: {},
    locals: {}
  };

  const response = await middleware({ event, resolve: handler });

  t.ok(handlerCalled, "handler should be called");
  t.equal(response.status, 200, "should return 200");

  await store.close();
  t.end();
});

test("sveltekit - POST without key when required returns 400", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const middleware = idempotency({ store, required: true });

  const handler = async () => {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const event = {
    request: new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify({ foo: "bar" })
    }),
    url: new URL("http://localhost/test"),
    params: {},
    locals: {}
  };

  const response = await middleware({ event, resolve: handler });

  t.equal(response.status, 400, "should return 400");
  t.match(await response.json(), /Idempotency-Key header is required/i);

  await store.close();
  t.end();
});

test("sveltekit - caches response on first request", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const middleware = idempotency({ store });

  let callCount = 0;
  const handler = async () => {
    callCount++;
    return new Response(JSON.stringify({ id: `order-${callCount}` }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const event = {
    request: new Request("http://localhost/test", {
      method: "POST",
      headers: { "idempotency-key": "cache-key-12345678901" },
      body: JSON.stringify({ foo: "bar" })
    }),
    url: new URL("http://localhost/test"),
    params: {},
    locals: {}
  };

  const response = await middleware({ event, resolve: handler });

  t.equal(response.status, 200, "should return 200");
  t.equal(callCount, 1, "handler should be called once");
  t.same(await response.json(), { id: "order-1" });

  await store.close();
  t.end();
});

test("sveltekit - replays cached response on duplicate request", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const middleware = idempotency({ store });

  let callCount = 0;
  const handler = async () => {
    callCount++;
    return new Response(JSON.stringify({ id: `order-${callCount}` }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const event1 = {
    request: new Request("http://localhost/test", {
      method: "POST",
      headers: { "idempotency-key": "cache-key-12345678901" },
      body: JSON.stringify({ foo: "bar" })
    }),
    url: new URL("http://localhost/test"),
    params: {},
    locals: {}
  };

  await middleware({ event1, resolve: handler });

  // Second request with same key
  const event2 = {
    request: new Request("http://localhost/test", {
      method: "POST",
      headers: { "idempotency-key": "cache-key-12345678901" },
      body: JSON.stringify({ foo: "bar" })
    }),
    url: new URL("http://localhost/test"),
    params: {},
    locals: {}
  };

  const response = await middleware({ event2, resolve: handler });

  t.equal(response.status, 200, "should return 200");
  t.equal(callCount, 1, "handler should not be called again");
  t.same(await response.json(), { id: "order-1" }, "should return cached response");
  t.equal(response.headers.get("x-idempotency-replayed"), "true", "should have replay header");

  await store.close();
  t.end();
});

test("sveltekit - rejects keys longer than 255 characters", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const middleware = idempotency({ store });

  const handler = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });

  const longKey = "a".repeat(256);
  const event = {
    request: new Request("http://localhost/test", {
      method: "POST",
      headers: { "idempotency-key": longKey },
      body: JSON.stringify({ foo: "bar" })
    }),
    url: new URL("http://localhost/test"),
    params: {},
    locals: {}
  };

  const response = await middleware({ event, resolve: handler });

  t.equal(response.status, 400, "should return 400");
  t.match(await response.json(), /too long/i);

  await store.close();
  t.end();
});

test("sveltekit - rejects empty key", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const middleware = idempotency({ store });

  const handler = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });

  const event = {
    request: new Request("http://localhost/test", {
      method: "POST",
      headers: { "idempotency-key": "" },
      body: JSON.stringify({ foo: "bar" })
    }),
    url: new URL("http://localhost/test"),
    params: {},
    locals: {}
  };

  const response = await middleware({ event, resolve: handler });

  t.equal(response.status, 400, "should return 400");

  await store.close();
  t.end();
});

test("sveltekit - exposes circuit breaker", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const middleware = idempotency({ store });

  t.ok(middleware.circuit, "should expose circuit breaker");
  t.equal(typeof middleware.circuit.fire, "function", "circuit should have fire method");

  await store.close();
  t.end();
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/frameworks/sveltekit && npm test
```

Expected: FAIL - "Cannot find module '../index.js'"

**Step 3: Commit**

```bash
git add packages/frameworks/sveltekit/tests/sveltekit-middleware.test.js
git commit -m "test: add sveltekit adapter tests"
```

---

## Task 3: Create the SvelteKit adapter implementation

**Files:**
- Create: `packages/frameworks/sveltekit/index.js`

**Reference:** See `packages/frameworks/hono/index.js` - it's the most similar since Hono also uses the Web Response API.

**Step 1: Write the implementation**

```javascript
import {
  generateFingerprint,
  validateExcludeFields,
  validateIdempotencyKey,
  validateIdempotencyOptions,
  checkLookupConflicts,
  shouldProcessRequest,
  getCachedResponse,
  prepareCachedResponse,
  withResilience,
  defaultOptions
} from "@idempot/core";

/**
 * @typedef {import("@idempot/core/store/interface.js").IdempotencyStore} IdempotencyStore
 * @typedef {import("@idempot/core/resilience.js").ResilienceOptions} ResilienceOptions
 * @typedef {import("@idempot/core/default-options.js").IdempotencyOptions} IdempotencyOptions
 */

/**
 * HTTP header name for idempotency key as defined in
 * https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07
 * @constant
 * @type {string}
 */
const HEADER_NAME = "idempotency-key";

/**
 * SvelteKit middleware for idempotency.
 * Works with SvelteKit's server hooks (src/hooks.server.ts).
 *
 * @param {Object} opts - Middleware options
 * @param {IdempotencyStore} opts.store - Storage backend
 * @param {string} [opts.headerName="Idempotency-Key"] - Header name
 * @param {number} [opts.maxKeyLength=255] - Maximum key length
 * @param {number} [opts.minKeyLength=21] - Minimum key length (default: 21 for nanoid)
 * @param {boolean} [opts.required=false] - Require idempotency key on requests
 * @param {string[]} [opts.excludeFields=[]] - Body fields to exclude from fingerprint
 * @param {number} [opts.ttlMs=86400000] - Cache TTL in milliseconds
 * @param {ResilienceOptions} [opts.resilience={}] - Resilience options
 * @returns {function} SvelteKit handle hook function with attached circuit breaker
 * @example
 * // src/hooks.server.ts
 * import { idempotency } from "@idempot/sveltekit-middleware";
 * import { SqliteIdempotencyStore } from "@idempot/sqlite-store";
 *
 * export const handle = idempotency({
 *   store: new SqliteIdempotencyStore({ path: "./idempotency.db" })
 * });
 */
export function idempotency(options = {}) {
  const opts = { ...defaultOptions, ...options };
  if (!opts.store) {
    throw new Error(
      "IdempotencyStore must be provided. " +
        "Use SqliteIdempotencyStore({ path: ':memory:' }) for development"
    );
  }
  validateExcludeFields(opts.excludeFields);
  validateIdempotencyOptions(opts);
  const store = opts.store;
  const { store: resilientStore, circuit } = withResilience(
    store,
    opts.resilience
  );

  /**
   * SvelteKit handle hook function
   * @param {Object} param
   * @param {import("@sveltejs/kit").RequestEvent} param.event - SvelteKit request event
   * @param {(event: import("@sveltejs/kit").RequestEvent) => Promise<Response>} param.resolve - SvelteKit resolve function
   * @returns {Promise<Response>}
   */
  const middleware = async ({ event, resolve }) => {
    const method = event.request.method;
    if (!shouldProcessRequest(method)) {
      return await resolve(event);
    }

    const key = event.request.headers.get(HEADER_NAME);
    if (key === null) {
      if (opts.required) {
        return new Response(JSON.stringify({ error: "Idempotency-Key header is required" }), {
          status: 400,
          headers: { "content-type": "application/json" }
        });
      }
      return await resolve(event);
    }

    const keyValidation = validateIdempotencyKey(key, {
      minKeyLength: opts.minKeyLength,
      maxKeyLength: opts.maxKeyLength
    });
    if (!keyValidation.valid) {
      return new Response(JSON.stringify({ error: keyValidation.error }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    const body = await event.request.text();
    const fingerprint = await generateFingerprint(body, opts.excludeFields);

    let lookup;
    try {
      lookup = await resilientStore.lookup(key, fingerprint);
    } catch {
      return new Response(JSON.stringify({ error: "Service temporarily unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" }
      });
    }

    const conflict = checkLookupConflicts(lookup, key, fingerprint);
    if (conflict.conflict) {
      return new Response(JSON.stringify({ error: conflict.error }), {
        status: conflict.status,
        headers: { "content-type": "application/json" }
      });
    }

    const cached = getCachedResponse(lookup);
    if (cached) {
      const response = prepareCachedResponse(cached);
      return new Response(response.body, {
        status: response.status,
        headers: response.headers
      });
    }

    if (!lookup.byKey && !lookup.byFingerprint) {
      try {
        await resilientStore.startProcessing(key, fingerprint, opts.ttlMs);
      } catch {
        return new Response(JSON.stringify({ error: "Service temporarily unavailable" }), {
          status: 503,
          headers: { "content-type": "application/json" }
        });
      }

      const response = await resolve(event);

      // Guard against body already being consumed (e.g., streaming responses)
      // If body is already used, we can't cache it but still return the response
      if (!response.bodyUsed) {
        const clonedResponse = response.clone();
        const responseData = {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: await clonedResponse.text()
        };

        try {
          await resilientStore.complete(key, responseData);
        } catch (err) {
          console.error("Failed to cache response:", err);
        }
      }

      return response;
    }

    return await resolve(event);
  };

  /**
   * Circuit breaker instance for monitoring and controlling resilience
   * @type {import("@idempot/core/resilience.js").CircuitBreaker}
   */
  middleware.circuit = circuit;

  return middleware;
}

/**
 * Alias for idempotency() - named "handle" to match SvelteKit hook convention.
 * Allows users to write: export const handle = handleMiddleware({ store });
 *
 * @param {Object} opts - Middleware options (same as idempotency)
 * @returns {function} SvelteKit handle hook function
 */
export const handle = idempotency;
```

**Step 2: Run tests to verify they pass**

```bash
cd packages/frameworks/sveltekit && npm test
```

Expected: PASS (10+ tests)

**Step 3: Run coverage verification**

```bash
npm run test:verify-coverage
```

Expected: 100% coverage

**Step 4: Commit**

```bash
git add packages/frameworks/sveltekit/index.js
git commit -m "feat: implement sveltekit middleware adapter"
```

---

## Task 4: Create README

**Files:**
- Create: `packages/frameworks/sveltekit/README.md`

**Reference:** See `packages/frameworks/hono/README.md` for the documentation structure.

**Step 1: Write the README**

```markdown
# @idempot/sveltekit-middleware

IETF-compliant idempotency middleware for SvelteKit.

## Installation

```bash
npm install @idempot/sveltekit-middleware
```

## Usage

Add the middleware to your SvelteKit hooks. You can use either export:

```typescript
// src/hooks.server.ts
import { idempotency } from "@idempot/sveltekit-middleware";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

export const handle = idempotency({
  store: new SqliteIdempotencyStore({ path: "./idempotency.db" })
});
```

Or use the `handle` alias for cleaner syntax:

```typescript
// src/hooks.server.ts
import { handle } from "@idempot/sveltekit-middleware";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

export default handle({
  store: new SqliteIdempotencyStore({ path: "./idempotency.db" })
});
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `store` | `IdempotencyStore` | (required) | Storage backend |
| `headerName` | `string` | `"Idempotency-Key"` | Header for idempotency key |
| `maxKeyLength` | `number` | `255` | Maximum key length |
| `minKeyLength` | `number` | `21` | Minimum key length |
| `required` | `boolean` | `false` | Require idempotency key |
| `excludeFields` | `string[]` | `[]` | Body fields to exclude from fingerprint |
| `ttlMs` | `number` | `86400000` | Cache TTL (24 hours) |

## Requirements

- SvelteKit 2.0+
- An idempotency store (e.g., `@idempot/sqlite-store`)

## See Also

- [@idempot/core](../core/README.md)
- [IETF idempotency key draft](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07)
```

**Step 2: Commit**

```bash
git add packages/frameworks/sveltekit/README.md
git commit -m "docs: add sveltekit middleware README"
```

---

## Task 5: Verify final state

**Step 1: Run full test suite**

```bash
npm run test:verify-coverage
```

Expected: All tests pass with 100% coverage

**Step 2: Check monorepo structure test**

Verify the new package is detected by the monorepo structure test:

```bash
npm run test:verify-coverage -- packages/tests/monorepo.test.js
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Create package.json |
| 2 | Create test harness |
| 3 | Implement adapter |
| 4 | Create README |
| 5 | Verify final state |
