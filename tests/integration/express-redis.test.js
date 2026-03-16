import t from "tap";
import express from "express";
import { idempotency } from "../../packages/frameworks/express/index.js";
import { generateTestId } from "./shared/setup.js";
import { makeRequest } from "./shared/request.js";
import { createRedisStore, cleanupRedis } from "./shared/redis.js";

function createExpressRedisApp(store) {
  const app = express();
  app.use(express.json());
  app.use(idempotency({ store }));
  app.post("/api", async (req, res) => {
    await store.client.set(
      `orders:${req.headers["idempotency-key"]}`,
      JSON.stringify(req.body)
    );
    res.json({ success: true, body: req.body });
  });
  return app;
}

t.beforeEach(async (t) => {
  await cleanupRedis();

  const store = await createRedisStore();
  const app = createExpressRedisApp(store);
  const server = app.listen(0);
  await new Promise((resolve) => server.on("listening", resolve));
  const port = server.address().port;

  t.context.store = store;
  t.context.server = server;
  t.context.port = port;
});

t.afterEach(async (t) => {
  await cleanupRedis();
  await new Promise((resolve) => t.context.server.close(resolve));
});

t.test("Express + Redis - first request creates record", async (t) => {
  const { store, port } = t.context;

  const response = await makeRequest(port, {
    idempotencyKey: "test-key-12345678901234567890",
    body: { foo: "bar" }
  });

  await new Promise((resolve) => setTimeout(resolve, 100));

  t.equal(response.status, 200, "should return 200");
  t.same(
    response.body,
    { success: true, body: { foo: "bar" } },
    "should return correct body"
  );

  const record = await store.client.get(
    "idempotency:test-key-12345678901234567890"
  );
  t.ok(record, "should have idempotency record");

  const parsed = JSON.parse(record);
  t.equal(parsed.key, "test-key-12345678901234567890", "key should match");
  t.equal(parsed.status, "complete", "status should be complete");

  const order = await store.client.get("orders:test-key-12345678901234567890");
  t.ok(order, "should have order created");
});

t.test(
  "Express + Redis - duplicate request returns cached response and does not create duplicate records",
  async (t) => {
    const { store, port } = t.context;

    const response1 = await makeRequest(port, {
      idempotencyKey: "test-key-dupe-123456789012345",
      body: { foo: "bar" }
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
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

    const keys = await store.client.keys("*idempotency*");
    t.equal(keys.length, 1, "should still have one idempotency record");

    const orderKeys = await store.client.keys("*order*");
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
    const { store, port } = t.context;

    await makeRequest(port, {
      idempotencyKey: "test-key-conflict-a-123456789",
      body: { foo: "bar" }
    });
    const response2 = await makeRequest(port, {
      idempotencyKey: "test-key-conflict-b-123456789",
      body: { foo: "bar" }
    });

    t.equal(response2.status, 409, "should return 409 conflict");

    const orderKeys = await store.client.keys("*order*");
    t.equal(
      orderKeys.length,
      1,
      "should only have one order despite two different idempotency keys (same fingerprint)"
    );
  }
);
