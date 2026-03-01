import { Hono } from "hono";
import { idempotency } from "../src/index.js";
import { BunSqliteIdempotencyStore } from "../src/store/bun-sqlite.js";

const app = new Hono();
const store = new BunSqliteIdempotencyStore({ path: "./data/idempotency.db" });

// Cleanup expired records every hour
setInterval(
  () => {
    store.cleanup().then(() => {
      console.log("Cleaned up expired idempotency records");
    });
  },
  60 * 60 * 1000
);

// Basic usage with SQLite persistence
app.post("/orders", idempotency({ store }), async (c) => {
  const body = await c.req.json();
  const orderId = Math.random().toString(36).substring(7);

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
console.log("Using SQLite storage at ./data/idempotency.db");
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
