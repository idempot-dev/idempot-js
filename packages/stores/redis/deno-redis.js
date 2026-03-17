// @ts-nocheck - Deno runtime only
import { connect } from "@db/redis";

/**
 * @typedef {Object} DenoRedisIdempotencyStoreOptions
 * @property {string} [hostname] - Redis hostname
 * @property {number} [port] - Redis port
 * @property {string} [prefix] - Key prefix (default: "idempotency:")
 * @property {boolean} [testMode] - Use in-memory store instead of Redis
 */

export class DenoRedisIdempotencyStore {
  /** @type {any} */
  redis = null;
  /** @type {string} */
  prefix;
  /** @type {boolean} */
  testMode;

  /** @type {Map<string, IdempotencyRecord>} */
  #testStore = new Map();

  /**
   * @param {DenoRedisIdempotencyStoreOptions} [options]
   */
  constructor(options = {}) {
    this.prefix = options.prefix ?? "idempotency:";
    this.testMode = options.testMode ?? false;
  }

  close() {
    // Redis connection will be closed when the test ends
  }

  /**
   * @param {string} key
   * @param {string} fingerprint
   * @returns {Promise<{byKey: IdempotencyRecord | null, byFingerprint: IdempotencyRecord | null}>}
   */
  async lookup(key, fingerprint) {
    if (this.testMode) {
      return {
        byKey: this.#testStore.get(key) ?? null,
        byFingerprint: this.#testStore.get(`fp:${fingerprint}`) ?? null
      };
    }

    await this.init();
    const [byKey, byFingerprint] = await Promise.all([
      this.redis.get(`${this.prefix}${key}`),
      this.redis.get(`${this.prefix}fp:${fingerprint}`)
    ]);

    return {
      byKey: byKey ? JSON.parse(byKey) : null,
      byFingerprint: byFingerprint ? JSON.parse(byFingerprint) : null
    };
  }

  /**
   * @param {string} key
   * @param {string} fingerprint
   * @param {number} ttlMs
   * @returns {Promise<void>}
   */
  async startProcessing(key, fingerprint, ttlMs) {
    if (this.testMode) {
      const record = {
        key,
        fingerprint,
        status: "processing",
        expiresAt: Date.now() + ttlMs
      };
      this.#testStore.set(key, record);
      this.#testStore.set(`fp:${fingerprint}`, record);
      return;
    }

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
      this.redis.set(
        `${this.prefix}fp:${fingerprint}`,
        JSON.stringify(record),
        { expireIn: ttlSeconds }
      )
    ]);
  }

  /**
   * @param {string} key
   * @param {{status: number, headers: Record<string, string>, body: string}} response
   * @returns {Promise<void>}
   */
  async complete(key, response) {
    if (this.testMode) {
      const existing = this.#testStore.get(key);
      if (!existing) {
        throw new Error(`No record found for key: ${key}`);
      }
      const record = {
        ...existing,
        status: "complete",
        response
      };
      this.#testStore.set(key, record);
      this.#testStore.set(`fp:${existing.fingerprint}`, record);
      return;
    }

    await this.init();
    const existing = await this.redis.get(`${this.prefix}${key}`);
    if (!existing) {
      throw new Error(`No record found for key: ${key}`);
    }

    const record = JSON.parse(existing);
    const ttlMs = record.expiresAt - Date.now();
    const ttlSeconds = Math.ceil(ttlMs / 1000);

    const updatedRecord = {
      ...record,
      status: "complete",
      response
    };

    await this.redis.set(
      `${this.prefix}${key}`,
      JSON.stringify(updatedRecord),
      { expireIn: ttlSeconds }
    );
  }

  /**
   * @returns {Promise<void>}
   */
  async init() {
    if (!this.redis && !this.testMode) {
      this.redis = await connect({ hostname: "127.0.0.1", port: 6379 });
    }
  }
}
