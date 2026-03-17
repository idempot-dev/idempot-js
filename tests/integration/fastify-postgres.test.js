import t from "tap";
import Fastify from "fastify";
import { idempotency } from "../../packages/frameworks/fastify/index.js";
import {
  createPostgresSchema,
  dropPostgresSchema,
  generateTestId,
  generateIdempotencyKey
} from "./shared/setup.js";
import { makeRequest } from "./shared/request.js";
import {
  createPostgresStore,
  waitForIdempotencyRecordComplete
} from "./shared/postgres.js";

function createFastifyPostgresApp(store) {
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
    await store.pool.query(
      `INSERT INTO ${store.quotedSchemaIdentifier}.orders (data) VALUES ($1)`,
      [JSON.stringify(req.body)]
    );
    return { success: true, body: req.body };
  });
  return app;
}

t.beforeEach(async (t) => {
  const schema = `t${generateTestId()}`;
  await createPostgresSchema(schema);

  const store = createPostgresStore(schema);
  const app = createFastifyPostgresApp(store);
  await app.listen({ port: 0 });
  const address = app.server.address();
  const port = address.port;

  t.context.schema = schema;
  t.context.store = store;
  t.context.app = app;
  t.context.port = port;
});

t.afterEach(async (t) => {
  await t.context.store.close();
  await dropPostgresSchema(t.context.schema);
  await t.context.app.close();
});

t.test("Fastify + Postgres - first request creates record", async (t) => {
  const { store, port, schema } = t.context;
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

  await waitForIdempotencyRecordComplete(store, schema, key);

  const records = await store.pool.query(
    `SELECT * FROM ${schema}.idempotency_records WHERE key = $1`,
    [key]
  );

  t.equal(records.rows.length, 1, "should have one idempotency record");
  t.equal(records.rows[0].key, key, "key should match");
  t.equal(records.rows[0].status, "complete", "status should be complete");

  const orders = await store.pool.query(`SELECT * FROM ${schema}.orders`);
  t.equal(orders.rows.length, 1, "should have one order created");
});

t.test(
  "Fastify + Postgres - duplicate request returns cached response and does not create duplicate records",
  async (t) => {
    const { store, port, schema } = t.context;
    const key = generateIdempotencyKey();

    const response1 = await makeRequest(port, {
      idempotencyKey: key,
      body: { foo: "bar" }
    });

    await waitForIdempotencyRecordComplete(store, schema, key);

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

    const idempotencyRecords = await store.pool.query(
      `SELECT * FROM ${schema}.idempotency_records WHERE key = $1`,
      [key]
    );

    t.equal(
      idempotencyRecords.rows.length,
      1,
      "should still have one idempotency record"
    );

    const orders = await store.pool.query(`SELECT * FROM ${schema}.orders`);
    t.equal(
      orders.rows.length,
      1,
      "should only have ONE order - duplicate request did not create another"
    );
  }
);

t.test(
  "Fastify + Postgres - conflict with same fingerprint different key",
  async (t) => {
    const { store, port, schema } = t.context;
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

    const orders = await store.pool.query(`SELECT * FROM ${schema}.orders`);
    t.equal(
      orders.rows.length,
      1,
      "should only have one order despite two different idempotency keys (same fingerprint)"
    );
  }
);
