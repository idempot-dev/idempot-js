import { test } from "tap";
import { createFakeMysqlPool } from "./mysql-test-helpers.js";

test("createFakeMysqlPool - query returns empty result for unknown SQL", async (t) => {
  const pool = createFakeMysqlPool();
  const result = await pool.query("DROP TABLE nonexistent");
  t.same(result, [[], []], "should return empty array result");
  t.end();
});

test("createFakeMysqlPool - INSERT creates record", async (t) => {
  const pool = createFakeMysqlPool();
  const result = await pool.query(
    "INSERT INTO idempotency_records (key, fingerprint, expires_at) VALUES (?, ?, ?)",
    ["test-key", "test-fp", Date.now() + 60000]
  );
  t.equal(result[0].affectedRows, 1, "should insert one row");
  t.end();
});

test("createFakeMysqlPool - guarded SELECT returns rows matching key or fingerprint", async (t) => {
  const pool = createFakeMysqlPool();
  const now = Date.now();
  await pool.query(
    "INSERT INTO idempotency_records (key, fingerprint, expires_at) VALUES (?, ?, ?)",
    ["test-key", "test-fp", now + 60000]
  );

  const LOOKUP =
    "SELECT * FROM idempotency_records WHERE (`key` = ? AND expires_at > ?) OR (fingerprint = ? AND expires_at > ?)";

  // key matches
  const byKey = await pool.query(LOOKUP, ["test-key", now, "other-fp", now]);
  t.equal(byKey[0].length, 1, "should find one row by key");
  t.equal(byKey[0][0].key, "test-key", "should have correct key");

  // fingerprint matches (different key)
  const byFingerprint = await pool.query(LOOKUP, [
    "other-key",
    now,
    "test-fp",
    now
  ]);
  t.equal(byFingerprint[0].length, 1, "should find one row by fingerprint");
  t.equal(
    byFingerprint[0][0].fingerprint,
    "test-fp",
    "should have correct fingerprint"
  );

  // same record can match both predicates
  const byBoth = await pool.query(LOOKUP, ["test-key", now, "test-fp", now]);
  t.equal(byBoth[0].length, 1, "should not duplicate a row matching both");
  t.end();
});

test("createFakeMysqlPool - guarded SELECT hides expired records", async (t) => {
  const pool = createFakeMysqlPool();
  const now = Date.now();
  await pool.query(
    "INSERT INTO idempotency_records (key, fingerprint, expires_at) VALUES (?, ?, ?)",
    ["test-key", "test-fp", now - 1000]
  );

  const result = await pool.query(
    "SELECT * FROM idempotency_records WHERE (`key` = ? AND expires_at > ?) OR (fingerprint = ? AND expires_at > ?)",
    ["test-key", now, "test-fp", now]
  );
  t.equal(result[0].length, 0, "expired record should not be returned");
  t.end();
});

test("createFakeMysqlPool - unguarded OR SELECT is not emulated (guard drift fails loudly)", async (t) => {
  const pool = createFakeMysqlPool();
  await pool.query(
    "INSERT INTO idempotency_records (key, fingerprint, expires_at) VALUES (?, ?, ?)",
    ["test-key", "test-fp", Date.now() + 60000]
  );

  // The store's lookup always carries the expiry guard; a statement
  // without it must get no emulation so store tests fail loudly instead
  // of passing on drifted SQL.
  const result = await pool.query(
    "SELECT * FROM idempotency_records WHERE `key` = ? OR fingerprint = ?",
    ["test-key", "test-fp"]
  );
  t.same(result, [[], []], "drifted statement shape must get no emulation");
  t.end();
});

test("createFakeMysqlPool - unguarded batched lookup is not emulated (guard drift fails loudly)", async (t) => {
  const pool = createFakeMysqlPool();
  pool.config = { connectionConfig: { multipleStatements: true } };
  await pool.query(
    "INSERT INTO idempotency_records (key, fingerprint, expires_at) VALUES (?, ?, ?)",
    ["test-key", "test-fp", Date.now() + 60000]
  );

  // The store's batched lookup always carries the expiry guard; a batch
  // whose SELECT drops it must get no row emulation so store tests fail
  // loudly instead of passing on drifted SQL.
  const result = await pool.query(
    "DELETE FROM idempotency_records WHERE expires_at <= ? LIMIT 10; SELECT * FROM idempotency_records WHERE `key` = ? OR fingerprint = ?",
    [Date.now(), "test-key", "test-fp"]
  );
  t.same(result[0][1], [], "drifted batched SELECT must get no rows");
  t.end();
});

test("createFakeMysqlPool - SELECT by key returns empty for non-existent", async (t) => {
  const pool = createFakeMysqlPool();
  const result = await pool.query(
    "SELECT * FROM idempotency_records WHERE `key` = ?",
    ["nonexistent"]
  );
  t.equal(result[0].length, 0, "should find no rows");
  t.end();
});

test("createFakeMysqlPool - guarded SELECT returns every row sharing the fingerprint", async (t) => {
  const pool = createFakeMysqlPool();
  const now = Date.now();
  await pool.query(
    "INSERT INTO idempotency_records (key, fingerprint, expires_at) VALUES (?, ?, ?)",
    ["key-1", "shared-fp", now + 60000]
  );
  await pool.query(
    "INSERT INTO idempotency_records (key, fingerprint, expires_at) VALUES (?, ?, ?)",
    ["key-2", "shared-fp", now + 60000]
  );

  const result = await pool.query(
    "SELECT * FROM idempotency_records WHERE (`key` = ? AND expires_at > ?) OR (fingerprint = ? AND expires_at > ?)",
    ["other-key", now, "shared-fp", now]
  );
  t.equal(result[0].length, 2, "should find both rows sharing the fingerprint");
  t.equal(
    result[0][0].fingerprint,
    "shared-fp",
    "should have correct fingerprint"
  );
  t.equal(
    result[0][1].fingerprint,
    "shared-fp",
    "should have correct fingerprint"
  );
  t.end();
});

test("createFakeMysqlPool - UPDATE returns affectedRows 0 for non-existent key", async (t) => {
  const pool = createFakeMysqlPool();
  const result = await pool.query(
    "UPDATE idempotency_records SET status = 'complete' WHERE `key` = ?",
    ["nonexistent"]
  );
  t.equal(result[0].affectedRows, 0, "should update 0 rows");
  t.end();
});

test("createFakeMysqlPool - DELETE removes expired records", async (t) => {
  const pool = createFakeMysqlPool();
  const pastExpiry = Date.now() - 1000;
  const futureExpiry = Date.now() + 60000;

  pool.__store.set("expired-key", {
    key: "expired-key",
    fingerprint: "fp-expired",
    status: "processing",
    expires_at: pastExpiry,
    response_status: null,
    response_headers: null,
    response_body: null
  });

  pool.__store.set("valid-key", {
    key: "valid-key",
    fingerprint: "fp-valid",
    status: "processing",
    expires_at: futureExpiry,
    response_status: null,
    response_headers: null,
    response_body: null
  });

  await pool.query("DELETE FROM idempotency_records WHERE expires_at <= ?", [
    Date.now()
  ]);

  t.equal(
    pool.__store.has("expired-key"),
    false,
    "expired key should be deleted"
  );
  t.equal(pool.__store.has("valid-key"), true, "valid key should remain");
  t.end();
});

test("createFakeMysqlPool - end is a sinon fake", async (t) => {
  const pool = createFakeMysqlPool();
  t.ok(pool.end.calledOnce === false, "end should not be called initially");
  await pool.end();
  t.ok(pool.end.calledOnce, "end should be tracked by sinon");
  t.end();
});

test("createFakeMysqlPool - query returns empty result for unrecognized SQL", async (t) => {
  const pool = createFakeMysqlPool();
  const result = await pool.query("DROP TABLE nonexistent");
  t.same(result, [[], []], "should return empty result for unrecognized SQL");
  t.end();
});

test("createFakeMysqlPool - SELECT without WHERE clause returns empty", async (t) => {
  const pool = createFakeMysqlPool();
  await pool.query(
    "INSERT INTO idempotency_records (key, fingerprint, expires_at) VALUES (?, ?, ?)",
    ["test-key", "test-fp", Date.now() + 60000]
  );

  const result = await pool.query("SELECT * FROM idempotency_records");
  t.same(
    result,
    [[], []],
    "should return empty result for SELECT without WHERE"
  );
  t.end();
});

test("createFakeMysqlPool - DELETE_EXPIRED without params uses Date.now()", async (t) => {
  const pool = createFakeMysqlPool();
  const pastExpiry = Date.now() - 1000;
  pool.__store.set("expired-key", {
    key: "expired-key",
    fingerprint: "fp",
    status: "processing",
    expires_at: pastExpiry,
    response_status: null,
    response_headers: null,
    response_body: null
  });

  const result = await pool.query(
    "DELETE FROM idempotency_records WHERE expires_at <= now()"
  );
  t.equal(
    result[0].affectedRows,
    1,
    "should delete expired record when no params passed"
  );
  t.equal(
    pool.__store.has("expired-key"),
    false,
    "expired key should be deleted"
  );
  t.end();
});
