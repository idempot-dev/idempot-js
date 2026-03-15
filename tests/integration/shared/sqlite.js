import { SqliteIdempotencyStore } from "../../../packages/stores/sqlite/index.js";
import { ulid } from "ulid";
import { unlink } from "fs/promises";

const dbPath = `/tmp/idempot-${ulid()}.db`;

export function sqliteOptions() {
  return {
    path: dbPath
  };
}

export function createSqliteStore() {
  const store = new SqliteIdempotencyStore(sqliteOptions());
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  return store;
}

export async function cleanupSqlite() {
  try {
    await unlink(dbPath);
  } catch {}
}
