import { Pool } from "pg";
import { BunSqlIdempotencyStore } from "../packages/stores/bun-sql/index.js";
import { createKeyFactory } from "./lib/keys.js";
import { createBodyFactory, createHandler, send } from "./lib/bun-harness.js";

const MODULE_NAME = "e2e.bun-bunsql-postgres";
const POSTGRES_URL = "postgres://idempot:idempot@localhost:5432/test";
const FRESH_KEY_TASK = "middleware (fresh key)";
const REPEAT_KEY_TASK = "middleware (repeat key)";
const BASELINE_TASK = "baseline (no middleware)";
const nextKey = createKeyFactory(19);
const nextBody = createBodyFactory();

let schemaCounter = 0;

/**
 * Create a store in a fresh, uniquely named schema so each phase (warmup
 * and timed) starts with an empty table. The schema is pre-created via
 * pg (same as tests/runtime/bun/bun-sql-integration.test.js) and handed
 * to the store through the connection string's search_path.
 */
async function createStore() {
  schemaCounter += 1;
  const schema = `bench_pg_${schemaCounter}`;
  const pool = new Pool({
    host: "localhost",
    port: 5432,
    database: "test",
    user: "idempot",
    password: "idempot"
  });
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await pool.end();
  return new BunSqlIdempotencyStore(`${POSTGRES_URL}?search_path=${schema}`);
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
 * End-to-end per-request overhead of the bun middleware (Bun runtime)
 * backed by the bun-sql store on a live postgres, driven in-process by
 * calling the wrapped Request => Response handler directly. Three timed
 * paths:
 *
 * - "middleware (fresh key)": unique key AND unique body per request —
 *   the full fingerprint -> lookup -> startProcessing -> handler ->
 *   complete chain (a repeated body on a fresh key would hit the
 *   fingerprint-conflict 409 path instead).
 * - "middleware (repeat key)": the same key and body re-sent after a
 *   priming request (beforeAll, outside timing) — the lookup ->
 *   cached-replay path.
 * - "baseline (no middleware)": the identical handler and request without
 *   the middleware, so the derived overhead metrics are a like-for-like
 *   delta.
 *
 * Requires the Bun runtime (run via `pnpm bench:bun`) and a reachable
 * postgres on localhost:5432 with database `test` and user
 * `idempot`/`idempot` (same prerequisites as the integration tests); the
 * module fails fast with a connection error when the server is
 * unreachable. The bun wrapper awaits store.complete() inside the
 * handler, so no settle delay is needed between the priming request and
 * the timed phase.
 *
 * The derived overhead numbers (overhead_delta_ms, overhead_pct) are
 * computed from the paired medians by derive() — they are informational;
 * the ±15% variance gate applies to the raw timings (AE2 scoping).
 */
export default {
  name: "e2e.bun-bunsql-postgres",
  register(bench) {
    const state = {};
    bench.add(
      FRESH_KEY_TASK,
      async () => {
        const status = await send(state.handler, {
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
          // Construct the store/handler outside the timed region and
          // verify the middleware path actually answers 200.
          state.store = await createStore();
          state.schema = `bench_pg_${schemaCounter}`;
          state.handler = createHandler(state.store);
          const status = await send(state.handler, {
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
        const status = await send(repeatState.handler, { key: repeatKey });
        if (status !== 200) {
          throw new Error(
            `middleware repeat-key request failed: HTTP ${status}`
          );
        }
      },
      {
        beforeAll: async () => {
          // Prime the cache-hit path: the priming request completes and
          // stores the response; every timed iteration then replays it.
          // complete() is awaited inside the wrapper, so the record is
          // stored before timing starts.
          repeatState.store = await createStore();
          repeatState.schema = `bench_pg_${schemaCounter}`;
          repeatState.handler = createHandler(repeatState.store);
          const status = await send(repeatState.handler, { key: repeatKey });
          if (status !== 200) {
            throw new Error(
              `middleware repeat-key request failed: HTTP ${status}`
            );
          }
        },
        afterAll: () => teardownStore(repeatState)
      }
    );

    const baselineHandler = createHandler(null);
    bench.add(BASELINE_TASK, async () => {
      const status = await send(baselineHandler);
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
