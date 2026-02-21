/// <reference types="deno" />
import { Hono } from "hono";
import { idempotency } from "../../src/index.js";
import { DenoRedisIdempotencyStore } from "../../src/store/deno-redis.js";

const app = new Hono();

app.use(
  "*",
  idempotency({
    store: new DenoRedisIdempotencyStore({
      hostname: Deno.env.get("REDIS_HOST") ?? "127.0.0.1",
      port: parseInt(Deno.env.get("REDIS_PORT") ?? "6379")
    })
  })
);

app.post("/posts", async (c) => {
  const body = await c.req.json();
  return c.json({ id: crypto.randomUUID(), ...body });
});

Deno.serve(app.fetch);
