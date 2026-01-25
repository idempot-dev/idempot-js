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
