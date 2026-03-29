/**
 * @typedef {Object} IdempotencyRecord
 * @property {string} key
 * @property {string} fingerprint
 * @property {"processing" | "complete"} status
 * @property {{status: number, headers: Record<string, string>, body: string}} [response]
 * @property {number} expiresAt
 */

/**
 * @typedef {Object} IdempotencyStore
 * @property {(key: string, fingerprint: string) => Promise<{byKey: IdempotencyRecord | null, byFingerprint: IdempotencyRecord | null}>} lookup
 * @property {(key: string, fingerprint: string, ttlMs: number) => Promise<void>} startProcessing
 * @property {(key: string, response: {status: number, headers: Record<string, string>, body: string}) => Promise<void>} complete
 * @property {() => Promise<void>} close
 */

// @ts-nocheck - Deno runtime only
import { connect } from "@db/redis";

/**
 * @typedef {Object} RedisIdempotencyStoreOptions
 * @property {string} [hostname] - Redis hostname
 * @property {number} [port] - Redis port
 * @property {string} [prefix] - Key prefix (default: "idempotency:")
 */

export class RedisIdempotencyStore {
  /** @type {any} */
  redis = null;
  /** @type {string} */
  prefix;

  /**
   * @param {RedisIdempotencyStoreOptions} [options]
   */
  constructor(options = {}) {
    this.prefix = options.prefix ?? "idempotency:";
  }

  async close() {
    if (this.redis) {
      await this.redis.close();
    }
  }

  /**
   * Look up an idempotency record by key and fingerprint
   * @param {string} key - The request key
   * @param {string} fingerprint - The request fingerprint
   * @returns {Promise<{byKey: IdempotencyRecord | null, byFingerprint: IdempotencyRecord | null}>}
   */
  async lookup(key, fingerprint) {
    await this.init();
    const [byKeyJson, fpKeyJson] = await Promise.all([
      this.redis.get(`${this.prefix}${key}`),
      this.redis.get(`fingerprint:${fingerprint}`)
    ]);

    const byKey = byKeyJson ? JSON.parse(byKeyJson) : null;

    let byFingerprint = null;
    if (fpKeyJson) {
      const recordJson = await this.redis.get(`${this.prefix}${fpKeyJson}`);
      byFingerprint = recordJson ? JSON.parse(recordJson) : null;
    }

    return { byKey, byFingerprint };
  }

  /**
   * Start processing a request
   * @param {string} key - The request key
   * @param {string} fingerprint - The request fingerprint
   * @param {number} ttlMs - Time to live in milliseconds
   * @returns {Promise<void>}
   */
  async startProcessing(key, fingerprint, ttlMs) {
    await this.init();
    const ttlSeconds = Math.ceil(ttlMs / 1000);
    const record = {
      key,
      fingerprint,
      status: "processing",
      expiresAt: Date.now() + ttlMs
    };

    await Promise.all([
      this.redis.set(`${this.prefix}${key}`, JSON.stringify(record), {
        expireIn: ttlSeconds
      }),
      this.redis.set(`fingerprint:${fingerprint}`, key, {
        expireIn: ttlSeconds
      })
    ]);
  }

  /**
   * Mark a request as complete with its response
   * @param {string} key - The request key
   * @param {{status: number, headers: Record<string, string>, body: string}} response - The response object
   * @returns {Promise<void>}
   * @throws {Error} If no record found for key
   */
  async complete(key, response) {
    await this.init();
    const existingJson = await this.redis.get(`${this.prefix}${key}`);
    if (!existingJson) {
      throw new Error(`No record found for key: ${key}`);
    }

    const record = JSON.parse(existingJson);
    record.status = "complete";
    record.response = response;

    const ttlMs = record.expiresAt - Date.now();
    const ttlSeconds = Math.ceil(ttlMs / 1000);

    if (ttlSeconds <= 0) {
      throw new Error(`Record expired for key: ${key}`);
    }

    await this.redis.set(`${this.prefix}${key}`, JSON.stringify(record), {
      expireIn: ttlSeconds
    });
  }

  /**
   * @returns {Promise<void>}
   */
  async init() {
    if (!this.redis) {
      this.redis = await connect({ hostname: "127.0.0.1", port: 6379 });
    }
  }
}
