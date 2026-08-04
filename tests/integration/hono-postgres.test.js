import t from "tap";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { idempotency } from "../../packages/frameworks/hono/index.js";
import {
  createPostgresSchema,
  dropPostgresSchema
} from "./shared/postgres-helpers.js";
import {
  generateTestId,
  generateIdempotencyKey
} from "./shared/shared-helpers.js";
import { makeRequest } from "./shared/request.js";
import {
  createPostgresStore,
  waitForIdempotencyRecordComplete
} from "./shared/postgres.js";
import { createLostRaceStore } from "./shared/lost-race-store.js";
import { generateFingerprint } from "../../packages/core/src/fingerprint.js";
import { IdempotencyKeyExistsError } from "../../packages/core/src/errors.js";

function createHonoPostgresApp(store) {
  const app = new Hono();
  app.use("*", idempotency({ store }));
  app.post("/api", async (c) => {
    const body = await c.req.json();
    await store.pool.query(
      `INSERT INTO ${store.quotedSchemaIdentifier}.orders (data) VALUES ($1)`,
      [JSON.stringify(body)]
    );
    return c.json({ success: true, body });
  });
  return app;
}

t.beforeEach(async (t) => {
  const schema = `t${generateTestId()}`;
  await createPostgresSchema(schema);

  const store = await createPostgresStore(schema);
  const app = createHonoPostgresApp(store);

  const server = serve({
    fetch: app.fetch,
    port: 0
  });

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

t.test("Hono + Postgres - first request creates record", async (t) => {
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
  "Hono + Postgres - duplicate request returns cached response and does not create duplicate records",
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
  "Hono + Postgres - conflict with same fingerprint different key",
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

t.test(
  "Hono + Postgres - returns 422 when same key is used with different payload",
  async (t) => {
    const { store, port, schema } = t.context;
    const key = generateIdempotencyKey();

    await makeRequest(port, {
      idempotencyKey: key,
      body: { foo: "bar" }
    });

    await waitForIdempotencyRecordComplete(store, schema, key);

    const response2 = await makeRequest(port, {
      idempotencyKey: key,
      body: { foo: "different" }
    });

    t.equal(response2.status, 422, "should return 422");
    t.ok(
      response2.headers["content-type"].includes("application/problem+json"),
      "should return problem+json content type"
    );
    t.match(response2.body.type, /idempotency/i, "should have type field");
    t.match(
      response2.body.title,
      /already used|different/i,
      "should indicate key is already used"
    );
  }
);

t.test(
  "Hono + Postgres - lost insert race returns 409 when winner is still processing",
  async (t) => {
    const { store } = t.context;
    const key = generateIdempotencyKey();
    const fp = await generateFingerprint(JSON.stringify({ foo: "bar" }));

    // Seed the winner's processing record directly on the real store so the
    // loser's insert hits the real driver's primary-key constraint (23505).
    await store.startProcessing(key, fp, 60000);

    const wrapped = createLostRaceStore(store);
    const app = createHonoPostgresApp(wrapped);
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
  "Hono + Postgres - lost race with different payload returns 422",
  async (t) => {
    const { store } = t.context;
    const key = generateIdempotencyKey();
    const winnerFp = await generateFingerprint(JSON.stringify({ foo: "bar" }));

    await store.startProcessing(key, winnerFp, 60000);

    const wrapped = createLostRaceStore(store);
    const app = createHonoPostgresApp(wrapped);
    const server = serve({ fetch: app.fetch, port: 0 });
    await new Promise((resolve) => server.on("listening", resolve));
    const racePort = server.address().port;

    const response = await makeRequest(racePort, {
      idempotencyKey: key,
      body: { foo: "different" }
    });
    server.close();

    t.equal(response.status, 422, "loser should get 422 unprocessable");
    t.match(response.body.type, /#section-2\.2$/, "422 spec reference");
    t.equal(response.body.retryable, false, "422 is not retryable");
  }
);

t.test(
  "Hono + Postgres - lost race replays 200 when winner already completed",
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
    const app = createHonoPostgresApp(wrapped);
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
  "Hono + Postgres - lost race re-lookup finds no record returns 409 (TTL expiry)",
  async (t) => {
    const { store } = t.context;
    const key = generateIdempotencyKey();
    const fp = await generateFingerprint(JSON.stringify({ foo: "bar" }));

    await store.startProcessing(key, fp, 60000);

    // missRecheck: simulate the winner's record having expired (TTL) before
    // the loser's re-lookup runs -> KTD2 says the loser still gets a 409.
    const wrapped = createLostRaceStore(store, { missRecheck: true });
    const app = createHonoPostgresApp(wrapped);
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

t.test(
  "Hono + Postgres - two concurrent startProcessing calls on the same key: exactly one wins",
  async (t) => {
    const { store } = t.context;
    const key = generateIdempotencyKey();
    const fp = generateFingerprint(JSON.stringify({ foo: "bar" }));

    const results = await Promise.allSettled([
      store.startProcessing(key, fp, 60000),
      store.startProcessing(key, fp, 60000)
    ]);

    // The primary key on `key` guarantees exactly one INSERT commits and the
    // other hits 23505 -> IdempotencyKeyExistsError, regardless of which
    // request wins the race.
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    t.equal(fulfilled.length, 1, "exactly one concurrent insert wins");
    t.equal(rejected.length, 1, "exactly one concurrent insert loses");
    t.match(
      rejected[0]?.reason,
      IdempotencyKeyExistsError,
      "the loser surfaces IdempotencyKeyExistsError (not a 503-style driver error)"
    );
  }
);
