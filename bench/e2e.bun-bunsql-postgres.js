import { Pool } from "pg";
import { BunSqlIdempotencyStore } from "../packages/stores/bun-sql/index.js";
import { createHandler, send } from "./lib/bun-harness.js";
import { createE2EBenchmarkModule } from "./lib/e2e-module.js";

const POSTGRES_URL = "postgres://idempot:idempot@localhost:5432/test";

let schemaCounter = 0;

/**
 * Create a store in a fresh, uniquely named schema so each phase (warmup
 * and timed) starts with an empty table. The schema is pre-created via
 * pg (same as tests/runtime/bun/bun-sql-integration.test.js) and handed
 * to the store through the connection string's search_path.
 */
async function createStore() {
  schemaCounter += 1;
  // The pid namespaces the schema so concurrent suite runs on one
  // machine cannot drop each other's schemas mid-phase.
  const schema = `bench_pg_${process.pid}_${schemaCounter}`;
  const pool = new Pool({
    host: "localhost",
    port: 5432,
    database: "test",
    user: "idempot",
    password: "idempot"
  });
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await pool.end();
  const store = new BunSqlIdempotencyStore(
    `${POSTGRES_URL}?search_path=${schema}`
  );
  return { store, schema };
}

async function teardownStore(state) {
  if (state.store) {
    try {
      await state.store.close();
    } finally {
      // The schema is dropped even when the store close fails.
      const pool = new Pool({
        host: "localhost",
        port: 5432,
        database: "test",
        user: "idempot",
        password: "idempot"
      });
      await pool.query(`DROP SCHEMA IF EXISTS ${state.schema} CASCADE`);
      await pool.end();
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
  const { store, schema } = await createStore();
  state.store = store;
  state.schema = schema;
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
  name: "e2e.bun-bunsql-postgres",
  createRun,
  createBaselineRun
});
