---
title: Hono Middleware - idempot-js
description: Add IETF-compliant idempotency to Hono applications. Works on Node.js, Bun, and Deno runtimes with multiple storage backends.
---

# Hono

## Installation

```bash
npm install @idempot/hono-middleware @idempot/sqlite-store
```

## Usage

```javascript
import { Hono } from "hono";
import { idempotency } from "@idempot/hono-middleware";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

const app = new Hono();
const store = new SqliteIdempotencyStore({ path: ":memory:" });

app.post("/orders", idempotency({ store }), async (c) => {
  const orderId = crypto.randomUUID();
  return c.json({ id: orderId, ...(await c.req.json()) }, 201);
});

export default app;
```

## API

### `idempotency(options)`

Creates Hono middleware for idempotency.

**Options:**

- `store` (required): Storage backend implementing `IdempotencyStore`
- `required`: Whether idempotency key is required (default: `true`)
- `ttlMs`: Time-to-live for idempotency records in milliseconds
- `excludeFields`: Fields to exclude from fingerprint calculation
- `resilience`: Circuit breaker and retry options

**Returns:** Hono middleware function with `circuit` property for monitoring.
