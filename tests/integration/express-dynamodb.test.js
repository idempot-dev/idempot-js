import t from "tap";
import express from "express";
import { idempotency } from "../../packages/frameworks/express/index.js";
import { makeRequest } from "./shared/request.js";
import { createDynamoDBStore, cleanupDynamoDB } from "./shared/dynamodb.js";
import { createLostRaceStore } from "./shared/lost-race-store.js";
import { generateFingerprint } from "../../packages/core/src/fingerprint.js";
import { GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

function createExpressDynamoDBApp(store, state) {
  const app = express();
  app.use(express.json());
  app.use(idempotency({ store }));
  app.post("/api", async (req, res) => {
    state.orders += 1;
    res.json({ success: true, body: req.body });
  });
  return app;
}

async function waitForCompleteRecord(client, tableName, key) {
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
  const state = { orders: 0 };

  const app = createExpressDynamoDBApp(store, state);
  const server = app.listen(0);
  await new Promise((resolve) => server.on("listening", resolve));
  const port = server.address().port;

  t.context.store = store;
  t.context.client = client;
  t.context.tableName = tableName;
  t.context.state = state;
  t.context.server = server;
  t.context.port = port;
});

t.afterEach(async (t) => {
  await new Promise((resolve) => t.context.server.close(resolve));
  await cleanupDynamoDB(t.context.client, t.context.tableName);
  await t.context.store.close();
});

t.test("Express + DynamoDB - first request creates record", async (t) => {
  const { client, tableName, port, state } = t.context;

  const response = await makeRequest(port, {
    idempotencyKey: "test-key-12345678901234567890",
    body: { foo: "bar" }
  });

  t.equal(response.status, 200, "should return 200");
  t.same(
    response.body,
    { success: true, body: { foo: "bar" } },
    "should return correct body"
  );

  const result = await client.send(
    new GetItemCommand({
      TableName: tableName,
      Key: { key: { S: "test-key-12345678901234567890" } }
    })
  );
  t.ok(result.Item, "should have one idempotency record");
  t.equal(state.orders, 1, "should have one order created");
});

t.test(
  "Express + DynamoDB - duplicate request returns cached response and does not create duplicate records",
  async (t) => {
    const { client, tableName, port, state } = t.context;
    const key = "test-key-dupe-123456789012345";

    const response1 = await makeRequest(port, {
      idempotencyKey: key,
      body: { foo: "bar" }
    });

    // The middleware writes the record via res.on('finish'), so poll until
    // the status flips from "processing" to "complete" before replaying.
    await waitForCompleteRecord(client, tableName, key);

    const response2 = await makeRequest(port, {
      idempotencyKey: key,
      body: { foo: "bar" }
    });

    t.equal(response1.status, 200, "first request should return 200");
    t.equal(response2.status, 200, "duplicate request should return 200");
    t.equal(
      response2.headers["x-idempotent-replayed"],
      "true",
      "duplicate should have replay header"
    );

    const result = await client.send(
      new GetItemCommand({ TableName: tableName, Key: { key: { S: key } } })
    );
    t.ok(result.Item, "should still have one idempotency record");
    t.equal(state.orders, 1, "duplicate request must not create another order");
  }
);

t.test(
  "Express + DynamoDB - conflict with same fingerprint different key",
  async (t) => {
    const { port, state } = t.context;

    await makeRequest(port, {
      idempotencyKey: "test-key-conflict-a-123456789",
      body: { foo: "bar" }
    });
    const response2 = await makeRequest(port, {
      idempotencyKey: "test-key-conflict-b-123456789",
      body: { foo: "bar" }
    });

    t.equal(response2.status, 409, "should return 409 conflict");
    t.equal(
      state.orders,
      1,
      "should only have one order despite two different keys (same fingerprint)"
    );
  }
);

t.test(
  "Express + DynamoDB - lost startProcessing race returns 409 when winner still processing",
  async (t) => {
    const { store, state } = t.context;
    const key = "dynamo-race-12345678901234567890";
    const fp = await generateFingerprint(JSON.stringify({ foo: "bar" }));

    // Seed the winner's processing record so the loser's conditional put
    // misses on the real driver.
    await store.startProcessing(key, fp, 60000);

    const wrapped = createLostRaceStore(store);
    const app = createExpressDynamoDBApp(wrapped, { orders: 0 });
    const server = app.listen(0);
    await new Promise((resolve) => server.on("listening", resolve));
    const racePort = server.address().port;

    const response = await makeRequest(racePort, {
      idempotencyKey: key,
      body: { foo: "bar" }
    });
    server.close();

    t.equal(response.status, 409, "loser should get 409 conflict");
    t.match(response.body.type, /#section-2\.6$/, "conflict spec reference");
    t.equal(response.body.retryable, true, "conflict is retryable");
    t.equal(state.orders, 0, "loser must not create an order");
  }
);

t.test(
  "Express + DynamoDB - lost race with different payload returns 422",
  async (t) => {
    const { store, state } = t.context;
    const key = "dynamo-race-12345678901234567890";
    const winnerFp = await generateFingerprint(JSON.stringify({ foo: "bar" }));

    await store.startProcessing(key, winnerFp, 60000);

    const wrapped = createLostRaceStore(store);
    const app = createExpressDynamoDBApp(wrapped, { orders: 0 });
    const server = app.listen(0);
    await new Promise((resolve) => server.on("listening", resolve));
    const racePort = server.address().port;

    const response = await makeRequest(racePort, {
      idempotencyKey: key,
      body: { foo: "different" }
    });
    server.close();

    t.equal(response.status, 422, "loser should get 422 unprocessable");
    t.match(response.body.type, /#section-2\.2$/, "422 spec reference");
    t.equal(response.body.retryable, false, "422 is not retryable");
    t.equal(state.orders, 0, "loser must not create an order");
  }
);
