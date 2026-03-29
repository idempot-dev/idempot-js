# @idempot/fastify-middleware

Fastify middleware for idempotency.

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
- `headerName`: Header name for idempotency key (default: `"Idempotency-Key"`)
- `required`: Whether idempotency key is required (default: `false`)
- `ttlMs`: Time-to-live for idempotency records in milliseconds
- `excludeFields`: Fields to exclude from fingerprint calculation
- `resilience`: Circuit breaker and retry options

**Returns:** Fastify preHandler hook function with `circuit` property for monitoring.

## License

BSD-3-Clause
