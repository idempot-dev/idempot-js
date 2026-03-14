import { test } from "tap";
import express from "express";
import http from "http";
import { runAdapterTests } from "../../../core/tests/framework-adapter-suite.js";
import { idempotency } from "../index.js";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

// Run shared adapter test suite
runAdapterTests({
  name: "express",
  setup: async () => {
    const app = express();
    app.use(express.json());
    app.use(express.text({ type: "text/plain" }));

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    return {
      mount: (method, path, middleware, handler) => {
        app[method.toLowerCase()](path, middleware, handler);
      },
      request: async (options) => {
        return new Promise((resolve, reject) => {
          const reqOptions = {
            hostname: "localhost",
            port,
            path: options.path,
            method: options.method,
            headers: options.headers || {}
          };

          if (options.body && typeof options.body === "object") {
            reqOptions.headers["Content-Type"] = "application/json";
          }

          const req = http.request(reqOptions, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              const contentType = res.headers["content-type"] || "";
              let body;

              if (contentType.includes("json")) {
                try {
                  body = JSON.parse(data);
                } catch {
                  body = data;
                }
              } else {
                body = data;
              }

              resolve({
                status: res.statusCode,
                headers: res.headers,
                body
              });
            });
          });

          req.on("error", reject);

          if (options.body) {
            const body =
              typeof options.body === "string"
                ? options.body
                : JSON.stringify(options.body);
            req.write(body);
          }
          req.end();
        });
      },
      teardown: async () => {
        server.close();
      }
    };
  },
  createMiddleware: (options) => idempotency(options),
  createStore: () => new SqliteIdempotencyStore({ path: ":memory:" })
});

// Express-specific test for non-standard lookup status
test("express - handles byKey with non-standard status passes through", async (t) => {
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

  const app = express();
  app.use(express.json());

  let callCount = 0;
  app.post("/test", idempotency({ store }), (req, res) => {
    callCount++;
    res.json({ message: "created" });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const response = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "localhost",
          port,
          path: "/test",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "test-key-123456789012"
          }
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            resolve({
              status: res.statusCode,
              body: JSON.parse(data)
            });
          });
        }
      );
      req.on("error", reject);
      req.write(JSON.stringify({ data: "test" }));
      req.end();
    });

    t.equal(callCount, 1, "handler should be called");
    t.equal(response.status, 200, "should pass through");
  } finally {
    server.close();
  }
});
