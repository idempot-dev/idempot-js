---
title: Fastify Plugin - idempot-js
description: Add IETF-compliant idempotency to Fastify applications using preHandler hooks. Supports Redis, PostgreSQL, MySQL, and SQLite storage backends.
---

# Fastify

## Installation

```bash
npm install @idempot/fastify-middleware @idempot/sqlite-store
```

## Usage

```javascript
import Fastify from "fastify";
import { idempotency } from "@idempot/fastify-middleware";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

const fastify = Fastify();
const store = new SqliteIdempotencyStore({ path: ":memory:" });

fastify.post(
  "/orders",
  { preHandler: idempotency({ store }) },
  async (request, reply) => {
    const orderId = crypto.randomUUID();
    return { id: orderId, ...request.body };
  }
);

fastify.listen({ port: 3000 });
```

## API

### `idempotency(options)`

Creates Fastify preHandler hook for idempotency.

**Options:**

- `store` (required): Storage backend implementing `IdempotencyStore`
- `required`: Whether idempotency key is required (default: `true`)
- `ttlMs`: Time-to-live for idempotency records in milliseconds
- `excludeFields`: Fields to exclude from fingerprint calculation
- `resilience`: Circuit breaker and retry options

**Returns:** Fastify preHandler hook function with `circuit` property for monitoring.
