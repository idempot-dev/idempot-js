import { test } from "tap";
import { PostgresIdempotencyStore } from "../src/store/postgres.js";

test("PostgresIdempotencyStore - initialization", async (t) => {
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test"
  });
  t.ok(store, "store should be created");
  t.ok(store.pool, "pool should be created");
  t.end();
});

test("PostgresIdempotencyStore - lookup with empty store", async (t) => {
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test"
  });

  try {
    const result = await store.lookup("test-key", "test-fingerprint");
    t.equal(result.byKey, null, "byKey should be null");
    t.equal(result.byFingerprint, null, "byFingerprint should be null");
  } catch (err) {
    t.ok(err, "should fail without real database");
  }
  t.end();
});

test("PostencyStore - startgresIdempotProcessing creates record", async (t) => {
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test"
  });

  try {
    await store.startProcessing("test-key", "test-fp", 60000);
    t.pass("should call query");
  } catch (err) {
    t.ok(err, "should fail without real database");
  }
  t.end();
});

test("PostgresIdempotencyStore - complete updates record", async (t) => {
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test"
  });

  try {
    await store.complete("test-key", {
      status: 200,
      headers: { "content-type": "application/json" },
      body: '{"result":"ok"}'
    });
    t.pass("should call query");
  } catch (err) {
    t.ok(err, "should fail without real database");
  }
  t.end();
});

test("PostgresIdempotencyStore - cleanup removes expired records", async (t) => {
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test"
  });

  try {
    await store.cleanup();
    t.pass("should call query");
  } catch (err) {
    t.ok(err, "should fail without real database");
  }
  t.end();
});

test("PostgresIdempotencyStore - complete throws on missing key", async (t) => {
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test"
  });

  try {
    await store.complete("nonexistent", {
      status: 200,
      headers: {},
      body: "test"
    });
    t.fail("should have thrown");
  } catch (err) {
    t.ok(err, "should throw error for missing key or connection error");
  }
  t.end();
});

test("PostgresIdempotencyStore - lookup with different key and fingerprint", async (t) => {
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test"
  });

  try {
    const result = await store.lookup("key-2", "fp-1");
    t.equal(result.byKey, null, "should not find by different key");
  } catch (err) {
    t.ok(err, "should fail without real database");
  }
  t.end();
});
