import t from "tap";
import Fastify from "fastify";
import { idempotency } from "../../packages/frameworks/fastify/index.js";
import { generateIdempotencyKey } from "./shared/shared-helpers.js";
import { initMysqlSchema } from "./shared/mysql-helpers.js";
import { makeRequest } from "./shared/request.js";
import {
  createNodeMysqlStore,
  waitForIdempotencyRecordComplete
} from "./shared/mysql.js";

function createFastifyMysqlApp(store) {
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
    return { success: true, body: req.body };
  });
  return app;
}

t.beforeEach(async (t) => {
  await initMysqlSchema();
  const store = createNodeMysqlStore();
  await store.pool.query("DELETE FROM idempotency_records");

  const app = createFastifyMysqlApp(store);
  await app.listen({ port: 0 });
  const address = app.server.address();
  const port = address.port;

  t.context.store = store;
  t.context.app = app;
  t.context.port = port;
});

t.afterEach(async (t) => {
  await t.context.store.close();
  await t.context.app.close();
});

t.test("Fastify + MySQL - first request creates record", async (t) => {
  const { store, port } = t.context;
  const key = generateIdempotencyKey();

  const response = await makeRequest(port, {
    idempotencyKey: key,
    body: { foo: "bar" }
  });

  t.equal(response.status, 200, "should return 200");
  t.same(
    response.body,
    { success: true, body: { foo: "bar" } },
    "should return correct body"
  );

  await waitForIdempotencyRecordComplete(store, key);

  const [rows] = await store.pool.query(
    "SELECT * FROM idempotency_records WHERE `key` = ?",
    [key]
  );

  t.equal(rows.length, 1, "should have one idempotency record");
  t.equal(rows[0].key, key, "key should match");
  t.equal(rows[0].status, "complete", "status should be complete");
});

t.test(
  "Fastify + MySQL - duplicate request returns cached response and does not create duplicate records",
  async (t) => {
    const { store, port } = t.context;
    const key = generateIdempotencyKey();

    const response1 = await makeRequest(port, {
      idempotencyKey: key,
      body: { foo: "bar" }
    });

    await waitForIdempotencyRecordComplete(store, key);

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

    const [rows] = await store.pool.query(
      "SELECT * FROM idempotency_records WHERE `key` = ?",
      [key]
    );

    t.equal(rows.length, 1, "should still have one idempotency record");
  }
);

t.test(
  "Fastify + MySQL - conflict with same fingerprint different key",
  async (t) => {
    const { port } = t.context;
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

    t.equal(response2.status, 409, "should return 409 conflict");
  }
);
