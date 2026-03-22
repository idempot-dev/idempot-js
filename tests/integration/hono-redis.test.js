import t from "tap";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { idempotency } from "../../packages/frameworks/hono/index.js";
import { makeRequest } from "./shared/request.js";
import { createRedisStore, cleanupRedis } from "./shared/redis.js";

function createHonoRedisApp(store, client) {
  const app = new Hono();
  app.use("*", idempotency({ store }));
  app.post("/api", async (c) => {
    const body = await c.req.json();
    await client.set(
      `orders:${c.req.header("idempotency-key")}`,
      JSON.stringify(body)
    );
    return c.json({ success: true, body });
  });
  return app;
}

t.beforeEach(async (t) => {
  const { store, client, prefix } = await createRedisStore();
  await cleanupRedis(client);

  const app = createHonoRedisApp(store, client);

  const server = serve({
    fetch: app.fetch,
    port: 0
  });

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
  await t.context.store.close();
});

t.test("Hono + Redis - first request creates record", async (t) => {
  const { client, prefix, port } = t.context;

  const response = await makeRequest(port, {
    idempotencyKey: "test-key-12345678901234567890",
    body: { foo: "bar" }
  });

  // Wait for idempotency middleware to write the record to Redis.
  // The middleware completes asynchronously, so we need to wait before
  // checking that keys exist.
  await new Promise((resolve) => setTimeout(resolve, 100));

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
  "Hono + Redis - duplicate request returns cached response and does not create duplicate records",
  async (t) => {
    const { client, prefix, port } = t.context;

    const response1 = await makeRequest(port, {
      idempotencyKey: "test-key-dupe-123456789012345",
      body: { foo: "bar" }
    });
    // Wait for idempotency middleware to write the record to Redis
    // before making the duplicate request.
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
  "Hono + Redis - conflict with same fingerprint different key",
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
