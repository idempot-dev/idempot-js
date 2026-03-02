# DRY Middleware Refactoring Implementation Plan (Pragmatic)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract shared validation and core logic from the three middleware files to reduce duplication while preserving framework-specific handling.

**Architecture:** Extend `src/validation.js` with shared functions. Each middleware focuses only on framework-specific request/response handling.

**Tech Stack:** JavaScript (ESM), JSDoc, tap testing framework

---

## Task 0: Verify Baseline

**Step 1: Run all existing tests before any changes**

```bash
npm test
```

Expected: All tests PASS (establish baseline)

**Step 2: Check coverage baseline**

```bash
npm run test:coverage
```

Expected: 100% coverage

---

## Task 1: Extend validation.js with Shared Utilities

**Files:**
- Modify: `src/validation.js`
- Test: `tests/validation.test.js`

**Step 1: Write failing tests for all three functions**

Add to `tests/validation.test.js` after existing tests:

```javascript
// validateIdempotencyKey tests
test("validateIdempotencyKey - accepts valid key", (t) => {
  const result = validateIdempotencyKey("valid-key", 255);
  t.equal(result.valid, true);
  t.equal(result.error, undefined);
  t.end();
});

test("validateIdempotencyKey - rejects empty key", (t) => {
  const result = validateIdempotencyKey("", 255);
  t.equal(result.valid, false);
  t.match(result.error, /between 1-255 characters/i);
  t.end();
});

test("validateIdempotencyKey - rejects too long key", (t) => {
  const longKey = "x".repeat(256);
  const result = validateIdempotencyKey(longKey, 255);
  t.equal(result.valid, false);
  t.match(result.error, /between 1-255 characters/i);
  t.end();
});

// checkLookupConflicts tests
test("checkLookupConflicts - no conflicts when lookup is empty", (t) => {
  const lookup = { byKey: null, byFingerprint: null };
  const result = checkLookupConflicts(lookup, "key", "fp");
  t.equal(result.conflict, false);
  t.end();
});

test("checkLookupConflicts - detects processing conflict", (t) => {
  const lookup = { 
    byKey: { status: "processing" }, 
    byFingerprint: null 
  };
  const result = checkLookupConflicts(lookup, "key", "fp");
  t.equal(result.conflict, true);
  t.equal(result.status, 409);
  t.match(result.error, /already being processed/i);
  t.end();
});

test("checkLookupConflicts - detects fingerprint mismatch", (t) => {
  const lookup = { 
    byKey: null, 
    byFingerprint: { key: "different-key" } 
  };
  const result = checkLookupConflicts(lookup, "key", "fp");
  t.equal(result.conflict, true);
  t.equal(result.status, 409);
  t.match(result.error, /different idempotency key/i);
  t.end();
});

test("checkLookupConflicts - detects key reuse with different payload", (t) => {
  const lookup = { 
    byKey: { status: "complete", fingerprint: "different-fp" }, 
    byFingerprint: null 
  };
  const result = checkLookupConflicts(lookup, "key", "fp");
  t.equal(result.conflict, true);
  t.equal(result.status, 422);
  t.match(result.error, /different request payload/i);
  t.end();
});

test("checkLookupConflicts - no conflict for matching key and fingerprint", (t) => {
  const lookup = { 
    byKey: { status: "complete", fingerprint: "fp" }, 
    byFingerprint: { key: "key" } 
  };
  const result = checkLookupConflicts(lookup, "key", "fp");
  t.equal(result.conflict, false);
  t.end();
});

// shouldProcessRequest tests
test("shouldProcessRequest - returns true for POST", (t) => {
  t.equal(shouldProcessRequest("POST"), true);
  t.end();
});

test("shouldProcessRequest - returns true for PATCH", (t) => {
  t.equal(shouldProcessRequest("PATCH"), true);
  t.end();
});

test("shouldProcessRequest - returns false for GET", (t) => {
  t.equal(shouldProcessRequest("GET"), false);
  t.end();
});

test("shouldProcessRequest - returns false for PUT", (t) => {
  t.equal(shouldProcessRequest("PUT"), false);
  t.end();
});

// getCachedResponse tests
test("getCachedResponse - returns cached response when complete", (t) => {
  const cached = { status: 200, body: "{}" };
  const lookup = { 
    byKey: { status: "complete", response: cached },
    byFingerprint: null
  };
  t.equal(getCachedResponse(lookup), cached);
  t.end();
});

test("getCachedResponse - returns null when not complete", (t) => {
  const lookup = { 
    byKey: { status: "processing" },
    byFingerprint: null
  };
  t.equal(getCachedResponse(lookup), null);
  t.end();
});

// prepareCachedResponse tests
test("prepareCachedResponse - adds replay header", (t) => {
  const cached = { 
    status: 200, 
    headers: { "content-type": "application/json" },
    body: "{}" 
  };
  const result = prepareCachedResponse(cached);
  t.equal(result.status, 200);
  t.equal(result.headers["x-idempotent-replayed"], "true");
  t.equal(result.headers["content-type"], "application/json");
  t.equal(result.body, "{}");
  t.end();
});

test("prepareCachedResponse - handles empty headers", (t) => {
  const cached = { 
    status: 201,
    body: "created"
  };
  const result = prepareCachedResponse(cached);
  t.equal(result.status, 201);
  t.equal(result.headers["x-idempotent-replayed"], "true");
  t.equal(result.body, "created");
  t.end();
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test -- tests/validation.test.js
```

Expected: FAIL with functions not defined

**Step 3: Implement all shared functions**

Add to end of `src/validation.js`:

```javascript
/**
 * @param {string} key
 * @param {number} maxKeyLength
 * @returns {{valid: boolean, error?: string}}
 */
export function validateIdempotencyKey(key, maxKeyLength) {
  if (key.length === 0 || key.length > maxKeyLength) {
    return {
      valid: false,
      error: `Idempotency-Key must be between 1-${maxKeyLength} characters`
    };
  }
  return { valid: true };
}

/**
 * @param {{byKey: any, byFingerprint: any}} lookup
 * @param {string} key
 * @param {string} fingerprint
 * @returns {{conflict: boolean, status?: number, error?: string}}
 */
export function checkLookupConflicts(lookup, key, fingerprint) {
  if (lookup.byKey?.status === "processing") {
    return {
      conflict: true,
      status: 409,
      error: "A request with this idempotency key is already being processed"
    };
  }

  if (lookup.byFingerprint && lookup.byFingerprint.key !== key) {
    return {
      conflict: true,
      status: 409,
      error: "This request was already processed with a different idempotency key"
    };
  }

  if (lookup.byKey && lookup.byKey.fingerprint !== fingerprint) {
    return {
      conflict: true,
      status: 422,
      error: "Idempotency key reused with different request payload"
    };
  }

  return { conflict: false };
}

/**
 * @param {string} method
 * @returns {boolean}
 */
export function shouldProcessRequest(method) {
  return method === "POST" || method === "PATCH";
}

/**
 * @param {{byKey: any, byFingerprint: any}} lookup
 * @returns {any | null}
 */
export function getCachedResponse(lookup) {
  if (lookup.byKey?.status === "complete" && lookup.byKey.response) {
    return lookup.byKey.response;
  }
  return null;
}

/**
 * @param {{status: number, headers?: Record<string, string>, body: string}} cached
 * @returns {{status: number, headers: Record<string, string>, body: string}}
 */
export function prepareCachedResponse(cached) {
  return {
    ...cached,
    headers: {
      ...(cached.headers || {}),
      "x-idempotent-replayed": "true"
    }
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test -- tests/validation.test.js
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/validation.js tests/validation.test.js
git commit -m "feat(validation): add shared idempotency utilities"
```

---

## Task 2: Refactor Hono Middleware

**Files:**
- Modify: `src/hono-middleware.js`

**Step 1: Update imports**

Replace lines 1-4:

```javascript
import { generateFingerprint } from "./fingerprint.js";
import { validateExcludeFields, validateIdempotencyKey, checkLookupConflicts, shouldProcessRequest, getCachedResponse, prepareCachedResponse } from "./validation.js";
import { withResilience } from "./resilience.js";
import { DEFAULT_OPTIONS } from "./default-options.js";
```

**Step 2: Refactor middleware function**

Replace lines 44-140:

```javascript
  const middleware = async (c, next) => {
    const method = c.req.method;
    if (!shouldProcessRequest(method)) {
      await next();
      return;
    }

    const key = c.req.header(HEADER_NAME);
    if (key === undefined) {
      if (opts.required) {
        return c.json({ error: "Idempotency-Key header is required" }, 400);
      }
      await next();
      return;
    }

    const keyValidation = validateIdempotencyKey(key, opts.maxKeyLength);
    if (!keyValidation.valid) {
      return c.json({ error: keyValidation.error }, 400);
    }

    const body = await c.req.text();
    const fingerprint = await generateFingerprint(body, opts.excludeFields);

    let lookup;
    try {
      lookup = await resilientStore.lookup(key, fingerprint);
    } catch {
      return c.json({ error: "Service temporarily unavailable" }, 503);
    }

    const conflict = checkLookupConflicts(lookup, key, fingerprint);
    if (conflict.conflict) {
      return c.json({ error: conflict.error }, conflict.status);
    }

    const cached = getCachedResponse(lookup);
    if (cached) {
      const response = prepareCachedResponse(cached);
      return c.body(response.body, response.status, response.headers);
    }

    if (!lookup.byKey && !lookup.byFingerprint) {
      try {
        await resilientStore.startProcessing(key, fingerprint, opts.ttlMs);
      } catch {
        return c.json({ error: "Service temporarily unavailable" }, 503);
      }

      await next();

      const clonedResponse = c.res.clone();
      const response = {
        status: c.res.status,
        headers: Object.fromEntries(c.res.headers.entries()),
        body: await clonedResponse.text()
      };

      try {
        await resilientStore.complete(key, response);
      } catch (err) {
        console.error("Failed to cache response:", err);
      }

      return;
    }

    await next();
  };
```

**Step 3: Run tests**

```bash
npm test -- tests/hono-middleware.test.js
```

Expected: PASS

---

## Task 3: Refactor Express Middleware

**Files:**
- Modify: `src/express-middleware.js`

**Step 1: Update imports**

Replace lines 1-4:

```javascript
import { generateFingerprint } from "./fingerprint.js";
import { validateExcludeFields, validateIdempotencyKey, checkLookupConflicts, shouldProcessRequest, getCachedResponse, prepareCachedResponse } from "./validation.js";
import { withResilience } from "./resilience.js";
import { DEFAULT_OPTIONS } from "./default-options.js";
```

**Step 2: Refactor middleware function**

Replace lines 37-147:

```javascript
  return async (req, res, next) => {
    const method = req.method;
    if (!shouldProcessRequest(method)) {
      next();
      return;
    }

    const key = /** @type {string} */ (req.headers[HEADER_NAME]);
    if (key === undefined) {
      if (opts.required) {
        res.status(400).json({ error: "Idempotency-Key header is required" });
        return;
      }
      next();
      return;
    }

    const keyValidation = validateIdempotencyKey(key, opts.maxKeyLength);
    if (!keyValidation.valid) {
      res.status(400).json({ error: keyValidation.error });
      return;
    }

    const bodyText = req.body
      ? typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body)
      : "";
    const fingerprint = await generateFingerprint(bodyText, opts.excludeFields);

    let lookup;
    try {
      lookup = await resilientStore.lookup(key, fingerprint);
    } catch {
      res.status(503).json({ error: "Service temporarily unavailable" });
      return;
    }

    const conflict = checkLookupConflicts(lookup, key, fingerprint);
    if (conflict.conflict) {
      res.status(conflict.status).json({ error: conflict.error });
      return;
    }

    const cached = getCachedResponse(lookup);
    if (cached) {
      const response = prepareCachedResponse(cached);
      res.status(response.status);
      for (const [headerKey, value] of Object.entries(response.headers)) {
        res.set(headerKey, value);
      }
      res.send(response.body);
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
      let capturedBody = "";

      res.send = (body) => {
        capturedBody = typeof body === "string" ? body : JSON.stringify(body);
        return originalSend(body);
      };

      next();

      res.on("finish", async () => {
        try {
          await resilientStore.complete(key, {
            status: res.statusCode,
            headers: Object.fromEntries(
              Object.entries(res.getHeaders()).map(([k, v]) => [
                k,
                /** @type {string} */ (v)
              ])
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
  };
```

**Step 3: Run tests**

```bash
npm test -- tests/express-middleware.test.js
```

Expected: PASS

---

## Task 4: Refactor Fastify Middleware

**Files:**
- Modify: `src/fastify-middleware.js`

**Step 1: Update imports**

Replace lines 1-4:

```javascript
import { generateFingerprint } from "./fingerprint.js";
import { validateExcludeFields, validateIdempotencyKey, checkLookupConflicts, shouldProcessRequest, getCachedResponse, prepareCachedResponse } from "./validation.js";
import { withResilience } from "./resilience.js";
import { DEFAULT_OPTIONS } from "./default-options.js";
```

**Step 2: Refactor middleware function**

Replace lines 23-129:

```javascript
  const middleware = async (request, reply) => {
    const method = request.method;
    if (!shouldProcessRequest(method)) {
      return;
    }

    const key = request.headers[HEADER_NAME];
    if (key === undefined) {
      if (opts.required) {
        return reply
          .code(400)
          .send({ error: "Idempotency-Key header is required" });
      }
      return;
    }

    const keyValidation = validateIdempotencyKey(key, opts.maxKeyLength);
    if (!keyValidation.valid) {
      return reply.code(400).send({ error: keyValidation.error });
    }

    const bodyText = request.body
      ? typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body)
      : "";
    const fingerprint = await generateFingerprint(bodyText, opts.excludeFields);

    let lookup;
    try {
      lookup = await resilientStore.lookup(key, fingerprint);
    } catch {
      return reply.code(503).send({ error: "Service temporarily unavailable" });
    }

    const conflict = checkLookupConflicts(lookup, key, fingerprint);
    if (conflict.conflict) {
      return reply.code(conflict.status).send({ error: conflict.error });
    }

    const cached = getCachedResponse(lookup);
    if (cached) {
      const response = prepareCachedResponse(cached);
      reply.code(response.status);
      for (const [headerKey, value] of Object.entries(response.headers)) {
        reply.header(headerKey, value);
      }
      return reply.send(response.body);
    }

    if (!lookup.byKey && !lookup.byFingerprint) {
      try {
        await resilientStore.startProcessing(key, fingerprint, opts.ttlMs);
      } catch {
        return reply
          .code(503)
          .send({ error: "Service temporarily unavailable" });
      }

      request.idempotencyKey = key;

      const originalSend = reply.send.bind(reply);
      reply.send = (payload) => {
        const capturedBody =
          typeof payload === "string" ? payload : JSON.stringify(payload);
        request.idempotencyBody = capturedBody;
        return originalSend(payload);
      };

      reply.then(
        () => {
          if (request.idempotencyKey) {
            resilientStore
              .complete(request.idempotencyKey, {
                status: reply.statusCode,
                headers: Object.fromEntries(
                  Object.entries(reply.getHeaders()).map(([k, v]) => [k, v])
                ),
                body: request.idempotencyBody || ""
              })
              .catch((err) => {
                console.error("Failed to cache response:", err);
              });
          }
        },
        () => {}
      );
    }
  };
```

**Step 3: Run tests**

```bash
npm test -- tests/fastify-middleware.test.js
```

Expected: PASS

**Step 4: Commit all middleware refactors**

```bash
git add src/hono-middleware.js src/express-middleware.js src/fastify-middleware.js
git commit -m "refactor(middleware): use shared validation utilities"
```

---

## Task 5: Verify Complete

**Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests PASS

**Step 2: Verify coverage maintained**

```bash
npm run test:verify-coverage
```

Expected: 100% coverage

**Step 3: Run lint**

```bash
npm run lint
```

Expected: No errors

**Step 4: Compare line counts**

```bash
wc -l src/*-middleware.js
```

Expected: Each file reduced from ~140 to ~70 lines

---

## Summary

**Changes:**
- 1 file extended (`validation.js`)
- 3 files refactored (middlewares)
- 2 commits total
- ~40 lines removed per middleware (50% reduction)
- 100% test coverage maintained

**Pragmatic wins:**
- No new files created (avoided file proliferation)
- All shared logic in one place
- Baseline verified before changes
- Framework-specific handling preserved
