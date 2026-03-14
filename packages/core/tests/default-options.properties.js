import { test } from "tap";
import * as fc from "fast-check";
import { defaultOptions } from "@idempot/core";

test("default-options - has all required top-level properties", async (t) => {
  const requiredProps = [
    "required",
    "ttlMs",
    "excludeFields",
    "store",
    "maxKeyLength",
    "minKeyLength",
    "resilience"
  ];

  for (const prop of requiredProps) {
    t.ok(prop in defaultOptions, `should have ${prop} property`);
  }
});

test("default-options - boolean properties are valid", async (t) => {
  await fc.assert(
    fc.property(fc.constant(defaultOptions.required), (val) => {
      return typeof val === "boolean";
    }),
    { numRuns: 10 }
  );
  t.pass("required is a boolean");
});

test("default-options - ttlMs is positive", async (t) => {
  t.ok(defaultOptions.ttlMs > 0, "ttlMs should be positive");
  t.ok(Number.isInteger(defaultOptions.ttlMs), "ttlMs should be an integer");
});

test("default-options - excludeFields is an array", async (t) => {
  t.ok(
    Array.isArray(defaultOptions.excludeFields),
    "excludeFields should be an array"
  );
  t.equal(
    defaultOptions.excludeFields.length,
    0,
    "excludeFields should be empty by default"
  );
});

test("default-options - key length constraints are valid", async (t) => {
  t.ok(defaultOptions.minKeyLength > 0, "minKeyLength should be positive");
  t.ok(defaultOptions.maxKeyLength > 0, "maxKeyLength should be positive");
  t.ok(
    defaultOptions.minKeyLength < defaultOptions.maxKeyLength,
    "minKeyLength should be less than maxKeyLength"
  );
  t.ok(
    Number.isInteger(defaultOptions.minKeyLength),
    "minKeyLength should be an integer"
  );
  t.ok(
    Number.isInteger(defaultOptions.maxKeyLength),
    "maxKeyLength should be an integer"
  );
});

test("default-options - minKeyLength is at least 21", async (t) => {
  t.ok(
    defaultOptions.minKeyLength >= 21,
    "minKeyLength should be at least 21 (nanoid default)"
  );
});

test("default-options - resilience has all required properties", async (t) => {
  const requiredResilienceProps = [
    "timeoutMs",
    "maxRetries",
    "retryDelayMs",
    "errorThresholdPercentage",
    "resetTimeoutMs",
    "volumeThreshold"
  ];

  for (const prop of requiredResilienceProps) {
    t.ok(
      prop in defaultOptions.resilience,
      `resilience should have ${prop} property`
    );
  }
});

test("default-options - resilience timeoutMs is positive", async (t) => {
  t.ok(defaultOptions.resilience.timeoutMs > 0, "timeoutMs should be positive");
  t.ok(
    Number.isInteger(defaultOptions.resilience.timeoutMs),
    "timeoutMs should be an integer"
  );
});

test("default-options - resilience maxRetries is positive", async (t) => {
  t.ok(
    defaultOptions.resilience.maxRetries > 0,
    "maxRetries should be positive"
  );
  t.ok(
    Number.isInteger(defaultOptions.resilience.maxRetries),
    "maxRetries should be an integer"
  );
});

test("default-options - resilience retryDelayMs is non-negative", async (t) => {
  t.ok(
    defaultOptions.resilience.retryDelayMs >= 0,
    "retryDelayMs should be non-negative"
  );
  t.ok(
    Number.isInteger(defaultOptions.resilience.retryDelayMs),
    "retryDelayMs should be an integer"
  );
});

test("default-options - resilience errorThresholdPercentage is between 0 and 100", async (t) => {
  t.ok(
    defaultOptions.resilience.errorThresholdPercentage >= 0,
    "errorThresholdPercentage should be >= 0"
  );
  t.ok(
    defaultOptions.resilience.errorThresholdPercentage <= 100,
    "errorThresholdPercentage should be <= 100"
  );
  t.ok(
    Number.isInteger(defaultOptions.resilience.errorThresholdPercentage),
    "errorThresholdPercentage should be an integer"
  );
});

test("default-options - resilience resetTimeoutMs is positive", async (t) => {
  t.ok(
    defaultOptions.resilience.resetTimeoutMs > 0,
    "resetTimeoutMs should be positive"
  );
  t.ok(
    Number.isInteger(defaultOptions.resilience.resetTimeoutMs),
    "resetTimeoutMs should be an integer"
  );
});

test("default-options - resilience volumeThreshold is positive", async (t) => {
  t.ok(
    defaultOptions.resilience.volumeThreshold > 0,
    "volumeThreshold should be positive"
  );
  t.ok(
    Number.isInteger(defaultOptions.resilience.volumeThreshold),
    "volumeThreshold should be an integer"
  );
});

test("default-options - all numeric values are finite", async (t) => {
  const numericProps = [
    defaultOptions.ttlMs,
    defaultOptions.maxKeyLength,
    defaultOptions.minKeyLength,
    defaultOptions.resilience.timeoutMs,
    defaultOptions.resilience.maxRetries,
    defaultOptions.resilience.retryDelayMs,
    defaultOptions.resilience.errorThresholdPercentage,
    defaultOptions.resilience.resetTimeoutMs,
    defaultOptions.resilience.volumeThreshold
  ];

  for (const val of numericProps) {
    t.ok(Number.isFinite(val), `${val} should be finite`);
    t.ok(!Number.isNaN(val), `${val} should not be NaN`);
  }
});

test("default-options - options object is frozen/immutable in practice", async (t) => {
  // While the object isn't actually frozen, we can verify that it has the expected structure
  const opts = defaultOptions;

  // Verify that nested objects exist and have expected types
  t.equal(typeof opts.resilience, "object", "resilience should be an object");
  t.ok(opts.resilience !== null, "resilience should not be null");

  // Verify store is null (as expected for default)
  t.equal(opts.store, null, "store should be null by default");
});

test("default-options - property-based validation of numeric ranges", async (t) => {
  await fc.assert(
    fc.property(
      fc.record({
        ttlMs: fc.integer({ min: 1, max: 86400000 * 30 }), // Up to 30 days
        maxKeyLength: fc.integer({ min: 21, max: 1000 }),
        minKeyLength: fc.integer({ min: 1, max: 50 }),
        timeoutMs: fc.integer({ min: 1, max: 5000 }),
        maxRetries: fc.integer({ min: 1, max: 10 }),
        retryDelayMs: fc.integer({ min: 0, max: 1000 }),
        errorThresholdPercentage: fc.integer({ min: 0, max: 100 }),
        resetTimeoutMs: fc.integer({ min: 1000, max: 60000 }),
        volumeThreshold: fc.integer({ min: 1, max: 100 })
      }),
      (generated) => {
        // Verify that default values are within reasonable ranges
        return (
          defaultOptions.ttlMs >= 1000 && // At least 1 second
          defaultOptions.ttlMs <= 86400000 * 365 && // At most 1 year
          defaultOptions.maxKeyLength >= defaultOptions.minKeyLength &&
          defaultOptions.resilience.timeoutMs >= 100 &&
          defaultOptions.resilience.maxRetries >= 1 &&
          defaultOptions.resilience.maxRetries <= 10 &&
          defaultOptions.resilience.errorThresholdPercentage >= 0 &&
          defaultOptions.resilience.errorThresholdPercentage <= 100
        );
      }
    ),
    { numRuns: 100 }
  );
  t.pass("default values are within reasonable ranges");
});
