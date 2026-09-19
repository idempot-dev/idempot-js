import { Hono } from "hono";
import { idempotency } from "../packages/frameworks/hono/index.js";
import { MysqlIdempotencyStore } from "../packages/stores/mysql/node-mysql.js";
import { BASE_BODY, BASE_HEADERS } from "./lib/fixtures.js";
import { createE2EBenchmarkModule } from "./lib/e2e-module.js";

const BODY = JSON.stringify(BASE_BODY);

let tableCounter = 0;

/**
 * Create a store backed by a fresh, uniquely named table so each phase
 * (warmup and timed) starts with an empty table. Unlike the postgres
 * store, the mysql store does not create its table, so the DDL runs here
 * (same shape as tests/integration/shared/mysql-helpers.js initMysqlSchema).
 */
async function createStore() {
  tableCounter += 1;
  // The pid namespaces the table so concurrent suite runs on one
  // machine cannot drop each other's tables mid-phase.
  const tableName = `bench_mysql_${process.pid}_${tableCounter}`;
  const store = new MysqlIdempotencyStore({
    host: "localhost",
    port: 3306,
    database: "test",
    user: "idempot",
    password: "idempot",
    tableName: `bench_mysql_${process.pid}_${tableCounter}`
  });
  await store.pool.query(`
    CREATE TABLE IF NOT EXISTS \`${tableName}\` (
      \`key\` VARCHAR(255) PRIMARY KEY,
      fingerprint VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL,
      response_status INT,
      response_headers TEXT,
      response_body TEXT,
      expires_at BIGINT NOT NULL,
      INDEX idx_fingerprint (fingerprint),
      INDEX idx_expires_at (expires_at)
    )
  `);
  return store;
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
        `DROP TABLE IF EXISTS \`${state.store.tableName}\``
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
  name: "e2e.hono-mysql",
  createRun,
  createBaselineRun
});
