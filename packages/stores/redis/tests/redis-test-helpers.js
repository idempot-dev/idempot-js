import sinon from "sinon";

/**
 * Creates an in-memory store that simulates Redis operations
 * @returns {Map<string, any> & {expiryTimers: Map<string, number>}}
 */
function createInMemoryStore() {
  const store = new Map();
  store.expiryTimers = new Map();
  return store;
}

/**
 * Creates a fake Redis client for unit testing using sinon fakes
 * Uses an in-memory Map to simulate Redis operations
 *
 * @returns {object} Fake Redis client with sinon spies
 */
export function createFakeRedisClient() {
  const store = createInMemoryStore();

  const client = {
    __store: store,

    get: sinon.fake(async (key) => {
      return store.get(key) ?? null;
    }),

    setex: sinon.fake(async (key, ttlSeconds, value) => {
      store.set(key, value);
      store.expiryTimers.set(key, Date.now() + ttlSeconds * 1000);
      return "OK";
    }),

    del: sinon.fake(async (key) => {
      const existed = store.has(key);
      store.delete(key);
      return existed ? 1 : 0;
    }),

    ttl: sinon.fake(async (key) => {
      const expiry = store.expiryTimers.get(key);
      if (!expiry) return -2;
      const remaining = Math.ceil((expiry - Date.now()) / 1000);
      return remaining > 0 ? remaining : -2;
    }),

    quit: sinon.fake.resolves(undefined),

    pipeline: sinon.fake(() => {
      const commands = [];
      const pipelineObj = {
        get: (key) => {
          commands.push(["get", key]);
          return pipelineObj;
        },
        setex: (key, ttl, value) => {
          commands.push(["setex", key, ttl, value]);
          return pipelineObj;
        },
        exec: sinon.fake(async () => {
          const results = [];
          for (const [cmd, ...args] of commands) {
            if (cmd === "get") {
              const val = store.get(args[0]) ?? null;
              results.push([null, val]);
            } else if (cmd === "setex") {
              const [key, ttl, value] = args;
              store.set(key, value);
              store.expiryTimers.set(key, Date.now() + ttl * 1000);
              results.push([null, "OK"]);
            }
          }
          return results;
        })
      };
      return pipelineObj;
    })
  };

  return client;
}