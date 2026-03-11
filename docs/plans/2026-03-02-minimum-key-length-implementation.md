# Minimum Key Length Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add configurable `minKeyLength` parameter to `validateIdempotencyKey` with a default of 16 characters

**Architecture:** Refactor validation function to accept options object `{ minKeyLength, maxKeyLength }`, propagate option through all middleware, update tests for new default

**Tech Stack:** JavaScript (ESM), Node.js test runner, Hono/Express/Fastify middleware

---

## Task 1: Refactor validateIdempotencyKey Function

**Files:**
- Modify: `src/validation.js:26-34`
- Test: `tests/validation.test.js:61-85`

**Step 1: Write failing test for minKeyLength option**

```javascript
test("validateIdempotencyKey - rejects key shorter than minKeyLength", (t) => {
  const result = validateIdempotencyKey("short", { minKeyLength: 16, maxKeyLength: 255 });
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.error, "Idempotency-Key must be between 16-255 characters");
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/validation.test.js --test-name-pattern="rejects key shorter than minKeyLength"
```
Expected: FAIL - function doesn't accept options object yet

**Step 3: Refactor validateIdempotencyKey to accept options**

```javascript
export function validateIdempotencyKey(key, options = {}) {
  const { minKeyLength = 16, maxKeyLength = 255 } = options;
  if (key.length < minKeyLength || key.length > maxKeyLength) {
    return {
      valid: false,
      error: `Idempotency-Key must be between ${minKeyLength}-${maxKeyLength} characters`
    };
  }
  return { valid: true };
}
```

**Step 4: Run all validation tests**

```bash
npm test -- tests/validation.test.js
```
Expected: PASS (some tests may fail due to changed default, will fix in Task 2)

**Step 5: Commit**

```bash
git add src/validation.js tests/validation.test.js
git commit -m "feat(validation): add minKeyLength option to validateIdempotencyKey

- Refactor to accept options object with minKeyLength and maxKeyLength
- Default minKeyLength is 16 characters for security
- Error messages now reflect the configured range"
```

---

## Task 2: Update Validation Tests for New Default

**Files:**
- Modify: `tests/validation.test.js:61-85`

**Step 1: Update existing test for accepts valid key**

```javascript
test("validateIdempotencyKey - accepts valid key", (t) => {
  const result = validateIdempotencyKey("valid-key-16-characters", { maxKeyLength: 255 });
  assert.strictEqual(result.valid, true);
});
```

**Step 2: Update test for empty key to use proper minKeyLength**

```javascript
test("validateIdempotencyKey - rejects key shorter than default minKeyLength", (t) => {
  const result = validateIdempotencyKey("short", { maxKeyLength: 255 });
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.error, "Idempotency-Key must be between 16-255 characters");
});
```

**Step 3: Add test for explicit minKeyLength override**

```javascript
test("validateIdempotencyKey - accepts key at minKeyLength boundary", (t) => {
  const result = validateIdempotencyKey("exactly-16-chars", { minKeyLength: 16, maxKeyLength: 255 });
  assert.strictEqual(result.valid, true);
});

test("validateIdempotencyKey - allows custom minKeyLength", (t) => {
  const result = validateIdempotencyKey("abc", { minKeyLength: 3, maxKeyLength: 255 });
  assert.strictEqual(result.valid, true);
});
```

**Step 4: Run all validation tests**

```bash
npm test -- tests/validation.test.js
```
Expected: ALL PASS

**Step 5: Commit**

```bash
git add tests/validation.test.js
git commit -m "test(validation): update tests for minKeyLength default

- Update existing tests to use 16+ character keys
- Add tests for minKeyLength boundary and custom values"
```

---

## Task 3: Update Hono Middleware

**Files:**
- Modify: `src/hono-middleware.js:15-30` (options destructuring)
- Modify: `src/hono-middleware.js:67` (validateIdempotencyKey call)
- Test: `tests/hono-middleware.test.js`

**Step 1: Add minKeyLength to middleware options destructuring**

Find the options destructuring in the middleware factory function and add `minKeyLength`:

```javascript
export function idempotency(opts = {}) {
  const {
    store,
    headerName = "Idempotency-Key",
    maxKeyLength = 255,
    minKeyLength = 16,  // ADD THIS LINE
    // ... rest of options
  } = opts;
```

**Step 2: Update validateIdempotencyKey call**

```javascript
const keyValidation = validateIdempotencyKey(key, { minKeyLength, maxKeyLength });
```

**Step 3: Run Hono middleware tests**

```bash
npm test -- tests/hono-middleware.test.js
```
Expected: Some tests may fail due to short test keys, fix them

**Step 4: Commit**

```bash
git add src/hono-middleware.js
git commit -m "feat(hono): add minKeyLength option to middleware

- Support configurable minKeyLength in middleware options
- Pass minKeyLength to validateIdempotencyKey"
```

---

## Task 4: Update Hono Middleware Tests

**Files:**
- Modify: `tests/hono-middleware.test.js`

**Step 1: Find and update tests using short idempotency keys**

Search for tests using keys shorter than 16 characters:

```bash
grep -n "Idempotency-Key.*:.*['\"]" tests/hono-middleware.test.js | head -20
```

Update test keys to be 16+ characters. For example:
- `"test-key"` → `"test-key-12345678"`
- `"key-123"` → `"key-123-4567890123"`

**Step 2: Run Hono middleware tests**

```bash
npm test -- tests/hono-middleware.test.js
```
Expected: ALL PASS

**Step 3: Commit**

```bash
git add tests/hono-middleware.test.js
git commit -m "test(hono): update tests for 16-character minKeyLength

- Update all test idempotency keys to be 16+ characters
- Ensures tests pass with new default minimum length"
```

---

## Task 5: Update Express Middleware

**Files:**
- Modify: `src/express-middleware.js`

**Step 1: Add minKeyLength to middleware options destructuring**

```javascript
export function idempotency(opts = {}) {
  const {
    store,
    headerName = "Idempotency-Key",
    maxKeyLength = 255,
    minKeyLength = 16,  // ADD THIS LINE
    // ... rest of options
  } = opts;
```

**Step 2: Update validateIdempotencyKey call**

```javascript
const keyValidation = validateIdempotencyKey(key, { minKeyLength, maxKeyLength });
```

**Step 3: Run Express middleware tests**

```bash
npm test -- tests/express-middleware.test.js
```
Expected: Some tests may fail

**Step 4: Commit**

```bash
git add src/express-middleware.js
git commit -m "feat(express): add minKeyLength option to middleware

- Support configurable minKeyLength in middleware options
- Pass minKeyLength to validateIdempotencyKey"
```

---

## Task 6: Update Express Middleware Tests

**Files:**
- Modify: `tests/express-middleware.test.js`

**Step 1: Find and update tests using short idempotency keys**

```bash
grep -n "Idempotency-Key.*:.*['\"]" tests/express-middleware.test.js | head -20
```

Update test keys to be 16+ characters.

**Step 2: Run Express middleware tests**

```bash
npm test -- tests/express-middleware.test.js
```
Expected: ALL PASS

**Step 3: Commit**

```bash
git add tests/express-middleware.test.js
git commit -m "test(express): update tests for 16-character minKeyLength

- Update all test idempotency keys to be 16+ characters"
```

---

## Task 7: Update Fastify Middleware

**Files:**
- Modify: `src/fastify-middleware.js`

**Step 1: Add minKeyLength to middleware options destructuring**

```javascript
export function idempotency(opts = {}) {
  const {
    store,
    headerName = "Idempotency-Key",
    maxKeyLength = 255,
    minKeyLength = 16,  // ADD THIS LINE
    // ... rest of options
  } = opts;
```

**Step 2: Update validateIdempotencyKey call**

```javascript
const keyValidation = validateIdempotencyKey(key, { minKeyLength, maxKeyLength });
```

**Step 3: Run Fastify middleware tests**

```bash
npm test -- tests/fastify-middleware.test.js
```
Expected: Some tests may fail

**Step 4: Commit**

```bash
git add src/fastify-middleware.js
git commit -m "feat(fastify): add minKeyLength option to middleware

- Support configurable minKeyLength in middleware options
- Pass minKeyLength to validateIdempotencyKey"
```

---

## Task 8: Update Fastify Middleware Tests

**Files:**
- Modify: `tests/fastify-middleware.test.js`

**Step 1: Find and update tests using short idempotency keys**

```bash
grep -n "Idempotency-Key.*:.*['\"]" tests/fastify-middleware.test.js | head -20
```

Update test keys to be 16+ characters.

**Step 2: Run Fastify middleware tests**

```bash
npm test -- tests/fastify-middleware.test.js
```
Expected: ALL PASS

**Step 3: Commit**

```bash
git add tests/fastify-middleware.test.js
git commit -m "test(fastify): update tests for 16-character minKeyLength

- Update all test idempotency keys to be 16+ characters"
```

---

## Task 9: Verify Full Test Coverage

**Files:**
- All test files

**Step 1: Run full test suite**

```bash
npm test
```
Expected: ALL PASS

**Step 2: Verify 100% code coverage**

```bash
npm run test:verify-coverage
```
Expected: PASS with 100% coverage

**Step 3: Check detailed coverage if needed**

```bash
npm run test:coverage
```

**Step 4: Commit (if any final fixes needed)**

```bash
git add -A
git commit -m "test: ensure 100% coverage for minKeyLength feature"
```

---

## Task 10: Update JSDoc Documentation

**Files:**
- Modify: `src/validation.js:21-34`
- Modify: `src/hono-middleware.js`
- Modify: `src/express-middleware.js`
- Modify: `src/fastify-middleware.js`

**Step 1: Update JSDoc for validateIdempotencyKey**

```javascript
/**
 * @param {string} key
 * @param {Object} options
 * @param {number} [options.minKeyLength=16] - Minimum allowed key length (default: 16)
 * @param {number} [options.maxKeyLength=255] - Maximum allowed key length (default: 255)
 * @returns {{valid: boolean, error?: string}}
 */
export function validateIdempotencyKey(key, options = {}) {
```

**Step 2: Update JSDoc for middleware factory functions**

Add to all three middleware files:
```javascript
/**
 * @param {Object} opts - Middleware options
 * @param {IdempotencyStore} opts.store - Storage backend
 * @param {string} [opts.headerName="Idempotency-Key"] - Header name
 * @param {number} [opts.maxKeyLength=255] - Maximum key length
 * @param {number} [opts.minKeyLength=16] - Minimum key length (default: 16 for entropy)
 * ...
 */
```

**Step 3: Commit**

```bash
git add src/
git commit -m "docs(jsdoc): document minKeyLength option

- Add JSDoc for options parameter in validateIdempotencyKey
- Document minKeyLength in all middleware factory functions"
```

---

## Task 11: Update README Documentation

**Files:**
- Modify: `README.md`

**Step 1: Add key length section after "Response Headers"**

Add a new section:

```markdown
## Key Length Requirements

By default, idempotency keys must be between **16 and 255 characters**. This provides sufficient entropy (~95 bits with base64) to prevent key exhaustion and collision attacks.

### Why 16 characters?

- Matches industry standards (NanoID default)
- Provides ~95 bits of entropy
- Accommodates all major ID generators: UUID (36), ULID (26), CUID (25), KSUID (27)
- Prevents exhaustion with just 62 possible values (1 char = only a-z, A-Z, 0-9)

### Customizing Key Length

If you need shorter keys (not recommended for production):

\`\`\`javascript
idempotency({
  store,
  minKeyLength: 8,  // Reduce minimum (1-255 allowed)
  maxKeyLength: 128 // Reduce maximum if needed
})
\`\`\`

**Note:** The IETF draft spec recommends 1-255 characters. We default to 16+ for security.
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): document key length requirements

- Explain 16-character default minimum
- Document why this provides sufficient entropy
- Add example for customizing minKeyLength"
```

---

## Task 12: Final Verification

**Step 1: Build the project**

```bash
npm run build
```
Expected: No errors, TypeScript definitions generated from JSDoc

**Step 2: Run full test suite one more time**

```bash
npm test
```
Expected: ALL PASS

**Step 3: Verify 100% coverage**

```bash
npm run test:verify-coverage
```
Expected: PASS

**Step 4: Summary commit**

```bash
git log --oneline -15
```

Verify clean commit history with logical progression.

---

## Implementation Complete

All tasks completed. The `minKeyLength` option is now:
- Configurable in all three middlewares (Hono, Express, Fastify)
- Defaults to 16 characters for security
- Fully tested with 100% coverage
