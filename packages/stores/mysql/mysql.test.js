// packages/stores/mysql/mysql.test.js
// This file runs the shared store adapter test suite via runStoreTests()
// then adds MySQL-specific edge cases not covered by the shared tests.
// See packages/core/tests/store-adapter-suite.js for the shared tests.
import { test } from "tap";
import { MysqlIdempotencyStore } from "@idempot/mysql-store";
import { createFakeMysqlPool } from "./tests/mysql-test-helpers.js";
import { runStoreTests } from "../../core/tests/store-adapter-suite.js";

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
