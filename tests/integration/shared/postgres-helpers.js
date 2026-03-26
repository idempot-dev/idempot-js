import { execSync } from "child_process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");

const POSTGRES_PORT = 5432;

export async function startPostgres() {
  console.log("Starting local Postgres...");
  try {
    execSync("brew services start postgresql@14", { stdio: "inherit" });
  } catch {}
}

export async function stopPostgres() {
  try {
    execSync("brew services stop postgresql@14", { stdio: "inherit" });
  } catch {}
}

export function getPostgresUrl(schema = "public") {
  return `postgres://idempot:idempot@localhost:${POSTGRES_PORT}/test?search_path=${schema}`;
}

export function getPostgresPool(schema = "public") {
  return new Pool({
    host: "localhost",
    port: POSTGRES_PORT,
    database: "test",
    user: "idempot",
    password: "idempot"
  });
}

export async function createPostgresSchema(schema) {
  const pool = new Pool({
    host: "localhost",
    port: POSTGRES_PORT,
    database: "test",
    user: "idempot",
    password: "idempot"
  });
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await pool.end();
}

export async function dropPostgresSchema(schema) {
  const pool = new Pool({
    host: "localhost",
    port: POSTGRES_PORT,
    database: "test",
    user: "idempot",
    password: "idempot"
  });
  await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await pool.end();
}
