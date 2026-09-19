import mysql from "mysql2/promise";
import { BunSqlIdempotencyStore } from "../packages/stores/bun-sql/index.js";
import { createKeyFactory } from "./lib/keys.js";
import { createBodyFactory, createHandler, send } from "./lib/bun-harness.js";

const MODULE_NAME = "e2e.bun-bunsql-mysql";
const MYSQL_URL = "mysql://idempot:idempot@localhost:3306/test";
const FRESH_KEY_TASK = "middleware (fresh key)";
const REPEAT_KEY_TASK = "middleware (repeat key)";
const BASELINE_TASK = "baseline (no middleware)";
const nextKey = createKeyFactory(19);
const nextBody = createBodyFactory();

/**
 * Create a store against a fresh table so each phase (warmup and timed)
 * starts empty. The bun-sql store uses a fixed table name
 * (idempotency_records), so isolation comes from dropping the table
 * before the new store's lazy ensureSchema() creates it (same teardown
 * shape as tests/runtime/bun/bun-sql-integration.test.js).
 */
async function createStore() {
  const connection = await mysql.createConnection({
    host: "localhost",
    port: 3306,
    user: "idempot",
    password: "idempot",
    database: "test"
  });
  await connection.query("DROP TABLE IF EXISTS idempotency_records");
  await connection.end();
  // Bun >= 1.4 refuses the MySQL caching_sha2_password RSA public-key
  // handshake over insecure connections unless explicitly allowed.
  return new BunSqlIdempotencyStore(MYSQL_URL, {
    allowPublicKeyRetrieval: true
  });
}

async function teardownStore(state) {
  if (state.store) {
    try {
      await state.store.close();
    } finally {
      // The table is dropped even when the store close fails. The table
      // name is fixed by the bun-sql store, so concurrent bun-mysql runs
      // on one machine share it (residual limitation, not fixable here).
      const connection = await mysql.createConnection({
        host: "localhost",
        port: 3306,
        user: "idempot",
        password: "idempot",
        database: "test"
      });
      await connection.query("DROP TABLE IF EXISTS idempotency_records");
      await connection.end();
      state.store = null;
      state.handler = null;
    }
  }
}

/**
 * End-to-end per-request overhead of the bun middleware (Bun runtime)
 * backed by the bun-sql store on a live mysql, driven in-process by
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
 * mysql on localhost:3306 with database `test` and user
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
  name: "e2e.bun-bunsql-mysql",
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
