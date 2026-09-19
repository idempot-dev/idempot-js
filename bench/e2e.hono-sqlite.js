import { Hono } from "hono";
import { idempotency } from "../packages/frameworks/hono/index.js";
import { SqliteIdempotencyStore } from "../packages/stores/sqlite/index.js";
import { BASE_BODY, BASE_HEADERS } from "./lib/fixtures.js";
import { createE2EBenchmarkModule } from "./lib/e2e-module.js";

const BODY = JSON.stringify(BASE_BODY);

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

function ensureMiddlewareState(state) {
  if (!state.store) {
    state.store = new SqliteIdempotencyStore({ path: ":memory:" });
    state.app = createMiddlewareApp(state.store);
  }
  return state.app;
}

async function teardownMiddlewareState(state) {
  if (state.store) {
    await state.store.close();
    state.store = null;
    state.app = null;
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
  name: "e2e.hono-sqlite",
  createRun,
  createBaselineRun
});
