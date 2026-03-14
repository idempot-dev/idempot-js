import { test } from "tap";
import * as fc from "fast-check";
import { withResilience } from "@idempot/core";

/**
 * Create a mock store that succeeds on the Nth attempt
 */
const createFlakyStore = (successOnAttempt) => {
  let attempts = 0;
  return {
    lookup: async () => {
      attempts++;
      if (attempts < successOnAttempt) {
        throw new Error(`Failure on attempt ${attempts}`);
      }
      return { byKey: null, byFingerprint: null, attempts };
    },
    startProcessing: async () => {},
    complete: async () => {}
  };
};

/**
 * Create a store that always succeeds
 */
const createReliableStore = () => ({
  lookup: async () => ({ byKey: null, byFingerprint: null }),
  startProcessing: async () => {},
  complete: async () => {}
});

/**
 * Create a store that always fails
 */
const createFailingStore = () => ({
  lookup: async () => {
    throw new Error("Always fails");
  },
  startProcessing: async () => {},
  complete: async () => {}
});

test("resilience - never exceeds maxRetries", async (t) => {
  await fc.assert(
    fc.asyncProperty(fc.integer({ min: 1, max: 3 }), async (maxRetries) => {
      let attempts = 0;
      const store = {
        lookup: async () => {
          attempts++;
          throw new Error("Always fails");
        },
        startProcessing: async () => {},
        complete: async () => {}
      };

      const { store: wrapped } = withResilience(store, {
        maxRetries,
        retryDelayMs: 1
      });

      try {
        await wrapped.lookup("key", "fp");
      } catch {
        // Expected
      }

      return attempts <= maxRetries;
    }),
    { numRuns: 20 }
  );
  t.pass("retry count invariant holds");
});

test("resilience - success on first attempt does not retry", async (t) => {
  await fc.assert(
    fc.asyncProperty(fc.integer({ min: 1, max: 3 }), async (maxRetries) => {
      let attempts = 0;
      const store = {
        lookup: async () => {
          attempts++;
          return { byKey: null, byFingerprint: null };
        },
        startProcessing: async () => {},
        complete: async () => {}
      };

      const { store: wrapped } = withResilience(store, {
        maxRetries,
        retryDelayMs: 1
      });
      await wrapped.lookup("key", "fp");

      return attempts === 1;
    }),
    { numRuns: 20 }
  );
  t.pass("no retry on success invariant holds");
});

test("resilience - succeeds if failure count is less than maxRetries", async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 2, max: 4 }),
      fc.integer({ min: 1, max: 3 }),
      async (maxRetries, failCount) => {
        if (failCount >= maxRetries) return true;

        let attempts = 0;
        const store = {
          lookup: async () => {
            attempts++;
            if (attempts <= failCount) {
              throw new Error(`Failure ${attempts}`);
            }
            return { byKey: null, byFingerprint: null };
          },
          startProcessing: async () => {},
          complete: async () => {}
        };

        const { store: wrapped } = withResilience(store, {
          maxRetries,
          retryDelayMs: 1
        });

        try {
          await wrapped.lookup("key", "fp");
          return true;
        } catch {
          return false;
        }
      }
    ),
    { numRuns: 30 }
  );
  t.pass("succeeds when failures < maxRetries invariant holds");
});

test("resilience - throws when failures >= maxRetries", async (t) => {
  await fc.assert(
    fc.asyncProperty(fc.integer({ min: 1, max: 3 }), async (maxRetries) => {
      const store = {
        lookup: async () => {
          throw new Error("Always fails");
        },
        startProcessing: async () => {},
        complete: async () => {}
      };

      const { store: wrapped } = withResilience(store, {
        maxRetries,
        retryDelayMs: 1
      });

      try {
        await wrapped.lookup("key", "fp");
        return false;
      } catch {
        return true;
      }
    }),
    { numRuns: 20 }
  );
  t.pass("throws when failures >= maxRetries invariant holds");
});

test("resilience - successful operations are deterministic", async (t) => {
  await fc.assert(
    fc.asyncProperty(fc.string(), fc.string(), async (key, fingerprint) => {
      let callCount = 0;
      const store = {
        lookup: async () => {
          callCount++;
          return { byKey: null, byFingerprint: null, callCount };
        },
        startProcessing: async () => {},
        complete: async () => {}
      };

      const { store: wrapped } = withResilience(store, {
        maxRetries: 3,
        retryDelayMs: 1
      });

      const result1 = await wrapped.lookup(key, fingerprint);
      const result2 = await wrapped.lookup(key, fingerprint);

      return result1.callCount === 1 && result2.callCount === 2;
    }),
    { numRuns: 30 }
  );
  t.pass("successful operations are deterministic");
});

test("resilience - all three operations are wrapped", async (t) => {
  const operations = ["lookup", "startProcessing", "complete"];

  for (const op of operations) {
    let called = false;
    const store = {
      lookup: async () => ({ byKey: null, byFingerprint: null }),
      startProcessing: async () => {},
      complete: async () => {}
    };

    store[op] = async () => {
      called = true;
      return op === "lookup" ? { byKey: null, byFingerprint: null } : undefined;
    };

    const { store: wrapped } = withResilience(store);

    if (op === "lookup") {
      await wrapped.lookup("key", "fp");
    } else if (op === "startProcessing") {
      await wrapped.startProcessing("key", "fp", 60000);
    } else {
      await wrapped.complete("key", { status: 200, headers: {}, body: "" });
    }

    t.ok(called, `${op} should be wrapped and called`);
  }
});
