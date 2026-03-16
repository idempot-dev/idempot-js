import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { idempotency } from "../packages/frameworks/hono/index.js";
import { PostgresIdempotencyStore } from "../packages/stores/postgres/index.js";
import { ulid } from "ulid";

const app = new Hono();

// Create store - pool is created automatically
const store = new PostgresIdempotencyStore({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false
});

// Basic usage with PostgreSQL persistence
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

// Endpoint requiring idempotency key
app.post("/payments", idempotency({ store }), async (c) => {
  const body = await c.req.json();
  const paymentId = ulid();

  console.log(`Processing payment: ${paymentId}`);

  return c.json(
    {
      id: paymentId,
      status: "completed",
      ...body
    },
    200
  );
});

serve(
  {
    fetch: app.fetch,
    port: 3000
  },
  (info) => {
    console.log(`Server running at http://localhost:${info.port}`);
    console.log(
      `Using PostgreSQL storage at ${process.env.DATABASE_URL || "localhost"}`
    );
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
    console.log("# Payment (required idempotency-key)");
    console.log("curl -X POST http://localhost:3000/payments \\");
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -H "idempotency-key: payment-456" \\');
    console.log('  -d \'{"amount": 100, "currency": "USD"}\'');
    console.log("");
  }
);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  store.close();
  process.exit(0);
});
