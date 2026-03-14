# Reusable Framework Adapter Test Suite Design

**Date**: 2026-03-14  
**Author**: Assistant  
**Status**: Approved

## Problem Statement

The framework adapters (Hono, Fastify, Express) each have ~20 test cases with significant duplication. Tests cover identical idempotency behaviors but use framework-specific setup and request patterns. This creates maintenance burden and inconsistency.

## Goals

1. Create a single comprehensive test suite in `@idempot/core`
2. Reduce each framework adapter's test file to ~30 lines
3. Ensure all adapters test the same behaviors consistently
4. Make it easy to add new framework adapters

## Architecture

### Location

`packages/core/tests/framework-adapter-suite.js`

### Interface

The test suite exports a single function:

```javascript
export function runAdapterTests(adapter)
```

Where `adapter` implements:

```javascript
{
  name: string,              // "hono" | "fastify" | "express"
  setup: async () => ({      // Returns test context
    app: any,                // Framework app instance
    mount: (middleware, handler) => void,  // Mount to a route
    request: (options) => Promise<Response>, // Framework-agnostic request
    teardown: async () => void  // Cleanup resources
  })
}
```

### Request/Response Normalized Format

```javascript
// Request options
{
  method: "POST",
  headers: { "idempotency-key": "..." },
  body: string | object
}

// Returned response
{
  status: number,
  headers: Record<string, string>,
  body: any  // Parsed JSON or string
}
```

## Test Coverage

The suite runs ~20 tests covering:

### HTTP Method Handling (1 test)
- GET requests bypass idempotency processing

### Validation (5 tests)
- Missing key when optional: passes through
- Missing key when required: returns 400
- Key too long (>255 chars): returns 400
- Empty key: returns 400
- Key contains comma: returns 400
- Multiple idempotency-key headers: returns 400

### Caching Behavior (3 tests)
- First request with new key: processes and stores response
- Second request with same key: returns cached response
- Handler called exactly once for duplicate requests
- `x-idempotent-replayed: true` header on replay

### Conflict Detection (4 tests)
- Concurrent processing: returns 409
- Same key with different payload: returns 422
- Different key with same fingerprint: returns 409
- Key mismatch with same fingerprint: returns 409

### Error Handling (4 tests)
- Store lookup failure: returns 503
- Store startProcessing failure: returns 503
- Store complete failure: returns 200 (request succeeds, logging only)
- Non-standard lookup status: passes through to handler

### Body Handling (3 tests)
- JSON body: handled correctly
- String body: handled correctly
- Empty body: handled correctly

### Configuration (2 tests)
- Field exclusion: excluded fields ignored in fingerprint
- PATCH method protected: same as POST

## Example Adapter Usage

### Hono Adapter Tests (after refactor)

```javascript
import { test } from "tap";
import { Hono } from "hono";
import { runAdapterTests } from "@idempot/core/tests/framework-adapter-suite.js";
import { idempotency } from "../index.js";

runAdapterTests({
  name: "hono",
  setup: async () => {
    const app = new Hono();
    return {
      app,
      mount: (middleware, handler) => {
        app.post("/test", middleware, handler);
      },
      request: async (options) => {
        const res = await app.request("/test", {
          method: options.method,
          headers: options.headers,
          body: options.body
        });
        return {
          status: res.status,
          headers: Object.fromEntries(res.headers.entries()),
          body: res.headers.get("content-type")?.includes("json") 
            ? await res.json() 
            : await res.text()
        };
      },
      teardown: async () => {}
    };
  },
  createMiddleware: (options) => idempotency(options)
});
```

### Fastify Adapter Tests (after refactor)

```javascript
import { test } from "tap";
import Fastify from "fastify";
import { runAdapterTests } from "@idempot/core/tests/framework-adapter-suite.js";
import { idempotency } from "../index.js";

runAdapterTests({
  name: "fastify",
  setup: async () => {
    const app = Fastify();
    return {
      app,
      mount: (middleware, handler) => {
        app.post("/test", { preHandler: middleware }, handler);
      },
      request: async (options) => {
        const res = await app.inject({
          method: options.method,
          url: "/test",
          payload: options.body,
          headers: options.headers
        });
        return {
          status: res.statusCode,
          headers: res.headers,
          body: res.headers["content-type"]?.includes("json")
            ? res.json()
            : res.body
        };
      },
      teardown: async () => {}
    };
  },
  createMiddleware: (options) => idempotency(options)
});
```

## Benefits

1. **Maintainability**: Fix a test once, all adapters benefit
2. **Consistency**: All adapters guarantee identical behavior
3. **New Adapters**: Adding Koa, NestJS, etc. requires only ~30 lines
4. **Coverage**: 100% coverage of framework adapter code
5. **Documentation**: Test suite serves as specification for adapter behavior

## Implementation Notes

1. Tests use `SqliteIdempotencyStore({ path: ":memory:" })` for isolation
2. Each test creates a fresh store instance to avoid state leakage
3. Tests are ordered: validation → caching → conflicts → errors → edge cases
4. Framework-specific edge cases can be added in adapter test files after calling `runAdapterTests()`
