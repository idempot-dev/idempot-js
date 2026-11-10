import { createRequire } from "module";

import { POSTGRES_PORT } from "./postgres.js";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");

function schemaPool() {
  return new Pool({
    host: "localhost",
    port: POSTGRES_PORT,
    database: "test",
    user: "idempot",
    password: "idempot"
  });
}

export async function createPostgresSchema(schema) {
  const pool = schemaPool();
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await pool.end();
}

export async function dropPostgresSchema(schema) {
  const pool = schemaPool();
  await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await pool.end();
}
