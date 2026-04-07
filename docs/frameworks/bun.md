---
title: Bun Handler - idempot-js
description: Add IETF-compliant idempotency to Bun.serve applications. Wraps native Request/Response handlers with Redis, PostgreSQL, MySQL, SQLite, or Bun SQL storage backends.
---

# Bun

## Installation

```bash
bun add @idempot/bun-handler @idempot/bun-sql-store
```

## Usage

```javascript
import { idempotency } from "@idempot/bun-handler";
import { BunSqlIdempotencyStore } from "@idempot/bun-sql-store";

const store = new BunSqlIdempotencyStore("sqlite://:memory:");
const withIdempotency = idempotency({ store });

Bun.serve({
  routes: {
    "/orders": withIdempotency(async (req) => {
      const body = await req.json();
      const orderId = crypto.randomUUID();
      return Response.json({ id: orderId, ...body }, { status: 201 });
    }),
  },
});
```

Unlike Express/Fastify/Hono middleware, `idempotency()` returns a **handler wrapper** rather than a middleware function. Call it once per route to wrap the handler directly.

## API

### `idempotency(options)`

Creates a handler wrapper for idempotency enforcement.

**Options:**

- `store` (required): Storage backend implementing `IdempotencyStore`
- `required`: Whether idempotency key is required (default: `true`)
- `ttlMs`: Time-to-live for idempotency records in milliseconds
- `excludeFields`: Fields to exclude from fingerprint calculation
- `resilience`: Circuit breaker and retry options

**Returns:** A function `(handler) => handler` that wraps a `Request => Response` handler. The returned wrapper function has a `circuit` property for circuit-breaker monitoring.

## Multiple Routes

Call `idempotency()` once and reuse the wrapper across routes:

```javascript
import { idempotency } from "@idempot/bun-handler";
import { BunSqlIdempotencyStore } from "@idempot/bun-sql-store";

const store = new BunSqlIdempotencyStore("sqlite://:memory:");
const withIdempotency = idempotency({ store });

Bun.serve({
  routes: {
    "/orders": withIdempotency(async (req) => {
      const body = await req.json();
      return Response.json({ id: crypto.randomUUID(), ...body }, { status: 201 });
    }),

    "/payments": withIdempotency(async (req) => {
      const body = await req.json();
      return Response.json({ id: crypto.randomUUID(), ...body }, { status: 201 });
    }),
  },
});
```

## Circuit Breaker

The wrapper exposes the underlying circuit breaker for monitoring:

```javascript
const withIdempotency = idempotency({ store });

console.log(withIdempotency.circuit.stats);
```
