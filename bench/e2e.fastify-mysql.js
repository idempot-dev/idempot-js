import { MysqlIdempotencyStore } from "../packages/stores/mysql/node-mysql.js";
import { createKeyFactory } from "./lib/keys.js";
import {
  createBodyFactory,
  createFastifyApp,
  send,
  settle
} from "./lib/fastify-harness.js";

const MODULE_NAME = "e2e.fastify-mysql";
const FRESH_KEY_TASK = "middleware (fresh key)";
const REPEAT_KEY_TASK = "middleware (repeat key)";
const BASELINE_TASK = "baseline (no middleware)";
const nextKey = createKeyFactory(19);
const nextBody = createBodyFactory();

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

async function teardownStore(state) {
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
 * End-to-end per-request overhead of the fastify middleware backed by a
 * live mysql store, driven in-process via app.inject() (no socket —
 * same measurement class as the hono modules). Three timed paths:
 *
 * - "middleware (fresh key)": unique key AND unique body per request —
 *   the full fingerprint -> lookup -> startProcessing -> handler ->
 *   complete chain (a repeated body on a fresh key would hit the
 *   fingerprint-conflict 409 path instead).
 * - "middleware (repeat key)": the same key and body re-sent after a
 *   priming request (beforeAll, outside timing) — the lookup ->
 *   cached-replay path.
 * - "baseline (no middleware)": the identical app and request without the
 *   middleware, so the derived overhead metrics are a like-for-like delta.
 *
 * Requires a reachable mysql on localhost:3306 with database `test` and
 * user `idempot`/`idempot` (same prerequisites as the integration tests);
 * the module fails fast with a connection error when the server is
 * unreachable.
 *
 * Lifecycle: tinybench runs the warmup AND the timed phase for every task,
 * each with its own beforeAll/afterAll cycle — so stores are created
 * lazily per phase with a unique table and dropped+closed in afterAll,
 * keeping setup and teardown outside the timed regions. The fastify
 * middleware completes the record via reply.then() fire-and-forget, so
 * beforeAll settles briefly after the priming request before timing
 * starts.
 *
 * The derived overhead numbers (overhead_delta_ms, overhead_pct) are
 * computed from the paired medians by derive() — they are informational;
 * the ±15% variance gate applies to the raw timings (AE2 scoping).
 */
export default {
  name: "e2e.fastify-mysql",
  register(bench) {
    const state = {};
    bench.add(
      FRESH_KEY_TASK,
      async () => {
        const status = await send(state.app, {
          key: nextKey("key"),
          body: nextBody()
        });
        if (status !== 200) {
          throw new Error(
            `middleware fresh-key request failed: HTTP ${status}`
          );
        }
      },
      {
        beforeAll: async () => {
          // Construct the store/app outside the timed region and verify
          // the middleware path actually answers 200.
          state.store = await createStore();
          state.app = createFastifyApp(state.store);
          const status = await send(state.app, {
            key: nextKey("key"),
            body: nextBody()
          });
          if (status !== 200) {
            throw new Error(
              `middleware fresh-key request failed: HTTP ${status}`
            );
          }
        },
        afterAll: () => teardownStore(state)
      }
    );

    const repeatState = {};
    const repeatKey = nextKey("key");
    bench.add(
      REPEAT_KEY_TASK,
      async () => {
        const status = await send(repeatState.app, { key: repeatKey });
        if (status !== 200) {
          throw new Error(
            `middleware repeat-key request failed: HTTP ${status}`
          );
        }
      },
      {
        beforeAll: async () => {
          // Prime the cache-hit path: first request completes and stores
          // the response; every timed iteration then replays it. Settle so
          // the priming request's async complete() has landed before the
          // first timed iteration.
          repeatState.store = await createStore();
          repeatState.app = createFastifyApp(repeatState.store);
          const status = await send(repeatState.app, { key: repeatKey });
          if (status !== 200) {
            throw new Error(
              `middleware repeat-key request failed: HTTP ${status}`
            );
          }
          await settle();
        },
        afterAll: () => teardownStore(repeatState)
      }
    );

    const baselineApp = createFastifyApp(null);
    bench.add(BASELINE_TASK, async () => {
      const status = await send(baselineApp);
      if (status !== 200) {
        throw new Error(`baseline request failed: HTTP ${status}`);
      }
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
