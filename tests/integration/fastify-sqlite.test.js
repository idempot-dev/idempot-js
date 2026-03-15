import t from "tap";
import Fastify from "fastify";
import { idempotency } from "../../packages/frameworks/fastify/index.js";
import { createSqliteStore, cleanupSqlite } from "./shared/sqlite.js";
import { makeRequest } from "./shared/request.js";

function createFastifySqliteApp(store) {
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
    store.db
      .prepare("INSERT INTO orders (data) VALUES (?)")
      .run(JSON.stringify(req.body));
    return { success: true, body: req.body };
  });
  return app;
}

t.beforeEach(async (t) => {
  const store = createSqliteStore();
  const app = createFastifySqliteApp(store);
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
  await cleanupSqlite();
});

t.test("Fastify + SQLite - first request creates record", async (t) => {
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
  "Fastify + SQLite - duplicate request returns cached response and does not create duplicate records",
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
  "Fastify + SQLite - conflict with same fingerprint different key",
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
