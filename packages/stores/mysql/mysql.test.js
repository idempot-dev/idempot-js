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

test("MysqlIdempotencyStore - close calls pool.end", async (t) => {
  const pool = createFakeMysqlPool();
  const store = new MysqlIdempotencyStore({ pool });

  await store.close();

  t.equal(pool.end.calledOnce, true, "pool.end should be called once");
  t.end();
});
