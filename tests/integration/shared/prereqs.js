import { execSync } from "child_process";
import { createRequire } from "module";
import net from "net";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");
const mysql = require("mysql2/promise");
import Redis from "ioredis";
import { readPort } from "./env.js";
import { POSTGRES_PORT } from "./postgres.js";

const REDIS_PORT = 6379;
const MYSQL_PORT = readPort("MYSQL_PORT", 3307);
const MAX_RETRIES = 30;
const RETRY_INTERVAL_MS = 1000;

function log(message) {
  console.log(`[prereqs] ${message}`);
}

function error(message) {
  console.error(`[prereqs] ERROR: ${message}`);
}

function describeError(err) {
  return err instanceof Error ? err.message : String(err);
}

function checkContainerCommand() {
  try {
    execSync("command -v container", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function checkContainerService() {
  try {
    const output = execSync("container system status", { encoding: "utf8" });
    return output.includes("running");
  } catch {
    return false;
  }
}

function checkPort(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function checkPostgres() {
  return checkPort(POSTGRES_PORT);
}

async function checkRedis() {
  return checkPort(REDIS_PORT);
}

async function checkMysql() {
  return checkPort(MYSQL_PORT);
}

async function waitForPostgres(maxRetries = MAX_RETRIES) {
  for (let i = 0; i < maxRetries; i++) {
    if (await checkPostgres()) {
      return true;
    }
    await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
  }
  return false;
}

async function waitForRedis(maxRetries = MAX_RETRIES) {
  for (let i = 0; i < maxRetries; i++) {
    if (await checkRedis()) {
      return true;
    }
    await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
  }
  return false;
}

async function waitForMysql(maxRetries = MAX_RETRIES) {
  for (let i = 0; i < maxRetries; i++) {
    if (await checkMysql()) {
      return true;
    }
    await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
  }
  return false;
}

// A container can publish its port before the service accepts connections, so
// each verifier retries. Without this the first integration run after a cold
// start fails on a transient "starting up" error.
async function verifyPostgresConnection(maxRetries = 10) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    const pool = new Pool({
      host: "localhost",
      port: POSTGRES_PORT,
      database: "test",
      user: "idempot",
      password: "idempot",
      connectionTimeoutMillis: 5000
    });
    try {
      await pool.query("SELECT 1");
      return true;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 500));
    } finally {
      await pool.end();
    }
  }
  error(`Cannot connect to Postgres: ${describeError(lastError)}`);
  return false;
}

async function verifyRedisConnection(maxRetries = 10) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    const client = new Redis({
      host: "127.0.0.1",
      port: REDIS_PORT,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null
    });
    try {
      await client.ping();
      return true;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 500));
    } finally {
      client.disconnect();
    }
  }
  error(`Cannot connect to Redis: ${describeError(lastError)}`);
  return false;
}

async function verifyMysqlConnection(maxRetries = 10) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const connection = await mysql.createConnection({
        host: "localhost",
        port: MYSQL_PORT,
        database: "test",
        user: "idempot",
        password: "idempot",
        connectTimeout: 5000
      });
      try {
        await connection.query("SELECT 1");
        return true;
      } finally {
        await connection.end().catch(() => {});
      }
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  error(`Cannot connect to MySQL: ${describeError(lastError)}`);
  return false;
}

async function startContainers() {
  log("Attempting to start containers...");
  try {
    execSync("npm run test:container:start", {
      stdio: "inherit",
      cwd: process.cwd()
    });
    return true;
  } catch {
    return false;
  }
}

async function checkPrereqs() {
  log("Checking prerequisites for integration tests...");

  if (!checkContainerCommand()) {
    error("apple/container is not installed.");
    error("Please install it from: https://github.com/apple/container");
    return false;
  }
  log("container command found");

  if (!checkContainerService()) {
    error("apple/container service is not running.");
    error("Please start it with: container system start");
    return false;
  }
  log("container service is running");

  const postgresUp = await checkPostgres();
  const redisUp = await checkRedis();
  const mysqlUp = await checkMysql();

  if (!postgresUp || !redisUp || !mysqlUp) {
    log("Services not reachable. Attempting to start containers...");
    const started = await startContainers();
    if (!started) {
      error("Failed to start containers");
      return false;
    }

    const newPostgresUp = await waitForPostgres();
    const newRedisUp = await waitForRedis();
    const newMysqlUp = await waitForMysql();

    if (!newPostgresUp) {
      error("Postgres is not reachable after starting containers");
      return false;
    }
    log("Postgres is ready");

    if (!newRedisUp) {
      error("Redis is not reachable after starting containers");
      return false;
    }
    log("Redis is ready");

    if (!newMysqlUp) {
      error("MySQL is not reachable after starting containers");
      return false;
    }
    log("MySQL is ready");
  } else {
    log("Postgres is ready");
    log("Redis is ready");
    log("MySQL is ready");
  }

  const pgConn = await verifyPostgresConnection();
  if (!pgConn) {
    error("Postgres connection verification failed");
    return false;
  }
  log("Postgres connection verified");

  const redisConn = await verifyRedisConnection();
  if (!redisConn) {
    error("Redis connection verification failed");
    return false;
  }
  log("Redis connection verified");

  const mysqlConn = await verifyMysqlConnection();
  if (!mysqlConn) {
    error("MySQL connection verification failed");
    return false;
  }
  log("MySQL connection verified");

  log("All prerequisites satisfied!");
  return true;
}

checkPrereqs()
  .then((ok) => {
    process.exit(ok ? 0 : 1);
  })
  .catch((err) => {
    error(err.message);
    process.exit(1);
  });
