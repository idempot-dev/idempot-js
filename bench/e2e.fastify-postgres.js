import { PostgresIdempotencyStore } from "../packages/stores/postgres/index.js";
import { createFastifyApp, send } from "./lib/fastify-harness.js";
import { createE2EBenchmarkModule } from "./lib/e2e-module.js";

let schemaCounter = 0;

/**
 * Create a store in a fresh, uniquely named schema so each phase (warmup
 * and timed) starts with an empty table. The store's constructor fires
 * initSchema() without awaiting it, so poll until the table answers.
 */
async function createStore() {
  schemaCounter += 1;
  const store = new PostgresIdempotencyStore({
    host: "localhost",
    port: 5432,
    database: "test",
    user: "idempot",
    password: "idempot",
    schema: `bench_pg_${process.pid}_${schemaCounter}`
  });
  let lastError;
  for (let i = 0; i < 50; i++) {
    try {
      await store.pool.query(
        `SELECT 1 FROM ${store.quotedSchemaIdentifier}.idempotency_records LIMIT 1`
      );
      return store;
    } catch (e) {
      // A down database will never become ready; fail with the real
      // error instead of misattributing it to DDL timing.
      if (e?.code === "ECONNREFUSED") {
        throw e;
      }
      lastError = e;
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  throw new Error(
    `idempotency_records table not ready for schema bench_pg_${process.pid}_${schemaCounter} after 1s (last error: ${lastError?.message ?? "unknown"})`
  );
}

async function teardownStore(state) {
  if (state.store) {
    try {
      await state.store.pool.query(
        `DROP SCHEMA IF EXISTS ${state.store.quotedSchemaIdentifier} CASCADE`
      );
    } finally {
      // The pool is released even when the DROP fails (lost connection).
      await state.store.close();
      state.store = null;
      state.app = null;
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
  state.app = createFastifyApp(state.store);
  return {
    send: (opts) => send(state.app, opts),
    close: () => teardownStore(state)
  };
}

function createBaselineRun() {
  const app = createFastifyApp(null);
  return {
    send: (opts) => send(app, opts),
    close: async () => {}
  };
}

export default createE2EBenchmarkModule({
  name: "e2e.fastify-postgres",
  createRun,
  createBaselineRun,
  settleMs: 50
});
