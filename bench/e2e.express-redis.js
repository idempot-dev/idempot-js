import Redis from "ioredis";
import { RedisIdempotencyStore } from "../packages/stores/redis/node-redis.js";
import {
  createExpressApp,
  startServer,
  stopServer
} from "./lib/express-harness.js";
import { createE2EBenchmarkModule } from "./lib/e2e-module.js";

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
 * Three timed paths and the shared lifecycle are documented in
 * createE2EBenchmarkModule (bench/lib/e2e-module.js).
 */
async function createRun() {
  const redis = await createStore();
  const { server, send } = await startServer(createExpressApp(redis.store));
  return {
    send,
    close: async () => {
      try {
        await stopServer(server);
      } finally {
        await teardownStore(redis);
      }
    }
  };
}

async function createBaselineRun() {
  const { server, send } = await startServer(createExpressApp(null));
  return {
    send,
    close: () => stopServer(server)
  };
}

export default createE2EBenchmarkModule({
  name: "e2e.express-redis",
  createRun,
  createBaselineRun,
  settleMs: 50
});
