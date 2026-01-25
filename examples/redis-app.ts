import { serve } from "@hono/node-server";
import { Hono } from "hono";
import Redis from "ioredis";
import { idempotency, RedisIdempotencyStore } from "../src/index.js";

const app = new Hono();

// Configure Redis client
const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

const store = new RedisIdempotencyStore({ client: redis });

// Basic usage with Redis persistence
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
      `Using Redis storage at ${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || "6379"}`
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
  redis.quit();
  process.exit(0);
});
