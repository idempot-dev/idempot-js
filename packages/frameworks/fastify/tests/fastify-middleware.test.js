import { test } from "tap";
import Fastify from "fastify";
import { runAdapterTests } from "../../../core/tests/framework-adapter-suite.js";
import { idempotency } from "../index.js";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

// Run shared adapter test suite
runAdapterTests({
  name: "fastify",
  setup: async () => {
    const app = Fastify();

    return {
      mount: (method, path, middleware, handler) => {
        app[method.toLowerCase()](path, { preHandler: middleware }, handler);
      },
      request: async (options) => {
        const res = await app.inject({
          method: options.method,
          url: options.path,
          payload: options.body,
          headers: options.headers
        });

        const contentType = res.headers["content-type"] || "";
        let body;

        if (contentType.includes("json")) {
          body = res.json();
        } else {
          body = res.body || res.payload;
        }

        return {
          status: res.statusCode,
          headers: res.headers,
          body
        };
      },
      teardown: async () => {}
    };
  },
  createMiddleware: (options) => idempotency(options),
  createStore: () => new SqliteIdempotencyStore({ path: ":memory:" })
});

// Fastify-specific tests
test("fastify - exposes circuit breaker", async (t) => {
  const store = { lookup: () => {}, startProcessing: () => {}, complete: () => {} };
  const middleware = idempotency({ store });
  t.ok(middleware.circuit);
});

test("fastify - handles handler that returns value without calling send", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = Fastify();

  app.post(
    "/test",
    { preHandler: idempotency({ store }) },
    async (request, reply) => {
      return { direct: "return" };
    }
  );

  const response = await app.inject({
    method: "POST",
    url: "/test",
    payload: { foo: "bar" },
    headers: { "idempotency-key": "direct-return-key-12345" }
  });

  t.equal(response.statusCode, 200);
  t.equal(response.json().direct, "return");
});

test("fastify - handles handler that sends undefined", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = Fastify();

  app.post(
    "/test",
    { preHandler: idempotency({ store }) },
    async (request, reply) => {
      return reply.send(undefined);
    }
  );

  const response = await app.inject({
    method: "POST",
    url: "/test",
    payload: { foo: "bar" },
    headers: { "idempotency-key": "undefined-body-key-12345" }
  });

  t.equal(response.statusCode, 200);
});

test("fastify - handles string response body", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = Fastify();

  app.post(
    "/test",
    { preHandler: idempotency({ store }) },
    async (request, reply) => {
      return reply.send("text response");
    }
  );

  const response1 = await app.inject({
    method: "POST",
    url: "/test",
    payload: { foo: "bar" },
    headers: { "idempotency-key": "string-response-key-123" }
  });

  t.equal(response1.statusCode, 200);
  t.equal(response1.body, "text response");

  const response2 = await app.inject({
    method: "POST",
    url: "/test",
    payload: { foo: "bar" },
    headers: { "idempotency-key": "string-response-key-123" }
  });

  t.equal(response2.statusCode, 200);
  t.equal(response2.headers["x-idempotent-replayed"], "true");
  t.equal(response2.body, "text response");
});
