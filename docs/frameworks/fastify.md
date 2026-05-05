---
title: Fastify Plugin - idempot-js
description: Add IETF-compliant idempotency to Fastify applications using a Fastify plugin. Supports Redis, PostgreSQL, MySQL, and SQLite storage backends.
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

// Register as a plugin - applies to all routes in this scope
fastify.register(idempotency, { store });

fastify.post("/orders", async (request, reply) => {
  const orderId = crypto.randomUUID();
  return { id: orderId, ...request.body };
});

fastify.listen({ port: 3000 });
```

### Migration from v1.x

```javascript
// v1.x (deprecated)
fastify.addHook("preHandler", idempotency({ store }));

// v2.x
fastify.register(idempotency, { store });
```

## API

### `idempotency(options)`

Creates a Fastify plugin for idempotency. The plugin registers `preHandler` and `onSend` hooks internally.

**Options:**

- `store` (required): Storage backend implementing `IdempotencyStore`
- `required`: Whether idempotency key is required (default: `true`)
- `ttlMs`: Time-to-live for idempotency records in milliseconds
- `excludeFields`: Fields to exclude from fingerprint calculation
- `resilience`: Circuit breaker and retry options

**Returns:** Fastify plugin with `circuit` property for monitoring.
