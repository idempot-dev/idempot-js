/// <reference types="deno" />
import { Hono } from "hono";
import { idempotency } from "../../src/index.js";
import { DenoSqliteIdempotencyStore } from "../../src/store/deno-sqlite.js";

const app = new Hono();

app.use(
  "*",
  idempotency({
    store: new DenoSqliteIdempotencyStore({ path: "./idempotency.db" })
  })
);

app.post("/users", async (c) => {
  const body = await c.req.json();
  return c.json({ id: crypto.randomUUID(), ...body });
});

Deno.serve(app.fetch);
