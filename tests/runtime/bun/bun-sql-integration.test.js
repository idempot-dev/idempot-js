import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { idempotency } from "../../../packages/frameworks/hono/index.js";
import { BunSqlIdempotencyStore } from "../../../packages/stores/bun-sql/index.js";
import mysql from "mysql2/promise";
import { createRequire } from "module";
import { ulid } from "ulid";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");

const POSTGRES_URL = "postgres://idempot:idempot@localhost:5432/test";
const MYSQL_URL = "mysql://idempot:idempot@localhost:3306/test";

function generateTestId() {
  return "t" + ulid().toLowerCase();
}

function generateIdempotencyKey() {
  return "key" + ulid().toLowerCase();
}

async function makeRequest(port, options) {
  const { idempotencyKey, body } = options;
  const headers = {
    "content-type": "application/json"
  };
  if (idempotencyKey) {
    headers["idempotency-key"] = idempotencyKey;
  }

  const response = await fetch(`http://localhost:${port}/api`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  const responseBody = await response.json();
  const headersObj = {};
  response.headers.forEach((value, key) => {
    headersObj[key] = value;
  });

  return {
    status: response.status,
    headers: headersObj,
    body: responseBody
  };
}

function createApp(store) {
  const app = new Hono();
  app.use("*", idempotency({ store }));
  app.post("/api", async (c) => {
    const body = await c.req.json();
    return c.json({ success: true, body });
  });
  return app;
}

describe("BunSqlIdempotencyStore with PostgreSQL", () => {
  let server;
  let port;
  let store;
  let schema;

  beforeEach(async () => {
    schema = generateTestId();

    const pool = new Pool({
      host: "localhost",
      port: 5432,
      database: "test",
      user: "idempot",
      password: "idempot"
    });
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await pool.end();

    const connectionUrl = `${POSTGRES_URL}?search_path=${schema}`;
    store = new BunSqlIdempotencyStore(connectionUrl);
    const app = createApp(store);

    server = serve({
      fetch: app.fetch,
      port: 0
    });

    await new Promise((resolve) => server.on("listening", resolve));
    port = server.address().port;
  });

  afterEach(async () => {
    await store.close();

    const pool = new Pool({
      host: "localhost",
      port: 5432,
      database: "test",
      user: "idempot",
      password: "idempot"
    });
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();

    server.close();
  });

  test("first request creates record", async () => {
    const key = generateIdempotencyKey();

    const response = await makeRequest(port, {
      idempotencyKey: key,
      body: { foo: "bar" }
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, body: { foo: "bar" } });

    const pool = new Pool({
      host: "localhost",
      port: 5432,
      database: "test",
      user: "idempot",
      password: "idempot"
    });

    const records = await pool.query(
      `SELECT * FROM ${schema}.idempotency_records WHERE key = $1`,
      [key]
    );

    expect(records.rows.length).toBe(1);
    expect(records.rows[0].key).toBe(key);
    expect(records.rows[0].status).toBe("complete");

    await pool.end();
  });

  test("duplicate request returns cached response", async () => {
    const key = generateIdempotencyKey();

    const response1 = await makeRequest(port, {
      idempotencyKey: key,
      body: { foo: "bar" }
    });

    const response2 = await makeRequest(port, {
      idempotencyKey: key,
      body: { foo: "bar" }
    });

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    expect(response2.headers["x-idempotent-replayed"]).toBe("true");
  });

  test("conflict with same fingerprint different key", async () => {
    const key1 = generateIdempotencyKey();
    const key2 = generateIdempotencyKey();

    await makeRequest(port, {
      idempotencyKey: key1,
      body: { foo: "bar" }
    });

    const response2 = await makeRequest(port, {
      idempotencyKey: key2,
      body: { foo: "bar" }
    });

    expect(response2.status).toBe(409);
  });
});

describe("BunSqlIdempotencyStore with MySQL", () => {
  let server;
  let port;
  let store;
  let mysqlConnection;

  beforeEach(async () => {
    mysqlConnection = await mysql.createConnection({
      host: "localhost",
      port: 3306,
      user: "idempot",
      password: "idempot",
      database: "test"
    });

    store = new BunSqlIdempotencyStore(MYSQL_URL);
    const app = createApp(store);

    server = serve({
      fetch: app.fetch,
      port: 0
    });

    await new Promise((resolve) => server.on("listening", resolve));
    port = server.address().port;
  });

  afterEach(async () => {
    await store.close();
    await mysqlConnection.query("DROP TABLE IF EXISTS idempotency_records");
    await mysqlConnection.end();
    server.close();
  });

  test("first request creates record", async () => {
    const key = generateIdempotencyKey();

    const response = await makeRequest(port, {
      idempotencyKey: key,
      body: { foo: "bar" }
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, body: { foo: "bar" } });

    const [rows] = await mysqlConnection.query(
      "SELECT * FROM idempotency_records WHERE `key` = ?",
      [key]
    );

    expect(rows.length).toBe(1);
    expect(rows[0].key).toBe(key);
    expect(rows[0].status).toBe("complete");
  });

  test("duplicate request returns cached response", async () => {
    const key = generateIdempotencyKey();

    const response1 = await makeRequest(port, {
      idempotencyKey: key,
      body: { foo: "bar" }
    });

    const response2 = await makeRequest(port, {
      idempotencyKey: key,
      body: { foo: "bar" }
    });

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    expect(response2.headers["x-idempotent-replayed"]).toBe("true");
  });

  test("conflict with same fingerprint different key", async () => {
    const key1 = generateIdempotencyKey();
    const key2 = generateIdempotencyKey();

    await makeRequest(port, {
      idempotencyKey: key1,
      body: { foo: "bar" }
    });

    const response2 = await makeRequest(port, {
      idempotencyKey: key2,
      body: { foo: "bar" }
    });

    expect(response2.status).toBe(409);
  });
});
