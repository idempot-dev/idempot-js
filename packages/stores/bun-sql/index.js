/**
 * @typedef {import("@idempot/core").IdempotencyRecord} IdempotencyRecord
 * @typedef {import("@idempot/core").IdempotencyStore} IdempotencyStore
 */

// @ts-nocheck - bun:sqlite and bun:sql are only available in Bun runtime
import { Database } from "bun:sqlite";

/**
 * @typedef {Object} BunSqlIdempotencyStoreOptions
 * @property {boolean} [lazy=false] - Don't create connection until first query
 */

/**
 * @implements {IdempotencyStore}
 */
export class BunSqlIdempotencyStore {
  /**
   * @type {import("bun").SQL | Database}
   */
  db;

  /**
   * @type {boolean}
   */
  isSqlite;

  /**
   * @type {boolean}
   */
  isMySQL;

  /**
   * @param {string} connectionString - Database connection string or path
   * @param {BunSqlIdempotencyStoreOptions} [options]
   */
  constructor(connectionString, options = {}) {
    this.isSqlite = this.isSqliteConnection(connectionString);
    this.isMySQL = this.isMySqlConnection(connectionString);

    if (this.isSqlite) {
      const sqlitePath = this.normalizeSqlitePath(connectionString);
      this.db = new Database(sqlitePath);
      this.initSchema();
    } else {
      const { SQL } = require("bun");
      this.db = new SQL(connectionString || "sqlite://idempotency.db", options);
    }
  }

  /**
   * Normalize SQLite path for bun:sqlite
   * @param {string} [connectionString]
   * @returns {string}
   */
  normalizeSqlitePath(connectionString) {
    if (!connectionString) {
      return "./idempotency.db";
    }

    const lower = connectionString.toLowerCase();

    if (lower === ":memory:") {
      return ":memory:";
    }

    if (lower === "sqlite://:memory:") {
      return ":memory:";
    }

    if (lower.startsWith("sqlite://")) {
      return connectionString.slice("sqlite://".length);
    }

    if (lower.startsWith("file://")) {
      return connectionString.slice("file://".length);
    }

    if (lower.startsWith("sqlite:")) {
      return connectionString.slice("sqlite:".length);
    }

    return connectionString;
  }

  /**
   * Check if connection string is SQLite
   * @param {string} [connectionString]
   * @returns {boolean}
   */
  isSqliteConnection(connectionString) {
    if (!connectionString) return true;

    const lower = connectionString.toLowerCase();

    if (lower === ":memory:" || lower === "sqlite://:memory:") return true;
    if (lower.includes("postgres") || lower.includes("postgresql"))
      return false;
    if (lower.includes("mysql") || lower.includes("mariadb")) return false;

    return (
      lower.startsWith("sqlite://") ||
      lower.startsWith("sqlite:") ||
      /\.db$/.test(connectionString) ||
      /\.sqlite$/.test(connectionString) ||
      /\.sqlite3$/.test(connectionString)
    );
  }

  /**
   * Check if connection string is MySQL
   * @param {string} [connectionString]
   * @returns {boolean}
   */
  isMySqlConnection(connectionString) {
    if (!connectionString) return false;
    const lower = connectionString.toLowerCase();
    return lower.includes("mysql") || lower.includes("mariadb");
  }

  /**
   * Initialize database schema with tables and indexes
   * @private
   * @returns {void | Promise<void>}
   */
  initSchema() {
    if (this.isSqlite) {
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
  }

  /**
   * Ensure schema exists for non-SQLite databases
   * @private
   * @returns {Promise<void>}
   */
  async ensureSchema() {
    if (!this.isSqlite) {
      const keyColumn = this.isMySQL ? "`key`" : '"key"';

      if (this.isMySQL) {
        await this.db.unsafe(`
          CREATE TABLE IF NOT EXISTS idempotency_records (
            ${keyColumn} VARCHAR(255) PRIMARY KEY,
            fingerprint VARCHAR(255) NOT NULL,
            status VARCHAR(50) NOT NULL,
            response_status INT,
            response_headers TEXT,
            response_body TEXT,
            expires_at BIGINT NOT NULL
          )
        `);
      } else {
        await this.db.unsafe(`
          CREATE TABLE IF NOT EXISTS idempotency_records (
            ${keyColumn} TEXT PRIMARY KEY,
            fingerprint TEXT NOT NULL,
            status TEXT NOT NULL,
            response_status INT,
            response_headers TEXT,
            response_body TEXT,
            expires_at BIGINT NOT NULL
          )
        `);
      }

      try {
        await this
          .db`CREATE INDEX idx_fingerprint ON idempotency_records(fingerprint)`;
      } catch {
        // Index already exists, ignore
      }

      try {
        await this
          .db`CREATE INDEX idx_expires_at ON idempotency_records(expires_at)`;
      } catch {
        // Index already exists, ignore
      }
    }
  }

  /**
   * Close the database connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.isSqlite) {
      this.db.close();
    } else {
      return this.db.close();
    }
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
            headers: JSON.parse(row.response_headers || "{}"),
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
    await this.ensureSchema();

    if (this.isSqlite) {
      this.db
        .prepare(
          "DELETE FROM idempotency_records WHERE expires_at <= ? LIMIT 10"
        )
        .run(Date.now());

      const byKeyRow = this.db
        .prepare("SELECT * FROM idempotency_records WHERE key = ?")
        .get(key);

      const byFingerprintRow = this.db
        .prepare("SELECT * FROM idempotency_records WHERE fingerprint = ?")
        .get(fingerprint);

      return {
        byKey: this.parseRecord(byKeyRow),
        byFingerprint: this.parseRecord(byFingerprintRow)
      };
    } else {
      await this
        .db`DELETE FROM idempotency_records WHERE expires_at <= ${Date.now()}`;

      const keyColumn = this.isMySQL ? "`key`" : '"key"';
      const paramPlaceholder = this.isMySQL ? "?" : "$1";

      const [byKeyResult, byFingerprintResult] = await Promise.all([
        this.db.unsafe(
          `SELECT * FROM idempotency_records WHERE ${keyColumn} = ${paramPlaceholder}`,
          [key]
        ),
        this
          .db`SELECT * FROM idempotency_records WHERE fingerprint = ${fingerprint}`
      ]);

      return {
        byKey: this.parseRecord(byKeyResult[0]),
        byFingerprint: this.parseRecord(byFingerprintResult[0])
      };
    }
  }

  /**
   * Start processing a request
   * @param {string} key - The request key
   * @param {string} fingerprint - The request fingerprint
   * @param {number} ttlMs - Time to live in milliseconds
   * @returns {Promise<void>}
   */
  async startProcessing(key, fingerprint, ttlMs) {
    await this.ensureSchema();

    if (this.isSqlite) {
      this.db
        .prepare(
          `
        INSERT INTO idempotency_records
        (key, fingerprint, status, expires_at)
        VALUES (?, ?, 'processing', ?)
      `
        )
        .run(key, fingerprint, Date.now() + ttlMs);
    } else {
      const keyColumn = this.isMySQL ? "`key`" : '"key"';

      if (this.isMySQL) {
        await this.db.unsafe(
          `INSERT INTO idempotency_records (${keyColumn}, fingerprint, status, expires_at) VALUES (?, ?, 'processing', ?)`,
          [key, fingerprint, Date.now() + ttlMs]
        );
      } else {
        await this.db.unsafe(
          `INSERT INTO idempotency_records (${keyColumn}, fingerprint, status, expires_at) VALUES ($1, $2, 'processing', $3)`,
          [key, fingerprint, Date.now() + ttlMs]
        );
      }
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
    await this.ensureSchema();

    if (this.isSqlite) {
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
    } else {
      const keyColumn = this.isMySQL ? "`key`" : '"key"';

      let result;
      if (this.isMySQL) {
        result = await this.db.unsafe(
          `UPDATE idempotency_records SET status = 'complete', response_status = ?, response_headers = ?, response_body = ? WHERE ${keyColumn} = ?`,
          [
            response.status,
            JSON.stringify(response.headers),
            response.body,
            key
          ]
        );
      } else {
        result = await this.db.unsafe(
          `UPDATE idempotency_records SET status = 'complete', response_status = $1, response_headers = $2, response_body = $3 WHERE ${keyColumn} = $4`,
          [
            response.status,
            JSON.stringify(response.headers),
            response.body,
            key
          ]
        );
      }

      if (result.changes === 0) {
        throw new Error(`No record found for key: ${key}`);
      }
    }
  }
}
