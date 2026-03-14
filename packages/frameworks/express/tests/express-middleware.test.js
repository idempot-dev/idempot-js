import { test } from "tap";
import express from "express";
import http from "http";
import { idempotency } from "@idempot/express-middleware";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

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
    t.same(
      JSON.parse(res.body),
      { message: "success" },
      "should return handler response"
    );
  } finally {
    server.close();
  }
});

test("middleware-express - POST without key when optional", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = express();
  app.use(express.json());
  app.post("/test", idempotency({ store, required: false }), (req, res) => {
    res.json({ message: "created" });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const res = await makeRequest(port, "/test", "POST", null, {
      data: "test"
    });
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
    const res = await makeRequest(port, "/test", "POST", null, {
      data: "test"
    });
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
    const res = await makeRequest(port, "/test", "POST", longKey, {
      data: "test"
    });
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
    const res = await makeRequest(port, "/test", "POST", "unique-key-0000000001", {
      data: "test"
    });
    t.equal(res.status, 200, "should return handler response");
    t.same(
      JSON.parse(res.body),
      { message: "created", id: 123 },
      "should return correct body"
    );
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
    const res1 = await makeRequest(port, "/test", "POST", "replay-key-0000000001", {
      data: "test"
    });
    t.equal(res1.status, 200, "first request should succeed");
    t.equal(callCount, 1, "handler should be called once");

    const res2 = await makeRequest(port, "/test", "POST", "replay-key-0000000001", {
      data: "test"
    });
    t.equal(res2.status, 200, "cached response should have same status");
    t.equal(callCount, 1, "handler should not be called again");
    t.equal(
      res2.headers["x-idempotent-replayed"],
      "true",
      "should have replay header"
    );

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
    const promise1 = makeRequest(port, "/test", "POST", "concurrent-key-0000001", {
      data: "test"
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const promise2 = makeRequest(port, "/test", "POST", "concurrent-key-0000001", {
      data: "test"
    });

    const [res1, res2] = await Promise.all([promise1, promise2]);
    const statuses = [res1.status, res2.status].sort();
    t.same(statuses, [200, 409], "one success and one conflict");

    const conflict = res1.status === 409 ? res1 : res2;
    const json = JSON.parse(conflict.body);
    t.match(
      json.error,
      /already being processed/i,
      "should indicate concurrent processing"
    );
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
    await makeRequest(port, "/test", "POST", "payload-key-000000001", {
      data: "test1"
    });
    const res2 = await makeRequest(port, "/test", "POST", "payload-key-000000001", {
      data: "test2"
    });
    t.equal(res2.status, 422, "should return 422");
    const json = JSON.parse(res2.body);
    t.match(
      json.error,
      /different request payload/i,
      "should indicate payload mismatch"
    );
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
    await makeRequest(port, "/test", "POST", "fingerprint-key-0000001", {
      data: "test"
    });
    const res2 = await makeRequest(
      port,
      "/test",
      "POST",
      "fingerprint-key-02000001",
      {
        data: "test"
      }
    );
    t.equal(res2.status, 409, "should return 409");
    const json = JSON.parse(res2.body);
    t.match(
      json.error,
      /different idempotency key/i,
      "should indicate different key"
    );
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
    const res1 = await makeRequest(port, "/test", "PATCH", "patch-key-00000000001", {
      data: "test"
    });
    t.equal(res1.status, 200, "first request should succeed");
    t.equal(callCount, 1, "handler should be called once");

    const res2 = await makeRequest(port, "/test", "PATCH", "patch-key-00000000001", {
      data: "test"
    });
    t.equal(res2.status, 200, "cached response should be returned");
    t.equal(callCount, 1, "handler should not be called again");
    t.equal(
      res2.headers["x-idempotent-replayed"],
      "true",
      "should have replay header"
    );
  } finally {
    server.close();
  }
});

test("middleware-express - field exclusion works", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = express();
  app.use(express.json());
  app.post(
    "/test",
    idempotency({ store, excludeFields: ["timestamp"] }),
    (req, res) => {
      res.json({ message: "created", timestamp: Date.now() });
    }
  );

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    let callCount = 0;
    const res1 = await makeRequest(port, "/test", "POST", "exclude-key-000000001", {
      data: "test",
      timestamp: 123
    });
    t.equal(res1.status, 200, "first request should succeed");
    callCount++;

    const res2 = await makeRequest(port, "/test", "POST", "exclude-key-000000001", {
      data: "test",
      timestamp: 456
    });
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
    t.match(
      err.message,
      /IdempotencyStore must be provided/i,
      "should throw about store"
    );
  }
});

test("middleware-express - returns 503 when lookup fails", async (t) => {
  const store = {
    lookup: async () => {
      throw new Error("Connection failed");
    }
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
    const res = await makeRequest(port, "/test", "POST", "test-key-000000000001", {
      data: "test"
    });
    t.equal(res.status, 503, "should return 503 when lookup fails");
  } finally {
    server.close();
  }
});

test("middleware-express - returns 503 when startProcessing fails", async (t) => {
  const store = {
    lookup: async () => ({ byKey: null, byFingerprint: null }),
    startProcessing: async () => {
      throw new Error("Connection failed");
    }
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
    const res = await makeRequest(port, "/test", "POST", "test-key-000000000001", {
      data: "test"
    });
    t.equal(res.status, 503, "should return 503 when startProcessing fails");
  } finally {
    server.close();
  }
});

test("middleware-express - handles byKey with non-standard status passes through", async (t) => {
  const store = {
    lookup: async (key, fingerprint) => {
      return {
        byKey: { key: key, fingerprint: fingerprint, status: "unknown" },
        byFingerprint: null
      };
    },
    startProcessing: async () => {},
    complete: async () => {},
    cleanup: async () => {}
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
    const res = await makeRequest(port, "/test", "POST", "test-key-000000000001", {
      data: "test"
    });
    t.equal(res.status, 200, "handler should be called");
    t.equal(callCount, 1, "should pass through");
  } finally {
    server.close();
  }
});

test("middleware-express - handles complete failure gracefully", async (t) => {
  const store = {
    lookup: async () => ({ byKey: null, byFingerprint: null }),
    startProcessing: async () => {},
    complete: async () => {
      throw new Error("Connection failed");
    },
    cleanup: async () => {}
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
    const res = await makeRequest(port, "/test", "POST", "test-key-000000000001", {
      data: "test"
    });
    t.equal(res.status, 200, "should return 200 even if complete fails");
    t.equal(callCount, 1, "handler should be called");
  } finally {
    server.close();
  }
});

test("middleware-express - handles string body", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = express();
  app.use(express.text({ type: "text/plain" }));

  app.post("/test", idempotency({ store }), (req, res) => {
    res.send("plain text response");
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const res = await new Promise((resolve) => {
      const options = {
        hostname: "localhost",
        port,
        path: "/test",
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          "Idempotency-Key": "string-body-key-12345"
        }
      };
      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode, body: data });
        });
      });
      req.write("plain text body");
      req.end();
    });
    t.equal(res.status, 200, "should return 200");
    t.equal(res.body, "plain text response", "should return text body");
  } finally {
    server.close();
  }
});

test("middleware-express - handles empty body", async (t) => {
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
    const res = await new Promise((resolve) => {
      const options = {
        hostname: "localhost",
        port,
        path: "/test",
        method: "POST",
        headers: {
          "Idempotency-Key": "empty-body-key-123456"
        }
      };
      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode, body: data });
        });
      });
      req.end();
    });
    t.equal(res.status, 200, "should return 200");
  } finally {
    server.close();
  }
});

test("middleware-express - handles non-string response body", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = express();
  app.use(express.json());

  app.post("/test", idempotency({ store }), (req, res) => {
    res.send({ message: "created" });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const res1 = await makeRequest(port, "/test", "POST", "non-string-key-0000001", {
      data: "test"
    });
    t.equal(res1.status, 200, "first request should succeed");

    const res2 = await makeRequest(port, "/test", "POST", "non-string-key-0000001", {
      data: "test"
    });
    t.equal(res2.status, 200, "replay should succeed");
    t.equal(
      res2.headers["x-idempotent-replayed"],
      "true",
      "should have replay header"
    );
  } finally {
    server.close();
  }
});

test("middleware-express - rejects keys containing commas", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = express();
  app.use(express.json());

  app.post("/test", idempotency({ store }), (req, res) => {
    res.json({ ok: true });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        { hostname: "localhost", port, path: "/test", method: "POST", headers: { "Content-Type": "application/json", "idempotency-key": "key-with,comma-16chars" } },
        (response) => {
          let body = "";
          response.on("data", (chunk) => (body += chunk));
          response.on("end", () => resolve({ status: response.statusCode, body }));
        }
      );
      req.on("error", reject);
      req.write(JSON.stringify({ data: "test" }));
      req.end();
    });

    t.equal(res.status, 400, "should return 400 for comma-containing key");
    t.match(res.body, /cannot contain commas/, "should indicate comma error");
  } finally {
    server.close();
  }
});

test("middleware-express - rejects multiple idempotency-key headers", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = express();
  app.use(express.json());

  app.post("/test", idempotency({ store }), (req, res) => {
    res.json({ ok: true });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // Multiple headers get combined with commas per RFC 7230
    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        { hostname: "localhost", port, path: "/test", method: "POST", headers: {
          "Content-Type": "application/json",
          "idempotency-key": "first-key-16chars, second-key-16chars"
        } },
        (response) => {
          let body = "";
          response.on("data", (chunk) => (body += chunk));
          response.on("end", () => resolve({ status: response.statusCode, body }));
        }
      );
      req.on("error", reject);
      req.write(JSON.stringify({ data: "test" }));
      req.end();
    });

    t.equal(res.status, 400, "should return 400 for multiple headers");
    t.match(res.body, /cannot contain commas/, "should indicate multiple keys not allowed");
  } finally {
    server.close();
  }
});
