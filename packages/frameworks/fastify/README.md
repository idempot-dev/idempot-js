# @idempot/fastify-middleware

Fastify middleware for idempotency.

## Installation

```bash
npm install @idempot/fastify-middleware
```

### Available Stores

Choose a storage backend that fits your infrastructure:

- `@idempot/sqlite-store` - great for development and single-node deployments
- `@idempot/redis-store`
- `@idempot/postgres-store`
- `@idempot/mysql-store`
- `@idempot/bun-sql-store` - Bun runtime

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

If upgrading from v1.x, update your code:

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

## TypeScript Support

This library uses JavaScript with JSDoc comments for type information. Enable `allowJs` in your TypeScript configuration to use these types directly—no separate .d.ts files needed.

To use this library in a TypeScript project:

1. Add these settings to your `tsconfig.json`:

   ```json
   {
     "allowJs": true,
     "checkJs": true
   }
   ```

2. Import the library as you normally would:

   ```typescript
   import { idempotency } from "@idempot/fastify-middleware";
   ```

3. JSDoc comments provide full type safety: parameter types, return types, and detailed documentation in your IDE.

This approach simplifies maintenance while giving TypeScript users an excellent developer experience.

## License

BSD-3-Clause
