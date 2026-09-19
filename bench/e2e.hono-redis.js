import { Hono } from "hono";
import Redis from "ioredis";
import { idempotency } from "../packages/frameworks/hono/index.js";
import { RedisIdempotencyStore } from "../packages/stores/redis/node-redis.js";
import { BASE_BODY, BASE_HEADERS } from "./lib/fixtures.js";
import { createE2EBenchmarkModule } from "./lib/e2e-module.js";

const REDIS_OPTIONS = { host: "127.0.0.1", port: 6379 };

const BODY = JSON.stringify(BASE_BODY);

let clientCounter = 0;

/**
 * Create a store backed by a fresh ioredis client with a unique keyPrefix
 * so each phase (warmup and timed) starts with an empty keyspace. The
 * client-level keyPrefix (not the store prefix) is what namespaces the
 * store's fingerprint keys, mirroring tests/integration/shared/redis.js.
 */
async function createStore() {
  clientCounter += 1;
  // The pid namespaces the prefix so concurrent suite runs on one
  // machine cannot delete each other's keys mid-phase.
  const prefix = `bench_r${process.pid}_${clientCounter}`;
  const client = new Redis({ ...REDIS_OPTIONS, keyPrefix: `${prefix}:` });
  const store = new RedisIdempotencyStore({ client });
  return { store, client, prefix };
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
  if (!state.redis) {
    state.redis = await createStore();
    state.store = state.redis.store;
    state.app = createMiddlewareApp(state.redis.store);
  }
  return state.app;
}

async function teardownMiddlewareState(state) {
  if (state.redis) {
    // Delete through an unprefixed client: the traffic client's keyPrefix
    // would double-prefix DEL arguments.
    const cleaner = new Redis(REDIS_OPTIONS);
    try {
      const keys = await cleaner.keys(`${state.redis.prefix}:*`);
      if (keys.length > 0) {
        await cleaner.del(...keys);
      }
    } finally {
      try {
        await cleaner.quit();
      } finally {
        // Each client quits even when the other's quit rejects.
        await state.redis.client.quit();
        state.redis = null;
        state.store = null;
        state.app = null;
      }
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
  name: "e2e.hono-redis",
  createRun,
  createBaselineRun
});
