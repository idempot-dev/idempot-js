/**
 * AWS Lambda + API Gateway Example with Redis/ElastiCache
 *
 * This example shows how to deploy idempot middleware on AWS Lambda
 * behind API Gateway using Redis (ElastiCache) for persistence.
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
 * CONNECTION MANAGEMENT:
 * - lazyConnect: true - Don't connect until first operation (faster cold starts)
 * - maxRetriesPerRequest: 3 - Retry failed operations
 * - enableReadyCheck: false - Skip ready check (faster warm starts)
 * - keepAlive: 30000 - Keep connections alive between invocations
 *
 * DEPLOYMENT:
 * 1. Build: npm run build
 * 2. Deploy Lambda in VPC with access to ElastiCache
 * 3. Configure API Gateway trigger
 * 4. Set environment variables with Redis connection details
 */

import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import Redis from "ioredis";
import { idempotency } from "../packages/frameworks/hono/src/index.js";
import { RedisIdempotencyStore } from "../packages/stores/redis/src/index.js";

// Initialize Redis client OUTSIDE handler for connection reuse
// Lambda-specific configuration for optimal performance in serverless environment
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
  // Lambda-specific: aggressive connection management
  lazyConnect: true, // Don't connect until first operation (faster cold starts)
  maxRetriesPerRequest: 3, // Retry failed operations
  enableReadyCheck: false, // Skip ready check (faster warm starts)
  keepAlive: 30000, // Keep connections alive between invocations
  // Connection pool settings
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

// Lambda handler - Hono's adapter handles API Gateway event format automatically
export const handler = handle(app);
