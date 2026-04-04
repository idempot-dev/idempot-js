import { test } from "tap";
import * as fc from "fast-check";
import { validateIdempotencyOptions } from "@idempot/core";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Helper to create a valid mock store
const createMockStore = () => ({
  lookup: async () => ({ byKey: null, byFingerprint: null }),
  startProcessing: async () => {},
  complete: async () => {},
  close: async () => {}
});

// Arbitrary for valid options (using fc.oneof with undefined, not fc.option which includes null)
const validOptionsArbitrary = () =>
  fc.record(
    {
      required: fc.oneof(fc.constant(undefined), fc.boolean()),
      ttlMs: fc.oneof(
        fc.constant(undefined),
        fc.integer({ min: 1, max: ONE_YEAR_MS })
      ),
      excludeFields: fc.oneof(fc.constant(undefined), fc.array(fc.string())),
      store: fc.oneof(fc.constant(undefined), fc.constant(createMockStore())),
      minKeyLength: fc.oneof(
        fc.constant(undefined),
        fc.integer({ min: 21, max: 255 })
      ),
      maxKeyLength: fc.oneof(
        fc.constant(undefined),
        fc.integer({ min: 21, max: 255 })
      ),
      resilience: fc.oneof(
        fc.constant(undefined),
        fc.record({
          timeoutMs: fc.oneof(fc.constant(undefined), fc.integer({ min: 1 })),
          maxRetries: fc.oneof(fc.constant(undefined), fc.integer({ min: 0 })),
          retryDelayMs: fc.oneof(
            fc.constant(undefined),
            fc.integer({ min: 0 })
          ),
          errorThresholdPercentage: fc.oneof(
            fc.constant(undefined),
            fc.integer({ min: 0, max: 100 })
          ),
          resetTimeoutMs: fc.oneof(
            fc.constant(undefined),
            fc.integer({ min: 1 })
          ),
          volumeThreshold: fc.oneof(
            fc.constant(undefined),
            fc.integer({ min: 1 })
          )
        })
      )
    },
    { withDeletedKeys: true }
  );

// Test: Valid options never throw
test("validateIdempotencyOptions - valid options never throw", async (t) => {
  await fc.assert(
    fc.property(validOptionsArbitrary(), (options) => {
      // Filter out cases where maxKeyLength < minKeyLength
      if (
        options.minKeyLength !== undefined &&
        options.maxKeyLength !== undefined &&
        options.maxKeyLength < options.minKeyLength
      ) {
        return true;
      }

      try {
        validateIdempotencyOptions(options);
        return true;
      } catch {
        return false;
      }
    }),
    { numRuns: 1000 }
  );
  t.pass("valid options never throw");
});

// Test: Null for any option throws
test("validateIdempotencyOptions - null for required throws", async (t) => {
  await fc.assert(
    fc.property(fc.anything(), () => {
      try {
        validateIdempotencyOptions({ required: null });
        return false;
      } catch (_err) {
        return _err.message === "required cannot be null";
      }
    }),
    { numRuns: 100 }
  );
  t.pass("null for required throws correctly");
});

test("validateIdempotencyOptions - null for ttlMs throws", async (t) => {
  await fc.assert(
    fc.property(fc.anything(), () => {
      try {
        validateIdempotencyOptions({ ttlMs: null });
        return false;
      } catch (_err) {
        return _err.message === "ttlMs cannot be null";
      }
    }),
    { numRuns: 100 }
  );
  t.pass("null for ttlMs throws correctly");
});

test("validateIdempotencyOptions - null for excludeFields throws", async (t) => {
  await fc.assert(
    fc.property(fc.anything(), () => {
      try {
        validateIdempotencyOptions({ excludeFields: null });
        return false;
      } catch (_err) {
        return _err.message === "excludeFields cannot be null";
      }
    }),
    { numRuns: 100 }
  );
  t.pass("null for excludeFields throws correctly");
});

test("validateIdempotencyOptions - null for store throws", async (t) => {
  await fc.assert(
    fc.property(fc.anything(), () => {
      try {
        validateIdempotencyOptions({ store: null });
        return false;
      } catch (_err) {
        return _err.message === "store cannot be null";
      }
    }),
    { numRuns: 100 }
  );
  t.pass("null for store throws correctly");
});

test("validateIdempotencyOptions - null for minKeyLength throws", async (t) => {
  await fc.assert(
    fc.property(fc.anything(), () => {
      try {
        validateIdempotencyOptions({ minKeyLength: null });
        return false;
      } catch (_err) {
        return _err.message === "minKeyLength cannot be null";
      }
    }),
    { numRuns: 100 }
  );
  t.pass("null for minKeyLength throws correctly");
});

test("validateIdempotencyOptions - null for maxKeyLength throws", async (t) => {
  await fc.assert(
    fc.property(fc.anything(), () => {
      try {
        validateIdempotencyOptions({ maxKeyLength: null });
        return false;
      } catch (_err) {
        return _err.message === "maxKeyLength cannot be null";
      }
    }),
    { numRuns: 100 }
  );
  t.pass("null for maxKeyLength throws correctly");
});

test("validateIdempotencyOptions - null for resilience throws", async (t) => {
  await fc.assert(
    fc.property(fc.anything(), () => {
      try {
        validateIdempotencyOptions({ resilience: null });
        return false;
      } catch (_err) {
        return _err.message === "resilience cannot be null";
      }
    }),
    { numRuns: 100 }
  );
  t.pass("null for resilience throws correctly");
});

test("validateIdempotencyOptions - null for resilience.timeoutMs throws", async (t) => {
  await fc.assert(
    fc.property(fc.anything(), () => {
      try {
        validateIdempotencyOptions({
          resilience: { timeoutMs: null }
        });
        return false;
      } catch (_err) {
        return _err.message === "resilience.timeoutMs cannot be null";
      }
    }),
    { numRuns: 100 }
  );
  t.pass("null for resilience.timeoutMs throws correctly");
});

test("validateIdempotencyOptions - null for resilience.maxRetries throws", async (t) => {
  await fc.assert(
    fc.property(fc.anything(), () => {
      try {
        validateIdempotencyOptions({
          resilience: { maxRetries: null }
        });
        return false;
      } catch (_err) {
        return _err.message === "resilience.maxRetries cannot be null";
      }
    }),
    { numRuns: 100 }
  );
  t.pass("null for resilience.maxRetries throws correctly");
});

test("validateIdempotencyOptions - null for resilience.retryDelayMs throws", async (t) => {
  await fc.assert(
    fc.property(fc.anything(), () => {
      try {
        validateIdempotencyOptions({
          resilience: { retryDelayMs: null }
        });
        return false;
      } catch (_err) {
        return _err.message === "resilience.retryDelayMs cannot be null";
      }
    }),
    { numRuns: 100 }
  );
  t.pass("null for resilience.retryDelayMs throws correctly");
});

test("validateIdempotencyOptions - null for resilience.errorThresholdPercentage throws", async (t) => {
  await fc.assert(
    fc.property(fc.anything(), () => {
      try {
        validateIdempotencyOptions({
          resilience: { errorThresholdPercentage: null }
        });
        return false;
      } catch (_err) {
        return (
          _err.message === "resilience.errorThresholdPercentage cannot be null"
        );
      }
    }),
    { numRuns: 100 }
  );
  t.pass("null for resilience.errorThresholdPercentage throws correctly");
});

test("validateIdempotencyOptions - null for resilience.resetTimeoutMs throws", async (t) => {
  await fc.assert(
    fc.property(fc.anything(), () => {
      try {
        validateIdempotencyOptions({
          resilience: { resetTimeoutMs: null }
        });
        return false;
      } catch (_err) {
        return _err.message === "resilience.resetTimeoutMs cannot be null";
      }
    }),
    { numRuns: 100 }
  );
  t.pass("null for resilience.resetTimeoutMs throws correctly");
});

test("validateIdempotencyOptions - null for resilience.volumeThreshold throws", async (t) => {
  await fc.assert(
    fc.property(fc.anything(), () => {
      try {
        validateIdempotencyOptions({
          resilience: { volumeThreshold: null }
        });
        return false;
      } catch (_err) {
        return _err.message === "resilience.volumeThreshold cannot be null";
      }
    }),
    { numRuns: 100 }
  );
  t.pass("null for resilience.volumeThreshold throws correctly");
});

// Test: Unknown options throw
test("validateIdempotencyOptions - unknown options throw", async (t) => {
  await fc.assert(
    fc.property(
      fc
        .string({ minLength: 1 })
        .filter(
          (s) =>
            ![
              "required",
              "ttlMs",
              "excludeFields",
              "store",
              "minKeyLength",
              "maxKeyLength",
              "resilience"
            ].includes(s)
        ),
      fc.anything(),
      (key, value) => {
        try {
          validateIdempotencyOptions({ [key]: value });
          return false;
        } catch (_err) {
          return _err.message === `Unknown option: ${key}`;
        }
      }
    ),
    { numRuns: 100 }
  );
  t.pass("unknown options throw correctly");
});

// Test: Boundary values for numeric options
test("validateIdempotencyOptions - ttlMs boundary values", async (t) => {
  await fc.assert(
    fc.property(fc.integer(), (value) => {
      try {
        validateIdempotencyOptions({ ttlMs: value });
        // If no error, value must be in valid range
        return value >= 1 && value <= ONE_YEAR_MS;
      } catch {
        // Error expected for invalid values
        return (
          value <= 0 ||
          value > ONE_YEAR_MS ||
          !Number.isInteger(value) ||
          !Number.isSafeInteger(value)
        );
      }
    }),
    { numRuns: 1000 }
  );
  t.pass("ttlMs boundary values validated");
});

test("validateIdempotencyOptions - minKeyLength boundary values", async (t) => {
  await fc.assert(
    fc.property(fc.integer(), (value) => {
      try {
        validateIdempotencyOptions({ minKeyLength: value });
        // If no error, value must be in valid range
        return value >= 21 && value <= 255;
      } catch {
        // Error expected for invalid values
        return (
          value < 21 ||
          value > 255 ||
          !Number.isInteger(value) ||
          !Number.isSafeInteger(value)
        );
      }
    }),
    { numRuns: 1000 }
  );
  t.pass("minKeyLength boundary values validated");
});

test("validateIdempotencyOptions - maxKeyLength boundary values", async (t) => {
  await fc.assert(
    fc.property(fc.integer(), (value) => {
      try {
        validateIdempotencyOptions({ maxKeyLength: value });
        // If no error, value must be <= 255
        return value <= 255;
      } catch {
        // Error expected for invalid values
        return (
          value > 255 ||
          !Number.isInteger(value) ||
          !Number.isSafeInteger(value)
        );
      }
    }),
    { numRuns: 1000 }
  );
  t.pass("maxKeyLength boundary values validated");
});

// Test: Cross-field constraint - maxKeyLength >= minKeyLength
test("validateIdempotencyOptions - maxKeyLength must be >= minKeyLength", async (t) => {
  await fc.assert(
    fc.property(
      fc.integer({ min: 21, max: 255 }),
      fc.integer({ min: 21, max: 255 }),
      (min, max) => {
        try {
          validateIdempotencyOptions({
            minKeyLength: min,
            maxKeyLength: max
          });
          // If no error, max must be >= min
          return max >= min;
        } catch {
          // Error expected when max < min
          return max < min;
        }
      }
    ),
    { numRuns: 1000 }
  );
  t.pass("maxKeyLength >= minKeyLength constraint validated");
});

// Test: Wrong types throw
test("validateIdempotencyOptions - required must be boolean", async (t) => {
  await fc.assert(
    fc.property(
      fc.oneof(fc.string(), fc.integer(), fc.object(), fc.array(fc.anything())),
      (value) => {
        try {
          validateIdempotencyOptions({ required: value });
          return false;
        } catch (_err) {
          return _err.message === "required must be a boolean";
        }
      }
    ),
    { numRuns: 100 }
  );
  t.pass("required type validation works");
});

test("validateIdempotencyOptions - ttlMs must be a number", async (t) => {
  await fc.assert(
    fc.property(
      fc.oneof(fc.string(), fc.boolean(), fc.object(), fc.array(fc.anything())),
      (value) => {
        try {
          validateIdempotencyOptions({ ttlMs: value });
          return false;
        } catch (_err) {
          return _err.message === "ttlMs must be a number";
        }
      }
    ),
    { numRuns: 100 }
  );
  t.pass("ttlMs type validation works");
});

test("validateIdempotencyOptions - store must be an object", async (t) => {
  await fc.assert(
    fc.property(fc.oneof(fc.string(), fc.integer(), fc.boolean()), (value) => {
      try {
        validateIdempotencyOptions({ store: value });
        return false;
      } catch (_err) {
        return _err.message === "store must be an object";
      }
    }),
    { numRuns: 100 }
  );
  t.pass("store type validation works");
});

test("validateIdempotencyOptions - store must not be an array", async (t) => {
  await fc.assert(
    fc.property(fc.array(fc.anything()), (value) => {
      try {
        validateIdempotencyOptions({ store: value });
        return false;
      } catch (_err) {
        return _err.message === "store must be an object";
      }
    }),
    { numRuns: 100 }
  );
  t.pass("store array validation works");
});

test("validateIdempotencyOptions - store must have required methods", async (t) => {
  await fc.assert(
    fc.property(
      fc.record({
        lookup: fc.option(fc.constant("not a function")),
        startProcessing: fc.option(fc.constant("not a function")),
        complete: fc.option(fc.constant("not a function"))
      }),
      (partialStore) => {
        const store = {};
        if (partialStore.lookup !== null) store.lookup = partialStore.lookup;
        if (partialStore.startProcessing !== null)
          store.startProcessing = partialStore.startProcessing;
        if (partialStore.complete !== null)
          store.complete = partialStore.complete;

        try {
          validateIdempotencyOptions({ store });
          // Should only pass if all methods are functions
          return (
            typeof store.lookup === "function" &&
            typeof store.startProcessing === "function" &&
            typeof store.complete === "function"
          );
        } catch (_err) {
          return (
            _err.message.includes("store must have a") &&
            _err.message.includes("method")
          );
        }
      }
    ),
    { numRuns: 100 }
  );
  t.pass("store method validation works");
});

test("validateIdempotencyOptions - resilience must be an object", async (t) => {
  await fc.assert(
    fc.property(fc.oneof(fc.string(), fc.integer(), fc.boolean()), (value) => {
      try {
        validateIdempotencyOptions({ resilience: value });
        return false;
      } catch (_err) {
        return _err.message === "resilience must be an object";
      }
    }),
    { numRuns: 100 }
  );
  t.pass("resilience type validation works");
});

test("validateIdempotencyOptions - resilience must not be an array", async (t) => {
  await fc.assert(
    fc.property(fc.array(fc.anything()), (value) => {
      try {
        validateIdempotencyOptions({ resilience: value });
        return false;
      } catch (_err) {
        return _err.message === "resilience must be an object";
      }
    }),
    { numRuns: 100 }
  );
  t.pass("resilience array validation works");
});

// Test: Resilience boundary values
test("validateIdempotencyOptions - resilience.timeoutMs must be positive", async (t) => {
  await fc.assert(
    fc.property(fc.integer(), (value) => {
      try {
        validateIdempotencyOptions({
          resilience: { timeoutMs: value }
        });
        return value > 0;
      } catch {
        return (
          value <= 0 || !Number.isInteger(value) || !Number.isSafeInteger(value)
        );
      }
    }),
    { numRuns: 1000 }
  );
  t.pass("resilience.timeoutMs must be positive");
});

test("validateIdempotencyOptions - resilience.maxRetries must be non-negative", async (t) => {
  await fc.assert(
    fc.property(fc.integer(), (value) => {
      try {
        validateIdempotencyOptions({
          resilience: { maxRetries: value }
        });
        return value >= 0;
      } catch {
        return (
          value < 0 || !Number.isInteger(value) || !Number.isSafeInteger(value)
        );
      }
    }),
    { numRuns: 1000 }
  );
  t.pass("resilience.maxRetries must be non-negative");
});

test("validateIdempotencyOptions - resilience.retryDelayMs must be non-negative", async (t) => {
  await fc.assert(
    fc.property(fc.integer(), (value) => {
      try {
        validateIdempotencyOptions({
          resilience: { retryDelayMs: value }
        });
        return value >= 0;
      } catch {
        return (
          value < 0 || !Number.isInteger(value) || !Number.isSafeInteger(value)
        );
      }
    }),
    { numRuns: 1000 }
  );
  t.pass("resilience.retryDelayMs must be non-negative");
});

test("validateIdempotencyOptions - resilience.errorThresholdPercentage must be 0-100", async (t) => {
  await fc.assert(
    fc.property(fc.integer(), (value) => {
      try {
        validateIdempotencyOptions({
          resilience: { errorThresholdPercentage: value }
        });
        return value >= 0 && value <= 100;
      } catch {
        return (
          value < 0 ||
          value > 100 ||
          !Number.isInteger(value) ||
          !Number.isSafeInteger(value)
        );
      }
    }),
    { numRuns: 1000 }
  );
  t.pass("resilience.errorThresholdPercentage must be 0-100");
});

test("validateIdempotencyOptions - resilience.resetTimeoutMs must be positive", async (t) => {
  await fc.assert(
    fc.property(fc.integer(), (value) => {
      try {
        validateIdempotencyOptions({
          resilience: { resetTimeoutMs: value }
        });
        return value > 0;
      } catch {
        return (
          value <= 0 || !Number.isInteger(value) || !Number.isSafeInteger(value)
        );
      }
    }),
    { numRuns: 1000 }
  );
  t.pass("resilience.resetTimeoutMs must be positive");
});

test("validateIdempotencyOptions - resilience.volumeThreshold must be positive", async (t) => {
  await fc.assert(
    fc.property(fc.integer(), (value) => {
      try {
        validateIdempotencyOptions({
          resilience: { volumeThreshold: value }
        });
        return value > 0;
      } catch {
        return (
          value <= 0 || !Number.isInteger(value) || !Number.isSafeInteger(value)
        );
      }
    }),
    { numRuns: 1000 }
  );
  t.pass("resilience.volumeThreshold must be positive");
});

// Test: Empty object and undefined are valid
test("validateIdempotencyOptions - empty object is valid", async (t) => {
  t.doesNotThrow(() => validateIdempotencyOptions({}));
  t.end();
});

test("validateIdempotencyOptions - undefined is valid", async (t) => {
  t.doesNotThrow(() => validateIdempotencyOptions(undefined));
  t.end();
});

test("validateIdempotencyOptions - no argument is valid", async (t) => {
  t.doesNotThrow(() => validateIdempotencyOptions());
  t.end();
});

// Test: Non-object options throws
test("validateIdempotencyOptions - null options throws", (t) => {
  t.throws(() => validateIdempotencyOptions(null), {
    message: "options cannot be null"
  });
  t.end();
});

test("validateIdempotencyOptions - non-object options throws", async (t) => {
  await fc.assert(
    fc.property(fc.oneof(fc.string(), fc.integer(), fc.boolean()), (value) => {
      try {
        validateIdempotencyOptions(value);
        return false;
      } catch (_err) {
        return _err.message === "options must be an object";
      }
    }),
    { numRuns: 100 }
  );
  t.pass("non-object options throws correctly");
});

test("validateIdempotencyOptions - array options throws", async (t) => {
  await fc.assert(
    fc.property(fc.array(fc.anything()), (value) => {
      try {
        validateIdempotencyOptions(value);
        return false;
      } catch (_err) {
        return _err.message === "options must be an object";
      }
    }),
    { numRuns: 100 }
  );
  t.pass("array options throws correctly");
});
