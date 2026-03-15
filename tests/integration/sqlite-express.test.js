import t from "tap";
import express from "express";
import { idempotency } from "../../packages/frameworks/express/index.js";
import { createSqliteStore, cleanupSqlite } from "./shared/sqlite.js";
import { makeRequest } from "./shared/request.js";

function createSqliteExpressApp(store) {
  const app = express();
  app.use(express.json());
  app.use(idempotency({ store }));
  app.post("/api", async (req, res) => {
    store.db
      .prepare("INSERT INTO orders (data) VALUES (?)")
      .run(JSON.stringify(req.body));
    res.json({ success: true, body: req.body });
  });
  return app;
}

t.beforeEach(async (t) => {
  const store = createSqliteStore();
  const app = createSqliteExpressApp(store);
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
  await cleanupSqlite();
});

t.test("Express + SQLite - first request creates record", async (t) => {
  const { store, port } = t.context;

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

  const records = store.db
    .prepare("SELECT * FROM idempotency_records WHERE key = ?")
    .all("test-key-12345678901234567890");

  t.equal(records.length, 1, "should have one idempotency record");
  t.equal(records[0].key, "test-key-12345678901234567890", "key should match");
  t.equal(records[0].status, "complete", "status should be complete");

  const orders = store.db.prepare("SELECT * FROM orders").all();
  t.equal(orders.length, 1, "should have one order created");
});

t.test(
  "Express + SQLite - duplicate request returns cached response and does not create duplicate records",
  async (t) => {
    const { store, port } = t.context;

    const response1 = await makeRequest(port, {
      idempotencyKey: "test-key-dupe-123456789012345",
      body: { foo: "bar" }
    });
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

    const idempotencyRecords = store.db
      .prepare("SELECT * FROM idempotency_records WHERE key = ?")
      .all("test-key-dupe-123456789012345");

    t.equal(
      idempotencyRecords.length,
      1,
      "should still have one idempotency record"
    );

    const orders = store.db.prepare("SELECT * FROM orders").all();
    t.equal(
      orders.length,
      1,
      "should only have ONE order - duplicate request did not create another"
    );
  }
);

t.test(
  "Express + SQLite - conflict with same fingerprint different key",
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

    const orders = store.db.prepare("SELECT * FROM orders").all();
    t.equal(
      orders.length,
      1,
      "should only have one order despite two different idempotency keys (same fingerprint)"
    );
  }
);
