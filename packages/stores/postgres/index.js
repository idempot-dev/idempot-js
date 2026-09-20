/**
 * @typedef {import("@idempot/core").IdempotencyRecord} IdempotencyRecord
 * @typedef {import("@idempot/core").IdempotencyStore} IdempotencyStore
 */

import { createRequire } from "module";
import { IdempotencyKeyExistsError } from "@idempot/core";
import { PreparedLookupPool } from "./lookup-pool.js";

const require = createRequire(import.meta.url);

/**
 * @typedef {Object} PostgresIdempotencyStoreOptions
 * @property {string} [connectionString] - PostgreSQL connection string
 * @property {import("pg").PoolConfig} [connection] - Connection pool options (passed to pg.Pool)
 * @property {string} [schema="public"] - Database schema for the idempotency table
 * @property {number} [purgeIntervalMs=1000] - Minimum interval between TTL-purge sweeps
 * @property {number} [lookupPoolSize=2] - Dedicated prepared-statement clients for lookups
 *   (store-owned pools only; 0 falls back to pool.query). User-provided pools always use
 *   pool.query.
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
   * Minimum interval in ms between TTL-purge sweeps.
   * @type {number}
   */
  purgeIntervalMs;

  /**
   * Timestamp of the last TTL-purge sweep.
   * @type {number}
   */
  lastPurgeAt = 0;

  /**
   * Dedicated prepared-statement clients for the lookup (null when the
   * store does not own its pool). An owned pool always holds a
   * PreparedLookupPool; lookupPoolSize 0 makes it empty, so every lookup
   * falls back to the regular pool.
   * @type {PreparedLookupPool | null}
   */
  lookupPool;

  /**
   * The lookup SELECT, built once: also the statement text prepared on
   * the dedicated lookup clients.
   * @type {string}
   */
  lookupSQL;

  /**
   * @param {PostgresIdempotencyStoreOptions} [options]
   */
  constructor(options = {}) {
    this.schema = options.schema ?? "public";
    this.purgeIntervalMs = options.purgeIntervalMs ?? 1000;
    this.quotedSchemaIdentifier = `"${this.schema.replace(/"/g, '""')}"`;
    this.lookupSQL = `SELECT * FROM ${this.quotedSchemaIdentifier}.idempotency_records
       WHERE (key = $1 AND expires_at > $2)
          OR (fingerprint = $3 AND expires_at > $2)`;
    if (options.pool) {
      this.pool = options.pool;
      this.lookupPool = null;
    } else {
      const { Pool, Client } = require("pg");
      this.pool = new Pool(options);
      // Named prepared statements are per server session, so the hot
      // lookup runs on dedicated clients instead of the rotating pool.
      // A lookupPoolSize of 0 creates an empty pool: every lookup then
      // falls back to the regular pool until it is disabled entirely.
      this.lookupPool = new PreparedLookupPool({
        clientFactory: () => new Client(options),
        statementName: "idempotency_lookup",
        statementText: this.lookupSQL,
        size: options.lookupPoolSize ?? 2
      });
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
    if (this.lookupPool) {
      await this.lookupPool.end();
    }
    await this.pool.end();
  }

  /**
   * Parse a database row into an IdempotencyRecord
   * @private
   * @param {any} row
   * @returns {IdempotencyRecord}
   */
  parseRecord(row) {
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

    // Periodic TTL purge: expired rows are excluded from results by the
    // expiry guard in the SELECT below regardless, so deferred sweeping
    // only delays space reclamation, never correctness. ORDER BY
    // expires_at keeps the LIMIT-10 subquery on the expires_at index (a
    // bare LIMIT makes the planner seq-scan once the table grows).
    if (now - this.lastPurgeAt >= this.purgeIntervalMs) {
      this.lastPurgeAt = now;
      await this.pool.query(
        `DELETE FROM ${this.quotedSchemaIdentifier}.idempotency_records
         WHERE key IN (
           SELECT key FROM ${this.quotedSchemaIdentifier}.idempotency_records
           WHERE expires_at <= $1
           ORDER BY expires_at
           LIMIT 10
         )`,
        [now]
      );
    }

    // One round trip: match on key OR fingerprint, then disambiguate by
    // value. `key` is the primary key so at most one row can match it; the
    // fingerprint index is not unique (transient concurrent 'processing'
    // rows can share a fingerprint), and any matching row leads to the
    // same replay or conflict decision. The expiry guard sits inside each
    // OR arm: a table-wide `AND expires_at > $2` would defeat the BitmapOr
    // over the primary key and fingerprint indexes.
    //
    // Store-owned pools run this statement on dedicated clients with the
    // statement prepared server-side (named statements are per session);
    // until a dedicated client is ready, or when one failed, the regular
    // pool serves the identical SQL.
    const prepared = this.lookupPool
      ? await this.lookupPool.query([key, now, fingerprint])
      : null;
    const result =
      prepared ??
      (await this.pool.query(this.lookupSQL, [key, now, fingerprint]));

    // Disambiguate OR-matched rows by value: `key` is the primary key so at
    // most one row can match it; the fingerprint index is not unique
    // (transient concurrent 'processing' rows can share a fingerprint), and
    // any matching row leads to the same replay or conflict decision.
    let byKey = null;
    let byFingerprint = null;
    for (const row of result.rows) {
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
        `INSERT INTO ${this.quotedSchemaIdentifier}.idempotency_records (key, fingerprint, status, expires_at)
       VALUES ($1, $2, 'processing', $3)`,
        [key, fingerprint, Date.now() + ttlMs]
      );
    } catch (error) {
      if (error?.code === "23505") {
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
