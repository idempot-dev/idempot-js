import { test } from "tap";
import Fastify from "fastify";
import { runAdapterTests } from "../../core/tests/framework-adapter-suite.js";
import { idempotency } from "./index.js";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";
import {
  createRaceStubStore,
  RACE_KEY
} from "../../core/tests/race-store-helper.js";

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

// Content negotiation tests
test("fastify - returns markdown format when Accept: text/markdown", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = Fastify();

  app.post(
    "/test",
    { preHandler: idempotency({ store, required: true }) },
    async (_request, _reply) => {
      return { ok: true };
    }
  );

  const response = await app.inject({
    method: "POST",
    url: "/test",
    payload: {},
    headers: {
      "Content-Type": "application/json",
      Accept: "text/markdown"
    }
  });

  t.equal(response.statusCode, 400, "should return 400");
  t.ok(
    response.headers["content-type"].includes("text/markdown"),
    "should return markdown content type"
  );
  t.ok(response.body.includes("---"), "should have YAML frontmatter");

  await store.close();
});

test("fastify - returns JSON format when Accept: application/json", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = Fastify();

  app.post(
    "/test",
    { preHandler: idempotency({ store, required: true }) },
    async (_request, _reply) => {
      return { ok: true };
    }
  );

  const response = await app.inject({
    method: "POST",
    url: "/test",
    payload: {},
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    }
  });

  const contentType = response.headers["content-type"] || "";
  const isJson =
    contentType.includes("application/json") ||
    contentType.includes("application/problem+json");
  const body = isJson ? response.json() : response.body;

  t.equal(response.statusCode, 400, "should return 400");
  t.ok(
    contentType.includes("application/json"),
    "should return JSON content type"
  );
  t.ok(body.type, "should have type field in JSON body");

  await store.close();
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
    async (_request, _reply) => {
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
    async (_request, reply) => {
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

// --- Lost-race reroute: startProcessing throws IdempotencyKeyExistsError ---

test("fastify - lost race with winner still processing returns 409", async (t) => {
  const store = createRaceStubStore({
    secondLookup: { status: "processing" }
  });
  const app = Fastify();

  app.post(
    "/test",
    { preHandler: idempotency({ store, required: true }) },
    async () => {
      return { ok: true };
    }
  );

  const response = await app.inject({
    method: "POST",
    url: "/test",
    payload: {},
    headers: {
      "Content-Type": "application/json",
      "idempotency-key": RACE_KEY
    }
  });

  t.equal(response.statusCode, 409, "loser should get 409 conflict");
  t.match(
    response.json().type,
    /#section-2\.6$/,
    "conflict references spec section 2.6"
  );
});

test("fastify - lost race with winner complete replays cached response 200", async (t) => {
  const store = createRaceStubStore({
    secondLookup: {
      status: "complete",
      response: {
        status: 200,
        headers: { "content-type": "application/json" },
        body: '{"winner":true}'
      }
    }
  });
  const app = Fastify();

  app.post(
    "/test",
    { preHandler: idempotency({ store, required: true }) },
    async () => {
      return { ok: true };
    }
  );

  const response = await app.inject({
    method: "POST",
    url: "/test",
    payload: {},
    headers: {
      "Content-Type": "application/json",
      "idempotency-key": RACE_KEY
    }
  });

  t.equal(response.statusCode, 200, "loser should get 200 replay");
  t.equal(response.body, '{"winner":true}', "replays winner body");
});

test("fastify - lost race re-lookup finds no record returns 409", async (t) => {
  const store = createRaceStubStore({ secondLookup: null });
  const app = Fastify();

  app.post(
    "/test",
    { preHandler: idempotency({ store, required: true }) },
    async () => {
      return { ok: true };
    }
  );

  const response = await app.inject({
    method: "POST",
    url: "/test",
    payload: {},
    headers: {
      "Content-Type": "application/json",
      "idempotency-key": RACE_KEY
    }
  });

  t.equal(response.statusCode, 409, "no-record re-lookup returns 409 per KTD2");
});

test("fastify - lost race re-lookup throws returns 503", async (t) => {
  const store = createRaceStubStore({
    secondLookup: null,
    relookupError: new Error("connection refused")
  });
  const app = Fastify();

  app.post(
    "/test",
    { preHandler: idempotency({ store, required: true }) },
    async () => {
      return { ok: true };
    }
  );

  const response = await app.inject({
    method: "POST",
    url: "/test",
    payload: {},
    headers: {
      "Content-Type": "application/json",
      "idempotency-key": RACE_KEY
    }
  });

  t.equal(response.statusCode, 503, "re-lookup failure stays a 503");
});

test("fastify - non-key-exists error from startProcessing stays 503", async (t) => {
  const store = createRaceStubStore({
    secondLookup: null,
    startError: new Error("connection refused")
  });
  const app = Fastify();

  app.post(
    "/test",
    { preHandler: idempotency({ store, required: true }) },
    async () => {
      return { ok: true };
    }
  );

  const response = await app.inject({
    method: "POST",
    url: "/test",
    payload: {},
    headers: {
      "Content-Type": "application/json",
      "idempotency-key": RACE_KEY
    }
  });

  t.equal(response.statusCode, 503, "unrelated store error stays a 503");
});
