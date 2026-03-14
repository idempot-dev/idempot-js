import { test } from "tap";
import Fastify from "fastify";
import { idempotency } from "@idempot/fastify-middleware";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

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
    headers: { "idempotency-key": "test-key-123456789012" }
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
  t.match(response.json(), { error: /between 21-/ });
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
    headers: { "idempotency-key": "unique-key-12345678901" }
  });

  t.equal(response1.statusCode, 201);
  t.equal(handlerCallCount, 1);

  // Second request with same key should replay cached response
  const response2 = await fastify.inject({
    method: "POST",
    url: "/test",
    payload: { foo: "bar" },
    headers: { "idempotency-key": "unique-key-12345678901" }
  });

  t.equal(response2.statusCode, 201);
  t.equal(response2.headers["x-idempotent-replayed"], "true");
  t.equal(handlerCallCount, 1); // Handler should NOT be called again
});

test("returns 409 when same idempotency key is already processing", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const fastify = Fastify();

  // Start processing but don't complete
  await store.startProcessing("processing-key-123456789", "fp1", 60000);

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
    headers: { "idempotency-key": "processing-key-123456789" }
  });

  t.equal(response.statusCode, 409);
  t.match(response.json(), { error: /already being processed/ });
});

test("returns 409 when same fingerprint was used with different key", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const fastify = Fastify();

  // Complete a request with one key first
  fastify.post(
    "/test",
    { preHandler: idempotency({ store }) },
    async (request, reply) => {
      return reply.code(201).send({ id: "order-1" });
    }
  );

  // First request with key-1
  await fastify.inject({
    method: "POST",
    url: "/test",
    payload: { foo: "bar" },
    headers: { "idempotency-key": "key-1-16-chars-longxxxx" }
  });

  // New request with same body but different key
  const response = await fastify.inject({
    method: "POST",
    url: "/test",
    payload: { foo: "bar" }, // Same fingerprint
    headers: { "idempotency-key": "key-2-16-chars-longxxxx" } // Different key
  });

  t.equal(response.statusCode, 409);
  t.match(response.json(), { error: /different idempotency key/ });
});

test("returns 422 when idempotency key reused with different payload", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const fastify = Fastify();

  fastify.post(
    "/test",
    { preHandler: idempotency({ store }) },
    async (request, reply) => {
      return reply.code(201).send({ id: "order-1" });
    }
  );

  // First request with one key
  await fastify.inject({
    method: "POST",
    url: "/test",
    payload: { foo: "bar" },
    headers: { "idempotency-key": "same-key-123456789012" }
  });

  // New request with same key but different body
  const response = await fastify.inject({
    method: "POST",
    url: "/test",
    payload: { foo: "different" }, // Different fingerprint
    headers: { "idempotency-key": "same-key-123456789012" }
  });

  t.equal(response.statusCode, 422);
  t.match(response.json(), { error: /different request payload/ });
});

test("exposes circuit breaker", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });

  const middleware = idempotency({ store });

  t.ok(middleware.circuit);
});

test("throws when store is not provided", async (t) => {
  t.throws(() => {
    idempotency({});
  }, /IdempotencyStore must be provided/);
});

test("POST without key when optional", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const fastify = Fastify();

  let handlerCalled = false;
  fastify.post(
    "/test",
    { preHandler: idempotency({ store, required: false }) },
    async (request, reply) => {
      handlerCalled = true;
      return reply.send({ ok: true });
    }
  );

  const response = await fastify.inject({
    method: "POST",
    url: "/test",
    payload: { foo: "bar" }
  });

  t.ok(handlerCalled);
  t.equal(response.statusCode, 200);
});

test("returns 503 when lookup fails", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const fastify = Fastify();

  // Override lookup to throw
  store.lookup = async () => {
    throw new Error("Store unavailable");
  };

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
    headers: { "idempotency-key": "test-key-123456789012" }
  });

  t.equal(response.statusCode, 503);
  t.match(response.json(), { error: /Service temporarily unavailable/ });
});

test("returns 503 when startProcessing fails", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const fastify = Fastify();

  // Override startProcessing to throw
  store.startProcessing = async () => {
    throw new Error("Store unavailable");
  };

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
    headers: { "idempotency-key": "test-key-123456789012" }
  });

  t.equal(response.statusCode, 503);
  t.match(response.json(), { error: /Service temporarily unavailable/ });
});

test("handles complete failure gracefully", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const fastify = Fastify();

  // Override complete to always fail
  store.complete = async () => {
    throw new Error("Connection failed");
  };

  fastify.post(
    "/test",
    { preHandler: idempotency({ store }) },
    async (request, reply) => {
      return reply.send({ ok: true });
    }
  );

  // This should still return 200 even though complete fails
  const response = await fastify.inject({
    method: "POST",
    url: "/test",
    payload: { foo: "bar" },
    headers: { "idempotency-key": "test-key-123456789012" }
  });

  t.equal(response.statusCode, 200);
});

test("handles string body", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const fastify = Fastify();

  fastify.post(
    "/test",
    { preHandler: idempotency({ store }) },
    async (request, reply) => {
      return reply.send({ received: request.body });
    }
  );

  const response = await fastify.inject({
    method: "POST",
    url: "/test",
    payload: "plain text body",
    headers: {
      "idempotency-key": "string-body-key-123456789",
      "content-type": "text/plain"
    }
  });

  t.equal(response.statusCode, 200);
  t.equal(response.json().received, "plain text body");
});

test("handles string response body", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const fastify = Fastify();

  fastify.post(
    "/test",
    { preHandler: idempotency({ store }) },
    async (request, reply) => {
      return reply.send("text response");
    }
  );

  // First request
  const response1 = await fastify.inject({
    method: "POST",
    url: "/test",
    payload: { foo: "bar" },
    headers: { "idempotency-key": "string-response-key-123" }
  });

  t.equal(response1.statusCode, 200);
  t.equal(response1.body, "text response");

  // Second request should replay cached response
  const response2 = await fastify.inject({
    method: "POST",
    url: "/test",
    payload: { foo: "bar" },
    headers: { "idempotency-key": "string-response-key-123" }
  });

  t.equal(response2.statusCode, 200);
  t.equal(response2.headers["x-idempotent-replayed"], "true");
  t.equal(response2.body, "text response");
});

test("handles empty body", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const fastify = Fastify();

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
    headers: { "idempotency-key": "empty-body-key-123456789" }
  });

  t.equal(response.statusCode, 200);
});

test("handles handler that returns value without calling send", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const fastify = Fastify();

  fastify.post(
    "/test",
    { preHandler: idempotency({ store }) },
    async (request, reply) => {
      // Return value directly without calling reply.send()
      return { direct: "return" };
    }
  );

  const response = await fastify.inject({
    method: "POST",
    url: "/test",
    payload: { foo: "bar" },
    headers: { "idempotency-key": "direct-return-key-12345" }
  });

  t.equal(response.statusCode, 200);
  t.equal(response.json().direct, "return");
});

test("handles handler that sends undefined", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const fastify = Fastify();

  fastify.post(
    "/test",
    { preHandler: idempotency({ store }) },
    async (request, reply) => {
      return reply.send(undefined);
    }
  );

  const response = await fastify.inject({
    method: "POST",
    url: "/test",
    payload: { foo: "bar" },
    headers: { "idempotency-key": "undefined-body-key-12345" }
  });

  t.equal(response.statusCode, 200);
});

test("rejects keys containing commas", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const fastify = Fastify();

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
    headers: { "idempotency-key": "key-with,comma-16chars" }
  });

  t.equal(response.statusCode, 400);
  t.match(response.json(), { error: /cannot contain commas/ });
});

test("rejects multiple idempotency-key headers", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const fastify = Fastify();

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
    headers: {
      "idempotency-key": ["first-key-16charsxxxx", "second-key-16charsxxxx"]
    }
  });

  t.equal(response.statusCode, 400);
  t.match(response.json(), { error: /cannot contain commas/ });
});
