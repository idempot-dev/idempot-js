import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, Command } from "@aws-sdk/lib-dynamodb";
import { idempotency, DynamoDbIdempotencyStore } from "../src/index.js";

const app = new Hono();

// Configure DynamoDB client
const dynamoDBClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  endpoint: process.env.DYNAMODB_ENDPOINT // For local DynamoDB testing
});

const documentClient = DynamoDBDocumentClient.from(dynamoDBClient);

const store = new DynamoDbIdempotencyStore({
  client: documentClient,
  tableName: process.env.IDEMPOTENCY_TABLE || "idempotency-records"
});

// Basic usage with DynamoDB persistence
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

// Health check endpoint
app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

serve(
  {
    fetch: app.fetch,
    port: 3000
  },
  (info) => {
    console.log(`Server running at http://localhost:${info.port}`);
    console.log(
      `Using DynamoDB storage at ${process.env.DYNAMODB_ENDPOINT || `region: ${process.env.AWS_REGION || "us-east-1"}`}`
    );
    console.log(
      `Table name: ${process.env.IDEMPOTENCY_TABLE || "idempotency-records"}`
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
    console.log('  -h "idempotency-key: order-123" \\');
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
  dynamoDBClient.destroy();
  process.exit(0);
});
