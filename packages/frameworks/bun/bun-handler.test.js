import { test } from "tap";
import { runAdapterTests } from "../../core/tests/framework-adapter-suite.js";
import { idempotency } from "./index.js";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

test("bun - returns markdown format when Accept: text/markdown", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const wrap = idempotency({ store, required: true });
  const handler = wrap(async () => Response.json({ ok: true }));

  const res = await handler(
    new Request("http://localhost/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/markdown"
      },
      body: JSON.stringify({})
    })
  );

  const body = await res.text();

  t.equal(res.status, 400, "should return 400");
  t.ok(
    res.headers.get("content-type").includes("text/markdown"),
    "should return markdown content type"
  );
  t.ok(body.includes("---"), "should have YAML frontmatter");

  await store.close();
});

test("bun - returns JSON format when Accept: application/json", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const wrap = idempotency({ store, required: true });
  const handler = wrap(async () => Response.json({ ok: true }));

  const res = await handler(
    new Request("http://localhost/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({})
    })
  );

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

runAdapterTests({
  name: "bun",
  setup: async () => {
    /** @type {Map<string, (req: Request) => Promise<Response>>} */
    const routes = new Map();

    return {
      mount: (method, path, middleware, handler) => {
        const bunHandler = middleware(async (req) => {
          const contentType = req.headers.get("content-type") || "";
          let body;
          if (contentType.includes("application/json")) {
            try {
              body = await req.json();
            } catch {
              body = undefined;
            }
          } else {
            try {
              body = await req.text();
            } catch {
              body = undefined;
            }
          }

          const reqLike = { body };

          return new Promise((resolve) => {
            const res = {
              send: (data) => {
                if (typeof data === "string") {
                  resolve(new Response(data));
                } else {
                  resolve(Response.json(data));
                }
              }
            };
            Promise.resolve(handler(reqLike, res)).catch((err) => {
              resolve(
                new Response(JSON.stringify({ error: String(err) }), {
                  status: 500,
                  headers: { "Content-Type": "application/json" }
                })
              );
            });
          });
        });

        routes.set(`${method.toUpperCase()}:${path}`, bunHandler);
      },

      request: async (options) => {
        const routeHandler = routes.get(
          `${options.method.toUpperCase()}:${options.path}`
        );
        const url = new URL(options.path, "http://localhost");
        const headers = new Headers(options.headers || {});

        if (options.body && typeof options.body === "object") {
          headers.set("content-type", "application/json");
        }

        const req = new Request(url.toString(), {
          method: options.method,
          headers,
          body: options.body
            ? typeof options.body === "string"
              ? options.body
              : JSON.stringify(options.body)
            : undefined
        });

        const response = await routeHandler(req);

        const contentType = response.headers.get("content-type") || "";
        let body;
        if (contentType.includes("json")) {
          try {
            body = await response.json();
          } catch {
            body = await response.text();
          }
        } else {
          const text = await response.text();
          body = text || undefined;
        }

        return {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body
        };
      },

      teardown: async () => {
        routes.clear();
      }
    };
  },
  createMiddleware: (options) => idempotency(options),
  createStore: () => new SqliteIdempotencyStore({ path: ":memory:" })
});
