import { Hono } from "hono";
import { test } from "tap";
import { runAdapterTests } from "../../core/tests/framework-adapter-suite.js";
import { idempotency } from "./index.js";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

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
