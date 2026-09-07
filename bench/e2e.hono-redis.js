import { Hono } from "hono";
import Redis from "ioredis";
import { idempotency } from "../packages/frameworks/hono/index.js";
import { RedisIdempotencyStore } from "../packages/stores/redis/node-redis.js";
import { createKeyFactory } from "./lib/keys.js";

const MODULE_NAME = "e2e.hono-redis";
const FRESH_KEY_TASK = "middleware (fresh key)";
const REPEAT_KEY_TASK = "middleware (repeat key)";
const BASELINE_TASK = "baseline (no middleware)";
const nextKey = createKeyFactory(19);

// Unique request-body factory for the fresh-key task: the middleware
// rejects a fresh key whose payload fingerprint matches an earlier record
// (checkLookupConflicts returns 409), so each timed iteration needs a
// unique key AND a unique body to exercise the full claim chain.
let freshBodyCounter = 0;
const nextFreshBody = () => {
  freshBodyCounter += 1;
  return JSON.stringify({
    orderId: `ord-2026-${String(freshBodyCounter).padStart(6, "0")}`,
    amount: 4999,
    currency: "usd",
    items: [{ sku: "SKU-001", qty: 1 }]
  });
};

const REDIS_OPTIONS = { host: "127.0.0.1", port: 6379 };

const BASE_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json"
};

const BODY = JSON.stringify({
  orderId: "ord-2026-000001",
  amount: 4999,
  currency: "usd",
  items: [{ sku: "SKU-001", qty: 1 }]
});

let clientCounter = 0;

/**
 * Create a store backed by a fresh ioredis client with a unique keyPrefix
 * so each phase (warmup and timed) starts with an empty keyspace. The
 * client-level keyPrefix (not the store prefix) is what namespaces the
 * store's fingerprint keys, mirroring tests/integration/shared/redis.js.
 */
async function createStore() {
  clientCounter += 1;
  const prefix = `bench_r${clientCounter}`;
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
      await cleaner.quit();
      await state.redis.client.quit();
      state.redis = null;
      state.store = null;
      state.app = null;
    }
  }
}

/**
 * End-to-end per-request overhead of the hono middleware backed by a live
 * redis store. Same three timed paths as e2e.hono-sqlite:
 *
 * - "middleware (fresh key)": unique key AND unique body per request —
 *   the full fingerprint -> lookup -> startProcessing -> handler ->
 *   complete chain (a repeated body on a fresh key would hit the
 *   fingerprint-conflict 409 path instead).
 * - "middleware (repeat key)": the same key re-sent after a priming
 *   request (beforeAll, outside timing) — the lookup -> cached-replay path.
 * - "baseline (no middleware)": the identical app and request without the
 *   middleware, so the derived overhead metrics are a like-for-like delta.
 *
 * Requires a reachable redis on 127.0.0.1:6379 (no auth; same
 * prerequisites as the integration tests).
 *
 * Lifecycle: tinybench runs the warmup AND the timed phase for every task,
 * each with its own beforeAll/afterAll cycle — so clients are created
 * lazily per phase under a unique keyPrefix and cleaned+closed in
 * afterAll, keeping setup and teardown outside the timed regions.
 *
 * The derived overhead numbers (overhead_delta_ms, overhead_pct) are
 * computed from the paired medians by derive() — they are informational;
 * the ±15% variance gate applies to the raw timings (AE2 scoping).
 */
export default {
  name: "e2e.hono-redis",
  register(bench) {
    const state = {};
    bench.add(
      FRESH_KEY_TASK,
      async () => {
        const res = await send(await ensureMiddlewareState(state), {
          key: nextKey("key"),
          body: nextFreshBody()
        });
        if (res.status !== 200) {
          throw new Error(
            `middleware fresh-key request failed: HTTP ${res.status}`
          );
        }
      },
      {
        beforeAll: async () => {
          // Construct the store/app outside the timed region and verify the
          // middleware path actually answers 200 — a 409/400/503 fast-fail
          // would otherwise be timed and reported as a fast success.
          const res = await send(await ensureMiddlewareState(state), {
            key: nextKey("key"),
            body: nextFreshBody()
          });
          if (res.status !== 200) {
            throw new Error(
              `middleware fresh-key request failed: HTTP ${res.status}`
            );
          }
        },
        afterAll: () => teardownMiddlewareState(state)
      }
    );

    const repeatState = {};
    const repeatKey = nextKey("key");
    bench.add(
      REPEAT_KEY_TASK,
      async () => {
        const res = await send(await ensureMiddlewareState(repeatState), {
          key: repeatKey
        });
        if (res.status !== 200) {
          throw new Error(
            `middleware repeat-key request failed: HTTP ${res.status}`
          );
        }
      },
      {
        beforeAll: async () => {
          // Prime the cache-hit path: first request completes and stores
          // the response; every timed iteration then replays it. Runs once
          // per phase (warmup and timed) against a fresh store, so the
          // priming request is always the first on the record. Also
          // verifies the replay path answers 200.
          const res = await send(await ensureMiddlewareState(repeatState), {
            key: repeatKey
          });
          if (res.status !== 200) {
            throw new Error(
              `middleware repeat-key request failed: HTTP ${res.status}`
            );
          }
        },
        afterAll: () => teardownMiddlewareState(repeatState)
      }
    );

    const baselineApp = createBaselineApp();
    bench.add(BASELINE_TASK, async () => {
      await send(baselineApp);
    });
  },

  /**
   * Derive the overhead metrics from this module's aggregated results.
   * Receives rows of { module, task, median_ops_s, median_ms, rme_pct }.
   */
  derive(moduleResults) {
    const fresh = moduleResults.find((row) => row.task === FRESH_KEY_TASK);
    const baseline = moduleResults.find((row) => row.task === BASELINE_TASK);
    if (!fresh || !baseline || !baseline.median_ms) {
      return [];
    }
    const deltaMs = fresh.median_ms - baseline.median_ms;
    return [
      { name: `${MODULE_NAME}.overhead_delta_ms`, value: deltaMs },
      {
        name: `${MODULE_NAME}.overhead_pct`,
        value: (deltaMs / baseline.median_ms) * 100
      }
    ];
  }
};
