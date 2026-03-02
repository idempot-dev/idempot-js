import { test } from "tap";
import Fastify from "fastify";
import { idempotency } from "../src/fastify-middleware.js";
import { SqliteIdempotencyStore } from "../src/store/sqlite.js";

test("returns 400 if idempotency-key is missing and required", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const fastify = Fastify();

  fastify.post(
    "/test",
    { preHandler: idempotency({ store, required: true }) },
    async (request, reply) => {
      return reply.send({ ok: true });
    }
  );

  const response = await fastify.inject({
    method: "POST",
    url: "/test",
    payload: { foo: "bar" }
  });

  t.equal(response.statusCode, 400);
  t.match(response.json(), { error: /Idempotency-Key header is required/ });
});

test("passes through when idempotency-key is provided", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const fastify = Fastify();

  fastify.post(
    "/test",
    { preHandler: idempotency({ store }) },
    async (request, reply) => {
      return reply.code(201).send({ id: "order-123" });
    }
  );

  const response = await fastify.inject({
    method: "POST",
    url: "/test",
    payload: { foo: "bar" },
    headers: { "idempotency-key": "test-key-123" }
  });

  t.equal(response.statusCode, 201);
  t.equal(response.json().id, "order-123");
});

test("GET requests pass through without idempotency processing", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const fastify = Fastify();

  let handlerCalled = false;
  fastify.get(
    "/test",
    { preHandler: idempotency({ store }) },
    async (request, reply) => {
      handlerCalled = true;
      return reply.send({ ok: true });
    }
  );

  const response = await fastify.inject({
    method: "GET",
    url: "/test"
  });

  t.ok(handlerCalled);
  t.equal(response.statusCode, 200);
});

test("returns 400 if idempotency-key is too long", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const fastify = Fastify();

  fastify.post(
    "/test",
    { preHandler: idempotency({ store }) },
    async (request, reply) => {
      return reply.send({ ok: true });
    }
  );

  const longKey = "a".repeat(256);
  const response = await fastify.inject({
    method: "POST",
    url: "/test",
    payload: { foo: "bar" },
    headers: { "idempotency-key": longKey }
  });

  t.equal(response.statusCode, 400);
  t.match(response.json(), { error: /between 1-/ });
});

test("caches response on first request with idempotency key", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const fastify = Fastify();
  let handlerCallCount = 0;

  fastify.post(
    "/test",
    { preHandler: idempotency({ store }) },
    async (request, reply) => {
      handlerCallCount++;
      return reply.code(201).send({ id: "order-123" });
    }
  );

  // First request
  const response1 = await fastify.inject({
    method: "POST",
    url: "/test",
    payload: { foo: "bar" },
    headers: { "idempotency-key": "unique-key-1" }
  });

  t.equal(response1.statusCode, 201);
  t.equal(handlerCallCount, 1);

  // Second request with same key should replay cached response
  const response2 = await fastify.inject({
    method: "POST",
    url: "/test",
    payload: { foo: "bar" },
    headers: { "idempotency-key": "unique-key-1" }
  });

  t.equal(response2.statusCode, 201);
  t.equal(response2.headers["x-idempotent-replayed"], "true");
  t.equal(handlerCallCount, 1); // Handler should NOT be called again
});

test("returns 409 when same idempotency key is already processing", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const fastify = Fastify();

  // Start processing but don't complete
  await store.startProcessing("processing-key", "fp1", 60000);

  fastify.post(
    "/test",
    { preHandler: idempotency({ store }) },
    async (request, reply) => {
      return reply.send({ ok: true });
    }
  );

  const response = await fastify.inject({
    method: "POST",
    url: "/test",
    payload: { foo: "bar" },
    headers: { "idempotency-key": "processing-key" }
  });

  t.equal(response.statusCode, 409);
  t.match(response.json(), { error: /already being processed/ });
});
