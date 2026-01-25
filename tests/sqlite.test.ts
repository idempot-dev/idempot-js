import { test } from "tap";
import { SqliteIdempotencyStore } from "../src/store/sqlite.js";

test("SqliteIdempotencyStore - initialization", (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  t.ok(store, "store should be created");
  store.close();
  t.end();
});

test("SqliteIdempotencyStore - lookup with empty store", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });

  const result = await store.lookup("test-key", "test-fingerprint");

  t.equal(result.byKey, null, "byKey should be null");
  t.equal(result.byFingerprint, null, "byFingerprint should be null");

  store.close();
});

test("SqliteIdempotencyStore - startProcessing creates record", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });

  await store.startProcessing("test-key", "test-fp", 60000);

  const result = await store.lookup("test-key", "test-fp");

  t.ok(result.byKey, "record should exist by key");
  t.ok(result.byFingerprint, "record should exist by fingerprint");
  t.equal(result.byKey?.status, "processing", "status should be processing");
  t.equal(result.byKey?.key, "test-key", "key should match");
  t.equal(result.byKey?.fingerprint, "test-fp", "fingerprint should match");
  t.ok(result.byKey?.expiresAt > Date.now(), "should have future expiration");

  store.close();
});

test("SqliteIdempotencyStore - complete updates record", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });

  await store.startProcessing("test-key", "test-fp", 60000);

  await store.complete("test-key", {
    status: 200,
    headers: { "content-type": "application/json" },
    body: '{"result":"ok"}',
  });

  const result = await store.lookup("test-key", "test-fp");

  t.equal(result.byKey?.status, "complete", "status should be complete");
  t.ok(result.byKey?.response, "response should be stored");
  t.equal(result.byKey?.response?.status, 200, "response status should match");

  store.close();
});

test("SqliteIdempotencyStore - cleanup removes expired records", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });

  // Add expired record
  await store.startProcessing("expired-key", "expired-fp", -1000);

  // Add valid record
  await store.startProcessing("valid-key", "valid-fp", 60000);

  await store.cleanup();

  const expired = await store.lookup("expired-key", "expired-fp");
  const valid = await store.lookup("valid-key", "valid-fp");

  t.equal(expired.byKey, null, "expired record should be removed by key");
  t.equal(
    expired.byFingerprint,
    null,
    "expired record should be removed by fingerprint"
  );
  t.ok(valid.byKey, "valid record should remain");
  t.ok(valid.byFingerprint, "valid record should remain");

  store.close();
});
