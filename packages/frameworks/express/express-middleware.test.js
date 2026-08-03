import { test } from "tap";
import express from "express";
import http from "http";
import { runAdapterTests } from "../../core/tests/framework-adapter-suite.js";
import { idempotency } from "./index.js";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";
import {
  createRaceStubStore,
  RACE_KEY
} from "../../core/tests/race-store-helper.js";

// Content negotiation tests
test("express - returns markdown format when Accept: text/markdown", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = express();
  app.use(express.json());

  const middleware = idempotency({ store, required: true });
  app.post("/test", middleware, (req, res) => res.json({ ok: true }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const response = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "localhost",
        port,
        path: "/test",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/markdown"
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data
          });
        });
      }
    );
    req.on("error", reject);
    req.write(JSON.stringify({}));
    req.end();
  });

  t.equal(response.status, 400, "should return 400");
  t.ok(
    response.headers["content-type"].includes("text/markdown"),
    "should return markdown content type"
  );
  t.ok(response.body.includes("---"), "should have YAML frontmatter");

  server.close();
  await store.close();
});

test("express - returns JSON format when Accept: application/json", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = express();
  app.use(express.json());

  const middleware = idempotency({ store, required: true });
  app.post("/test", middleware, (req, res) => res.json({ ok: true }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const response = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "localhost",
        port,
        path: "/test",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          const contentType = res.headers["content-type"] || "";
          const isJson =
            contentType.includes("application/json") ||
            contentType.includes("application/problem+json");
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: isJson ? JSON.parse(data) : data
          });
        });
      }
    );
    req.on("error", reject);
    req.write(JSON.stringify({}));
    req.end();
  });

  t.equal(response.status, 400, "should return 400");
  t.ok(
    response.headers["content-type"].includes("application/json"),
    "should return JSON content type"
  );
  t.ok(response.body.type, "should have type field in JSON body");

  server.close();
  await store.close();
});

// --- Lost-race reroute: startProcessing throws IdempotencyKeyExistsError ---

async function raceRequest(store) {
  const app = express();
  app.use(express.json());
  app.post("/test", idempotency({ store, required: true }), (req, res) =>
    res.json({ ok: true })
  );

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const response = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "localhost",
        port,
        path: "/test",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": RACE_KEY
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data
          });
        });
      }
    );
    req.on("error", reject);
    req.write(JSON.stringify({}));
    req.end();
  });

  server.close();
  return response;
}

test("express - lost race with winner still processing returns 409", async (t) => {
  const store = createRaceStubStore({
    secondLookup: { status: "processing" }
  });
  const response = await raceRequest(store);

  t.equal(response.status, 409, "loser should get 409 conflict");
  t.match(
    JSON.parse(response.body).type,
    /#section-2\.6$/,
    "conflict references spec section 2.6"
  );
});

test("express - lost race with winner complete replays cached response 200", async (t) => {
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
  const response = await raceRequest(store);

  t.equal(response.status, 200, "loser should get 200 replay");
  t.equal(response.body, '{"winner":true}', "replays winner body");
});

test("express - lost race re-lookup finds no record returns 409", async (t) => {
  const store = createRaceStubStore({ secondLookup: null });
  const response = await raceRequest(store);

  t.equal(response.status, 409, "no-record re-lookup returns 409 per KTD2");
});

test("express - lost race re-lookup throws returns 503", async (t) => {
  const store = createRaceStubStore({
    secondLookup: null,
    relookupError: new Error("connection refused")
  });
  const response = await raceRequest(store);

  t.equal(response.status, 503, "re-lookup failure stays a 503");
});

test("express - non-key-exists error from startProcessing stays 503", async (t) => {
  const store = createRaceStubStore({
    secondLookup: null,
    startError: new Error("connection refused")
  });
  const response = await raceRequest(store);

  t.equal(response.status, 503, "unrelated store error stays a 503");
});

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
