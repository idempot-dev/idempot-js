import express from "express";
import { idempotency } from "../packages/frameworks/express/index.js";
import { PostgresIdempotencyStore } from "../packages/stores/postgres/index.js";
import { ulid } from "ulid";

// Create a single Express app
const app = express();

// Parse JSON request bodies
app.use(express.json());

// Create a PostgreSQL-backed store
// The table will be created automatically on first use
const store = new PostgresIdempotencyStore({
  connectionString: process.env.DATABASE_URL
});

// Create ONE middleware instance to share across endpoints
// This demonstrates that the same middleware can protect multiple routes
const sharedIdempotency = idempotency({
  store,
  required: true // All endpoints require idempotency-key header
});

// Each endpoint uses the SAME middleware instance
// This works because the request fingerprint includes the URL path,
// so /orders and /payments with the same idempotency-key are treated as
// different operations

// Orders endpoint - uses shared middleware
app.post("/orders", sharedIdempotency, async (req, res) => {
  const orderId = ulid();

  console.log(`Creating order: ${orderId}`);

  // Simulate order processing delay
  await new Promise((resolve) => setTimeout(resolve, 50));

  res.status(201).json({
    id: orderId,
    type: "order",
    status: "created",
    ...req.body
  });
});

// Payments endpoint - uses the SAME shared middleware
app.post("/payments", sharedIdempotency, async (req, res) => {
  const paymentId = ulid();

  console.log(`Processing payment: ${paymentId}`);

  // Simulate payment processing
  await new Promise((resolve) => setTimeout(resolve, 50));

  res.status(200).json({
    id: paymentId,
    type: "payment",
    status: "completed",
    ...req.body
  });
});

// Transfers endpoint - also uses the SAME shared middleware
app.post("/transfers", sharedIdempotency, async (req, res) => {
  const transferId = ulid();

  console.log(`Processing transfer: ${transferId}`);

  // Simulate transfer processing
  await new Promise((resolve) => setTimeout(resolve, 50));

  res.status(201).json({
    id: transferId,
    type: "transfer",
    status: "completed",
    ...req.body
  });
});

// Health check (no idempotency required)
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    circuit: sharedIdempotency.circuit.status
  });
});

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log("");
  console.log("This example demonstrates using the SAME middleware instance");
  console.log("across multiple endpoints with PostgreSQL storage.");
  console.log("");
  console.log("Key insight: Each endpoint is isolated because the request");
  console.log("fingerprint includes the URL path. Same idempotency-key on");
  console.log("different endpoints = different operations.");
  console.log("");
  console.log("Circuit breaker state is shared (check /health).");
  console.log("");
  console.log("Try these requests:");
  console.log("");
  console.log("# 1. Create an order");
  console.log(
    `curl -X POST http://localhost:${PORT}/orders -H "Content-Type: application/json" -H "idempotency-key: my-key-123" -d '{"item": "widget", "quantity": 5}'`
  );
  console.log("");
  console.log("# 2. Replay the SAME order (returns cached response)");
  console.log(
    `curl -X POST http://localhost:${PORT}/orders -H "Content-Type: application/json" -H "idempotency-key: my-key-123" -d '{"item": "widget", "quantity": 5}'`
  );
  console.log("");
  console.log(
    "# 3. Create a PAYMENT with the SAME key (different endpoint = new operation)"
  );
  console.log(
    `curl -X POST http://localhost:${PORT}/payments -H "Content-Type: application/json" -H "idempotency-key: my-key-123" -d '{"amount": 100, "currency": "USD"}'`
  );
  console.log("");
  console.log("# 4. Create a TRANSFER (also uses same shared middleware)");
  console.log(
    `curl -X POST http://localhost:${PORT}/transfers -H "Content-Type: application/json" -H "idempotency-key: transfer-456" -d '{"from": "account-1", "to": "account-2", "amount": 50}'`
  );
  console.log("");
  console.log("# 5. Check circuit breaker status");
  console.log(`curl http://localhost:${PORT}/health`);
  console.log("");
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await store.close();
  server.close(() => {
    process.exit(0);
  });
});
