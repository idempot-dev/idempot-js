/**
 * @typedef {import("@idempot/core").IdempotencyRecord} IdempotencyRecord
 * @typedef {import("@idempot/core").IdempotencyStore} IdempotencyStore
 */

import { createRequire } from "module";

const require = createRequire(import.meta.url);

/**
 * @typedef {Object} MysqlIdempotencyStoreOptions
 * @property {string} [connectionString] - MySQL connection string
 * @property {string} [host] - MySQL host
 * @property {number} [port] - MySQL port
 * @property {string} [user] - MySQL user
 * @property {string} [password] - MySQL password
 * @property {string} [database] - MySQL database
 * @property {import("mysql2/promise").PoolOptions} [connection] - Additional pool options
 */

/**
 * @implements {IdempotencyStore}
 */
export class MysqlIdempotencyStore {
  /**
   * @type {import("mysql2/promise").Pool}
   */
  pool;

  /**
   * @param {MysqlIdempotencyStoreOptions} [options]
   */
  constructor(options = {}) {
    const mysql = require("mysql2/promise");
    this.pool = mysql.createPool(options);
  }

  /**
   * Close the database connection
   * @returns {Promise<void>}
   */
  async close() {
    await this.pool.end();
  }

  /**
   * Parse a database row into an IdempotencyRecord
   * @private
   * @param {any} row
   * @returns {IdempotencyRecord | null}
   */
  parseRecord(row) {
    if (!row) return null;

    return {
      key: row.key,
      fingerprint: row.fingerprint,
      status: row.status,
      response: row.response_status
        ? {
            status: row.response_status,
            headers: JSON.parse(row.response_headers || "{}"),
            body: row.response_body
          }
        : undefined,
      expiresAt: row.expires_at
    };
  }

  /**
   * Look up an idempotency record
   * @param {string} key
   * @param {string} fingerprint
   * @returns {Promise<{byKey: IdempotencyRecord | null, byFingerprint: IdempotencyRecord | null}>}
   */
  async lookup(key, fingerprint) {
    await this.pool.query(
      "DELETE FROM idempotency_records WHERE expires_at <= ?",
      [Date.now()]
    );

    /** @type {any[]} */
    const byKeyResult = await this.pool.query(
      "SELECT * FROM idempotency_records WHERE `key` = ?",
      [key]
    );
    /** @type {any[]} */
    const byFingerprintResult = await this.pool.query(
      "SELECT * FROM idempotency_records WHERE fingerprint = ?",
      [fingerprint]
    );

    return {
      byKey: this.parseRecord(byKeyResult[0]?.[0]),
      byFingerprint: this.parseRecord(byFingerprintResult[0]?.[0])
    };
  }

  /**
   * Start processing a request
   * @param {string} key
   * @param {string} fingerprint
   * @param {number} ttlMs
   * @returns {Promise<void>}
   */
  async startProcessing(key, fingerprint, ttlMs) {
    await this.pool.query(
      "INSERT INTO idempotency_records (`key`, fingerprint, status, expires_at) VALUES (?, ?, 'processing', ?)",
      [key, fingerprint, Date.now() + ttlMs]
    );
  }

  /**
   * Mark a request as complete
   * @param {string} key
   * @param {{status: number, headers: Record<string, string>, body: string}} response
   * @returns {Promise<void>}
   */
  async complete(key, response) {
    /** @type {any} */
    const result = await this.pool.query(
      "UPDATE idempotency_records SET status = 'complete', response_status = ?, response_headers = ?, response_body = ? WHERE `key` = ?",
      [response.status, JSON.stringify(response.headers), response.body, key]
    );

    if (result[0]?.affectedRows === 0) {
      throw new Error(`No record found for key: ${key}`);
    }
  }
}
