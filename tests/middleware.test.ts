import { test } from "tap";
import { Hono } from "hono";
import { idempotency } from "../src/middleware.js";

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
