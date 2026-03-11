// @ts-nocheck - Deno runtime only
import { DB as Database } from "sqlite";

/** @typedef {import("./interface.js").IdempotencyStore} IdempotencyStore */
/** @typedef {import("./interface.js").IdempotencyRecord} IdempotencyRecord */

/**
 * @implements {IdempotencyStore}
 */
export class DenoSqliteIdempotencyStore {
  /** @type {Database} */
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
   * @private
   * @returns {void}
   */
  initSchema() {
    this.db.query(`
      CREATE TABLE IF NOT EXISTS idempotency_records (
        key TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('processing', 'complete')),
        response_status INTEGER,
        response_headers TEXT,
        response_body TEXT,
        expires_at INTEGER NOT NULL
      )
    `);
    this.db.query(`CREATE INDEX IF NOT EXISTS idx_fingerprint ON idempotency_records(fingerprint)`);
    this.db.query(`CREATE INDEX IF NOT EXISTS idx_expires_at ON idempotency_records(expires_at)`);
  }

  /**
   * @returns {void}
   */
  close() {
    this.db.close();
  }

  /**
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
            headers: JSON.parse(row.response_headers),
            body: row.response_body
          }
        : undefined,
      expiresAt: row.expires_at
    };
  }

  /**
   * @param {string} key
   * @param {string} fingerprint
   * @returns {Promise<{byKey: IdempotencyRecord | null, byFingerprint: IdempotencyRecord | null}>}
   */
  async lookup(key, fingerprint) {
    this.db.query("DELETE FROM idempotency_records WHERE expires_at <= ?", [Date.now()]);

    const byKeyRows = this.db.queryEntries("SELECT * FROM idempotency_records WHERE key = ?", [key]);
    const byFingerprintRows = this.db.queryEntries("SELECT * FROM idempotency_records WHERE fingerprint = ?", [fingerprint]);

    const byKey = byKeyRows.length > 0 ? this.parseRecord(byKeyRows[0]) : null;
    const byFingerprint = byFingerprintRows.length > 0 ? this.parseRecord(byFingerprintRows[0]) : null;

    return {
      byKey,
      byFingerprint
    };
  }

  /**
   * @param {string} key
   * @param {string} fingerprint
   * @param {number} ttlMs
   * @returns {Promise<void>}
   */
  async startProcessing(key, fingerprint, ttlMs) {
    this.db.query(
      `INSERT INTO idempotency_records (key, fingerprint, status, expires_at) VALUES (?, ?, 'processing', ?)`,
      [key, fingerprint, Date.now() + ttlMs]
    );
  }

  /**
   * @param {string} key
   * @param {{status: number, headers: Record<string, string>, body: string}} response
   * @returns {Promise<void>}
   */
  async complete(key, response) {
    const existing = this.db.queryEntries("SELECT * FROM idempotency_records WHERE key = ?", [key]);
    if (!existing || existing.length === 0) {
      throw new Error(`No record found for key: ${key}`);
    }
    
    this.db.query(
      `UPDATE idempotency_records SET status = 'complete', response_status = ?, response_headers = ?, response_body = ? WHERE key = ?`,
      [response.status, JSON.stringify(response.headers), response.body, key]
    );
  }

  /**
   * @returns {Promise<void>}
   */
  async cleanup() {
    this.db.query("DELETE FROM idempotency_records WHERE expires_at <= ?", [Date.now()]);
  }
}
