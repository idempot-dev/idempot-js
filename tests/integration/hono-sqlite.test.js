import t from "tap";
import { Hono } from "hono";
import { idempotency } from "../../packages/frameworks/hono/index.js";
import { createSqliteStore, cleanupSqlite } from "./shared/sqlite.js";

function createHonoSqliteApp(store) {
  const app = new Hono();
  app.use("*", idempotency({ store }));
  app.post("/api", async (c) => {
    const body = await c.req.json();
    store.db
      .prepare("INSERT INTO orders (data) VALUES (?)")
      .run(JSON.stringify(body));
    return c.json({ success: true, body });
  });
  return app;
}

async function makeHonoRequest(app, options) {
  const url = new URL("http://localhost/api");
  const headers = {
    "idempotency-key": options.idempotencyKey,
    "content-type": "application/json"
  };

  const res = await app.request(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(options.body)
  });

  const contentType = res.headers.get("content-type") || "";
  let body;
  if (contentType.includes("json")) {
    body = await res.json();
  }

  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body
  };
}

t.beforeEach(async (t) => {
  const store = createSqliteStore();
  const app = createHonoSqliteApp(store);

  t.context.store = store;
  t.context.app = app;
});

t.afterEach(async (t) => {
  await t.context.store.close();
  await cleanupSqlite();
});

t.test("Hono + SQLite - first request creates record", async (t) => {
  const { store, app } = t.context;

  const response = await makeHonoRequest(app, {
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
  "Hono + SQLite - duplicate request returns cached response and does not create duplicate records",
  async (t) => {
    const { store, app } = t.context;

    const response1 = await makeHonoRequest(app, {
      idempotencyKey: "test-key-dupe-123456789012345",
      body: { foo: "bar" }
    });
    const response2 = await makeHonoRequest(app, {
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
  "Hono + SQLite - conflict with same fingerprint different key",
  async (t) => {
    const { store, app } = t.context;

    await makeHonoRequest(app, {
      idempotencyKey: "test-key-conflict-a-123456789",
      body: { foo: "bar" }
    });
    const response2 = await makeHonoRequest(app, {
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
