import { Hono } from "hono";
import { idempotency } from "../packages/frameworks/hono/index.js";
import { MysqlIdempotencyStore } from "../packages/stores/mysql/node-mysql.js";
import { createKeyFactory } from "./lib/keys.js";
import { BASE_BODY, BASE_HEADERS, createBodyFactory } from "./lib/fixtures.js";

const MODULE_NAME = "e2e.hono-mysql";
const FRESH_KEY_TASK = "middleware (fresh key)";
const REPEAT_KEY_TASK = "middleware (repeat key)";
const BASELINE_TASK = "baseline (no middleware)";
const nextKey = createKeyFactory(19);

const nextFreshBody = createBodyFactory();

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
 * End-to-end per-request overhead of the hono middleware backed by a live
 * mysql store. Same three timed paths as e2e.hono-sqlite:
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
 * Requires a reachable mysql on localhost:3306 with database `test` and
 * user `idempot`/`idempot` (same prerequisites as the integration tests).
 *
 * Lifecycle: tinybench runs the warmup AND the timed phase for every task,
 * each with its own beforeAll/afterAll cycle — so stores are created
 * lazily per phase in a unique table and dropped+closed in afterAll,
 * keeping setup and teardown outside the timed regions.
 *
 * The derived overhead numbers (overhead_delta_ms, overhead_pct) are
 * computed from the paired medians by derive() — they are informational;
 * the ±15% variance gate applies to the raw timings (AE2 scoping).
 */
export default {
  name: "e2e.hono-mysql",
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
