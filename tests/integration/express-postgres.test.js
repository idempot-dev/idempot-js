import t from "tap";
import express from "express";
import { idempotency } from "../../packages/frameworks/express/index.js";
import {
  createPostgresSchema,
  dropPostgresSchema,
  generateTestId,
  generateIdempotencyKey
} from "./shared/setup.js";
import { makeRequest } from "./shared/request.js";
import { createPostgresStore } from "./shared/postgres.js";

function createExpressPostgresApp(store) {
  const app = express();
  app.use(express.json());
  app.use(idempotency({ store }));
  app.post("/api", async (req, res) => {
    await store.pool.query(
      `INSERT INTO ${store.quotedSchemaIdentifier}.orders (data) VALUES ($1)`,
      [JSON.stringify(req.body)]
    );
    res.json({ success: true, body: req.body });
  });
  return app;
}

t.beforeEach(async (t) => {
  const schema = `t${generateTestId()}`;
  await createPostgresSchema(schema);

  const store = createPostgresStore(schema);
  const app = createExpressPostgresApp(store);
  const server = app.listen(0);
  await new Promise((resolve) => server.on("listening", resolve));
  const port = server.address().port;

  t.context.schema = schema;
  t.context.store = store;
  t.context.server = server;
  t.context.port = port;
});

t.afterEach(async (t) => {
  await t.context.store.close();
  await dropPostgresSchema(t.context.schema);
  t.context.server.close();
});

t.test("Express + Postgres - first request creates record", async (t) => {
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
  "Express + Postgres - duplicate request returns cached response and does not create duplicate records",
  async (t) => {
    const { store, port, schema } = t.context;
    const key = generateIdempotencyKey();

    const response1 = await makeRequest(port, {
      idempotencyKey: key,
      body: { foo: "bar" }
    });
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
  "Express + Postgres - conflict with same fingerprint different key",
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
