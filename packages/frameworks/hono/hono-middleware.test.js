import { Hono } from "hono";
import { runAdapterTests } from "../../../core/tests/framework-adapter-suite.js";
import { idempotency } from "../index.js";
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
