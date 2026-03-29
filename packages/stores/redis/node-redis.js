/**
 * @typedef {import("@idempot/core").IdempotencyRecord} IdempotencyRecord
 * @typedef {import("@idempot/core").IdempotencyStore} IdempotencyStore
 */

/** @typedef {import("ioredis").Redis} Redis */

/**
 * @typedef {Object} RedisIdempotencyStoreOptions
 * @property {Redis} client - The Redis client instance
 * @property {string} [prefix] - Key prefix (default: "idempotency:")
 */

/**
 * @implements {IdempotencyStore}
 */
export class RedisIdempotencyStore {
  /**
   * Close the Redis connection
   * @returns {Promise<void>}
   */
  async close() {
    await this.client.quit();
  }
  /**
   * @type {Redis}
   */
  client;

  /**
   * @type {string}
   */
  prefix;

  /**
   * @param {RedisIdempotencyStoreOptions} options
   */
  constructor(options) {
    this.client = options.client;
    this.prefix = options.prefix ?? "idempotency:";
  }

  /**
   * Look up an idempotency record by key and fingerprint
   * @param {string} key - The request key
   * @param {string} fingerprint - The request fingerprint
   * @returns {Promise<{byKey: IdempotencyRecord | null, byFingerprint: IdempotencyRecord | null}>}
   */
  async lookup(key, fingerprint) {
    // Pipeline for parallel execution
    const pipeline = this.client.pipeline();
    pipeline.get(`${this.prefix}${key}`);
    pipeline.get(`fingerprint:${fingerprint}`);
    const results = await pipeline.exec();

    if (!results) {
      return { byKey: null, byFingerprint: null };
    }

    const [[, byKeyJson], [, fpKeyJson]] =
      /** @type {[[Error | null, string | null], [Error | null, string | null]]} */ (
        results
      );

    // Parse record by key
    const byKey = byKeyJson ? JSON.parse(byKeyJson) : null;

    // If fingerprint found, fetch that record
    let byFingerprint = null;
    if (fpKeyJson) {
      const recordJson = await this.client.get(`${this.prefix}${fpKeyJson}`);
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
    const record = {
      key,
      fingerprint,
      status: "processing",
      expiresAt: Date.now() + ttlMs
    };

    const ttlSeconds = Math.ceil(ttlMs / 1000);

    // Pipeline both writes
    const pipeline = this.client.pipeline();
    pipeline.setex(`${this.prefix}${key}`, ttlSeconds, JSON.stringify(record));
    pipeline.setex(`fingerprint:${fingerprint}`, ttlSeconds, key);
    await pipeline.exec();
  }

  /**
   * Mark a request as complete with its response
   * @param {string} key - The request key
   * @param {{status: number, headers: Record<string, string>, body: string}} response - The response object
   * @returns {Promise<void>}
   * @throws {Error} If no record found for key
   */
  async complete(key, response) {
    // Fetch existing record
    const existingJson = await this.client.get(`${this.prefix}${key}`);
    if (!existingJson) {
      throw new Error(`No record found for key: ${key}`);
    }

    const record = JSON.parse(existingJson);
    record.status = "complete";
    record.response = response;

    // Get remaining TTL and re-set with updated record
    const ttl = await this.client.ttl(`${this.prefix}${key}`);
    if (ttl > 0) {
      await this.client.setex(
        `${this.prefix}${key}`,
        ttl,
        JSON.stringify(record)
      );
    } else {
      throw new Error(`Record expired or missing for key: ${key}`);
    }
  }
}
