import { test } from "tap";
import { Hono } from "hono";
import { idempotency } from "@idempot/hono-middleware";
import { withResilience } from "@idempot/core";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

test("middleware - passes through GET requests", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = new Hono();

  app.get("/test", idempotency({ store }), (c) => {
    return c.json({ message: "success" });
  });

  const res = await app.request("/test");

  t.equal(res.status, 200, "should return 200");
  const json = await res.json();
  t.same(json, { message: "success" }, "should return handler response");
});

test("middleware - POST without key when optional", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = new Hono();

  app.post("/test", idempotency({ store, required: false }), (c) => {
    return c.json({ message: "created" });
  });

  const res = await app.request("/test", {
    method: "POST",
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res.status, 200, "should allow request without key");
});

test("middleware - POST without key when required", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = new Hono();

  app.post("/test", idempotency({ store, required: true }), (c) => {
    return c.json({ message: "created" });
  });

  const res = await app.request("/test", {
    method: "POST",
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res.status, 400, "should return 400");
  const json = await res.json();
  t.match(json.error, /required/i, "should indicate header is required");
});

test("middleware - validates key length", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = new Hono();

  app.post("/test", idempotency({ store }), (c) => {
    return c.json({ message: "created" });
  });

  const longKey = "x".repeat(256);
  const res = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": longKey },
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res.status, 400, "should return 400 for too-long key");
  const json = await res.json();
  t.match(json.error, /255 characters/i, "should indicate max length");
});

test("middleware - validates empty key", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = new Hono();

  app.post("/test", idempotency({ store }), (c) => {
    return c.json({ message: "created" });
  });

  const res = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "" },
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res.status, 400, "should return 400 for empty key");
});

test("middleware - first request with new key", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = new Hono();

  app.post("/test", idempotency({ store }), (c) => {
    return c.json({ message: "created", id: 123 });
  });

  const res = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "unique-key-123456789012" },
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res.status, 200, "should return handler response");
  const json = await res.json();
  t.same(json, { message: "created", id: 123 }, "should return correct body");
  t.notOk(res.headers.get("x-idempotent-replayed"), "should not be replayed");
});

test("middleware - replays cached response", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = new Hono();

  let callCount = 0;
  app.post("/test", idempotency({ store }), (c) => {
    callCount++;
    return c.json({ message: "created", id: 123 });
  });

  // First request
  const res1 = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "replay-key-123456789012" },
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res1.status, 200, "first request should succeed");
  t.equal(callCount, 1, "handler should be called once");

  // Second request with same key and body
  const res2 = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "replay-key-123456789012" },
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res2.status, 200, "cached response should have same status");
  t.equal(callCount, 1, "handler should not be called again");
  t.equal(
    res2.headers.get("x-idempotent-replayed"),
    "true",
    "should have replay header"
  );

  const json2 = await res2.json();
  t.same(json2, { message: "created", id: 123 }, "should return cached body");
});

test("middleware - detects concurrent processing", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = new Hono();

  app.post("/test", idempotency({ store }), async (c) => {
    // Simulate slow handler
    await new Promise((resolve) => setTimeout(resolve, 100));
    return c.json({ message: "created" });
  });

  // Start two requests concurrently with slight delay
  const promise1 = app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "concurrent-key-12345678901" },
    body: JSON.stringify({ data: "test" })
  });

  // Small delay to ensure first request starts processing
  await new Promise((resolve) => setTimeout(resolve, 10));

  const promise2 = app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "concurrent-key-12345678901" },
    body: JSON.stringify({ data: "test" })
  });

  const [res1, res2] = await Promise.all([promise1, promise2]);

  // One should succeed, one should get 409
  const statuses = [res1.status, res2.status].sort();
  t.same(statuses, [200, 409], "one success and one conflict");

  const conflict = res1.status === 409 ? res1 : res2;
  const json = await conflict.json();
  t.match(
    json.error,
    /already being processed/i,
    "should indicate concurrent processing"
  );
});

test("middleware - detects same key with different payload", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = new Hono();

  app.post("/test", idempotency({ store }), (c) => {
    return c.json({ message: "created" });
  });

  // First request
  await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "mismatch-key-12345678901" },
    body: JSON.stringify({ data: "original" })
  });

  // Second request with same key, different body
  const res = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "mismatch-key-12345678901" },
    body: JSON.stringify({ data: "changed" })
  });

  t.equal(res.status, 422, "should return 422");
  const json = await res.json();
  t.match(
    json.error,
    /different.*payload/i,
    "should indicate payload mismatch"
  );
});

test("middleware - detects duplicate request with different key", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = new Hono();

  app.post("/test", idempotency({ store }), (c) => {
    return c.json({ message: "created" });
  });

  // First request
  await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "key-1-234567890123456" },
    body: JSON.stringify({ data: "test" })
  });

  // Second request with different key, same body
  const res = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "key-2-234567890123456" },
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res.status, 409, "should return 409");
  const json = await res.json();
  t.match(json.error, /different.*key/i, "should indicate different key");
});

test("middleware - PATCH method is protected", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = new Hono();

  let callCount = 0;
  app.patch("/test", idempotency({ store }), (c) => {
    callCount++;
    return c.json({ message: "updated" });
  });

  await app.request("/test", {
    method: "PATCH",
    headers: { "idempotency-key": "patch-key-123456789012" },
    body: JSON.stringify({ data: "test" })
  });

  const res = await app.request("/test", {
    method: "PATCH",
    headers: { "idempotency-key": "patch-key-123456789012" },
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res.status, 200, "should replay cached response");
  t.equal(callCount, 1, "handler called only once");
});

test("middleware - field exclusion works", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = new Hono();

  let callCount = 0;
  app.post(
    "/test",
    idempotency({ store, excludeFields: ["timestamp"] }),
    (c) => {
      callCount++;
      return c.json({ message: "created" });
    }
  );

  await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "exclude-key-12345678901" },
    body: JSON.stringify({ data: "test", timestamp: "2024-01-01" })
  });

  const res = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "exclude-key-12345678901" },
    body: JSON.stringify({ data: "test", timestamp: "2024-01-02" })
  });

  t.equal(res.status, 200, "should replay despite timestamp difference");
  t.equal(callCount, 1, "handler called only once");
});

test("middleware - throws when store is not provided", async (t) => {
  try {
    idempotency();
    t.fail("should have thrown");
  } catch (err) {
    t.match(
      err.message,
      /IdempotencyStore must be provided/i,
      "should throw error about store"
    );
  }
});

test("middleware - handles byKey with non-standard status passes through", async (t) => {
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

test("withResilience retries until success", async (t) => {
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

  t.equal(attempts, 3, "should retry 3 times before success");
});

test("returns 503 when startProcessing fails after lookup", async (t) => {
  const store = {
    lookup: async () => ({ byKey: null, byFingerprint: null }),
    startProcessing: async () => {
      throw new Error("Connection refused");
    },
    complete: async () => {}
  };

  const app = new Hono();
  app.post("/", idempotency({ store }), (c) => c.text("ok"));

  const res = await app.request("/", {
    method: "POST",
    headers: { "Idempotency-Key": "test-key-123456789012" },
    body: "{}"
  });

  t.equal(res.status, 503, "should return 503 when startProcessing fails");
});

test("returns 503 when lookup fails", async (t) => {
  const failingStore = {
    async lookup() {
      throw new Error("Connection refused");
    },
    async startProcessing() {},
    async complete() {}
  };

  const app = new Hono();
  app.post("/", idempotency({ store: failingStore }), (c) => c.text("ok"));

  const res = await app.request("/", {
    method: "POST",
    headers: { "Idempotency-Key": "test-key-123456789012" },
    body: "{}"
  });

  t.equal(res.status, 503, "should return 503 when lookup fails");
});

test("continues response when complete fails", async (t) => {
  const store = {
    lookup: async () => ({ byKey: null, byFingerprint: null }),
    startProcessing: async () => {},
    complete: async () => {
      throw new Error("Connection refused");
    }
  };

  const app = new Hono();
  app.post("/", idempotency({ store }), (c) => c.text("ok"));

  const res = await app.request("/", {
    method: "POST",
    headers: { "Idempotency-Key": "test-key-123456789012" },
    body: "{}"
  });

  t.equal(res.status, 200, "should return 200 even if complete fails");
});

test("rejects keys containing commas", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = new Hono();
  app.post("/", idempotency({ store }), (c) => c.text("ok"));

  const res = await app.request("/", {
    method: "POST",
    headers: { "Idempotency-Key": "key-with,comma-21chars" },
    body: "{}"
  });

  t.equal(res.status, 400, "should return 400 for comma-containing key");
  const json = await res.json();
  t.match(json.error, /cannot contain commas/, "should indicate comma error");
});

test("rejects multiple idempotency-key headers", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const app = new Hono();
  app.post("/", idempotency({ store }), (c) => c.text("ok"));

  // Simulate multiple headers using Headers API with append
  const headers = new Headers();
  headers.append("Idempotency-Key", "first-key-16chars");
  headers.append("Idempotency-Key", "second-key-16chars");

  const res = await app.request("/", {
    method: "POST",
    headers,
    body: "{}"
  });

  t.equal(res.status, 400, "should return 400 for multiple headers");
  const json = await res.json();
  t.match(json.error, /cannot contain commas/, "should indicate multiple keys not allowed");
});
