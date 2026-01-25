import { test } from "tap";
import { MemoryIdempotencyStore } from "../src/store/memory.js";

test("MemoryIdempotencyStore - initialization", async (t) => {
  const store = new MemoryIdempotencyStore();
  t.ok(store, "store should be created");
});

test("MemoryIdempotencyStore - lookup with empty store", async (t) => {
  const store = new MemoryIdempotencyStore();
  const result = await store.lookup("test-key", "test-fingerprint");

  t.equal(result.byKey, null, "byKey should be null");
  t.equal(result.byFingerprint, null, "byFingerprint should be null");
});
