# Property-Based Testing Design

## Overview

Add property-based testing (PBT) using fast-check to the `@idempot/core` package to discover edge cases and verify invariants that unit tests may miss.

## Goals

1. Find edge cases in fingerprint generation and validation logic
2. Verify invariants hold under random input
3. Complement existing unit tests with broader coverage

## Architecture

### File Structure

```
packages/core/tests/
├── fingerprint.test.js      # Existing unit tests
├── validation.test.js       # Existing unit tests
├── fingerprint.properties.js # NEW: Property-based tests
└── validation.properties.js  # NEW: Property-based tests
```

### Dependencies

Add `fast-check` as a dev dependency to `@idempot/core`:

```bash
npm install --save-dev fast-check
```

### Test Runner Integration

Property tests run alongside existing tests via the project's test runner (tap). No special configuration required.

## Fingerprint Invariants

### 1. Determinism (Idempotence)

**Property:** Same input always produces same output.

```javascript
fc.assert(
  fc.property(fc.json(), (json) => {
    const body1 = JSON.stringify(json);
    const body2 = JSON.stringify(json);
    return generateFingerprint(body1) === generateFingerprint(body2);
  })
);
```

### 2. Order Independence

**Property:** Object key ordering does not affect fingerprint.

```javascript
fc.assert(
  fc.property(fcJsonObject(), (obj) => {
    const body1 = JSON.stringify(obj);
    const body2 = JSON.stringify(Object.fromEntries(
      Object.entries(obj).sort(([a], [b]) => b.localeCompare(a))
    ));
    return generateFingerprint(body1) === generateFingerprint(body2);
  })
);
```

### 3. Exclusion Invariance

**Property:** Two objects that differ only in excluded fields should produce the same fingerprint.

```javascript
fc.assert(
  fc.property(fc.json(), fc.string(), (obj, excludedValue) => {
    const key = "excludedField";
    const obj1 = { ...obj, [key]: excludedValue };
    const obj2 = { ...obj, [key]: "different-value-" + Math.random() };
    
    const body1 = JSON.stringify(obj1);
    const body2 = JSON.stringify(obj2);
    return generateFingerprint(body1, [key]) === generateFingerprint(body2, [key]);
  })
);
```

### 4. Empty and Null Handling

**Property:** Empty string and valid JSON produce different fingerprints; null and empty object produce different fingerprints.

```javascript
fc.assert(
  fc.property(fcJson(), (json) => {
    const emptyString = "";
    const emptyJson = JSON.stringify(json);
    return generateFingerprint(emptyString) !== generateFingerprint(emptyJson);
  })
);
```

## Validation Invariants

### 1. Key Length Boundaries

**Property:** Keys shorter than min are rejected; keys at or above min and below max are accepted.

```javascript
fc.assert(
  fc.property(fc.bigInt({ min: 1n, max: 1000n }), (len) => {
    const key = "x".repeat(Number(len));
    const min = 21, max = 255;
    const result = validateIdempotencyKey(key, { minKeyLength: min, maxKeyLength: max });
    return (len >= min && len <= max) ? result.valid : !result.valid;
  })
);
```

### 2. Comma Rejection

**Property:** Any key containing a comma is rejected.

```javascript
fc.assert(
  fc.property(fc.string({ minLength: 21, maxLength: 50 }), fc.integer(0, 50), (base, pos) => {
    const key = base.slice(0, pos) + "," + base.slice(pos);
    return !validateIdempotencyKey(key).valid;
  })
);
```

### 3. Exclude Fields Validation

**Property:** Valid exclude field arrays never throw.

```javascript
fc.assert(
  fc.property(fc.array(fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)), { maxLength: 20 }), (fields) => {
    return doesNotThrow(() => validateExcludeFields(fields));
  })
);
```

### 4. Exclude Fields Edge Cases

**Property:** The function accepts null, undefined, and strings; throws for non-string primitives.

```javascript
fc.assert(
  fc.property(fc.array(fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)), { maxLength: 20 }), (fields) => {
    try {
      validateExcludeFields(fields);
      return true;
    } catch (e) {
      return false;
    }
  })
);
```

Note: The implementation only rejects `$.` as invalid. It does NOT validate JSONPath syntax correctness (e.g., `$.nonexistent` is accepted even if the path doesn't exist in the data).

## Implementation Notes

### Async Handling

Fingerprint generation is async. Wrap fast-check assertions in async test functions:

```javascript
test("fingerprint - determinism", async (t) => {
  await fc.assert(
    fc.property(fc.json(), async (json) => {
      const body = JSON.stringify(json);
      const fp1 = await generateFingerprint(body);
      const fp2 = await generateFingerprint(body);
      return fp1 === fp2;
    }), { numRuns: 1000 }
  );
});
```

### Number of Runs

Default 100 runs is often sufficient for finding bugs. Increase for harder-to-find edge cases:

```javascript
fc.assert(property, { numRuns: 1000 });
```

### Async Integration

**Verify before implementing:** The combination of tap + async + fast-check needs testing. The pattern `await fc.assert()` should work, but verify during implementation. If issues arise, consider:

1. Using `fc.assertAsync()` instead
2. Running property tests in a separate `describe` block
3. Skipping async tests in CI if needed

### CI Toggling

If property tests become slow or flaky, add a skip mechanism:

```javascript
const RUN_PROPERTY_TESTS = process.env.RUN_PROPERTY_TESTS === "1";

test("determinism", { skip: !RUN_PROPERTY_TESTS }, async (t) => {
  // ...
});
```

## Testing

Run property tests:

```bash
npm test
```

Run coverage verification:

```bash
npm run test:verify-coverage
```

Property tests count toward coverage.

## Success Criteria

1. All property tests pass
2. No regressions in existing unit tests
3. 100% code coverage maintained
4. Property tests integrate cleanly with tap runner
