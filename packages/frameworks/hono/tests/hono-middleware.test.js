import { test } from "tap";
import { Hono } from "hono";
import { runAdapterTests } from "../../../core/tests/framework-adapter-suite.js";
import { idempotency } from "../index.js";
import { withResilience } from "@idempot/core";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

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

// Hono-specific tests
test("hono - handles byKey with non-standard status passes through", async (t) => {
  const body = JSON.stringify({ data: "test" });

  const store = {
    lookup: async (key, fingerprint) => {
      return {
        byKey: { key: key, fingerprint: fingerprint, status: "unknown" },
        byFingerprint: null
      };
    },
    startProcessing: async () => {},
    complete: async () => {}
  };

  const app = new Hono();
  let callCount = 0;
  app.post("/test", idempotency({ store }), (c) => {
    callCount++;
    return c.json({ message: "created" });
  });

  const res = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "test-key-123456789012" },
    body: body
  });

  t.equal(callCount, 1, "handler should be called");
  t.equal(res.status, 200, "should pass through");
});

test("hono - withResilience retries until success", async (t) => {
  let attempts = 0;
  const flakyStore = {
    lookup: () => {
      attempts++;
      if (attempts < 3) throw new Error("Transient error");
      return Promise.resolve({ byKey: null, byFingerprint: null });
    },
    startProcessing: () => Promise.resolve(),
    complete: () => Promise.resolve()
  };

  const { store } = withResilience(flakyStore, { maxRetries: 3 });
  await store.lookup("key", "fp");

  t.equal(attempts, 3);
});
