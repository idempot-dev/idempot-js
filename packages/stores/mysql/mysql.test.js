// packages/stores/mysql/mysql.test.js
import { test } from "tap";
import { runStoreTests } from "../../core/tests/store-adapter-suite.js";
import { MysqlIdempotencyStore } from "@idempot/mysql-store";

runStoreTests({
  name: "mysql",
  createStore: () => new MysqlIdempotencyStore({ testMode: true })
});

test("MysqlIdempotencyStore - parseRecord handles null response_headers", (t) => {
  const store = new MysqlIdempotencyStore({ testMode: true });

  const row = {
    key: "test-key",
    fingerprint: "test-fp",
    status: "complete",
    response_status: 200,
    response_headers: null,
    response_body: "test"
  };

  const result = store.parseRecord(row);
  t.ok(result.response, "response should exist");
  t.same(result.response.headers, {}, "headers default to empty object");
  t.equal(result.response.status, 200, "status preserved");

  store.close();
  t.end();
});

test("MysqlIdempotencyStore - parseRecord handles empty string response_headers", (t) => {
  const store = new MysqlIdempotencyStore({ testMode: true });

  const row = {
    key: "test-key",
    fingerprint: "test-fp",
    status: "complete",
    response_status: 200,
    response_headers: "",
    response_body: "test"
  };

  const result = store.parseRecord(row);
  t.same(
    result.response.headers,
    {},
    "empty string headers default to empty object"
  );

  store.close();
  t.end();
});

test("MysqlIdempotencyStore - parseRecord returns undefined response when response_status is null", (t) => {
  const store = new MysqlIdempotencyStore({ testMode: true });

  const row = {
    key: "test-key",
    fingerprint: "test-fp",
    status: "complete",
    response_status: null,
    response_headers: null,
    response_body: null
  };

  const result = store.parseRecord(row);
  t.equal(result.response, undefined, "response is undefined when status null");

  store.close();
  t.end();
});

test("MysqlIdempotencyStore - close is no-op in testMode", async (t) => {
  const store = new MysqlIdempotencyStore({ testMode: true });
  await store.close();
  t.pass("close() does not throw in testMode");
  t.end();
});

test("MysqlIdempotencyStore - close ends pool when not in testMode", async (t) => {
  let ended = false;

  class MockPool {
    async query() {
      return [[], {}];
    }
    async end() {
      ended = true;
    }
  }

  const createRequire = (await import("module")).createRequire;
  const require = createRequire(import.meta.url);
  const mysql2Path = require.resolve("mysql2/promise");

  const originalCache = require.cache[mysql2Path];
  delete require.cache[mysql2Path];

  require.cache[mysql2Path] = {
    id: mysql2Path,
    filename: mysql2Path,
    loaded: true,
    exports: { createPool: () => new MockPool() }
  };

  const { MysqlIdempotencyStore: Store } = await import("@idempot/mysql-store");
  const store = new Store({ host: "localhost" });

  await store.close();

  if (originalCache) require.cache[mysql2Path] = originalCache;
  else delete require.cache[mysql2Path];

  t.ok(ended, "pool.end() was called");
  t.end();
});

test("MysqlIdempotencyStore - default constructor with testMode works", (t) => {
  const store = new MysqlIdempotencyStore({ testMode: true });
  t.ok(store, "store created without error");
  t.ok(store.testMode, "testMode is true");
  store.close();
  t.end();
});
