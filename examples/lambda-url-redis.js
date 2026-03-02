/**
 * AWS Lambda Function URL Example with Redis/ElastiCache
 *
 * This example shows how to deploy idempot middleware on AWS Lambda
 * with Function URLs using Redis (ElastiCache) for persistence.
 *
 * FUNCTION URL vs API GATEWAY:
 * - Function URLs provide direct HTTPS endpoints to Lambda
 * - Simpler setup: no API Gateway configuration needed
 * - Lower latency: no API Gateway hop
 * - Fewer features: no request validation, throttling, API keys, etc.
 *
 * VPC CONFIGURATION REQUIRED:
 * - Lambda must be deployed in the same VPC as ElastiCache
 * - Security groups must allow Lambda to connect to Redis port (6379)
 * - Lambda needs VPC execution role with ec2:CreateNetworkInterface permissions
 *
 * ENVIRONMENT VARIABLES:
 * - REDIS_HOST: Redis endpoint (required)
 * - REDIS_PORT: Redis port (default: 6379)
 * - REDIS_PASSWORD: Redis password (for AUTH-enabled clusters)
 *
 * DEPLOYMENT:
 * 1. Build: npm run build
 * 2. Deploy Lambda in VPC with access to ElastiCache
 * 3. Enable Function URL in Lambda console or IaC
 * 4. Configure auth type (AWS_IAM or NONE)
 * 5. Set environment variables with Redis connection details
 */

import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import Redis from "ioredis";
import { idempotency } from "../src/hono-middleware.js";
import { RedisIdempotencyStore } from "../src/store/redis.js";

// Initialize Redis client OUTSIDE handler for connection reuse
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
  // Lambda-specific: aggressive connection management
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
  keepAlive: 30000,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

const store = new RedisIdempotencyStore({ client: redis });

const app = new Hono();

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
export const handler = handle(app);
