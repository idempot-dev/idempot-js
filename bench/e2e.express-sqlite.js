import { SqliteIdempotencyStore } from "../packages/stores/sqlite/index.js";
import { createKeyFactory } from "./lib/keys.js";
import {
  createBodyFactory,
  createExpressApp,
  settle,
  startServer,
  stopServer
} from "./lib/express-harness.js";

const MODULE_NAME = "e2e.express-sqlite";
const FRESH_KEY_TASK = "middleware (fresh key)";
const REPEAT_KEY_TASK = "middleware (repeat key)";
const BASELINE_TASK = "baseline (no middleware)";
const nextKey = createKeyFactory(19);
const nextBody = createBodyFactory();

/**
 * End-to-end per-request overhead of the express middleware backed by the
 * sqlite in-memory store, measured over real HTTP (ephemeral port, undici
 * keep-alive). Three timed paths:
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
 * Lifecycle: tinybench runs the warmup AND the timed phase for every task,
 * each with its own beforeAll/afterAll cycle — so stores and servers are
 * created lazily per phase and closed in afterAll, keeping setup and
 * teardown outside the timed regions. The express middleware completes
 * the record via res.on("finish") fire-and-forget, so beforeAll settles
 * briefly after the priming request before timing starts.
 *
 * The derived overhead numbers (overhead_delta_ms, overhead_pct) are
 * computed from the paired medians by derive() — they are informational;
 * the ±15% variance gate applies to the raw timings (AE2 scoping).
 */
export default {
  name: "e2e.express-sqlite",
  register(bench) {
    const state = {};
    bench.add(
      FRESH_KEY_TASK,
      async () => {
        const status = await state.send({
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
          // Construct the store/server outside the timed region and verify
          // the middleware path actually answers 200.
          state.store = new SqliteIdempotencyStore({ path: ":memory:" });
          const { server, send } = await startServer(
            createExpressApp(state.store)
          );
          state.server = server;
          state.send = send;
          const status = await send({ key: nextKey("key"), body: nextBody() });
          if (status !== 200) {
            throw new Error(
              `middleware fresh-key request failed: HTTP ${status}`
            );
          }
        },
        afterAll: async () => {
          try {
            await stopServer(state.server);
          } finally {
            // The store is released even when the server close fails.
            await state.store.close();
            state.store = null;
          }
        }
      }
    );

    const repeatState = {};
    const repeatKey = nextKey("key");
    bench.add(
      REPEAT_KEY_TASK,
      async () => {
        const status = await repeatState.send({ key: repeatKey });
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
          repeatState.store = new SqliteIdempotencyStore({ path: ":memory:" });
          const { server, send } = await startServer(
            createExpressApp(repeatState.store)
          );
          repeatState.server = server;
          repeatState.send = send;
          const status = await send({ key: repeatKey });
          if (status !== 200) {
            throw new Error(
              `middleware repeat-key request failed: HTTP ${status}`
            );
          }
          await settle();
        },
        afterAll: async () => {
          try {
            await stopServer(repeatState.server);
          } finally {
            // The store is released even when the server close fails.
            await repeatState.store.close();
            repeatState.store = null;
          }
        }
      }
    );

    bench.add(
      BASELINE_TASK,
      async () => {
        const status = await state.baselineSend();
        if (status !== 200) {
          throw new Error(`baseline request failed: HTTP ${status}`);
        }
      },
      {
        beforeAll: async () => {
          const { server, send } = await startServer(createExpressApp(null));
          state.baselineServer = server;
          state.baselineSend = send;
        },
        afterAll: async () => {
          await stopServer(state.baselineServer);
          state.baselineSend = null;
        }
      }
    );
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
