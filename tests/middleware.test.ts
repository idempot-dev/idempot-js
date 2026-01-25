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
