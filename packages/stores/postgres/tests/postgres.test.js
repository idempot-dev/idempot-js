// packages/stores/postgres/tests/postgres.test.js
import { test } from "tap";
import { runStoreTests } from "../../../core/tests/store-adapter-suite.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const createInMemoryMockPool = () => {
  const records = {};

  return {
    query: async (sql, params) => {
      if (sql.includes("CREATE TABLE")) {
        return { rows: [], rowCount: 0 };
      }

      const now = Date.now();

      if (sql.includes("INSERT")) {
        const [key, fingerprint, expiresAt] = params;
        records[key] = {
          key,
          fingerprint,
          status: "processing",
          expires_at: expiresAt,
          response_status: null,
          response_headers: null,
          response_body: null
        };
        return { rows: [], rowCount: 1 };
      }

      if (sql.includes("UPDATE") && sql.includes("WHERE key")) {
        const [responseStatus, responseHeaders, responseBody, key] = params;
        if (records[key]) {
          records[key].status = "complete";
          records[key].response_status = responseStatus;
          records[key].response_headers = responseHeaders;
          records[key].response_body = responseBody;
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sql.includes("DELETE") && sql.includes("expires_at")) {
        let deleted = 0;
        for (const key of Object.keys(records)) {
          if (records[key].expires_at <= now) {
            delete records[key];
            deleted++;
            if (deleted >= 10) break;
          }
        }
        return { rows: [], rowCount: deleted };
      }

      if (sql.includes("SELECT") && sql.includes("WHERE key")) {
        const row = records[params[0]];
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }

      if (sql.includes("SELECT") && sql.includes("WHERE fingerprint")) {
        const row = Object.values(records).find(
          (r) => r.fingerprint === params[0]
        );
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }

      return { rows: [], rowCount: 0 };
    },
    end: async () => {}
  };
};

const mockPool = createInMemoryMockPool();

// Cache-busting: clear require cache for pg and the store
const pgPath = require.resolve("pg");
delete require.cache[pgPath];

const originalPool = require("pg").Pool;
require.cache[pgPath] = {
  id: pgPath,
  filename: pgPath,
  loaded: true,
  exports: {
    Pool: function () {
      return mockPool;
    }
  }
};

const { PostgresIdempotencyStore } = await import("@idempot/postgres-store");

runStoreTests({
  name: "postgres",
  createStore: () => new PostgresIdempotencyStore()
});

test("PostgresIdempotencyStore - parseRecord handles null response_headers", async (t) => {
  const records = {};

  const mockPool = {
    query: async (sql, params) => {
      if (sql.includes("CREATE TABLE")) return { rows: [], rowCount: 0 };
      if (sql.includes("SELECT") && sql.includes("WHERE key")) {
        const row = records[params[0]];
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    },
    end: async () => {}
  };

  const testPath = require.resolve("pg");
  require.cache[testPath] = {
    id: testPath,
    filename: testPath,
    loaded: true,
    exports: {
      Pool: function () {
        return mockPool;
      }
    }
  };

  const { PostgresIdempotencyStore: Store2 } =
    await import("@idempot/postgres-store");
  const store = new Store2();

  records["test-key"] = {
    key: "test-key",
    fingerprint: "test-fp",
    status: "complete",
    response_status: 200,
    response_headers: null,
    response_body: "test"
  };

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

test("PostgresIdempotencyStore - close ends pool", async (t) => {
  let ended = false;

  class TestPool {
    query = async () => ({ rows: [], rowCount: 0 });
    end = async () => {
      ended = true;
    };
  }

  const testPath = require.resolve("pg");
  require.cache[testPath] = {
    id: testPath,
    filename: testPath,
    loaded: true,
    exports: { Pool: TestPool }
  };

  const { PostgresIdempotencyStore: Store2 } =
    await import("@idempot/postgres-store");
  const store = new Store2();
  await store.close();
  t.ok(ended, "pool should be ended");
  t.end();
});
