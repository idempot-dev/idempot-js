import t from "tap";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { idempotency } from "../../packages/frameworks/hono/index.js";
import { generateIdempotencyKey } from "./shared/shared-helpers.js";
import { initMysqlSchema, generateTableName } from "./shared/mysql-helpers.js";
import { makeRequest } from "./shared/request.js";
import {
  createNodeMysqlStore,
  waitForIdempotencyRecordComplete
} from "./shared/mysql.js";
import { createLostRaceStore } from "./shared/lost-race-store.js";
import { generateFingerprint } from "../../packages/core/src/fingerprint.js";

function createHonoMysqlApp(store) {
  const app = new Hono();
  app.use("*", idempotency({ store }));
  app.post("/api", async (c) => {
    const body = await c.req.json();
    return c.json({ success: true, body });
  });
  return app;
}

t.beforeEach(async (t) => {
  const tableName = generateTableName();
  await initMysqlSchema(tableName);
  const store = createNodeMysqlStore(tableName);

  const app = createHonoMysqlApp(store);

  const server = serve({
    fetch: app.fetch,
    port: 0
  });

  await new Promise((resolve) => server.on("listening", resolve));
  const port = server.address().port;

  t.context.store = store;
  t.context.server = server;
  t.context.port = port;
  t.context.tableName = tableName;
});

t.afterEach(async (t) => {
  await t.context.store.close();
  t.context.server.close();
});

t.test("Hono + MySQL - first request creates record", async (t) => {
  const { store, port, tableName } = t.context;
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
    `SELECT * FROM \`${tableName}\` WHERE \`key\` = ?`,
    [key]
  );

  t.equal(rows.length, 1, "should have one idempotency record");
  t.equal(rows[0].key, key, "key should match");
  t.equal(rows[0].status, "complete", "status should be complete");
});

t.test(
  "Hono + MySQL - duplicate request returns cached response and does not create duplicate records",
  async (t) => {
    const { store, port, tableName } = t.context;
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
      `SELECT * FROM \`${tableName}\` WHERE \`key\` = ?`,
      [key]
    );

    t.equal(rows.length, 1, "should still have one idempotency record");
  }
);

t.test(
  "Hono + MySQL - conflict with same fingerprint different key",
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
  "Hono + MySQL - lost insert race returns 409 when winner is still processing",
  async (t) => {
    const { store } = t.context;
    const key = generateIdempotencyKey();
    const fp = await generateFingerprint(JSON.stringify({ foo: "bar" }));

    // Seed the winner's processing record directly on the real store so the
    // loser's insert hits the real driver's duplicate-key constraint (ER_DUP_ENTRY).
    await store.startProcessing(key, fp, 60000);

    const wrapped = createLostRaceStore(store);
    const app = createHonoMysqlApp(wrapped);
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
  "Hono + MySQL - lost race replays 200 when winner already completed",
  async (t) => {
    const { store } = t.context;
    const key = generateIdempotencyKey();
    const fp = await generateFingerprint(JSON.stringify({ foo: "bar" }));

    await store.startProcessing(key, fp, 60000);
    await store.complete(key, {
      status: 200,
      headers: { "content-type": "application/json" },
      body: '{"winner":true}'
    });

    const wrapped = createLostRaceStore(store);
    const app = createHonoMysqlApp(wrapped);
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
  "Hono + MySQL - lost race re-lookup finds no record returns 409 (TTL expiry)",
  async (t) => {
    const { store } = t.context;
    const key = generateIdempotencyKey();
    const fp = await generateFingerprint(JSON.stringify({ foo: "bar" }));

    await store.startProcessing(key, fp, 60000);

    // missRecheck: simulate the winner's record having expired (TTL) before
    // the loser's re-lookup runs -> KTD2 says the loser still gets a 409.
    const wrapped = createLostRaceStore(store, { missRecheck: true });
    const app = createHonoMysqlApp(wrapped);
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
