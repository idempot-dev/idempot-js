import { execSync } from "child_process";
import { ulid } from "ulid";
import { createRequire } from "module";
import Redis from "ioredis";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");

const POSTGRES_PORT = 5432;
const REDIS_PORT = 6379;

export async function startServices() {
  console.log("Starting local Postgres...");
  try {
    execSync("brew services start postgresql@14", { stdio: "inherit" });
  } catch {
    // might already be running
  }

  console.log("Starting local Redis...");
  try {
    execSync("brew services start redis", { stdio: "inherit" });
  } catch {
    // might already be running
  }

  console.log("Waiting for services...");
  // Wait for services to fully start. The brew services start command
  // returns before the service is actually ready to accept connections.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log("Services ready!");
}

export async function stopServices() {
  console.log("Stopping services...");
  try {
    execSync("brew services stop postgresql@14", { stdio: "inherit" });
  } catch {}
  try {
    execSync("brew services stop redis", { stdio: "inherit" });
  } catch {}
}

export async function cleanupServices() {
  // Nothing to cleanup for local services
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

export function getRedisClient() {
  return new Redis({
    host: "localhost",
    port: REDIS_PORT
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

export async function cleanupRedisPrefix(prefix) {
  const client = getRedisClient();
  const keys = await client.keys(`${prefix}*`);
  if (keys.length > 0) {
    await client.del(...keys);
  }
  await client.quit();
}

export function generateTestId() {
  return "t" + ulid().toLowerCase();
}

export function generateIdempotencyKey() {
  return "key" + ulid().toLowerCase();
}

const command = process.argv[2];
if (command === "start") {
  startServices()
    .then(() => {
      console.log("Services started successfully");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
} else if (command === "stop") {
  stopServices()
    .then(() => {
      console.log("Services stopped successfully");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
} else if (command === "cleanup") {
  cleanupServices()
    .then(() => {
      console.log("Services cleaned up successfully");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
