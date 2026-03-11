import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { idempotency } from "../packages/frameworks/hono/src/index.js";
import { SqliteIdempotencyStore } from "../packages/stores/sqlite/src/index.js";

const app = new Hono();
const store = new SqliteIdempotencyStore({ path: "./examples/idempotency.db" });

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

serve(
  {
    fetch: app.fetch,
    port: 3000
  },
  (info) => {
    console.log(`Server running at http://localhost:${info.port}`);
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
  }
);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Closing database...");
  store.close();
  process.exit(0);
});
