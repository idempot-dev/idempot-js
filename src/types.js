/**
 * @typedef {Object} IdempotencyRecord
 * @property {string} key
 * @property {string} fingerprint
 * @property {"processing" | "complete"} status
 * @property {{status: number, headers: Record<string, string>, body: string}} [response]
 * @property {number} expiresAt
 */

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

/**
 * @typedef {Object} IdempotencyStore
 * @property {(key: string, fingerprint: string) => Promise<{byKey: IdempotencyRecord | null, byFingerprint: IdempotencyRecord | null}>} lookup
 * @property {(key: string, fingerprint: string, ttlMs: number) => Promise<void>} startProcessing
 * @property {(key: string, response: {status: number, headers: Record<string, string>, body: string}) => Promise<void>} complete
 * @property {() => Promise<void>} cleanup
 */

export {};
