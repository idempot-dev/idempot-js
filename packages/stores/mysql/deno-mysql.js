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
import { Client } from "mysql";

/**
 * @typedef {Object} MysqlIdempotencyStoreOptions
 * @property {string} [hostname="localhost"] - MySQL hostname
 * @property {number} [port=3306] - MySQL port
 * @property {string} [username] - MySQL username
 * @property {string} [password] - MySQL password
 * @property {string} [db] - Database name
 * @property {number} [poolSize=3] - Connection pool size
 * @property {boolean} [testMode] - Use in-memory store instead of MySQL
 */

/**
 * @implements {IdempotencyStore}
 */
export class MysqlIdempotencyStore {
  /** @type {Client} */
  client;

  /**
   * @type {boolean}
   */
  testMode;

  /**
   * @type {Map<string, IdempotencyRecord>}
   */
  #testStore = new Map();

  /**
   * @param {MysqlIdempotencyStoreOptions} [options]
   */
  constructor(options = {}) {
    this.testMode = options.testMode ?? false;
    if (!this.testMode) {
      this.client = new Client();
    }
    this.options = {
      hostname: options.hostname ?? "localhost",
      port: options.port ?? 3306,
      username: options.username ?? "root",
      password: options.password ?? "",
      db: options.db ?? "mysql",
      poolSize: options.poolSize ?? 3
    };
  }

  /**
   * @private
   * @type {MysqlIdempotencyStoreOptions}
   */
  options;

  /**
   * Connect to the database
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.testMode) {
      return;
    }
    await this.client.connect(this.options);
    await this.initSchema();
  }

  /**
   * Initialize the database schema
   * @returns {Promise<void>}
   */
  async initSchema() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS idempotency_records (
        \`key\` VARCHAR(255) PRIMARY KEY,
        fingerprint VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL,
        response_status INT,
        response_headers TEXT,
        response_body TEXT,
        expires_at BIGINT NOT NULL,
        INDEX idx_fingerprint (fingerprint),
        INDEX idx_expires_at (expires_at)
      )
    `;
    await this.client.execute(createTableSQL);
  }

  /**
   * Close the database connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.testMode) {
      return;
    }
    await this.client.close();
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
    if (this.testMode) {
      /** @type {IdempotencyRecord | null} */
      const byKey = /** @type {IdempotencyRecord | null} */ (
        this.#testStore.get(key) ?? null
      );
      /** @type {IdempotencyRecord | null} */
      let byFingerprint = null;
      for (const record of this.#testStore.values()) {
        if (record.fingerprint === fingerprint) {
          byFingerprint = record;
          break;
        }
      }
      return { byKey, byFingerprint };
    }

    await this.client.execute(
      "DELETE FROM idempotency_records WHERE expires_at <= ?",
      [Date.now()]
    );

    const [byKeyResult] = await this.client.query(
      "SELECT * FROM idempotency_records WHERE `key` = ?",
      [key]
    );
    const [byFingerprintResult] = await this.client.query(
      "SELECT * FROM idempotency_records WHERE fingerprint = ?",
      [fingerprint]
    );

    return {
      byKey: this.parseRecord(byKeyResult[0]),
      byFingerprint: this.parseRecord(byFingerprintResult[0])
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
    if (this.testMode) {
      /** @type {IdempotencyRecord} */
      const record = {
        key,
        fingerprint,
        status: "processing",
        expiresAt: Date.now() + ttlMs
      };
      this.#testStore.set(key, record);
      return;
    }

    await this.client.execute(
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
    if (this.testMode) {
      const existing = this.#testStore.get(key);
      if (!existing) {
        throw new Error(`No record found for key: ${key}`);
      }
      /** @type {IdempotencyRecord} */
      const record = {
        ...existing,
        status: "complete",
        response
      };
      this.#testStore.set(key, record);
      return;
    }

    const [result] = await this.client.execute(
      "UPDATE idempotency_records SET status = 'complete', response_status = ?, response_headers = ?, response_body = ? WHERE `key` = ?",
      [response.status, JSON.stringify(response.headers), response.body, key]
    );

    if (result.affectedRows === 0) {
      throw new Error(`No record found for key: ${key}`);
    }
  }
}
