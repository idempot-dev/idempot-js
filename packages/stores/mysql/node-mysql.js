/**
 * @typedef {import("@idempot/core").IdempotencyRecord} IdempotencyRecord
 * @typedef {import("@idempot/core").IdempotencyStore} IdempotencyStore
 */

import { createRequire } from "module";
import { IdempotencyKeyExistsError } from "@idempot/core";

const require = createRequire(import.meta.url);

/**
 * Probe whether a user-supplied mysql2 pool was created with
 * multipleStatements enabled. mysql2 exposes its connection options at
 * pool.config.connectionConfig on the callback Pool and at
 * pool.pool.config.connectionConfig on the promise wrapper. Anything else
 * (other drivers, fakes, plain connections) is treated as not supporting
 * multiple statements and keeps the two-query lookup.
 *
 * @private
 * @param {any} pool
 * @returns {boolean}
 */
function poolSupportsMultipleStatements(pool) {
  const raw = pool?.pool ?? pool;
  return raw?.config?.connectionConfig?.multipleStatements === true;
}

/**
 * @typedef {Object} MysqlIdempotencyStoreOptions
 * @property {string} [connectionString] - MySQL connection string
 * @property {string} [host] - MySQL host
 * @property {number} [port] - MySQL port
 * @property {string} [user] - MySQL user
 * @property {string} [password] - MySQL password
 * @property {string} [database] - MySQL database
 * @property {string} [tableName] - MySQL table name (default: "idempotency_records")
 * @property {import("mysql2/promise").PoolOptions} [connection] - Additional pool options
 * @property {import("mysql2/promise").Pool} [pool] - Optional pre-configured pool (for testing)
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
   * @type {string}
   */
  tableName;

  /**
   * Whether the pool supports multiple statements in one query. Only
   * guaranteed for pools created by this store.
   * @type {boolean}
   */
  multipleStatements;

  /**
   * @param {MysqlIdempotencyStoreOptions} [options]
   */
  constructor(options = {}) {
    const { tableName = "idempotency_records", pool, ...poolOptions } = options;
    this.tableName = tableName;
    if (pool) {
      this.pool = pool;
      this.multipleStatements = poolSupportsMultipleStatements(pool);
    } else /* c8 ignore start */ {
      const mysql = require("mysql2/promise");
      this.pool = mysql.createPool({
        ...poolOptions,
        // The store owns this pool and all its queries bind values as
        // placeholders, so batching the lookup into one round trip is safe.
        multipleStatements: true
      });
      this.multipleStatements = true;
      /* c8 ignore stop */
    } /* c8 ignore next */
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
    const now = Date.now();
    /** @type {any[]} */
    let rows;
    if (this.multipleStatements) {
      // Store-owned pool: cleanup and lookup in a single round trip.
      const [results] = await this.pool.query(
        `DELETE FROM \`${this.tableName}\` WHERE expires_at <= ? LIMIT 10; SELECT * FROM \`${this.tableName}\` WHERE (\`key\` = ? AND expires_at > ?) OR (fingerprint = ? AND expires_at > ?)`,
        [now, key, now, fingerprint, now]
      );
      rows = results[1];
    } else {
      await this.pool.query(
        `DELETE FROM \`${this.tableName}\` WHERE expires_at <= ? LIMIT 10`,
        [now]
      );

      // One round trip instead of two: match on key OR fingerprint, then
      // disambiguate by value. `key` is the primary key so at most one row
      // can match it; the fingerprint index is not unique (transient
      // concurrent 'processing' rows can share a fingerprint), and any
      // matching row leads to the same replay or conflict decision. The
      // expiry guard sits inside each OR arm: the purge above only
      // reclaims up to 10 rows, so expired records must never surface
      // from this SELECT.
      const result = await this.pool.query(
        `SELECT * FROM \`${this.tableName}\` WHERE (\`key\` = ? AND expires_at > ?) OR (fingerprint = ? AND expires_at > ?)`,
        [key, now, fingerprint, now]
      );
      rows = result[0];
    }

    /** @type {IdempotencyRecord | null} */
    let byKey = null;
    /** @type {IdempotencyRecord | null} */
    let byFingerprint = null;
    for (const row of /** @type {any[]} */ (rows)) {
      // Rows matching both predicates (the common repeat-hit case) are
      // parsed once and shared between byKey and byFingerprint.
      if (!byKey && row.key === key) {
        byKey = this.parseRecord(row);
      }
      if (!byFingerprint && row.fingerprint === fingerprint) {
        byFingerprint =
          row.key === key && byKey ? byKey : this.parseRecord(row);
      }
    }

    return { byKey, byFingerprint };
  }

  /**
   * Start processing a request
   * @param {string} key
   * @param {string} fingerprint
   * @param {number} ttlMs
   * @returns {Promise<void>}
   */
  async startProcessing(key, fingerprint, ttlMs) {
    try {
      await this.pool.query(
        `INSERT INTO \`${this.tableName}\` (\`key\`, fingerprint, status, expires_at) VALUES (?, ?, 'processing', ?)`,
        [key, fingerprint, Date.now() + ttlMs]
      );
    } catch (error) {
      const isDuplicate =
        error?.code === "ER_DUP_ENTRY" ||
        (typeof error?.message === "string" &&
          error.message.includes("Duplicate entry"));
      if (isDuplicate) {
        throw new IdempotencyKeyExistsError(
          `Idempotency key already exists: ${key}`,
          { cause: error }
        );
      }
      throw error;
    }
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
      `UPDATE \`${this.tableName}\` SET status = 'complete', response_status = ?, response_headers = ?, response_body = ? WHERE \`key\` = ?`,
      [response.status, JSON.stringify(response.headers), response.body, key]
    );

    if (result[0]?.affectedRows === 0) {
      throw new Error(`No record found for key: ${key}`);
    }
  }
}
