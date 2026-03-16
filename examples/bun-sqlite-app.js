import { Hono } from "hono";
import { idempotency } from "../packages/frameworks/hono/src/index.js";
import { BunSqliteIdempotencyStore } from "../packages/stores/bun-sqlite/src/index.js";
import { ulid } from "ulid";

const app = new Hono();
const store = new BunSqliteIdempotencyStore({
  path: "./examples/idempotency.db"
});

// Basic usage with SQLite persistence
app.post("/orders", idempotency({ store }), async (c) => {
  const body = await c.req.json();
  const orderId = ulid();

  console.log(`Creating order: ${orderId}`);

  return c.json(
    {
      id: orderId,
      status: "created",
      ...body
    },
    201
  );
});

console.log("Server running at http://localhost:3000");
console.log("Using SQLite storage at ./examples/idempotency.db");
console.log("");
console.log("Try these requests:");
console.log("");
console.log("# Create order (optional idempotency-key)");
console.log("curl -X POST http://localhost:3000/orders \\");
console.log('  -H "Content-Type: application/json" \\');
console.log('  -H "idempotency-key: order-123" \\');
console.log('  -d \'{"item": "widget", "quantity": 5}\'');
console.log("");
console.log("# Replay - same key and body returns cached response");
console.log("curl -X POST http://localhost:3000/orders \\");
console.log('  -H "Content-Type: application/json" \\');
console.log('  -H "idempotency-key: order-123" \\');
console.log('  -d \'{"item": "widget", "quantity": 5}\'');
console.log("");

// Bun's native server
export default {
  port: 3000,
  fetch: app.fetch
};

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Closing database...");
  store.close();
  process.exit(0);
});
