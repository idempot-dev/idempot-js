import { Hono } from "hono";
import { test } from "tap";
import { runAdapterTests } from "../../core/tests/framework-adapter-suite.js";
import { idempotency } from "./index.js";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";
import {
  createRaceStubStore,
  RACE_KEY
} from "../../core/tests/race-store-helper.js";

// Content negotiation tests
test("hono - returns markdown format when Accept: text/markdown", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = new Hono();
  const middleware = idempotency({ store, required: true });
  app.post("/test", middleware, (c) => c.json({ ok: true }));

  const res = await app.request("http://localhost/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/markdown"
    },
    body: JSON.stringify({})
  });

  const body = await res.text();

  t.equal(res.status, 400, "should return 400");
  t.ok(
    res.headers.get("content-type").includes("text/markdown"),
    "should return markdown content type"
  );
  t.ok(body.includes("---"), "should have YAML frontmatter");

  await store.close();
});

test("hono - returns JSON format when Accept: application/json", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = new Hono();
  const middleware = idempotency({ store, required: true });
  app.post("/test", middleware, (c) => c.json({ ok: true }));

  const res = await app.request("http://localhost/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({})
  });

  const contentType = res.headers.get("content-type") || "";
  const isJson =
    contentType.includes("application/json") ||
    contentType.includes("application/problem+json");
  const body = isJson ? await res.json() : await res.text();

  t.equal(res.status, 400, "should return 400");
  t.ok(
    contentType.includes("application/json"),
    "should return JSON content type"
  );
  t.ok(body.type, "should have type field in JSON body");

  await store.close();
});

// --- Lost-race reroute: startProcessing throws IdempotencyKeyExistsError ---

test("hono - lost race with winner still processing returns 409", async (t) => {
  const store = createRaceStubStore({
    secondLookup: { status: "processing" }
  });
  const app = new Hono();
  const middleware = idempotency({ store, required: true });
  app.post("/test", middleware, (c) => c.json({ ok: true }));

  const res = await app.request("http://localhost/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": RACE_KEY
    },
    body: JSON.stringify({})
  });

  t.equal(res.status, 409, "loser should get 409 conflict");
  const body = await res.json();
  t.match(body.type, /#section-2\.6$/, "conflict references spec section 2.6");
  t.equal(body.retryable, true, "concurrent conflict is retryable");
});

test("hono - lost race with winner complete replays cached response 200", async (t) => {
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
  const app = new Hono();
  const middleware = idempotency({ store, required: true });
  app.post("/test", middleware, (c) => c.json({ ok: true }));

  const res = await app.request("http://localhost/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": RACE_KEY
    },
    body: JSON.stringify({})
  });

  t.equal(res.status, 200, "loser should get 200 replay");
  t.equal(await res.text(), '{"winner":true}', "replays winner body");
});

test("hono - lost race re-lookup finds no record returns 409", async (t) => {
  const store = createRaceStubStore({ secondLookup: null });
  const app = new Hono();
  const middleware = idempotency({ store, required: true });
  app.post("/test", middleware, (c) => c.json({ ok: true }));

  const res = await app.request("http://localhost/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": RACE_KEY
    },
    body: JSON.stringify({})
  });

  t.equal(res.status, 409, "no-record re-lookup returns 409 per KTD2");
});

test("hono - lost race re-lookup throws returns 503", async (t) => {
  const store = createRaceStubStore({
    secondLookup: null,
    relookupError: new Error("connection refused")
  });
  const app = new Hono();
  const middleware = idempotency({ store, required: true });
  app.post("/test", middleware, (c) => c.json({ ok: true }));

  const res = await app.request("http://localhost/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": RACE_KEY
    },
    body: JSON.stringify({})
  });

  t.equal(res.status, 503, "re-lookup failure stays a 503");
});

test("hono - non-key-exists error from startProcessing stays 503", async (t) => {
  const store = createRaceStubStore({
    secondLookup: null,
    startError: new Error("connection refused")
  });
  const app = new Hono();
  const middleware = idempotency({ store, required: true });
  app.post("/test", middleware, (c) => c.json({ ok: true }));

  const res = await app.request("http://localhost/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": RACE_KEY
    },
    body: JSON.stringify({})
  });

  t.equal(res.status, 503, "unrelated store error stays a 503");
});

// Run shared adapter test suite
runAdapterTests({
  name: "hono",
  setup: async () => {
    const app = new Hono();

    return {
      mount: (method, path, middleware, handler) => {
        // Wrap generic handler to work with Hono's context API
        app[method.toLowerCase()](path, middleware, async (c) => {
          // Create req-like object with body property
          const contentType = c.req.header("content-type") || "";
          let body;
          if (contentType.includes("application/json")) {
            try {
              body = await c.req.json();
            } catch {
              body = undefined;
            }
          } else {
            try {
              body = await c.req.text();
            } catch {
              body = undefined;
            }
          }
          const req = { body };

          // Create a res-like object for the generic handler
          const res = {
            send: (data) => {
              if (typeof data === "string") {
                return c.body(data);
              }
              return c.json(data);
            }
          };

          return handler(req, res);
        });
      },
      request: async (options) => {
        const url = new URL(options.path, "http://localhost");
        const headers = new Headers(options.headers);

        const res = await app.request(url.toString(), {
          method: options.method,
          headers,
          body: options.body ? JSON.stringify(options.body) : options.body
        });

        const contentType = res.headers.get("content-type") || "";
        let body;

        if (contentType.includes("json")) {
          body = await res.json();
        } else {
          const text = await res.text();
          body = text ? text : undefined;
        }

        return {
          status: res.status,
          headers: Object.fromEntries(res.headers.entries()),
          body
        };
      },
      teardown: async () => {}
    };
  },
  createMiddleware: (options) => idempotency(options),
  createStore: () => new SqliteIdempotencyStore({ path: ":memory:" })
});
