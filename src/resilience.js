import CircuitBreaker from "opossum";

/**
 * @typedef {import("./types.js").ResilienceOptions} ResilienceOptions
 * @typedef {import("./types.js").IdempotencyStore} IdempotencyStore
 */

const DEFAULT_RESILIENCE_OPTIONS = {
  timeout: 500,
  maxRetries: 3,
  retryDelay: 100,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 10
};

/**
 * Wrap store operations with resilience
 * @param {IdempotencyStore} store
 * @param {ResilienceOptions} options
 * @returns {{store: IdempotencyStore, circuit: import("opossum").CircuitBreaker}}
 */
export function withResilience(store, options = {}) {
  const opts = { ...DEFAULT_RESILIENCE_OPTIONS, ...options };

  const breakerOptions = {
    timeout: opts.timeout,
    errorThresholdPercentage: opts.errorThresholdPercentage,
    resetTimeout: opts.resetTimeout,
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
          await new Promise((r) => setTimeout(r, opts.retryDelay));
        }
      }
    }
    throw lastError;
  };

  const breaker = new CircuitBreaker(withRetry, breakerOptions);

  const wrappedStore = {
    async lookup(key, fingerprint) {
      return breaker.fire(() => store.lookup(key, fingerprint));
    },

    async startProcessing(key, fingerprint, ttlMs) {
      return breaker.fire(() => store.startProcessing(key, fingerprint, ttlMs));
    },

    async complete(key, response) {
      return breaker.fire(() => store.complete(key, response));
    },

    async cleanup() {
      return store.cleanup();
    }
  };

  return { store: wrappedStore, circuit: breaker };
}
