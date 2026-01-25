import Database from "better-sqlite3";
import type { IdempotencyStore, IdempotencyRecord } from "../types.js";

export class SqliteIdempotencyStore implements IdempotencyStore {
  private db: Database.Database;

  constructor(options?: { path?: string }) {
    const dbPath = options?.path ?? "./idempotency.db";
    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
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

  close(): void {
    this.db.close();
  }

  private parseRecord(row: any): IdempotencyRecord | null {
    if (!row) return null;

    return {
      key: row.key,
      fingerprint: row.fingerprint,
      status: row.status,
      response: row.response_status
        ? {
            status: row.response_status,
            headers: JSON.parse(row.response_headers),
            body: row.response_body,
          }
        : undefined,
      expiresAt: row.expires_at,
    };
  }

  async lookup(
    key: string,
    fingerprint: string
  ): Promise<{
    byKey: IdempotencyRecord | null;
    byFingerprint: IdempotencyRecord | null;
  }> {
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
      byFingerprint: this.parseRecord(byFingerprintRow),
    };
  }

  async startProcessing(
    key: string,
    fingerprint: string,
    ttlMs: number
  ): Promise<void> {
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

  async complete() {}
  async cleanup() {}
}
