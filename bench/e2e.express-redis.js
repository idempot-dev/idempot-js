import Redis from "ioredis";
import { RedisIdempotencyStore } from "../packages/stores/redis/node-redis.js";
import { createKeyFactory } from "./lib/keys.js";
import {
  createBodyFactory,
  createExpressApp,
  settle,
  startServer,
  stopServer
} from "./lib/express-harness.js";

const MODULE_NAME = "e2e.express-redis";
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
  // The pid namespaces the prefix so concurrent suite runs on one
  // machine cannot delete each other's keys mid-phase.
  const prefix = `bench_r${process.pid}_${clientCounter}`;
  const client = new Redis({ ...REDIS_OPTIONS, keyPrefix: `${prefix}:` });
  const store = new RedisIdempotencyStore({ client });
  return { store, client, prefix };
}

async function teardownStore(redis) {
  // Delete through an unprefixed client: the traffic client's keyPrefix
  // would double-prefix DEL arguments.
  const cleaner = new Redis(REDIS_OPTIONS);
  try {
    const keys = await cleaner.keys(`${redis.prefix}:*`);
    if (keys.length > 0) {
      await cleaner.del(...keys);
    }
  } finally {
    try {
      await cleaner.quit();
    } finally {
      // Each client quits even when the other's quit rejects.
      await redis.client.quit();
    }
  }
}

/**
 * End-to-end per-request overhead of the express middleware backed by a
 * live redis store, measured over real HTTP (ephemeral port, undici
 * keep-alive). Same three timed paths as the other e2e modules; see
 * bench/lib/express-harness.js and e2e.express-sqlite.js for the
 * fresh-key body uniqueness rationale and lifecycle notes.
 *
 * Requires a reachable redis on 127.0.0.1:6379 (no auth; same
 * prerequisites as the integration tests).
 */
export default {
  name: "e2e.express-redis",
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
          state.redis = await createStore();
          const { server, send } = await startServer(
            createExpressApp(state.redis.store)
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
            // The redis clients are released even when the server close fails.
            await teardownStore(state.redis);
            state.redis = null;
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
          repeatState.redis = await createStore();
          const { server, send } = await startServer(
            createExpressApp(repeatState.redis.store)
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
            // The redis clients are released even when the server close fails.
            await teardownStore(repeatState.redis);
            repeatState.redis = null;
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
