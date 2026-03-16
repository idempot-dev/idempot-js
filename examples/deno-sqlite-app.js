import { Hono } from "hono";
import { ulid } from "https://esm.sh/ulid@3";
import { idempotency } from "../packages/frameworks/hono/src/index.js";
import { DenoSqliteIdempotencyStore } from "../packages/stores/sqlite/src/deno-sqlite.js";

const app = new Hono();

app.use(
  "*",
  idempotency({
    store: new DenoSqliteIdempotencyStore({ path: "./examples/idempotency.db" })
  })
);

app.post("/users", async (c) => {
  const body = await c.req.json();
  return c.json({ id: ulid(), ...body });
});

console.log("Server running at http://localhost:8000");
console.log("Using SQLite storage at ./examples/idempotency.db");
console.log("");
console.log("Try these requests:");
console.log("");
console.log("# Create user (optional idempotency-key)");
console.log("curl -X POST http://localhost:8000/users \\");
console.log('  -H "Content-Type: application/json" \\');
console.log('  -H "idempotency-key: user-123" \\');
console.log('  -d \'{"name": "John"}\'');
console.log("");
console.log("# Replay - same key and body returns cached response");
console.log("curl -X POST http://localhost:8000/users \\");
console.log('  -H "Content-Type: application/json" \\');
console.log('  -H "idempotency-key: user-123" \\');
console.log('  -d \'{"name": "John"}\'');
console.log("");

Deno.serve(app.fetch);
