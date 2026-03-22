import t from "tap";
import Fastify from "fastify";
import { idempotency } from "../../packages/frameworks/fastify/index.js";
import { makeRequest } from "./shared/request.js";
import { createRedisStore, cleanupRedis } from "./shared/redis.js";

function createFastifyRedisApp(store, client) {
  const app = Fastify();
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      req.body = JSON.parse(body);
      done(null, req.body);
    }
  );
  app.addHook("preHandler", idempotency({ store }));
  app.post("/api", async (req, res) => {
    await client.set(
      `orders:${req.headers["idempotency-key"]}`,
      JSON.stringify(req.body)
    );
    return { success: true, body: req.body };
  });
  return app;
}

t.beforeEach(async (t) => {
  const { store, client, prefix } = await createRedisStore();
  await cleanupRedis(client);

  const app = createFastifyRedisApp(store, client);
  await app.listen({ port: 0 });
  const address = app.server.address();
  const port = address.port;

  t.context.store = store;
  t.context.client = client;
  t.context.prefix = prefix;
  t.context.app = app;
  t.context.port = port;
});

t.afterEach(async (t) => {
  await cleanupRedis(t.context.client);
  await t.context.app.close();
  await t.context.store.close();
});

t.test("Fastify + Redis - first request creates record", async (t) => {
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
  "Fastify + Redis - duplicate request returns cached response and does not create duplicate records",
  async (t) => {
    const { client, prefix, port } = t.context;

    const response1 = await makeRequest(port, {
      idempotencyKey: "test-key-dupe-123456789012345",
      body: { foo: "bar" }
    });

    // Wait for idempotency middleware to mark record as "complete" in Redis.
    // The middleware writes the record asynchronously via res.on('finish'),
    // so we poll until the status changes from "processing" to "complete".
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 10));
      const record = await client.get(
        `${prefix}:idempotency:test-key-dupe-123456789012345`
      );
      if (record && JSON.parse(record).status === "complete") break;
    }

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
  "Fastify + Redis - conflict with same fingerprint different key",
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
