# Property-Based Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add fast-check property-based tests to the `@idempot/core` package to verify invariants.

**Architecture:** Create two separate property test files alongside existing unit tests, using fast-check to generate random inputs and verify deterministic behavior.

**Tech Stack:** Node.js, tap, fast-check, @idempot/core

---

## Task 1: Create Fingerprint Property Tests

**Files:**
- Create: `packages/core/tests/fingerprint.properties.js`

**Step 1: Write tests for determinism**

```javascript
import { test } from "tap";
import * as fc from "fast-check";
import { generateFingerprint } from "@idempot/core";

test("fingerprint - determinism (same input produces same output)", async (t) => {
  await fc.assert(
    fc.property(fc.json(), async (json) => {
      const body = JSON.stringify(json);
      const fp1 = await generateFingerprint(body);
      const fp2 = await generateFingerprint(body);
      return fp1 === fp2;
    }),
    { numRuns: 100 }
  );
});
```

**Step 2: Write tests for order independence**

```javascript
test("fingerprint - order independence (object key order doesn't matter)", async (t) => {
  await fc.assert(
    fc.property(fc.object(), async (obj) => {
      const body1 = JSON.stringify(obj);
      const body2 = JSON.stringify(
        Object.fromEntries(
          Object.entries(obj).sort(([a], [b]) => b.localeCompare(a))
        )
      );
      const fp1 = await generateFingerprint(body1);
      const fp2 = await generateFingerprint(body2);
      return fp1 === fp2;
    }),
    { numRuns: 100 }
  );
});
```

**Step 3: Write tests for exclusion invariance**

```javascript
test("fingerprint - exclusion invariance (excluded fields don't affect fingerprint)", async (t) => {
  await fc.assert(
    fc.property(fc.object(), fc.string(), async (obj, excludedValue) => {
      const key = "excludedField";
      const obj1 = { ...obj, [key]: excludedValue };
      const obj2 = { ...obj, [key]: excludedValue + "_different" };

      const body1 = JSON.stringify(obj1);
      const body2 = JSON.stringify(obj2);
      const fp1 = await generateFingerprint(body1, [key]);
      const fp2 = await generateFingerprint(body2, [key]);
      return fp1 === fp2;
    }),
    { numRuns: 100 }
  );
});
```

**Step 4: Write tests for empty vs JSON distinction**

```javascript
test("fingerprint - empty string differs from JSON", async (t) => {
  await fc.assert(
    fc.property(fc.json(), async (json) => {
      const emptyFp = await generateFingerprint("");
      const jsonFp = await generateFingerprint(JSON.stringify(json));
      return emptyFp !== jsonFp;
    }),
    { numRuns: 50 }
  );
});
```

**Step 5: Run tests to verify they pass**

Run: `npm test packages/core/tests/fingerprint.properties.js`

**Step 6: Commit**

```bash
git add packages/core/tests/fingerprint.properties.js
git commit -m "test(core): add property-based tests for fingerprint generation"
```

---

## Task 2: Create Validation Property Tests

**Files:**
- Create: `packages/core/tests/validation.properties.js`

**Step 1: Write tests for key length boundaries**

```javascript
import { test } from "tap";
import * as fc from "fast-check";
import { validateIdempotencyKey } from "@idempot/core";

test("validation - key length boundaries", async (t) => {
  await fc.assert(
    fc.property(fc.integer({ min: 1, max: 300 }), (len) => {
      const key = "x".repeat(len);
      const result = validateIdempotencyKey(key, {
        minKeyLength: 21,
        maxKeyLength: 255
      });
      const shouldBeValid = len >= 21 && len <= 255 && !key.includes(",");
      return result.valid === shouldBeValid;
    }),
    { numRuns: 200 }
  );
});
```

**Step 2: Write tests for comma rejection**

```javascript
test("validation - comma rejection", async (t) => {
  await fc.assert(
    fc.property(
      fc.string({ minLength: 21, maxLength: 50 }),
      fc.integer({ min: 0, max: 49 }),
      (base, pos) => {
        const key = base.slice(0, pos) + "," + base.slice(pos);
        const result = validateIdempotencyKey(key);
        return !result.valid;
      }
    ),
    { numRuns: 100 }
  );
});
```

**Step 3: Write tests for exclude fields edge cases**

```javascript
import { validateExcludeFields } from "@idempot/core";

test("validation - exclude fields accepts strings/null/undefined", async (t) => {
  await fc.assert(
    fc.property(
      fc.array(
        fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)),
        { maxLength: 20 }
      ),
      (fields) => {
        try {
          validateExcludeFields(fields);
          return true;
        } catch {
          return false;
        }
      }
    ),
    { numRuns: 100 }
  );
});
```

**Step 4: Write tests for exclude fields type rejection**

```javascript
test("validation - exclude fields rejects non-string primitives", async (t) => {
  await fc.assert(
    fc.property(
      fc.array(fc.oneof(fc.integer(), fc.boolean(), fc.constant({}), fc.constant([])), {
        minLength: 1,
        maxLength: 5
      }),
      (fields) => {
        try {
          validateExcludeFields(fields);
          return false;
        } catch {
          return true;
        }
      }
    ),
    { numRuns: 100 }
  );
});
```

**Step 5: Run tests to verify they pass**

Run: `npm test packages/core/tests/validation.properties.js`

**Step 6: Commit**

```bash
git add packages/core/tests/validation.properties.js
git commit -m "test(core): add property-based tests for validation functions"
```

---

## Task 3: Verify Coverage

**Step 1: Run full test suite with coverage**

Run: `npm run test:verify-coverage`

**Step 2: Verify 100% coverage maintained**

Expected: All tests pass with 100% coverage

**Step 3: Commit if coverage maintained**

```bash
git commit --allow-empty -m "test(core): verify property tests maintain 100% coverage"
```
