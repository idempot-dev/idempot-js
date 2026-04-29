/**
 * @typedef {import("@idempot/core").IdempotencyRecord} IdempotencyRecord
 * @typedef {import("@idempot/core").IdempotencyStore} IdempotencyStore
 */

import { createRequire } from "module";

const require = createRequire(import.meta.url);

/**
 * @typedef {Object} PostgresIdempotencyStoreOptions
 * @property {string} [connectionString] - PostgreSQL connection string
 * @property {import("pg").PoolConfig} [connection] - Connection pool options (passed to pg.Pool)
 * @property {string} [schema="public"] - Database schema for the idempotency table
 * @property {import("pg").Pool} [pool] - Optional pre-configured pool (for testing)
 */

/**
 * @implements {IdempotencyStore}
 */

export class PostgresIdempotencyStore {
  /**
   * @type {import("pg").Pool}
   */
  pool;

  /**
   * @type {string}
   */
  schema;

  /**
   * @param {PostgresIdempotencyStoreOptions} [options]
   */
  constructor(options = {}) {
    this.schema = options.schema ?? "public";
    this.quotedSchemaIdentifier = `"${this.schema.replace(/"/g, '""')}"`;
    if (options.pool) {
      this.pool = options.pool;
    } else {
      const { Pool } = require("pg");
      this.pool = new Pool(options);
    }
    this.initSchema();
  }

  /**
   * Initialize the database schema
   * @returns {Promise<void>}
   */
  async initSchema() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${this.quotedSchemaIdentifier}.idempotency_records (
        key TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('processing', 'complete')),
        response_status INTEGER,
        response_headers TEXT,
        response_body TEXT,
        expires_at BIGINT NOT NULL
      )
    `;
    await this.pool.query(
      `CREATE SCHEMA IF NOT EXISTS ${this.quotedSchemaIdentifier}`
    );
    await this.pool.query(createTableSQL);

    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_fingerprint ON ${this.quotedSchemaIdentifier}.idempotency_records(fingerprint)`
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_expires_at ON ${this.quotedSchemaIdentifier}.idempotency_records(expires_at)`
    );
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
    // Use subquery with LIMIT since PostgreSQL doesn't support LIMIT in DELETE directly
    await this.pool.query(
      `DELETE FROM ${this.quotedSchemaIdentifier}.idempotency_records WHERE key IN (SELECT key FROM ${this.quotedSchemaIdentifier}.idempotency_records WHERE expires_at <= $1 LIMIT 10)`,
      [Date.now()]
    );

    const [byKeyResult, byFingerprintResult] = await Promise.all([
      this.pool.query(
        `SELECT * FROM ${this.quotedSchemaIdentifier}.idempotency_records WHERE key = $1`,
        [key]
      ),
      this.pool.query(
        `SELECT * FROM ${this.quotedSchemaIdentifier}.idempotency_records WHERE fingerprint = $1`,
        [fingerprint]
      )
    ]);

    return {
      byKey: this.parseRecord(byKeyResult.rows[0]),
      byFingerprint: this.parseRecord(byFingerprintResult.rows[0])
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
      `INSERT INTO ${this.quotedSchemaIdentifier}.idempotency_records (key, fingerprint, status, expires_at)
       VALUES ($1, $2, 'processing', $3)`,
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
    const result = await this.pool.query(
      `UPDATE ${this.quotedSchemaIdentifier}.idempotency_records
       SET status = 'complete',
           response_status = $1,
           response_headers = $2,
           response_body = $3
       WHERE key = $4`,
      [response.status, JSON.stringify(response.headers), response.body, key]
    );

    if (result.rowCount === 0) {
      throw new Error(`No record found for key: ${key}`);
    }
  }
}
