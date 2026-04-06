---
title: Sharing Middleware Across Endpoints - idempot-js
description: Learn how to reuse a single idempotency middleware instance across multiple API endpoints for consistent configuration and shared circuit breaker state.
---

# Sharing Middleware Across Endpoints

You can reuse the same idempotency middleware instance across multiple endpoints. This approach provides consistent configuration and shared circuit breaker monitoring across your API.

## Why Share Middleware?

**Consistent Configuration**: All endpoints use the same TTL, key validation, and resilience settings.

**Shared Circuit Breaker**: Monitor storage health from a single state object instead of multiple instances.

**Performance**: Create the middleware once, use it everywhere.

## How It Works

The middleware uses request fingerprints to distinguish operations. The fingerprint includes:

- Request body content
- HTTP method
- Excluded fields (if configured)

Each endpoint naturally creates different fingerprints because they have different request bodies and paths. This means:

- Same idempotency key on `/orders` → one operation
- Same idempotency key on `/payments` → different operation
- Same idempotency key on same endpoint with same body → duplicate detected

## Basic Pattern

Create the middleware once and apply it to multiple routes:

```javascript
import express from "express";
import { idempotency } from "@idempot/express-middleware";
import { PostgresIdempotencyStore } from "@idempot/postgres-store";

const app = express();
const store = new PostgresIdempotencyStore({
  connectionString: process.env.DATABASE_URL
});

// Create ONE middleware instance
const idempotencyMiddleware = idempotency({
  store,
  required: true,
  ttlMs: 24 * 60 * 60 * 1000 // 24 hours
});

// Apply to multiple endpoints
app.post("/orders", idempotencyMiddleware, createOrderHandler);
app.post("/payments", idempotencyMiddleware, processPaymentHandler);
app.post("/transfers", idempotencyMiddleware, createTransferHandler);

// Monitor circuit breaker from the shared instance
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    circuit: idempotencyMiddleware.circuit.status
  });
});
```

## Circuit Breaker State

When you share a middleware instance, the circuit breaker state is shared across all endpoints:

```javascript
const middleware = idempotency({ store });

// All endpoints share this circuit state
app.post("/orders", middleware, handler);
app.post("/payments", middleware, handler);

// Check if storage is healthy
console.log(middleware.circuit.status); // 'closed', 'open', or 'half-open'
```

This is usually what you want—if PostgreSQL goes down, you want all endpoints to know about it and respond with 503 Service Unavailable.

## When to Create Separate Instances

Create separate middleware instances when endpoints need different configurations:

```javascript
// Short TTL for webhooks (retries happen quickly)
const webhookIdempotency = idempotency({
  store,
  ttlMs: 60 * 60 * 1000 // 1 hour
});

// Long TTL for financial operations
const paymentIdempotency = idempotency({
  store,
  ttlMs: 7 * 24 * 60 * 60 * 1000 // 7 days
});

app.post("/webhooks", webhookIdempotency, handleWebhook);
app.post("/payments", paymentIdempotency, processPayment);
```

## Complete Example

See [`examples/express-postgres-multi-endpoint.js`](https://github.com/idempot-dev/idempot-js/blob/main/examples/express-postgres-multi-endpoint.js) for a runnable Express application that demonstrates:

- Single middleware instance protecting `/orders`, `/payments`, and `/transfers`
- PostgreSQL storage with automatic table creation
- Circuit breaker monitoring via `/health` endpoint
- Curl commands to test idempotency across different endpoints

Run it with:

```bash
# Set up PostgreSQL (creates table automatically)
export DATABASE_URL="postgres://user:pass@localhost:5432/mydb"

# Run the example
node examples/express-postgres-multi-endpoint.js
```

## Framework-Specific Notes

### Express

Express middleware can be reused directly:

```javascript
const middleware = idempotency({ store });

app.post("/a", middleware, handlerA);
app.post("/b", middleware, handlerB);
```

### Fastify

Fastify's plugin system works with shared middleware:

```javascript
const middleware = idempotency({ store });

fastify.post("/a", { preHandler: middleware }, handlerA);
fastify.post("/b", { preHandler: middleware }, handlerB);
```

### Hono

Hono middleware can be shared the same way:

```javascript
const middleware = idempotency({ store });

app.post("/a", middleware, handlerA);
app.post("/b", middleware, handlerB);
```

## Key Takeaway

Sharing middleware is safe and recommended when endpoints need the same idempotency behavior. The request fingerprinting ensures proper isolation between endpoints while giving you centralized monitoring and configuration.
