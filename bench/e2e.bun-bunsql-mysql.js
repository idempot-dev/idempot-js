import mysql from "mysql2/promise";
import { BunSqlIdempotencyStore } from "../packages/stores/bun-sql/index.js";
import { createHandler, send } from "./lib/bun-harness.js";
import { createE2EBenchmarkModule } from "./lib/e2e-module.js";

const MYSQL_URL = "mysql://idempot:idempot@localhost:3306/test";

/**
 * Create a store against a fresh table so each phase (warmup and timed)
 * starts empty. The bun-sql store uses a fixed table name
 * (idempotency_records), so isolation comes from dropping the table
 * before the new store's lazy ensureSchema() creates it (same teardown
 * shape as tests/runtime/bun/bun-sql-integration.test.js).
 */
async function createStore() {
  const connection = await mysql.createConnection({
    host: "localhost",
    port: 3306,
    user: "idempot",
    password: "idempot",
    database: "test"
  });
  await connection.query("DROP TABLE IF EXISTS idempotency_records");
  await connection.end();
  // Bun >= 1.4 refuses the MySQL caching_sha2_password RSA public-key
  // handshake over insecure connections unless explicitly allowed.
  return new BunSqlIdempotencyStore(MYSQL_URL, {
    allowPublicKeyRetrieval: true
  });
}

async function teardownStore(state) {
  if (state.store) {
    try {
      await state.store.close();
    } finally {
      // The table is dropped even when the store close fails. The table
      // name is fixed by the bun-sql store, so concurrent bun-mysql runs
      // on one machine share it (residual limitation, not fixable here).
      const connection = await mysql.createConnection({
        host: "localhost",
        port: 3306,
        user: "idempot",
        password: "idempot",
        database: "test"
      });
      await connection.query("DROP TABLE IF EXISTS idempotency_records");
      await connection.end();
      state.store = null;
      state.handler = null;
    }
  }
}

/**
 * Three timed paths and the shared lifecycle are documented in
 * createE2EBenchmarkModule (bench/lib/e2e-module.js).
 */
async function createRun() {
  const state = {};
  state.store = await createStore();
  state.handler = createHandler(state.store);
  return {
    send: (opts) => send(state.handler, opts),
    close: () => teardownStore(state)
  };
}

function createBaselineRun() {
  const handler = createHandler(null);
  return {
    send: (opts) => send(handler, opts),
    close: async () => {}
  };
}

export default createE2EBenchmarkModule({
  name: "e2e.bun-bunsql-mysql",
  createRun,
  createBaselineRun
});
