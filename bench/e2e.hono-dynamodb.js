import { Hono } from "hono";
import { idempotency } from "../packages/frameworks/hono/index.js";
import { DynamoDbIdempotencyStore } from "../packages/stores/dynamodb/index.js";
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  waitUntilTableExists
} from "@aws-sdk/client-dynamodb";
import { BASE_BODY, BASE_HEADERS } from "./lib/fixtures.js";
import { createE2EBenchmarkModule } from "./lib/e2e-module.js";
import { ulid } from "ulid";

const BODY = JSON.stringify(BASE_BODY);

/**
 * Create a store against a fresh, uniquely named table so each phase
 * (warmup and timed) starts with an empty table. The endpoint comes from
 * DYNAMODB_ENDPOINT (DynamoDB Local default localhost:8000; Floci on
 * localhost:4566 works too). A down endpoint will never become ready, so
 * connection failures propagate instead of being misattributed to DDL
 * timing.
 */
async function createStore() {
  const client = new DynamoDBClient({
    region: "us-east-1",
    endpoint: process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000",
    credentials: { accessKeyId: "test", secretAccessKey: "test" }
  });
  const tableName = `bench_${ulid().toLowerCase()}`;
  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      AttributeDefinitions: [
        { AttributeName: "key", AttributeType: "S" },
        { AttributeName: "fingerprint", AttributeType: "S" }
      ],
      KeySchema: [{ AttributeName: "key", KeyType: "HASH" }],
      GlobalSecondaryIndexes: [
        {
          IndexName: "fingerprint-index",
          KeySchema: [{ AttributeName: "fingerprint", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" }
        }
      ],
      BillingMode: "PAY_PER_REQUEST"
    })
  );
  await waitUntilTableExists(
    { client, maxWaitTime: 15, minDelay: 0.2, maxDelay: 1 },
    { TableName: tableName }
  );
  return {
    store: new DynamoDbIdempotencyStore({ client, tableName }),
    client,
    tableName
  };
}

function createMiddlewareApp(store) {
  const app = new Hono();
  app.post("/pay", idempotency({ store }), (c) => c.json({ ok: true }));
  return app;
}

function createBaselineApp() {
  const app = new Hono();
  app.post("/pay", (c) => c.json({ ok: true }));
  return app;
}

function send(app, { key, body = BODY } = {}) {
  const headers = { ...BASE_HEADERS };
  if (key) {
    headers["Idempotency-Key"] = key;
  }
  return app.request("http://localhost/pay", {
    method: "POST",
    headers,
    body
  });
}

async function ensureMiddlewareState(state) {
  if (!state.db) {
    state.db = await createStore();
    state.app = createMiddlewareApp(state.db.store);
  }
  return state.app;
}

async function teardownMiddlewareState(state) {
  if (state.db) {
    const { store, client, tableName } = state.db;
    try {
      await client.send(new DeleteTableCommand({ TableName: tableName }));
    } finally {
      // The table delete failing must not leak the client.
      await store.close();
      state.db = null;
      state.app = null;
    }
  }
}

/**
 * Three timed paths and the shared lifecycle are documented in
 * createE2EBenchmarkModule (bench/lib/e2e-module.js).
 */
async function createRun() {
  const state = {};
  await ensureMiddlewareState(state);
  return {
    send: (opts) =>
      Promise.resolve(send(state.app, opts)).then((res) => res.status),
    close: () => teardownMiddlewareState(state)
  };
}

function createBaselineRun() {
  const app = createBaselineApp();
  return {
    send: (opts) => Promise.resolve(send(app, opts)).then((res) => res.status),
    close: async () => {}
  };
}

export default createE2EBenchmarkModule({
  name: "e2e.hono-dynamodb",
  createRun,
  createBaselineRun
});
