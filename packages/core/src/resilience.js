import CircuitBreaker from "opossum";

/**
 * @typedef {import("./store/interface.js").IdempotencyStore} IdempotencyStore
 */

/**
 * @typedef {Object} ResilienceOptions
 * @property {number} [timeoutMs=500]
 * @property {number} [maxRetries=3]
 * @property {number} [retryDelayMs=100]
 * @property {number} [errorThresholdPercentage=50]
 * @property {number} [resetTimeoutMs=30000]
 * @property {number} [volumeThreshold=10]
 */

const DEFAULT_RESILIENCE_OPTIONS = {
  timeoutMs: 500,
  maxRetries: 3,
  retryDelayMs: 100,
  errorThresholdPercentage: 50,
  resetTimeoutMs: 30000,
  volumeThreshold: 10
};

/**
 * Wrap store operations with resilience
 * @param {IdempotencyStore} store
 * @param {ResilienceOptions} [options]
 * @returns {{store: IdempotencyStore, circuit: any}}
 */
export function withResilience(store, options = {}) {
  const opts = { ...DEFAULT_RESILIENCE_OPTIONS, ...options };

  const breakerOptions = {
    timeout: opts.timeoutMs,
    errorThresholdPercentage: opts.errorThresholdPercentage,
    resetTimeout: opts.resetTimeoutMs,
    volumeThreshold: opts.volumeThreshold
  };

  /**
   * @param {() => Promise<any>} operation
   * @returns {Promise<any>}
   */
  const withRetry = async (operation) => {
    let lastError;
    for (let i = 0; i < opts.maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (i < opts.maxRetries - 1) {
          await new Promise((r) => setTimeout(r, opts.retryDelayMs));
        }
      }
    }
    throw lastError;
  };

  const breaker = new CircuitBreaker(withRetry, breakerOptions);

  /** @type {IdempotencyStore} */
  const wrappedStore = {
    /**
     * @param {string} key
     * @param {string} fingerprint
     * @returns {Promise<{byKey: import("./interface.js").IdempotencyRecord | null, byFingerprint: import("./interface.js").IdempotencyRecord | null}>}
     */
    async lookup(key, fingerprint) {
      return breaker.fire(() => store.lookup(key, fingerprint));
    },

    /**
     * @param {string} key
     * @param {string} fingerprint
     * @param {number} ttlMs
     * @returns {Promise<void>}
     */
    async startProcessing(key, fingerprint, ttlMs) {
      return breaker.fire(() => store.startProcessing(key, fingerprint, ttlMs));
    },

    /**
     * @param {string} key
     * @param {{status: number, headers: Record<string, string>, body: string}} response
     * @returns {Promise<void>}
     */
    async complete(key, response) {
      return breaker.fire(() => store.complete(key, response));
    },

    async close() {
      return store.close();
    }
  };

  return { store: wrappedStore, circuit: breaker };
}
