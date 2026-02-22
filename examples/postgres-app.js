import { serve } from "@hono/node-server";
import { Hono } from "hono";
import pg from "pg";
import { idempotency, PostgresIdempotencyStore } from "../src/index.js";

const app = new Hono();

// Configure PostgreSQL pool
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false
});

const store = new PostgresIdempotencyStore({ pool });
await store.init();

// Basic usage with PostgreSQL persistence
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

// Endpoint requiring idempotency key
app.post("/payments", idempotency({ store, required: true }), async (c) => {
  const body = await c.req.json();
  const paymentId = Math.random().toString(36).substring(7);

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
    console.log("\nTry these curl commands:");
    console.log("curl -X POST http://localhost:3000/orders \\");
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -H "Idempotency-Key: order-123" \\');
    console.log('  -d \'{"product":"widget","quantity":5}\'');
  }
);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  pool.end();
  process.exit(0);
});
