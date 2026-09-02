import { test } from "tap";
import { withResilience, IdempotencyKeyExistsError } from "@idempot/core";

test("withResilience - wraps store operations", async (t) => {
  let lookupCalled = false;
  let startProcessingCalled = false;
  let completeCalled = false;
  const mockStore = {
    lookup: async () => {
      lookupCalled = true;
      return { byKey: null, byFingerprint: null };
    },
    startProcessing: async () => {
      startProcessingCalled = true;
    },
    complete: async () => {
      completeCalled = true;
    }
  };

  const { store } = withResilience(mockStore);
  await store.lookup("key", "fp");
  await store.startProcessing("key", "fp", 60000);
  await store.complete("key", { status: 200, headers: {}, body: "" });

  t.ok(lookupCalled, "should call original store lookup");
  t.ok(startProcessingCalled, "should call original store startProcessing");
  t.ok(completeCalled, "should call original store complete");
});

test("withResilience - retries on failure", async (t) => {
  let attempts = 0;
  const flakyStore = {
    lookup: async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error("Temporary failure");
      }
      return { byKey: null, byFingerprint: null };
    },
    startProcessing: async () => {},
    complete: async () => {}
  };

  const { store } = withResilience(flakyStore, { maxRetries: 3 });
  await store.lookup("key", "fp");

  t.equal(attempts, 3, "should retry until success");
});

test("withResilience - throws after max retries", async (t) => {
  let attempts = 0;
  const alwaysFailingStore = {
    lookup: async () => {
      attempts++;
      throw new Error("Permanent failure");
    },
    startProcessing: async () => {},
    complete: async () => {}
  };

  const { store } = withResilience(alwaysFailingStore, { maxRetries: 3 });

  try {
    await store.lookup("key", "fp");
    t.fail("should have thrown");
  } catch (error) {
    t.equal(attempts, 3, "should have retried 3 times");
    t.equal(error.message, "Permanent failure", "should throw original error");
  }
});

test("withResilience - key-exists error is invoked once and not retried", async (t) => {
  let attempts = 0;
  const duplicateStore = {
    lookup: async () => ({ byKey: null, byFingerprint: null }),
    startProcessing: async () => {
      attempts++;
      throw new IdempotencyKeyExistsError("duplicate key");
    },
    complete: async () => {}
  };

  const { store } = withResilience(duplicateStore, { maxRetries: 3 });

  await t.rejects(
    store.startProcessing("key", "fp", 60000),
    IdempotencyKeyExistsError,
    "key-exists error should propagate to caller"
  );
  t.equal(attempts, 1, "key-exists error should not be retried");
});

test("withResilience - key-exists error keeps the circuit closed", async (t) => {
  let attempts = 0;
  const duplicateThenSuccessStore = {
    lookup: async () => {
      attempts++;
      if (attempts === 1) {
        throw new IdempotencyKeyExistsError("duplicate key");
      }
      return { byKey: null, byFingerprint: null };
    },
    startProcessing: async () => {},
    complete: async () => {}
  };

  const { store, circuit } = withResilience(duplicateThenSuccessStore, {
    maxRetries: 1,
    errorThresholdPercentage: 1,
    volumeThreshold: 1
  });

  await t.rejects(
    store.lookup("key", "fp"),
    IdempotencyKeyExistsError,
    "first lookups throws key-exists error"
  );

  const result = await store.lookup("key", "fp");
  t.same(
    result,
    { byKey: null, byFingerprint: null },
    "subsequent call succeeds"
  );
  t.notOk(
    circuit.opened,
    "circuit should remain closed after key-exists error"
  );
});

test("withResilience - respects timeout", async (t) => {
  const slowStore = {
    lookup: async () => {
      await new Promise((r) => setTimeout(r, 200));
      return { byKey: null, byFingerprint: null };
    },
    startProcessing: async () => {},
    complete: async () => {}
  };

  const { store } = withResilience(slowStore, { timeoutMs: 100 });

  try {
    await store.lookup("key", "fp");
    t.fail("should have timed out");
  } catch (error) {
    t.ok(error.message.includes("Timed out"), "should throw timeout error");
  }
});

test("withResilience - circuit breaker opens after failures", async (t) => {
  let _attempts = 0;
  const failingStore = {
    lookup: async () => {
      _attempts++;
      throw new Error("Failure");
    },
    startProcessing: async () => {},
    complete: async () => {}
  };

  const { store, circuit } = withResilience(failingStore, {
    maxRetries: 1,
    errorThresholdPercentage: 1,
    volumeThreshold: 1
  });

  // First call should fail
  try {
    await store.lookup("key", "fp");
  } catch {
    // Expected
  }

  t.ok(circuit.opened, "circuit should be open after failures");
});

test("withResilience - coalesces concurrent same-key startProcessing", async (t) => {
  let calls = 0;
  let resolveWinner;
  const deferredStore = {
    lookup: async () => ({ byKey: null, byFingerprint: null }),
    startProcessing: async () => {
      calls++;
      return new Promise((resolve) => {
        resolveWinner = resolve;
      });
    },
    complete: async () => {}
  };

  const { store } = withResilience(deferredStore);

  const winner = store.startProcessing("key", "fp", 60000);
  await t.rejects(
    store.startProcessing("key", "fp", 60000),
    IdempotencyKeyExistsError,
    "concurrent same-key call should get key-exists error without hitting the store"
  );
  t.equal(calls, 1, "store startProcessing should be called exactly once");

  resolveWinner();
  await winner;
  t.equal(calls, 1, "coalescing should not add store calls");
});

test("withResilience - concurrent different-key startProcessing does not coalesce", async (t) => {
  let calls = 0;
  const countingStore = {
    lookup: async () => ({ byKey: null, byFingerprint: null }),
    startProcessing: async () => {
      calls++;
    },
    complete: async () => {}
  };

  const { store } = withResilience(countingStore);

  await Promise.all([
    store.startProcessing("key-1", "fp", 60000),
    store.startProcessing("key-2", "fp", 60000)
  ]);
  t.equal(calls, 2, "different keys should each reach the store");
});

test("withResilience - in-flight entry clears after success", async (t) => {
  let calls = 0;
  const countingStore = {
    lookup: async () => ({ byKey: null, byFingerprint: null }),
    startProcessing: async () => {
      calls++;
    },
    complete: async () => {}
  };

  const { store } = withResilience(countingStore);

  await store.startProcessing("key", "fp", 60000);
  await store.startProcessing("key", "fp", 60000);
  t.equal(calls, 2, "sequential same-key calls should each reach the store");
});

test("withResilience - in-flight entry clears after failure", async (t) => {
  let calls = 0;
  const failingOnceStore = {
    lookup: async () => ({ byKey: null, byFingerprint: null }),
    startProcessing: async () => {
      calls++;
      if (calls === 1) {
        throw new Error("Store failure");
      }
    },
    complete: async () => {}
  };

  const { store } = withResilience(failingOnceStore, { maxRetries: 1 });

  await t.rejects(
    store.startProcessing("key", "fp", 60000),
    "first call fails"
  );
  await store.startProcessing("key", "fp", 60000);
  t.equal(calls, 2, "same key should reach the store again after failure");
});

test("withResilience - close calls underlying store close", async (t) => {
  let closeCalled = false;
  const mockStore = {
    lookup: async () => ({ byKey: null, byFingerprint: null }),
    startProcessing: async () => {},
    complete: async () => {},
    close: async () => {
      closeCalled = true;
    }
  };

  const { store } = withResilience(mockStore);
  await store.close();

  t.ok(closeCalled, "should call underlying store close");
});
