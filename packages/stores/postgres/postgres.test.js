// packages/stores/postgres/postgres.test.js
// This file runs the shared store adapter test suite via runStoreTests()
// then adds PostgreSQL-specific edge cases not covered by the shared tests.
// See packages/core/tests/store-adapter-suite.js for the shared tests.
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
