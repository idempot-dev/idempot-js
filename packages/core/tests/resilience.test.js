import { test } from "tap";
import { withResilience } from "@idempot/core";

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

test("withResilience - respects timeout", async (t) => {
  const slowStore = {
    lookup: async () => {
      await new Promise((r) => setTimeout(r, 200));
      return { byKey: null, byFingerprint: null };
    },
    startProcessing: async () => {},
    complete: async () => {}
  };

  const { store, circuit } = withResilience(slowStore, { timeoutMs: 100 });

  try {
    await store.lookup("key", "fp");
    t.fail("should have timed out");
  } catch (error) {
    t.ok(error.message.includes("Timed out"), "should throw timeout error");
  }
});

test("withResilience - circuit breaker opens after failures", async (t) => {
  let attempts = 0;
  const failingStore = {
    lookup: async () => {
      attempts++;
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
  } catch (e) {
    // Expected
  }

  t.ok(circuit.opened, "circuit should be open after failures");
});
