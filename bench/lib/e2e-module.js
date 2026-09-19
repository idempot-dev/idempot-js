import { createKeyFactory } from "./keys.js";
import { createBodyFactory } from "./fixtures.js";

export const FRESH_KEY_TASK = "middleware (fresh key)";
export const REPEAT_KEY_TASK = "middleware (repeat key)";
export const BASELINE_TASK = "baseline (no middleware)";

function settle(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Shared scaffold for the e2e benchmark modules. Every module measures the
 * same three timed paths:
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
 * Lifecycle: tinybench runs the warmup AND the timed phase for every
 * task, each with its own beforeAll/afterAll cycle — so each phase gets a
 * fresh run (store, app/server/handler) via createRun()/createBaselineRun()
 * and releases it in afterAll, keeping setup and teardown outside the
 * timed regions.
 *
 * The derived overhead numbers (overhead_delta_ms, overhead_pct) are
 * computed from the paired medians by derive() — they are informational;
 * the ±15% variance discipline applies to run-to-run medians (AE2 scoping).
 *
 * @param {Object} options
 * @param {string} options.name - module name, e.g. "e2e.hono-sqlite"
 * @param {() => Promise<{send: (opts: {key?: string, body?: string}) => Promise<number>, close: () => Promise<void>}>} options.createRun
 *   Create one middleware run: store plus app/server/handler wiring. The
 *   store must be fresh per phase (unique schema/table/prefix/in-memory)
 *   so warmup and timed phases both start empty.
 * @param {() => Promise<{send: (opts: {key?: string, body?: string}) => Promise<number>, close: () => Promise<void>}>} options.createBaselineRun
 *   Create one baseline run: the identical transport without middleware.
 * @param {number} [options.settleMs=0] - settle delay after the repeat-key
 *   priming request, for middleware whose record completion runs
 *   fire-and-forget after the response arrives (express, fastify). Not
 *   needed when the middleware awaits store.complete() inside the request
 *   (hono, bun).
 * @returns {{name: string, register: (bench: Object) => void, derive: (moduleResults: Array) => Array}}
 */
export function createE2EBenchmarkModule({
  name,
  createRun,
  createBaselineRun,
  settleMs = 0
}) {
  const nextKey = createKeyFactory(19);
  const nextBody = createBodyFactory();

  return {
    name,
    register(bench) {
      const state = {};
      bench.add(
        FRESH_KEY_TASK,
        async () => {
          const status = await state.run.send({
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
            // the middleware path actually answers 200 — a 409/400/503
            // fast-fail would otherwise be timed and reported as a fast
            // success.
            state.run = await createRun();
            const status = await state.run.send({
              key: nextKey("key"),
              body: nextBody()
            });
            if (status !== 200) {
              throw new Error(
                `middleware fresh-key request failed: HTTP ${status}`
              );
            }
          },
          afterAll: () => state.run.close()
        }
      );

      const repeatState = {};
      const repeatKey = nextKey("key");
      bench.add(
        REPEAT_KEY_TASK,
        async () => {
          const status = await repeatState.run.send({ key: repeatKey });
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
            // Settle when the middleware's completion is fire-and-forget,
            // so the priming write has landed before timing starts.
            repeatState.run = await createRun();
            const status = await repeatState.run.send({ key: repeatKey });
            if (status !== 200) {
              throw new Error(
                `middleware repeat-key request failed: HTTP ${status}`
              );
            }
            if (settleMs > 0) {
              await settle(settleMs);
            }
          },
          afterAll: () => repeatState.run.close()
        }
      );

      const baselineState = {};
      bench.add(
        BASELINE_TASK,
        async () => {
          const status = await baselineState.run.send();
          if (status !== 200) {
            throw new Error(`baseline request failed: HTTP ${status}`);
          }
        },
        {
          beforeAll: async () => {
            baselineState.run = await createBaselineRun();
          },
          afterAll: () => baselineState.run.close()
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
        { name: `${name}.overhead_delta_ms`, value: deltaMs },
        {
          name: `${name}.overhead_pct`,
          value: (deltaMs / baseline.median_ms) * 100
        }
      ];
    }
  };
}
