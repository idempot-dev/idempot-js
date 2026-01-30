/**
 * AWS Lambda + API Gateway Example with DynamoDB
 *
 * This example shows how to deploy hono-idempotency middleware on AWS Lambda
 * behind API Gateway (REST API or HTTP API) using DynamoDB for persistence.
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
 * 2. Package and deploy using SAM, CDK, Serverless Framework, or Terraform
 * 3. Configure API Gateway trigger in Lambda console or IaC
 * 4. Ensure DynamoDB table exists with correct schema (see docs/dynamodb-setup.md)
 */

import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { idempotency, DynamoDbIdempotencyStore } from "../src/index.js";

// Initialize clients OUTSIDE handler for connection reuse across warm invocations
// This significantly improves performance by avoiding reconnection overhead
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

// Lambda handler - Hono's adapter handles API Gateway event format automatically
export const handler = handle(app);
