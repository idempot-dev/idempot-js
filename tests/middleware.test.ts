import { test } from "tap";
import { Hono } from "hono";
import { idempotency } from "../src/middleware.js";
import { MemoryIdempotencyStore } from "../src/store/memory.js";

test("middleware - passes through GET requests", async (t) => {
  const app = new Hono();

  app.get("/test", idempotency(), (c) => {
    return c.json({ message: "success" });
  });

  const res = await app.request("/test");

  t.equal(res.status, 200, "should return 200");
  const json = await res.json();
  t.same(json, { message: "success" }, "should return handler response");
});

test("middleware - POST without key when optional", async (t) => {
  const app = new Hono();

  app.post("/test", idempotency(), (c) => {
    return c.json({ message: "created" });
  });

  const res = await app.request("/test", {
    method: "POST",
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res.status, 200, "should allow request without key");
});

test("middleware - POST without key when required", async (t) => {
  const app = new Hono();

  app.post("/test", idempotency({ required: true }), (c) => {
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
  const app = new Hono();

  app.post("/test", idempotency(), (c) => {
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
  const app = new Hono();

  app.post("/test", idempotency(), (c) => {
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
  const store = new MemoryIdempotencyStore();
  const app = new Hono();

  app.post("/test", idempotency({ store }), (c) => {
    return c.json({ message: "created", id: 123 });
  });

  const res = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "unique-key-1" },
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res.status, 200, "should return handler response");
  const json = await res.json();
  t.same(json, { message: "created", id: 123 }, "should return correct body");
  t.notOk(res.headers.get("x-idempotent-replayed"), "should not be replayed");
});

test("middleware - replays cached response", async (t) => {
  const store = new MemoryIdempotencyStore();
  const app = new Hono();

  let callCount = 0;
  app.post("/test", idempotency({ store }), (c) => {
    callCount++;
    return c.json({ message: "created", id: 123 });
  });

  // First request
  const res1 = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "replay-key" },
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res1.status, 200, "first request should succeed");
  t.equal(callCount, 1, "handler should be called once");

  // Second request with same key and body
  const res2 = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "replay-key" },
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
  const store = new MemoryIdempotencyStore();
  const app = new Hono();

  app.post("/test", idempotency({ store }), async (c) => {
    // Simulate slow handler
    await new Promise((resolve) => setTimeout(resolve, 100));
    return c.json({ message: "created" });
  });

  // Start two requests concurrently with slight delay
  const promise1 = app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "concurrent-key" },
    body: JSON.stringify({ data: "test" })
  });

  // Small delay to ensure first request starts processing
  await new Promise((resolve) => setTimeout(resolve, 10));

  const promise2 = app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "concurrent-key" },
    body: JSON.stringify({ data: "test" })
  });

  const [res1, res2] = await Promise.all([promise1, promise2]);

  // One should succeed, one should get 409
  const statuses = [res1.status, res2.status].sort();
  t.same(statuses, [200, 409], "one success and one conflict");

  const conflict = res1.status === 409 ? res1 : res2;
  const json = await conflict.json();
  t.match(json.error, /already being processed/i, "should indicate concurrent processing");
});

test("middleware - detects same key with different payload", async (t) => {
  const store = new MemoryIdempotencyStore();
  const app = new Hono();

  app.post("/test", idempotency({ store }), (c) => {
    return c.json({ message: "created" });
  });

  // First request
  await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "mismatch-key" },
    body: JSON.stringify({ data: "original" })
  });

  // Second request with same key, different body
  const res = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "mismatch-key" },
    body: JSON.stringify({ data: "changed" })
  });

  t.equal(res.status, 422, "should return 422");
  const json = await res.json();
  t.match(json.error, /different.*payload/i, "should indicate payload mismatch");
});

test("middleware - detects duplicate request with different key", async (t) => {
  const store = new MemoryIdempotencyStore();
  const app = new Hono();

  app.post("/test", idempotency({ store }), (c) => {
    return c.json({ message: "created" });
  });

  // First request
  await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "key-1" },
    body: JSON.stringify({ data: "test" })
  });

  // Second request with different key, same body
  const res = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "key-2" },
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res.status, 409, "should return 409");
  const json = await res.json();
  t.match(json.error, /different.*key/i, "should indicate different key");
});

test("middleware - PATCH method is protected", async (t) => {
  const store = new MemoryIdempotencyStore();
  const app = new Hono();

  let callCount = 0;
  app.patch("/test", idempotency({ store }), (c) => {
    callCount++;
    return c.json({ message: "updated" });
  });

  await app.request("/test", {
    method: "PATCH",
    headers: { "idempotency-key": "patch-key" },
    body: JSON.stringify({ data: "test" })
  });

  const res = await app.request("/test", {
    method: "PATCH",
    headers: { "idempotency-key": "patch-key" },
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res.status, 200, "should replay cached response");
  t.equal(callCount, 1, "handler called only once");
});

test("middleware - custom header name", async (t) => {
  const app = new Hono();

  app.post("/test", idempotency({ headerName: "x-request-id" }), (c) => {
    return c.json({ message: "created" });
  });

  const res = await app.request("/test", {
    method: "POST",
    headers: { "x-request-id": "custom-key" },
    body: JSON.stringify({ data: "test" })
  });

  t.equal(res.status, 200, "should work with custom header name");
});

test("middleware - field exclusion works", async (t) => {
  const store = new MemoryIdempotencyStore();
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
    headers: { "idempotency-key": "exclude-key" },
    body: JSON.stringify({ data: "test", timestamp: "2024-01-01" })
  });

  const res = await app.request("/test", {
    method: "POST",
    headers: { "idempotency-key": "exclude-key" },
    body: JSON.stringify({ data: "test", timestamp: "2024-01-02" })
  });

  t.equal(res.status, 200, "should replay despite timestamp difference");
  t.equal(callCount, 1, "handler called only once");
});
