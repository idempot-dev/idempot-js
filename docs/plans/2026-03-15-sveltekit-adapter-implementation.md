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

## Task 2: Create test harness for SvelteKit adapter

**Files:**
- Create: `packages/frameworks/sveltekit/tests/sveltekit-middleware.test.js`

**Reference:** See `packages/frameworks/express/tests/express-middleware.test.js` for the test structure.

**Step 1: Write the failing test**

The test imports `runAdapterTests` from the framework adapter suite. The suite needs a test harness that simulates SvelteKit's handle hook:

```javascript
import { test } from "tap";
import { runAdapterTests } from "../../../core/tests/framework-adapter-suite.js";
import { idempotency } from "../index.js";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

runAdapterTests({
  name: "sveltekit",
  setup: async () => {
    const handlers = new Map();

    const handle = async ({ event }) => {
      const key = event.url.pathname;
      const handler = handlers.get(key);
      if (!handler) {
        return new Response("Not Found", { status: 404 });
      }
      return handler(event);
    };

    return {
      mount: (method, path, middleware, handler) => {
        const wrappedHandler = async ({ event }) => {
          if (middleware) {
            let passed = false;
            const mockNext = () => {
              passed = true;
            };
            await middleware({ event, resolve: async () => handler(event) }, mockNext);
            if (!passed) {
              return new Response("Middleware blocked", { status: 500 });
            }
          }
          return handler(event);
        };
        handlers.set(path, wrappedHandler);
      },
      request: async (options) => {
        const bodyText = options.body
          ? typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body)
          : "";

        const request = new Request(`http://localhost${options.path}`, {
          method: options.method,
          headers: options.headers || {},
          body: options.method !== "GET" ? bodyText : undefined
        });

        const event = {
          request,
          url: new URL(request.url),
          params: {},
          locals: {}
        };

        const response = await handle({ event, resolve: async (evt) => {
          const handler = handlers.get(evt.url.pathname);
          if (handler) {
            return handler(evt);
          }
          return new Response("Not Found", { status: 404 });
        }});

        const responseBody = await response.text();
        let parsedBody;
        try {
          parsedBody = JSON.parse(responseBody);
        } catch {
          parsedBody = responseBody;
        }

        return {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: parsedBody
        };
      },
      teardown: async () => {
        handlers.clear();
      }
    };
  },
  createMiddleware: (options) => idempotency(options)
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
git commit -m "test: add sveltekit adapter test"
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
 * SvelteKit middleware for idempotency
 * @param {Object} opts - Middleware options
 * @param {IdempotencyStore} opts.store - Storage backend
 * @param {string} [opts.headerName="Idempotency-Key"] - Header name
 * @param {number} [opts.maxKeyLength=255] - Maximum key length
 * @param {number} [opts.minKeyLength=21] - Minimum key length (default: 21 for nanoid)
 * @returns {() => Promise<Response>}
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
   * @param {Object} param
   * @param {import("@sveltejs/kit").RequestEvent} param.event
   * @param {(event: import("@sveltejs/kit").RequestEvent) => Promise<Response>} param.resolve
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

      return response;
    }

    return await resolve(event);
  };

  middleware.circuit = circuit;

  return middleware;
}
```

**Step 2: Run tests to verify they pass**

```bash
cd packages/frameworks/sveltekit && npm test
```

Expected: PASS (23 tests)

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

Add the middleware to your SvelteKit hooks:

```typescript
// src/hooks.server.ts
import { idempotency } from "@idempot/sveltekit-middleware";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

export const handle = idempotency({
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
