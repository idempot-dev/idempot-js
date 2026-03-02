/**
 * @typedef {import("./store/interface.js").IdempotencyStore} IdempotencyStore
 * @typedef {import("./resilience.js").ResilienceOptions} ResilienceOptions
 */

/**
 * @typedef {Object} IdempotencyOptions
 * @property {boolean} [required] - Whether the Idempotency-Key header is required for all requests
 * @property {number} [ttlMs] - Time-to-live in milliseconds for idempotency records
 * @property {string[]} [excludeFields] - Body fields to exclude when generating the request fingerprint
 * @property {IdempotencyStore} [store] - The storage backend for persisting idempotency records
 * @property {number} [maxKeyLength] - Maximum allowed length for the Idempotency-Key header value
 * @property {ResilienceOptions} [resilience] - Circuit breaker and retry configuration for store operations
 */

/** @type {Required<IdempotencyOptions>} */
const DEFAULT_OPTIONS = {
  /** Whether the Idempotency-Key header is required. When false, requests without the header pass through unchanged. */
  required: false,

  /** Time-to-live in milliseconds for storing idempotency records. Default is 24 hours (86400000ms). */
  ttlMs: 86400000,

  /** List of body fields to exclude when generating the fingerprint. Useful for fields that change on every request (e.g., timestamps). */
  excludeFields: [],

  /** The storage backend for persisting idempotency records. Must be provided by the user. */
  store: /** @type {any} */ (null),

  /** Maximum allowed length for the Idempotency-Key header value. Default is 255 characters. */
  maxKeyLength: 255,

  /** Configuration for the circuit breaker and retry logic when interacting with the store. */
  resilience: {
    /** Timeout in milliseconds for each store operation. Default is 500ms. */
    timeout: 500,
    /** Maximum number of retry attempts for failed operations. Default is 3. */
    maxRetries: 3,
    /** Delay in milliseconds between retry attempts. Default is 100ms. */
    retryDelay: 100,
    /** Error threshold percentage that triggers the circuit breaker. Default is 50%. */
    errorThresholdPercentage: 50,
    /** Time in milliseconds to wait before attempting to reset the circuit breaker. Default is 30000ms (30 seconds). */
    resetTimeout: 30000,
    /** Minimum number of requests required before the circuit breaker can trigger. Default is 10. */
    volumeThreshold: 10
  }
};

export { DEFAULT_OPTIONS };
