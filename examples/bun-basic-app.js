import { Hono } from "hono";
import { idempotency } from "../src/index.js";
import { BunSqliteIdempotencyStore } from "../src/store/bun-sqlite.js";

const app = new Hono();
const store = new BunSqliteIdempotencyStore({ path: ":memory:" });

// Basic usage with default options (optional idempotency-key)
app.post("/orders", idempotency({ store }), async (c) => {
  // Simulate order creation
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

// Required idempotency-key
app.post("/payments", idempotency({ store, required: true }), async (c) => {
  const body = await c.req.json();
  const paymentId = Math.random().toString(36).substring(7);

  console.log(`Processing payment: ${paymentId}`);

  return c.json(
    {
      id: paymentId,
      status: "processed",
      ...body
    },
    201
  );
});

// Custom header name
app.post(
  "/transfers",
  idempotency({
    store,
    headerName: "x-request-id"
  }),
  async (c) => {
    const body = await c.req.json();
    const transferId = Math.random().toString(36).substring(7);

    console.log(`Processing transfer: ${transferId}`);

    return c.json(
      {
        id: transferId,
        status: "completed",
        ...body
      },
      201
    );
  }
);

// Exclude timestamp field from fingerprint
app.post(
  "/events",
  idempotency({
    store,
    excludeFields: ["timestamp", "$.metadata.requestId"]
  }),
  async (c) => {
    const body = await c.req.json();
    const eventId = Math.random().toString(36).substring(7);

    console.log(`Recording event: ${eventId}`);

    return c.json(
      {
        id: eventId,
        recorded: true,
        ...body
      },
      201
    );
  }
);

// PATCH endpoint also protected
app.patch("/orders/:id", idempotency({ store }), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  console.log(`Updating order: ${id}`);

  return c.json({
    id,
    status: "updated",
    ...body
  });
});

// Cleanup expired records every 10 minutes
setInterval(
  () => {
    store.cleanup().then(() => {
      console.log("Cleaned up expired idempotency records");
    });
  },
  10 * 60 * 1000
);

// Bun's native server
export default {
  port: 3000,
  fetch: app.fetch
};

console.log("Server running at http://localhost:3000");
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
