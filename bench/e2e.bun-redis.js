import Redis from "ioredis";
import { RedisIdempotencyStore } from "../packages/stores/redis/node-redis.js";
import { createKeyFactory } from "./lib/keys.js";
import { createBodyFactory, createHandler, send } from "./lib/bun-harness.js";

const MODULE_NAME = "e2e.bun-redis";
const REDIS_OPTIONS = { host: "127.0.0.1", port: 6379 };
const FRESH_KEY_TASK = "middleware (fresh key)";
const REPEAT_KEY_TASK = "middleware (repeat key)";
const BASELINE_TASK = "baseline (no middleware)";
const nextKey = createKeyFactory(19);
const nextBody = createBodyFactory();

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

async function teardownStore(state) {
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
        state.handler = null;
      }
    }
  }
}

/**
 * End-to-end per-request overhead of the bun middleware (Bun runtime)
 * backed by the node-redis store (ioredis — pure JS, runtime-agnostic),
 * driven in-process by calling the wrapped Request => Response handler
 * directly. Three timed paths:
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
 * redis on 127.0.0.1:6379 with no auth (same prerequisites as the
 * integration tests); the module fails fast with a connection error when
 * the server is unreachable. The bun wrapper awaits store.complete()
 * inside the handler, so no settle delay is needed between the priming
 * request and the timed phase.
 *
 * The derived overhead numbers (overhead_delta_ms, overhead_pct) are
 * computed from the paired medians by derive() — they are informational;
 * the ±15% variance gate applies to the raw timings (AE2 scoping).
 */
export default {
  name: "e2e.bun-redis",
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
          state.redis = await createStore();
          state.store = state.redis.store;
          state.handler = createHandler(state.redis.store);
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
          repeatState.redis = await createStore();
          repeatState.store = repeatState.redis.store;
          repeatState.handler = createHandler(repeatState.redis.store);
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
