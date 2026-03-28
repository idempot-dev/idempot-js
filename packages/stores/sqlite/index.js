/**
 * @typedef {import("@idempot/core").IdempotencyRecord} IdempotencyRecord
 * @typedef {import("@idempot/core").IdempotencyStore} IdempotencyStore
 */

import Database from "better-sqlite3";

/**
 * @implements {IdempotencyStore}
 */
export class SqliteIdempotencyStore {
  /**
   * @type {Database.Database}
   */
  db;

  /**
   * @param {{path?: string}} [options]
   */
  constructor(options) {
    const dbPath = options?.path ?? "./idempotency.db";
    this.db = new Database(dbPath);
    this.initSchema();
  }

  /**
   * Initialize database schema with tables and indexes
   * @private
   * @returns {void}
   */
  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS idempotency_records (
        key TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('processing', 'complete')),
        response_status INTEGER,
        response_headers TEXT,
        response_body TEXT,
        expires_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_fingerprint
        ON idempotency_records(fingerprint);

      CREATE INDEX IF NOT EXISTS idx_expires_at
        ON idempotency_records(expires_at);
    `);
  }

  /**
   * Close the database connection
   * @returns {Promise<void>}
   */
  async close() {
    this.db.close();
  }

  /**
   * Parse a database row into an IdempotencyRecord
   * @private
   * @param {any} row - The database row to parse
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
            headers: JSON.parse(row.response_headers),
            body: row.response_body
          }
        : undefined,
      expiresAt: row.expires_at
    };
  }

  /**
   * Look up an idempotency record by key and fingerprint
   * @param {string} key - The request key
   * @param {string} fingerprint - The request fingerprint
   * @returns {Promise<{byKey: IdempotencyRecord | null, byFingerprint: IdempotencyRecord | null}>}
   */
  async lookup(key, fingerprint) {
    // Delete up to 10 expired records
    this.db
      .prepare("DELETE FROM idempotency_records WHERE expires_at <= ? LIMIT 10")
      .run(Date.now());

    // Lookup by key
    const byKeyRow = this.db
      .prepare("SELECT * FROM idempotency_records WHERE key = ?")
      .get(key);

    // Lookup by fingerprint
    const byFingerprintRow = this.db
      .prepare("SELECT * FROM idempotency_records WHERE fingerprint = ?")
      .get(fingerprint);

    return {
      byKey: this.parseRecord(byKeyRow),
      byFingerprint: this.parseRecord(byFingerprintRow)
    };
  }

  /**
   * Start processing a request
   * @param {string} key - The request key
   * @param {string} fingerprint - The request fingerprint
   * @param {number} ttlMs - Time to live in milliseconds
   * @returns {Promise<void>}
   */
  async startProcessing(key, fingerprint, ttlMs) {
    this.db
      .prepare(
        `
      INSERT INTO idempotency_records
      (key, fingerprint, status, expires_at)
      VALUES (?, ?, 'processing', ?)
    `
      )
      .run(key, fingerprint, Date.now() + ttlMs);
  }

  /**
   * Mark a request as complete with its response
   * @param {string} key - The request key
   * @param {{status: number, headers: Record<string, string>, body: string}} response - The response object
   * @returns {Promise<void>}
   * @throws {Error} If no record found for key
   */
  async complete(key, response) {
    const result = this.db
      .prepare(
        `
      UPDATE idempotency_records
      SET status = 'complete',
          response_status = ?,
          response_headers = ?,
          response_body = ?
      WHERE key = ?
    `
      )
      .run(
        response.status,
        JSON.stringify(response.headers),
        response.body,
        key
      );

    if (result.changes === 0) {
      throw new Error(`No record found for key: ${key}`);
    }
  }
}
