/**
 * AWS Lambda Function URL Example with DynamoDB
 *
 * This example shows how to deploy idempot middleware on AWS Lambda
 * with Function URLs (direct HTTP access, no API Gateway required).
 *
 * FUNCTION URL vs API GATEWAY:
 * - Function URLs provide direct HTTPS endpoints to Lambda
 * - Simpler setup: no API Gateway configuration needed
 * - Lower latency: no API Gateway hop
 * - Fewer features: no request validation, throttling, API keys, etc.
 * - Same handler code: Hono's adapter handles both formats
 *
 * REQUIRED IAM PERMISSIONS:
 * The Lambda execution role needs:
 * - dynamodb:GetItem
 * - dynamodb:PutItem
 * - dynamodb:UpdateItem
 * - dynamodb:Query
 * On the idempotency table
 *
 * ENVIRONMENT VARIABLES:
 * - AWS_REGION: AWS region (default: us-east-1)
 * - IDEMPOTENCY_TABLE: DynamoDB table name (default: idempotency-records)
 *
 * DEPLOYMENT:
 * 1. Build: npm run build
 * 2. Deploy Lambda function
 * 3. Enable Function URL in Lambda console or IaC
 * 4. Configure auth type (AWS_IAM or NONE)
 * 5. Ensure DynamoDB table exists with correct schema
 */

import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { idempotency } from "../src/hono-middleware.js";
import { DynamoDbIdempotencyStore } from "../src/store/dynamodb.js";

// Initialize clients OUTSIDE handler for connection reuse across warm invocations
const dynamoDBClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1"
});
const documentClient = DynamoDBDocumentClient.from(dynamoDBClient);

const store = new DynamoDbIdempotencyStore({
  client: documentClient,
  tableName: process.env.IDEMPOTENCY_TABLE || "idempotency-records"
});

const app = new Hono();

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

// Required idempotency key for sensitive operations
app.post("/payments", idempotency({ store }), async (c) => {
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

// Lambda handler - works with both API Gateway and Function URL
// Hono's adapter automatically detects and handles the event format
export const handler = handle(app);
