import t from "tap";
import express from "express";
import { idempotency } from "../../packages/frameworks/express/index.js";
import { makeRequest } from "./shared/request.js";
import { createRedisStore, cleanupRedis, closeRedis } from "./shared/redis.js";

function createExpressRedisApp(store, client) {
  const app = express();
  app.use(express.json());
  app.use(idempotency({ store }));
  app.post("/api", async (req, res) => {
    await client.set(
      `orders:${req.headers["idempotency-key"]}`,
      JSON.stringify(req.body)
    );
    res.json({ success: true, body: req.body });
  });
  return app;
}

t.beforeEach(async (t) => {
  const { store, client, prefix } = await createRedisStore();
  await cleanupRedis(client);

  const app = createExpressRedisApp(store, client);
  const server = app.listen(0);
  await new Promise((resolve) => server.on("listening", resolve));
  const port = server.address().port;

  t.context.store = store;
  t.context.client = client;
  t.context.prefix = prefix;
  t.context.server = server;
  t.context.port = port;
});

t.afterEach(async (t) => {
  await cleanupRedis(t.context.client);
  await new Promise((resolve) => t.context.server.close(resolve));
  await closeRedis(t.context.client);
});

t.test("Express + Redis - first request creates record", async (t) => {
  const { client, prefix, port } = t.context;

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

  const keys = await client.keys(`*${prefix}:idempotency:*`);
  t.equal(keys.length, 1, "should have one idempotency record");

  const orderKeys = await client.keys(`*${prefix}:orders:*`);
  t.equal(orderKeys.length, 1, "should have one order created");
});

t.test(
  "Express + Redis - duplicate request returns cached response and does not create duplicate records",
  async (t) => {
    const { store, client, prefix, port } = t.context;

    const response1 = await makeRequest(port, {
      idempotencyKey: "test-key-dupe-123456789012345",
      body: { foo: "bar" }
    });

    // Wait for idempotency middleware to mark record as "complete" in Redis.
    // The middleware writes the record asynchronously via res.on('finish'),
    // so we poll until the status changes from "processing" to "complete".
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 20));
      const record = await client.get(
        `${prefix}:idempotency:test-key-dupe-123456789012345`
      );
      if (record && JSON.parse(record).status === "complete") break;
    }

    // Additional buffer to ensure the complete() Redis write is fully propagated
    // before we make the duplicate request.
    await new Promise((r) => setTimeout(r, 50));

    const response2 = await makeRequest(port, {
      idempotencyKey: "test-key-dupe-123456789012345",
      body: { foo: "bar" }
    });

    t.equal(response1.status, 200, "first request should return 200");
    t.equal(response2.status, 200, "duplicate request should return 200");
    t.equal(
      response2.headers["x-idempotent-replayed"],
      "true",
      "duplicate should have replay header"
    );

    const keys = await client.keys(`*${prefix}:idempotency:*`);
    t.equal(keys.length, 1, "should still have one idempotency record");

    const orderKeys = await client.keys(`*${prefix}:orders:*`);
    t.equal(
      orderKeys.length,
      1,
      "should only have ONE order - duplicate request did not create another"
    );
  }
);

t.test(
  "Express + Redis - conflict with same fingerprint different key",
  async (t) => {
    const { client, prefix, port } = t.context;

    await makeRequest(port, {
      idempotencyKey: "test-key-conflict-a-123456789",
      body: { foo: "bar" }
    });
    const response2 = await makeRequest(port, {
      idempotencyKey: "test-key-conflict-b-123456789",
      body: { foo: "bar" }
    });

    t.equal(response2.status, 409, "should return 409 conflict");

    const orderKeys = await client.keys(`*${prefix}:orders:*`);
    t.equal(
      orderKeys.length,
      1,
      "should only have one order despite two different idempotency keys (same fingerprint)"
    );
  }
);
