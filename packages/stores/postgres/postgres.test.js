import { test } from "tap";
import { PostgresIdempotencyStore } from "@idempot/postgres-store";
import { createFakePgPool } from "./tests/pg-test-helpers.js";
import { runStoreTests } from "../../core/tests/store-adapter-suite.js";

runStoreTests({
  name: "postgres",
  createStore: () => {
    const pool = createFakePgPool();
    return new PostgresIdempotencyStore({ pool });
  }
});

test("PostgresIdempotencyStore - lookup returns null for empty store", async (t) => {
  const pool = createFakePgPool();
  const store = new PostgresIdempotencyStore({ pool });

  const result = await store.lookup("key-1", "fp-1");

  t.equal(result.byKey, null, "byKey should be null");
  t.equal(result.byFingerprint, null, "byFingerprint should be null");
  t.end();
});

test("PostgresIdempotencyStore - lookup finds record by key", async (t) => {
  const pool = createFakePgPool();
  const store = new PostgresIdempotencyStore({ pool });

  await store.startProcessing("key-1", "fp-1", 60000);

  const result = await store.lookup("key-1", "fp-1");

  t.equal(result.byKey?.key, "key-1", "should find by key");
  t.equal(result.byKey?.status, "processing", "status should be processing");
  t.end();
});

test("PostgresIdempotencyStore - lookup finds record by fingerprint", async (t) => {
  const pool = createFakePgPool();
  const store = new PostgresIdempotencyStore({ pool });

  await store.startProcessing("key-1", "fp-1", 60000);

  const result = await store.lookup("key-2", "fp-1");

  t.equal(result.byFingerprint?.key, "key-1", "should find by fingerprint");
  t.equal(
    result.byFingerprint?.fingerprint,
    "fp-1",
    "fingerprint should match"
  );
  t.end();
});

test("PostgresIdempotencyStore - startProcessing creates record", async (t) => {
  const pool = createFakePgPool();
  const store = new PostgresIdempotencyStore({ pool });

  await store.startProcessing("key-1", "fp-1", 60000);

  const result = await store.lookup("key-1", "fp-1");

  t.equal(result.byKey?.status, "processing", "status should be processing");
  t.equal(result.byKey?.fingerprint, "fp-1", "fingerprint should be stored");
  t.end();
});

test("PostgresIdempotencyStore - complete updates record", async (t) => {
  const pool = createFakePgPool();
  const store = new PostgresIdempotencyStore({ pool });

  await store.startProcessing("key-1", "fp-1", 60000);

  await store.complete("key-1", {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: '{"success":true}'
  });

  const result = await store.lookup("key-1", "fp-1");

  t.equal(result.byKey?.status, "complete", "status should be complete");
  t.equal(result.byKey?.response?.status, 200, "response status should match");
  t.same(
    result.byKey?.response?.headers,
    { "Content-Type": "application/json" },
    "headers should match"
  );
  t.equal(
    result.byKey?.response?.body,
    '{"success":true}',
    "body should match"
  );
  t.end();
});

test("PostgresIdempotencyStore - complete throws on missing key", async (t) => {
  const pool = createFakePgPool();
  const store = new PostgresIdempotencyStore({ pool });

  try {
    await store.complete("nonexistent", {
      status: 200,
      headers: {},
      body: "test"
    });
    t.fail("should have thrown");
  } catch (err) {
    t.match(
      err.message,
      /No record found/i,
      "should throw error for missing key"
    );
  }
  t.end();
});

test("PostgresIdempotencyStore - parseRecord handles null response_headers", async (t) => {
  const pool = createFakePgPool();
  const store = new PostgresIdempotencyStore({ pool });

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

test("PostgresIdempotencyStore - close calls pool.end", async (t) => {
  const pool = createFakePgPool();
  const store = new PostgresIdempotencyStore({ pool });

  await store.close();

  t.equal(pool.end.calledOnce, true, "pool.end should be called once");
  t.end();
});
