import Redis from "ioredis";
import { RedisIdempotencyStore } from "../packages/stores/redis/node-redis.js";
import { createKeyFactory } from "./lib/keys.js";
import {
  createBodyFactory,
  createFastifyApp,
  send,
  settle
} from "./lib/fastify-harness.js";

const MODULE_NAME = "e2e.fastify-redis";
const FRESH_KEY_TASK = "middleware (fresh key)";
const REPEAT_KEY_TASK = "middleware (repeat key)";
const BASELINE_TASK = "baseline (no middleware)";
const nextKey = createKeyFactory(19);
const nextBody = createBodyFactory();

const REDIS_OPTIONS = { host: "127.0.0.1", port: 6379 };

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
      await cleaner.quit();
      await state.redis.client.quit();
      state.redis = null;
      state.store = null;
      state.app = null;
    }
  }
}

/**
 * End-to-end per-request overhead of the fastify middleware backed by a
 * live redis store, driven in-process via app.inject() (no socket —
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
 * Requires a reachable redis on 127.0.0.1:6379 with no auth (same
 * prerequisites as the integration tests); the module fails fast with a
 * connection error when the server is unreachable.
 *
 * Lifecycle: tinybench runs the warmup AND the timed phase for every task,
 * each with its own beforeAll/afterAll cycle — so clients are created
 * lazily per phase with a unique prefix and cleaned up in afterAll,
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
  name: "e2e.fastify-redis",
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
          state.redis = await createStore();
          state.store = state.redis.store;
          state.app = createFastifyApp(state.redis.store);
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
          repeatState.redis = await createStore();
          repeatState.store = repeatState.redis.store;
          repeatState.app = createFastifyApp(repeatState.redis.store);
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
