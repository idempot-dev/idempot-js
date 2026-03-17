import { PostgresIdempotencyStore } from "../../../packages/stores/postgres/index.js";

export function postgresOptions(schema) {
  return {
    host: "localhost",
    port: 5432,
    database: "test",
    user: "idempot",
    password: "idempot",
    schema
  };
}

export function createPostgresStore(schema) {
  const store = new PostgresIdempotencyStore(postgresOptions(schema));
  const quotedSchema = store.quotedSchemaIdentifier;
  store.pool.query(`
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
