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

export async function createPostgresStore(schema) {
  const store = new PostgresIdempotencyStore(postgresOptions(schema));
  const quotedSchema = store.quotedSchemaIdentifier;
  await store.pool.query(`
    CREATE TABLE IF NOT EXISTS ${quotedSchema}.orders (
      id SERIAL PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  // The store constructor fires initSchema() without awaiting it, so the
  // idempotency_records table may still be in flight. Poll until it exists so
  // direct store calls in tests don't race the DDL.
  for (let i = 0; i < 50; i++) {
    try {
      await store.pool.query(
        `SELECT 1 FROM ${quotedSchema}.idempotency_records LIMIT 1`
      );
      return store;
    } catch {
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  throw new Error(
    `idempotency_records table not ready for schema ${schema} after 1s`
  );
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
