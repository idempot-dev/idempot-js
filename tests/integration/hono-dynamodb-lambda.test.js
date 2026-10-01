import t from "tap";
import { Hono } from "hono";
import { handle } from "@hono/aws-lambda";
import { idempotency } from "../../packages/frameworks/hono/index.js";
import { createDynamoDBStore, cleanupDynamoDB } from "./shared/dynamodb.js";
import { createLostRaceStore } from "./shared/lost-race-store.js";
import { generateFingerprint } from "../../packages/core/src/fingerprint.js";

/**
 * Runs the same Hono app a user would deploy through @hono/aws-lambda's
 * handle(), invoked in-process with synthetic Function URL events against a
 * real DynamoDB-compatible endpoint. This pins the Lambda adapter wiring
 * (event -> Hono -> middleware -> store -> Lambda response) without a
 * container runtime.
 */

/** @param {string | null} key @param {string} [body] */
const makeEvent = (key, body = JSON.stringify({ foo: "bar" })) => ({
  version: "2.0",
  routeKey: "POST /api",
  rawPath: "/api",
  requestContext: { http: { method: "POST", path: "/api" } },
  headers: key
    ? { "content-type": "application/json", "idempotency-key": key }
    : { "content-type": "application/json" },
  body,
  isBase64Encoded: false
});

const CONTEXT = { getRemainingTimeInMillis: () => 30000 };

function createApp(store) {
  const app = new Hono();
  app.use("*", idempotency({ store }));
  app.post("/api", (c) => c.json({ success: true }));
  return app;
}

async function waitForCompleteRecord(client, tableName, key) {
  const { GetItemCommand } = await import("@aws-sdk/client-dynamodb");
  const { unmarshall } = await import("@aws-sdk/util-dynamodb");
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 20));
    const result = await client.send(
      new GetItemCommand({ TableName: tableName, Key: { key: { S: key } } })
    );
    if (result.Item && unmarshall(result.Item).status === "complete") return;
  }
}

t.beforeEach(async (t) => {
  const { store, client, tableName } = await createDynamoDBStore();
  t.context.store = store;
  t.context.client = client;
  t.context.tableName = tableName;
  t.context.handler = handle(createApp(store));
});

t.afterEach(async (t) => {
  await cleanupDynamoDB(t.context.client, t.context.tableName);
  await t.context.store.close();
});

t.test("Lambda + Hono + DynamoDB - first request creates record", async (t) => {
  const { handler, client, tableName } = t.context;

  const response = await handler(
    makeEvent("test-key-12345678901234567890"),
    CONTEXT
  );

  t.equal(response.statusCode, 200, "should return 200");
  t.same(
    JSON.parse(response.body),
    { success: true },
    "should return correct body"
  );

  const result = await client.send(
    new (await import("@aws-sdk/client-dynamodb")).GetItemCommand({
      TableName: tableName,
      Key: { key: { S: "test-key-12345678901234567890" } }
    })
  );
  t.ok(result.Item, "should have one idempotency record");
});

t.test(
  "Lambda + Hono + DynamoDB - duplicate request replays through the adapter",
  async (t) => {
    const { handler, client, tableName } = t.context;
    const key = "test-key-dupe-123456789012345";

    const response1 = await handler(makeEvent(key), CONTEXT);
    await waitForCompleteRecord(client, tableName, key);
    const response2 = await handler(makeEvent(key), CONTEXT);

    t.equal(response1.statusCode, 200, "first request should return 200");
    t.equal(response2.statusCode, 200, "duplicate should return 200");
    t.equal(
      response2.headers["x-idempotent-replayed"],
      "true",
      "duplicate should have replay header"
    );
    t.equal(
      response2.body,
      response1.body,
      "replayed body must match the stored response"
    );
  }
);

t.test(
  "Lambda + Hono + DynamoDB - conflict with same fingerprint different key",
  async (t) => {
    const { handler } = t.context;

    const response1 = await handler(
      makeEvent("test-key-conflict-a-123456789"),
      CONTEXT
    );
    const response2 = await handler(
      makeEvent("test-key-conflict-b-123456789"),
      CONTEXT
    );

    t.equal(response1.statusCode, 200, "first request should return 200");
    t.equal(response2.statusCode, 409, "should return 409 conflict");
    t.match(
      response2.headers["content-type"],
      /problem\+json/,
      "conflict should be problem+json"
    );
  }
);

t.test(
  "Lambda + Hono + DynamoDB - lost startProcessing race returns 409 when winner still processing",
  async (t) => {
    const { store } = t.context;
    const key = "lambda-race-12345678901234567890";
    const fp = await generateFingerprint(JSON.stringify({ foo: "bar" }));

    // Seed the winner's processing record so the loser's conditional put
    // misses on the real driver.
    await store.startProcessing(key, fp, 60000);

    const loserHandler = handle(createApp(createLostRaceStore(store)));
    const response = await loserHandler(makeEvent(key), CONTEXT);

    t.equal(response.statusCode, 409, "loser should get 409 conflict");
    t.match(
      JSON.parse(response.body).type,
      /#section-2\.6$/,
      "conflict spec reference"
    );
  }
);

t.test(
  "Lambda + Hono + DynamoDB - lost race with different payload returns 422",
  async (t) => {
    const { store } = t.context;
    const key = "lambda-race-12345678901234567890";
    const winnerFp = await generateFingerprint(JSON.stringify({ foo: "bar" }));

    await store.startProcessing(key, winnerFp, 60000);

    const loserHandler = handle(createApp(createLostRaceStore(store)));
    const response = await loserHandler(
      makeEvent(key, JSON.stringify({ foo: "different" })),
      CONTEXT
    );

    t.equal(response.statusCode, 422, "loser should get 422 unprocessable");
    t.match(
      JSON.parse(response.body).type,
      /#section-2\.2$/,
      "422 spec reference"
    );
  }
);
