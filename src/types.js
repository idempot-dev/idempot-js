/** @typedef {import("./store/interface.js").IdempotencyStore} IdempotencyStore */

/**
 * @typedef {Object} IdempotencyOptions
 * @property {boolean} [required]
 * @property {number} [ttlMs]
 * @property {string[]} [excludeFields]
 * @property {IdempotencyStore} [store]
 * @property {string} [headerName]
 * @property {number} [maxKeyLength]
 * @property {ResilienceOptions} [resilience]
 */

/**
 * @typedef {Object} ResilienceOptions
 * @property {number} [timeout=500]
 * @property {number} [maxRetries=3]
 * @property {number} [retryDelay=100]
 * @property {number} [errorThresholdPercentage=50]
 * @property {number} [resetTimeout=30000]
 * @property {number} [volumeThreshold=10]
 */

export {};
