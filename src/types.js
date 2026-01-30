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
 */

/**
 * @typedef {Object} IdempotencyStore
 * @property {(key: string, fingerprint: string) => Promise<{byKey: IdempotencyRecord | null, byFingerprint: IdempotencyRecord | null}>} lookup
 * @property {(key: string, fingerprint: string, ttlMs: number) => Promise<void>} startProcessing
 * @property {(key: string, response: {status: number, headers: Record<string, string>, body: string}) => Promise<void>} complete
 * @property {() => Promise<void>} cleanup
 */

export {};
