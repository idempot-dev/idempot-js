import t from "tap";
import express from "express";
import { idempotency } from "../../packages/frameworks/express/index.js";
import {
  generateTestId,
  generateIdempotencyKey
} from "./shared/shared-helpers.js";
import { initMysqlSchema } from "./shared/mysql-helpers.js";
import { makeRequest } from "./shared/request.js";
import {
  createNodeMysqlStore,
  waitForIdempotencyRecordComplete
} from "./shared/mysql.js";

function createExpressMysqlApp(store) {
  const app = express();
  app.use(express.json());
  app.use(idempotency({ store }));
  app.post("/api", async (req, res) => {
    res.json({ success: true, body: req.body });
  });
  return app;
}

t.beforeEach(async (t) => {
  await initMysqlSchema();
  const store = createNodeMysqlStore();
  await store.pool.query("DELETE FROM idempotency_records");

  const app = createExpressMysqlApp(store);
  const server = app.listen(0);
  await new Promise((resolve) => server.on("listening", resolve));
  const port = server.address().port;

  t.context.store = store;
  t.context.server = server;
  t.context.port = port;
});

t.afterEach(async (t) => {
  await t.context.store.close();
  t.context.server.close();
});

t.test("Express + MySQL - first request creates record", async (t) => {
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
  "Express + MySQL - duplicate request returns cached response and does not create duplicate records",
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
  "Express + MySQL - conflict with same fingerprint different key",
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

t.test(
  "Express + MySQL - complete throws error for non-existent key",
  async (t) => {
    const { store } = t.context;
    const key = generateIdempotencyKey();

    await t.rejects(
      store.complete(key, {
        status: 200,
        headers: { "content-type": "application/json" },
        body: '{"success":true}'
      }),
      /No record found for key/,
      "should throw error when completing non-existent record"
    );
  }
);

t.test(
  "Express + MySQL - handles null response_headers gracefully",
  async (t) => {
    const { store, port } = t.context;
    const key = generateIdempotencyKey();

    await store.pool.query(
      "INSERT INTO idempotency_records (`key`, fingerprint, status, response_status, response_headers, response_body, expires_at) VALUES (?, ?, 'complete', ?, ?, ?, ?)",
      [key, key + "fp", 200, null, '{"test":true}', Date.now() + 60000]
    );

    const result = await store.lookup(key, key + "fp");
    t.same(
      result.byKey?.response?.headers,
      {},
      "should return empty object for null headers"
    );
    t.equal(
      result.byKey?.response?.body,
      '{"test":true}',
      "should have response body"
    );
  }
);

t.test("Express + MySQL - handles empty string response_headers", async (t) => {
  const { store } = t.context;
  const key = generateIdempotencyKey();

  await store.pool.query(
    "INSERT INTO idempotency_records (`key`, fingerprint, status, response_status, response_headers, response_body, expires_at) VALUES (?, ?, 'complete', ?, ?, ?, ?)",
    [key, key + "fp", 200, "", '{"test":true}', Date.now() + 60000]
  );

  const result = await store.lookup(key, key + "fp");
  t.same(
    result.byKey?.response?.headers,
    {},
    "should return empty object for empty string headers"
  );
});
