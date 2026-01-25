import Database from "better-sqlite3";
import type { IdempotencyStore } from "../types.js";

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

  // Placeholder methods to satisfy interface
  async lookup() {
    return { byKey: null, byFingerprint: null };
  }
  async startProcessing() {}
  async complete() {}
  async cleanup() {}
}
