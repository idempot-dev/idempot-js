/**
 * Creates an in-memory store that simulates Deno Redis operations
 * @returns {Map<string, any> & {expiryTimers: Map<string, number>}}
 */
function createInMemoryStore() {
  const store = new Map();
  store.expiryTimers = new Map();
  return store;
}

/**
 * Creates a fake Redis client for Deno testing
 * Uses an in-memory Map to simulate Redis operations
 *
 * @param {Map<string, any> & {expiryTimers: Map<string, number>}} [sharedStore] - Optional shared store
 * @returns {object} Fake Redis client
 */
export function createFakeRedisClient(sharedStore) {
  const store = sharedStore || createInMemoryStore();

  return {
    __store: store,

    async get(key) {
      return store.get(key) ?? null;
    },

    async set(key, value, options) {
      store.set(key, value);
      if (options?.expireIn) {
        store.expiryTimers.set(key, Date.now() + options.expireIn * 1000);
      }
      return "OK";
    },

    async close() {
      // No-op for fake client
    }
  };
}