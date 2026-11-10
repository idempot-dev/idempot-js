import { execSync } from "child_process";
import { createRequire } from "module";
import net from "net";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");
const mysql = require("mysql2/promise");
import Redis from "ioredis";
import { POSTGRES_PORT } from "./postgres.js";

const REDIS_PORT = 6379;
const MYSQL_PORT = Number(process.env.MYSQL_PORT ?? 3306);
const MAX_RETRIES = 30;
const RETRY_INTERVAL_MS = 1000;

function log(message) {
  console.log(`[prereqs] ${message}`);
}

function error(message) {
  console.error(`[prereqs] ERROR: ${message}`);
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

async function verifyPostgresConnection() {
  try {
    const pool = new Pool({
      host: "localhost",
      port: POSTGRES_PORT,
      database: "test",
      user: "idempot",
      password: "idempot",
      connectionTimeoutMillis: 5000
    });
    await pool.query("SELECT 1");
    await pool.end();
    return true;
  } catch {
    return false;
  }
}

async function verifyRedisConnection() {
  try {
    const client = new Redis({
      host: "127.0.0.1",
      port: REDIS_PORT,
      connectTimeout: 5000
    });
    await client.ping();
    await client.quit();
    return true;
  } catch {
    return false;
  }
}

async function verifyMysqlConnection(maxRetries = 10) {
  // MySQL opens the port before it can authenticate, so keep trying for a few
  // seconds while the container finishes initialising.
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
      await connection.query("SELECT 1");
      await connection.end();
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
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
    error("Cannot connect to Postgres (auth failed or database not ready)");
    return false;
  }
  log("Postgres connection verified");

  const redisConn = await verifyRedisConnection();
  if (!redisConn) {
    error("Cannot connect to Redis (auth failed or service not ready)");
    return false;
  }
  log("Redis connection verified");

  const mysqlConn = await verifyMysqlConnection();
  if (!mysqlConn) {
    error("Cannot connect to MySQL (auth failed or database not ready)");
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
