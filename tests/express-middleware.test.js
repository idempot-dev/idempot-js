import { test } from "tap";
import express from "express";
import http from "http";
import { idempotency } from "../src/express-middleware.js";
import { SqliteIdempotencyStore } from "../src/store/sqlite.js";

function makeRequest(port, path, method, idempotencyKey, body) {
  return new Promise((resolve) => {
    const options = {
      hostname: "localhost",
      port,
      path,
      method,
      headers: {
        "Content-Type": "application/json"
      }
    };

    if (idempotencyKey) {
      options.headers["Idempotency-Key"] = idempotencyKey;
    }

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

test("middleware-express - exports idempotency function", async (t) => {
  t.type(idempotency, "function");
});

test("middleware-express - passes through GET requests", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = express();
  app.use(express.json());
  app.get("/test", idempotency({ store }), (req, res) => {
    res.json({ message: "success" });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const res = await makeRequest(port, "/test", "GET", null, null);
    t.equal(res.status, 200, "should return 200");
    t.same(JSON.parse(res.body), { message: "success" }, "should return handler response");
  } finally {
    server.close();
  }
});

test("middleware-express - POST without key when optional", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = express();
  app.use(express.json());
  app.post("/test", idempotency({ store }), (req, res) => {
    res.json({ message: "created" });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const res = await makeRequest(port, "/test", "POST", null, { data: "test" });
    t.equal(res.status, 200, "should allow request without key");
  } finally {
    server.close();
  }
});

test("middleware-express - POST without key when required", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = express();
  app.use(express.json());
  app.post("/test", idempotency({ store, required: true }), (req, res) => {
    res.json({ message: "created" });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const res = await makeRequest(port, "/test", "POST", null, { data: "test" });
    t.equal(res.status, 400, "should return 400");
    const json = JSON.parse(res.body);
    t.match(json.error, /required/i, "should indicate header is required");
  } finally {
    server.close();
  }
});

test("middleware-express - validates key length", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = express();
  app.use(express.json());
  app.post("/test", idempotency({ store }), (req, res) => {
    res.json({ message: "created" });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const longKey = "x".repeat(256);
    const res = await makeRequest(port, "/test", "POST", longKey, { data: "test" });
    t.equal(res.status, 400, "should return 400 for too-long key");
    const json = JSON.parse(res.body);
    t.match(json.error, /255 characters/i, "should indicate max length");
  } finally {
    server.close();
  }
});

test("middleware-express - first request with new key", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = express();
  app.use(express.json());
  app.post("/test", idempotency({ store }), (req, res) => {
    res.json({ message: "created", id: 123 });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const res = await makeRequest(port, "/test", "POST", "unique-key-1", { data: "test" });
    t.equal(res.status, 200, "should return handler response");
    t.same(JSON.parse(res.body), { message: "created", id: 123 }, "should return correct body");
    t.notOk(res.headers["x-idempotent-replayed"], "should not be replayed");
  } finally {
    server.close();
  }
});

test("middleware-express - replays cached response", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = express();
  app.use(express.json());

  let callCount = 0;
  app.post("/test", idempotency({ store }), (req, res) => {
    callCount++;
    res.json({ message: "created", id: 123, timestamp: Date.now() });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const res1 = await makeRequest(port, "/test", "POST", "replay-key", { data: "test" });
    t.equal(res1.status, 200, "first request should succeed");
    t.equal(callCount, 1, "handler should be called once");

    const res2 = await makeRequest(port, "/test", "POST", "replay-key", { data: "test" });
    t.equal(res2.status, 200, "cached response should have same status");
    t.equal(callCount, 1, "handler should not be called again");
    t.equal(res2.headers["x-idempotent-replayed"], "true", "should have replay header");

    const json2 = JSON.parse(res2.body);
    t.same(json2, JSON.parse(res1.body), "should return cached body");
  } finally {
    server.close();
  }
});

test("middleware-express - detects concurrent processing", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = express();
  app.use(express.json());
  app.post("/test", idempotency({ store }), async (req, res) => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    res.json({ message: "created" });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const promise1 = makeRequest(port, "/test", "POST", "concurrent-key", { data: "test" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const promise2 = makeRequest(port, "/test", "POST", "concurrent-key", { data: "test" });

    const [res1, res2] = await Promise.all([promise1, promise2]);
    const statuses = [res1.status, res2.status].sort();
    t.same(statuses, [200, 409], "one success and one conflict");

    const conflict = res1.status === 409 ? res1 : res2;
    const json = JSON.parse(conflict.body);
    t.match(json.error, /already being processed/i, "should indicate concurrent processing");
  } finally {
    server.close();
  }
});

test("middleware-express - detects same key with different payload", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = express();
  app.use(express.json());
  app.post("/test", idempotency({ store }), (req, res) => {
    res.json({ message: "created" });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    await makeRequest(port, "/test", "POST", "payload-key", { data: "test1" });
    const res2 = await makeRequest(port, "/test", "POST", "payload-key", { data: "test2" });
    t.equal(res2.status, 422, "should return 422");
    const json = JSON.parse(res2.body);
    t.match(json.error, /different request payload/i, "should indicate payload mismatch");
  } finally {
    server.close();
  }
});

test("middleware-express - detects duplicate request with different key", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = express();
  app.use(express.json());
  app.post("/test", idempotency({ store }), (req, res) => {
    res.json({ message: "created" });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    await makeRequest(port, "/test", "POST", "key-1", { data: "test" });
    const res2 = await makeRequest(port, "/test", "POST", "key-2", { data: "test" });
    t.equal(res2.status, 409, "should return 409");
    const json = JSON.parse(res2.body);
    t.match(json.error, /different idempotency key/i, "should indicate different key");
  } finally {
    server.close();
  }
});

test("middleware-express - PATCH method is protected", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = express();
  app.use(express.json());

  let callCount = 0;
  app.patch("/test", idempotency({ store }), (req, res) => {
    callCount++;
    res.json({ message: "updated", timestamp: Date.now() });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const res1 = await makeRequest(port, "/test", "PATCH", "patch-key", { data: "test" });
    t.equal(res1.status, 200, "first request should succeed");
    t.equal(callCount, 1, "handler should be called once");

    const res2 = await makeRequest(port, "/test", "PATCH", "patch-key", { data: "test" });
    t.equal(res2.status, 200, "cached response should be returned");
    t.equal(callCount, 1, "handler should not be called again");
    t.equal(res2.headers["x-idempotent-replayed"], "true", "should have replay header");
  } finally {
    server.close();
  }
});

test("middleware-express - field exclusion works", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = express();
  app.use(express.json());
  app.post("/test", idempotency({ store, excludeFields: ["timestamp"] }), (req, res) => {
    res.json({ message: "created", timestamp: Date.now() });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    let callCount = 0;
    const res1 = await makeRequest(port, "/test", "POST", "exclude-key", { data: "test", timestamp: 123 });
    t.equal(res1.status, 200, "first request should succeed");
    callCount++;

    const res2 = await makeRequest(port, "/test", "POST", "exclude-key", { data: "test", timestamp: 456 });
    t.equal(res2.status, 200, "should replay despite timestamp difference");
    t.equal(callCount, 1, "handler should not be called again");
  } finally {
    server.close();
  }
});

test("middleware-express - throws when store is not provided", async (t) => {
  try {
    idempotency({});
    t.fail("should throw");
  } catch (err) {
    t.match(err.message, /IdempotencyStore must be provided/i, "should throw about store");
  }
});

test("middleware-express - returns 503 when lookup fails", async (t) => {
  const store = {
    lookup: async () => { throw new Error("Connection failed"); }
  };
  const app = express();
  app.use(express.json());
  app.post("/test", idempotency({ store }), (req, res) => {
    res.json({ message: "created" });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const res = await makeRequest(port, "/test", "POST", "test-key", { data: "test" });
    t.equal(res.status, 503, "should return 503 when lookup fails");
  } finally {
    server.close();
  }
});

test("middleware-express - returns 503 when startProcessing fails", async (t) => {
  const store = {
    lookup: async () => ({ byKey: null, byFingerprint: null }),
    startProcessing: async () => { throw new Error("Connection failed"); }
  };
  const app = express();
  app.use(express.json());
  app.post("/test", idempotency({ store }), (req, res) => {
    res.json({ message: "created" });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const res = await makeRequest(port, "/test", "POST", "test-key", { data: "test" });
    t.equal(res.status, 503, "should return 503 when startProcessing fails");
  } finally {
    server.close();
  }
});
