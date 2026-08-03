/**
 * @typedef {import("@idempot/core").IdempotencyRecord} IdempotencyRecord
 * @typedef {import("@idempot/core").IdempotencyStore} IdempotencyStore
 */

/** @typedef {import("ioredis").Redis} Redis */

import { IdempotencyKeyExistsError } from "@idempot/core";

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

    // Atomically claim the key so only one concurrent request wins. SET ... NX
    // resolves "OK" for the winner only; the loser gets null and surfaces the
    // conflict via IdempotencyKeyExistsError (mirrors the SQL stores' integrity
    // error translation), routing the loser to 409/200 in the middleware.
    const pipeline = this.client.pipeline();
    pipeline.set(
      `${this.prefix}${key}`,
      JSON.stringify(record),
      "EX",
      ttlSeconds,
      "NX"
    );
    // Fingerprint index is non-unique (multiple keys may share a fingerprint,
    // matching the SQL stores and deno-redis), so it is a plain SET, not NX.
    pipeline.set(`fingerprint:${fingerprint}`, key, "EX", ttlSeconds);
    const results = await pipeline.exec();

    if (!results) {
      throw new Error("Redis pipeline failed");
    }

    // ioredis exec returns [err, result] per command; surface a real driver
    // error (infra failure -> 503) rather than misreporting it as a conflict.
    const [keyErr, keyResult] = results[0];
    if (keyErr) {
      throw keyErr;
    }
    if (keyResult !== "OK") {
      throw new IdempotencyKeyExistsError(
        `Idempotency key already exists: ${key}`
      );
    }
    // The fingerprint-index SET shares the same pipeline; surface its driver
    // error too, so a partial write (key claimed, index missing) is not
    // reported as success and silently bypasses byFingerprint dedup.
    const [fpErr] = results[1] ?? [];
    if (fpErr) {
      throw fpErr;
    }
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
