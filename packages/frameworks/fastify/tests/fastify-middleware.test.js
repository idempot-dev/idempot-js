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
// These tests cover Fastify-specific handler patterns that differ from the
// generic (req, res) interface used by the shared test suite.

/**
 * Fastify allows handlers to return a value directly instead of calling reply.send().
 * This test verifies the middleware properly captures and caches responses when
 * the handler uses Fastify's "return value" pattern rather than the explicit send() pattern.
 */
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

/**
 * Fastify handles undefined bodies specially - it doesn't send a response body
 * but still completes the request successfully. This test ensures the middleware
 * doesn't break when the handler calls reply.send(undefined) and that the
 * response is still properly cached for idempotency.
 */
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
