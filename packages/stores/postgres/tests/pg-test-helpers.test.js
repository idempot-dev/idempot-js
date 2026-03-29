import { test } from "tap";
import { createFakePgPool } from "./pg-test-helpers.js";

test("createFakePgPool - query returns empty result for CREATE statements", async (t) => {
  const pool = createFakePgPool();
  const result = await pool.query("CREATE TABLE test (id INT)");
  t.same(result, { rows: [], rowCount: 0 }, "should return empty result");
  t.end();
});

test("createFakePgPool - INSERT creates record", async (t) => {
  const pool = createFakePgPool();
  const result = await pool.query(
    "INSERT INTO idempotency_records (key, fingerprint, expires_at) VALUES ($1, $2, $3)",
    ["test-key", "test-fp", Date.now() + 60000]
  );
  t.equal(result.rowCount, 1, "should insert one row");
  t.end();
});

test("createFakePgPool - SELECT by key returns inserted record", async (t) => {
  const pool = createFakePgPool();
  await pool.query(
    "INSERT INTO idempotency_records (key, fingerprint, expires_at) VALUES ($1, $2, $3)",
    ["test-key", "test-fp", Date.now() + 60000]
  );

  const result = await pool.query(
    "SELECT * FROM idempotency_records WHERE key = $1",
    ["test-key"]
  );
  t.equal(result.rows.length, 1, "should find one row");
  t.equal(result.rows[0].key, "test-key", "should have correct key");
  t.end();
});

test("createFakePgPool - SELECT by key returns empty for non-existent", async (t) => {
  const pool = createFakePgPool();
  const result = await pool.query(
    "SELECT * FROM idempotency_records WHERE key = $1",
    ["nonexistent"]
  );
  t.equal(result.rows.length, 0, "should find no rows");
  t.end();
});

test("createFakePgPool - SELECT by fingerprint finds matching record", async (t) => {
  const pool = createFakePgPool();
  await pool.query(
    "INSERT INTO idempotency_records (key, fingerprint, expires_at) VALUES ($1, $2, $3)",
    ["key-1", "shared-fp", Date.now() + 60000]
  );

  const result = await pool.query(
    "SELECT * FROM idempotency_records WHERE fingerprint = $1",
    ["shared-fp"]
  );
  t.equal(result.rows.length, 1, "should find one row");
  t.equal(
    result.rows[0].fingerprint,
    "shared-fp",
    "should have correct fingerprint"
  );
  t.end();
});

test("createFakePgPool - UPDATE returns rowCount 0 for non-existent key", async (t) => {
  const pool = createFakePgPool();
  const result = await pool.query(
    "UPDATE idempotency_records SET status = 'complete' WHERE key = $1",
    ["nonexistent"]
  );
  t.equal(result.rowCount, 0, "should update 0 rows");
  t.end();
});

test("createFakePgPool - DELETE removes expired records", async (t) => {
  const pool = createFakePgPool();
  const pastExpiry = Date.now() - 1000;
  const futureExpiry = Date.now() + 60000;

  // Manually insert with past expiry
  pool.__store.set("expired-key", {
    key: "expired-key",
    fingerprint: "fp-expired",
    status: "processing",
    expires_at: pastExpiry,
    response_status: null,
    response_headers: null,
    response_body: null
  });

  // Manually insert with future expiry
  pool.__store.set("valid-key", {
    key: "valid-key",
    fingerprint: "fp-valid",
    status: "processing",
    expires_at: futureExpiry,
    response_status: null,
    response_headers: null,
    response_body: null
  });

  await pool.query("DELETE FROM idempotency_records WHERE expires_at <= $1", [
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

test("createFakePgPool - end is a sinon fake", async (t) => {
  const pool = createFakePgPool();
  t.ok(pool.end.calledOnce === false, "end should not be called initially");
  await pool.end();
  t.ok(pool.end.calledOnce, "end should be tracked by sinon");
  t.end();
});

test("createFakePgPool - query returns empty result for unrecognized SQL", async (t) => {
  const pool = createFakePgPool();
  const result = await pool.query("DROP TABLE nonexistent");
  t.same(result, { rows: [], rowCount: 0 }, "should return empty result for unrecognized SQL");
  t.end();
});

test("createFakePgPool - SELECT without WHERE clause returns empty", async (t) => {
  const pool = createFakePgPool();
  await pool.query(
    "INSERT INTO idempotency_records (key, fingerprint, expires_at) VALUES ($1, $2, $3)",
    ["test-key", "test-fp", Date.now() + 60000]
  );

  const result = await pool.query("SELECT * FROM idempotency_records");
  t.same(result, { rows: [], rowCount: 0 }, "should return empty result for SELECT without WHERE");
  t.end();
});
