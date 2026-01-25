import Database from "better-sqlite3";
import type { IdempotencyStore } from "../types.js";

export class SqliteIdempotencyStore implements IdempotencyStore {
  private db: Database.Database;

  constructor(options?: { path?: string }) {
    const dbPath = options?.path ?? "./idempotency.db";
    this.db = new Database(dbPath);
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
