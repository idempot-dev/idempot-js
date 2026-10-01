// packages/stores/mysql/mysql.test.js
// This file runs the shared store adapter test suite via runStoreTests()
// then adds MySQL-specific edge cases not covered by the shared tests.
// See packages/core/tests/store-adapter-suite.js for the shared tests.
import { test } from "tap";
import { MysqlIdempotencyStore } from "@idempot/mysql-store";
import { createFakeMysqlPool } from "./tests/mysql-test-helpers.js";
import { runStoreTests } from "../../core/tests/store-adapter-suite.js";

/**
 * Seed more expired rows than the purge batch (LIMIT 10) can reclaim, with
 * `targetKey` expiring last so it survives the purge. Only the expiry guard
 * can then hide it, so the lookup below fails if the guard is dropped.
 * @param {object} store
 * @param {string} targetKey
 * @param {string} targetFingerprint
 * @returns {Promise<void>}
 */
async function seedExpiredBacklog(store, targetKey, targetFingerprint) {
  for (let i = 0; i < 20; i++) {
    await store.startProcessing(`backlog-${i}`, `backlog-fp-${i}`, -100000 + i);
  }
  await store.startProcessing(targetKey, targetFingerprint, -1);
}

runStoreTests({
  name: "mysql",
  createStore: () => {
    const pool = createFakeMysqlPool();
    return new MysqlIdempotencyStore({ pool });
  }
});

test("MysqlIdempotencyStore - parseRecord handles null response_headers", async (t) => {
  const pool = createFakeMysqlPool();
  const store = new MysqlIdempotencyStore({ pool });

  pool.__store.set("test-key", {
    key: "test-key",
    fingerprint: "test-fp",
    status: "complete",
    response_status: 200,
    response_headers: null,
    response_body: "test",
    expires_at: Date.now() + 60000
  });

  const result = await store.lookup("test-key", "test-fp");
  t.ok(result.byKey.response, "response should exist");
  t.same(
    result.byKey.response.headers,
    {},
    "headers should default to empty object"
  );

  await store.close();
  t.end();
});

test("MysqlIdempotencyStore - uses batched lookup when pool supports multiple statements", async (t) => {
  const pool = createFakeMysqlPool();
  pool.config = { connectionConfig: { multipleStatements: true } };
  const store = new MysqlIdempotencyStore({ pool });

  await store.startProcessing("batch-key", "batch-fp", 60000);
  const result = await store.lookup("batch-key", "batch-fp");
  t.equal(result.byKey.key, "batch-key", "batched lookup should find by key");
  t.equal(
    result.byFingerprint.key,
    "batch-key",
    "batched lookup should find by fingerprint"
  );

  // fingerprint matches but key does not
  const byFingerprint = await store.lookup("other-key", "batch-fp");
  t.equal(
    byFingerprint.byFingerprint.key,
    "batch-key",
    "batched lookup should find by fingerprint only"
  );

  // neither matches
  const empty = await store.lookup("no-key", "no-fp");
  t.equal(empty.byKey, null, "batched lookup should miss by key");
  t.equal(
    empty.byFingerprint,
    null,
    "batched lookup should miss by fingerprint"
  );

  await store.close();
  t.end();
});

test("MysqlIdempotencyStore - does not return expired records", async (t) => {
  const pool = createFakeMysqlPool();
  const store = new MysqlIdempotencyStore({ pool });

  // Negative TTL inserts an already-expired record; the purge may reclaim
  // it and the expiry guard must hide it either way.
  await store.startProcessing("expired-key", "expired-fp", -1000);

  const byKey = await store.lookup("expired-key", "other-fp");
  t.equal(byKey.byKey, null, "expired record should not be found by key");

  await store.startProcessing("expired-key-2", "expired-fp-2", -1000);
  const byFingerprint = await store.lookup("other-key", "expired-fp-2");
  t.equal(
    byFingerprint.byFingerprint,
    null,
    "expired record should not be found by fingerprint"
  );

  await store.close();
  t.end();
});

test("MysqlIdempotencyStore - does not return an expired record the purge could not reclaim", async (t) => {
  const pool = createFakeMysqlPool();
  const store = new MysqlIdempotencyStore({ pool });

  await seedExpiredBacklog(store, "target-key", "target-fp");

  const byKey = await store.lookup("target-key", "other-fp");
  t.equal(
    byKey.byKey,
    null,
    "guard must hide an expired record the purge missed"
  );

  const byFingerprint = await store.lookup("other-key", "target-fp");
  t.equal(
    byFingerprint.byFingerprint,
    null,
    "guard must hide it by fingerprint too"
  );

  await store.close();
  t.end();
});

test("MysqlIdempotencyStore - batched lookup does not return an expired record the purge could not reclaim", async (t) => {
  const pool = createFakeMysqlPool();
  pool.config = { connectionConfig: { multipleStatements: true } };
  const store = new MysqlIdempotencyStore({ pool });

  await seedExpiredBacklog(store, "target-key", "target-fp");

  const byKey = await store.lookup("target-key", "other-fp");
  t.equal(
    byKey.byKey,
    null,
    "batched guard must hide an expired record the purge missed"
  );

  const byFingerprint = await store.lookup("other-key", "target-fp");
  t.equal(
    byFingerprint.byFingerprint,
    null,
    "batched guard must hide it by fingerprint too"
  );

  await store.close();
  t.end();
});

test("MysqlIdempotencyStore - parseRecord returns null for a falsy row", async (t) => {
  const pool = createFakeMysqlPool();
  const store = new MysqlIdempotencyStore({ pool });

  t.equal(store.parseRecord(null), null, "null row should map to null");
  t.equal(
    store.parseRecord(undefined),
    null,
    "undefined row should map to null"
  );

  await store.close();
  t.end();
});

test("MysqlIdempotencyStore - close calls pool.end", async (t) => {
  const pool = createFakeMysqlPool();
  const store = new MysqlIdempotencyStore({ pool });

  await store.close();

  t.equal(pool.end.calledOnce, true, "pool.end should be called once");
  t.end();
});

test("MysqlIdempotencyStore - startProcessing on existing key throws IdempotencyKeyExistsError", async (t) => {
  const { IdempotencyKeyExistsError } = await import("@idempot/core");
  const pool = createFakeMysqlPool();
  const store = new MysqlIdempotencyStore({ pool });

  await store.startProcessing("dup-key", "fp-1", 60000);

  await t.rejects(
    store.startProcessing("dup-key", "fp-2", 60000),
    IdempotencyKeyExistsError,
    "duplicate insert should throw IdempotencyKeyExistsError"
  );

  await store.close();
  t.end();
});

test("MysqlIdempotencyStore - startProcessing propagates non-constraint driver errors", async (t) => {
  const pool = createFakeMysqlPool();
  const store = new MysqlIdempotencyStore({ pool });

  pool.__insertError = new Error("connection refused");

  await t.rejects(
    store.startProcessing("key", "fp", 60000),
    /connection refused/,
    "transient driver error should propagate unchanged"
  );

  await store.close();
  t.end();
});

test("MysqlIdempotencyStore - startProcessing translates message-only duplicate errors", async (t) => {
  const { IdempotencyKeyExistsError } = await import("@idempot/core");
  const pool = createFakeMysqlPool();
  const store = new MysqlIdempotencyStore({ pool });

  // Some mysql drivers omit the code and expose only the message.
  const messageOnly = new Error("Duplicate entry 'key' for key 'PRIMARY'");
  pool.__insertError = messageOnly;

  await t.rejects(
    store.startProcessing("key", "fp", 60000),
    IdempotencyKeyExistsError,
    "message-only duplicate errors should be translated"
  );

  await store.close();
  t.end();
});

test("MysqlIdempotencyStore - startProcessing reclaims an expired row for the same key", async (t) => {
  const { IdempotencyKeyExistsError } = await import("@idempot/core");
  const pool = createFakeMysqlPool();
  const store = new MysqlIdempotencyStore({ pool });

  pool.__store.set("stale-key", {
    key: "stale-key",
    fingerprint: "old-fp",
    status: "complete",
    response_status: 200,
    response_headers: "{}",
    response_body: "old",
    expires_at: Date.now() - 1000
  });

  // Different fingerprint: an expired row must be reclaimable regardless of
  // the old payload, exactly like a purged row would be.
  await store.startProcessing("stale-key", "new-fp", 60000);

  t.ok(pool.__store.has("stale-key"), "row should exist");
  const record = pool.__store.get("stale-key");
  t.equal(record.status, "processing", "reclaimed row must be processing");
  t.equal(
    record.fingerprint,
    "new-fp",
    "reclaimed row carries the new fingerprint"
  );
  t.equal(record.response_status, null, "stale response must be cleared");
  t.equal(record.response_body, null, "stale response body must be cleared");

  // A live row must still be a conflict: the reclaim only touches expired rows.
  await t.rejects(
    store.startProcessing("stale-key", "other-fp", 60000),
    IdempotencyKeyExistsError,
    "live row must still raise IdempotencyKeyExistsError"
  );

  await store.close();
  t.end();
});
