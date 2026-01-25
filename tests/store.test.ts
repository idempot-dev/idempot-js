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

test("MemoryIdempotencyStore - startProcessing creates record", async (t) => {
  const store = new MemoryIdempotencyStore();
  const key = "test-key";
  const fingerprint = "test-fp";
  const ttlMs = 1000;

  await store.startProcessing(key, fingerprint, ttlMs);

  const result = await store.lookup(key, fingerprint);
  t.ok(result.byKey, "record should exist by key");
  t.ok(result.byFingerprint, "record should exist by fingerprint");
  t.equal(result.byKey?.status, "processing", "status should be processing");
  t.equal(result.byKey?.key, key, "key should match");
  t.equal(result.byKey?.fingerprint, fingerprint, "fingerprint should match");
  t.ok(result.byKey?.expiresAt > Date.now(), "should have future expiration");
});

test("MemoryIdempotencyStore - complete updates record", async (t) => {
  const store = new MemoryIdempotencyStore();
  const key = "test-key";
  const fingerprint = "test-fp";

  await store.startProcessing(key, fingerprint, 1000);

  const response = {
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ success: true })
  };

  await store.complete(key, response);

  const result = await store.lookup(key, fingerprint);
  t.equal(result.byKey?.status, "complete", "status should be complete");
  t.same(result.byKey?.response, response, "response should be stored");
});
