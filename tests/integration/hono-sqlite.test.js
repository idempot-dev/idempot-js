import t from "tap";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { idempotency } from "../../packages/frameworks/hono/index.js";
import { createSqliteStore, cleanupSqlite } from "./shared/sqlite.js";
import { makeRequest } from "./shared/request.js";
import { createLostRaceStore } from "./shared/lost-race-store.js";
import { generateFingerprint } from "../../packages/core/src/fingerprint.js";

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

t.beforeEach(async (t) => {
  const store = createSqliteStore();
  const app = createHonoSqliteApp(store);

  const server = serve({
    fetch: app.fetch,
    port: 0
  });

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

t.test("Hono + SQLite - first request creates record", async (t) => {
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
  "Hono + SQLite - duplicate request returns cached response and does not create duplicate records",
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
  "Hono + SQLite - conflict with same fingerprint different key",
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

t.test(
  "Hono + SQLite - lost insert race returns 409 when winner is still processing",
  async (t) => {
    const { store } = t.context;
    const key = "race-key-12345678901234567890";
    const fp = await generateFingerprint(JSON.stringify({ foo: "bar" }));

    // Seed the winner's processing record directly on the real store so the
    // loser's insert hits the real driver's primary-key constraint.
    await store.startProcessing(key, fp, 60000);

    const wrapped = createLostRaceStore(store);
    const app = createHonoSqliteApp(wrapped);
    const server = serve({ fetch: app.fetch, port: 0 });
    await new Promise((resolve) => server.on("listening", resolve));
    const racePort = server.address().port;

    const response = await makeRequest(racePort, {
      idempotencyKey: key,
      body: { foo: "bar" }
    });
    server.close();

    t.equal(response.status, 409, "loser should get 409 conflict");
    t.match(response.body.type, /#section-2\.6$/, "conflict spec reference");
    t.equal(response.body.retryable, true, "conflict is retryable");
  }
);

t.test(
  "Hono + SQLite - lost race replays 200 when winner already completed",
  async (t) => {
    const { store } = t.context;
    const key = "race-complete-key-12345678901";
    const fp = await generateFingerprint(JSON.stringify({ foo: "bar" }));

    await store.startProcessing(key, fp, 60000);
    await store.complete(key, {
      status: 200,
      headers: { "content-type": "application/json" },
      body: '{"winner":true}'
    });

    const wrapped = createLostRaceStore(store);
    const app = createHonoSqliteApp(wrapped);
    const server = serve({ fetch: app.fetch, port: 0 });
    await new Promise((resolve) => server.on("listening", resolve));
    const racePort = server.address().port;

    const response = await makeRequest(racePort, {
      idempotencyKey: key,
      body: { foo: "bar" }
    });
    server.close();

    t.equal(response.status, 200, "loser gets 200 replay");
    t.equal(response.body.winner, true, "body is the winner's body");
    t.equal(response.headers["x-idempotent-replayed"], "true", "replay header");
  }
);

t.test(
  "Hono + SQLite - lost race re-lookup finds no record returns 409 (TTL expiry)",
  async (t) => {
    const { store } = t.context;
    const key = "race-expired-key-12345678901";
    const fp = await generateFingerprint(JSON.stringify({ foo: "bar" }));

    await store.startProcessing(key, fp, 60000);

    // missRecheck: simulate the winner's record having expired (TTL) before
    // the loser's re-lookup runs -> KTD2 says the loser still gets a 409.
    const wrapped = createLostRaceStore(store, { missRecheck: true });
    const app = createHonoSqliteApp(wrapped);
    const server = serve({ fetch: app.fetch, port: 0 });
    await new Promise((resolve) => server.on("listening", resolve));
    const racePort = server.address().port;

    const response = await makeRequest(racePort, {
      idempotencyKey: key,
      body: { foo: "bar" }
    });
    server.close();

    t.equal(response.status, 409, "no-record re-lookup returns 409 per KTD2");
    t.equal(response.body.retryable, true, "conflict is retryable");
  }
);
