import { PostgresIdempotencyStore } from "../../../packages/stores/postgres/index.js";
import { readPort } from "./env.js";

export const POSTGRES_PORT = readPort("POSTGRES_PORT", 5433);

export function postgresOptions(schema) {
  return {
    host: "localhost",
    port: POSTGRES_PORT,
    database: "test",
    user: "idempot",
    password: "idempot",
    schema
  };
}

export async function createPostgresStore(schema) {
  const store = new PostgresIdempotencyStore(postgresOptions(schema));
  const quotedSchema = store.quotedSchemaIdentifier;
  // The store constructor fires initSchema() without awaiting it, so the schema
  // and idempotency_records table may still be in flight. Poll until the table
  // exists before creating fixtures or calling the store directly.
  let ready = false;
  for (let i = 0; i < 50 && !ready; i++) {
    try {
      await store.pool.query(
        `SELECT 1 FROM ${quotedSchema}.idempotency_records LIMIT 1`
      );
      ready = true;
    } catch {
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  if (!ready) {
    throw new Error(
      `idempotency_records table not ready for schema ${schema} after 1s`
    );
  }
  await store.pool.query(`
    CREATE TABLE IF NOT EXISTS ${quotedSchema}.orders (
      id SERIAL PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  return store;
}

export async function waitForIdempotencyRecordComplete(
  store,
  schema,
  key,
  maxAttempts = 20,
  intervalMs = 20
) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const records = await store.pool.query(
      `SELECT * FROM ${schema}.idempotency_records WHERE key = $1`,
      [key]
    );
    if (records.rows[0]?.status === "complete") return;
  }
}
