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
  t.ok(
    result.byKey && result.byKey.expiresAt > Date.now(),
    "should have future expiration"
  );
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

test("MemoryIdempotencyStore - cleanup removes expired records", async (t) => {
  const store = new MemoryIdempotencyStore();
  const key1 = "expired-key";
  const key2 = "valid-key";
  const fp1 = "fp1";
  const fp2 = "fp2";

  // Create expired record (TTL = -1000ms, already expired)
  await store.startProcessing(key1, fp1, -1000);

  // Create valid record
  await store.startProcessing(key2, fp2, 10000);

  await store.cleanup();

  const result1 = await store.lookup(key1, fp1);
  const result2 = await store.lookup(key2, fp2);

  t.equal(result1.byKey, null, "expired record should be removed by key");
  t.equal(
    result1.byFingerprint,
    null,
    "expired record should be removed by fingerprint"
  );
  t.ok(result2.byKey, "valid record should remain");
  t.ok(result2.byFingerprint, "valid record should remain");
});

test("MemoryIdempotencyStore - complete throws on missing key", async (t) => {
  const store = new MemoryIdempotencyStore();

  await t.rejects(
    store.complete("nonexistent-key", {
      status: 200,
      headers: {},
      body: ""
    }),
    { message: /No record found/ },
    "should throw error for missing key"
  );
});

test("MemoryIdempotencyStore - lookup with different key and fingerprint", async (t) => {
  const store = new MemoryIdempotencyStore();

  await store.startProcessing("key1", "fp1", 1000);

  const result = await store.lookup("key2", "fp1");
  t.equal(result.byKey, null, "should not find by different key");
  t.ok(result.byFingerprint, "should find by matching fingerprint");
});
