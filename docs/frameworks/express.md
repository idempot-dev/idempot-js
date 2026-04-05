---
title: Express Middleware - idempot-js
description: Add IETF-compliant idempotency to Express applications. Simple middleware integration with Redis, PostgreSQL, MySQL, or SQLite storage backends.
---

# Express

## Installation

```bash
npm install @idempot/express-middleware @idempot/sqlite-store
```

## Usage

```javascript
import express from "express";
import { idempotency } from "@idempot/express-middleware";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

const app = express();
const store = new SqliteIdempotencyStore({ path: ":memory:" });

app.use(express.json());

app.post("/orders", idempotency({ store }), async (req, res) => {
  const orderId = crypto.randomUUID();
  res.status(201).json({ id: orderId, ...req.body });
});

app.listen(3000);
```

## API

### `idempotency(options)`

Creates Express middleware for idempotency.

**Options:**

- `store` (required): Storage backend implementing `IdempotencyStore`
- `required`: Whether idempotency key is required (default: `true`)
- `ttlMs`: Time-to-live for idempotency records in milliseconds
- `excludeFields`: Fields to exclude from fingerprint calculation
- `resilience`: Circuit breaker and retry options

**Returns:** Express middleware function with `circuit` property for monitoring.
