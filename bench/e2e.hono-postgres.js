import { Hono } from "hono";
import { idempotency } from "../packages/frameworks/hono/index.js";
import { PostgresIdempotencyStore } from "../packages/stores/postgres/index.js";
import { BASE_BODY, BASE_HEADERS } from "./lib/fixtures.js";
import { createE2EBenchmarkModule } from "./lib/e2e-module.js";

const BODY = JSON.stringify(BASE_BODY);

let schemaCounter = 0;

/**
 * Create a store in a fresh, uniquely named schema so each phase (warmup
 * and timed) starts with an empty table. The schema name carries the
 * process id so concurrent suite runs on one machine cannot collide on
 * (and tear down each other's) namespaces. The store's constructor fires
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

function createMiddlewareApp(store) {
  const app = new Hono();
  app.post("/pay", idempotency({ store }), (c) => c.json({ ok: true }));
  return app;
}

function createBaselineApp() {
  const app = new Hono();
  app.post("/pay", (c) => c.json({ ok: true }));
  return app;
}

function send(app, { key, body = BODY } = {}) {
  const headers = { ...BASE_HEADERS };
  if (key) {
    headers["Idempotency-Key"] = key;
  }
  return app.request("http://localhost/pay", {
    method: "POST",
    headers,
    body
  });
}

async function ensureMiddlewareState(state) {
  if (!state.store) {
    state.store = await createStore();
    state.app = createMiddlewareApp(state.store);
  }
  return state.app;
}

async function teardownMiddlewareState(state) {
  if (state.store) {
    try {
      await state.store.pool.query(
        `DROP SCHEMA IF EXISTS ${state.store.quotedSchemaIdentifier} CASCADE`
      );
    } finally {
      // The pool is released even when the DROP fails (lost connection),
      // so a flaky database cannot leak it.
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
  await ensureMiddlewareState(state);
  return {
    send: (opts) =>
      Promise.resolve(send(state.app, opts)).then((res) => res.status),
    close: () => teardownMiddlewareState(state)
  };
}

function createBaselineRun() {
  const app = createBaselineApp();
  return {
    send: (opts) => Promise.resolve(send(app, opts)).then((res) => res.status),
    close: async () => {}
  };
}

export default createE2EBenchmarkModule({
  name: "e2e.hono-postgres",
  createRun,
  createBaselineRun
});
