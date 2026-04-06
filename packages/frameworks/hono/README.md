# @idempot/hono-middleware

Hono middleware for idempotency.

## Installation

```bash
npm install @idempot/hono-middleware
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
- `headerName`: Header name for idempotency key (default: `"Idempotency-Key"`)
- `required`: Whether idempotency key is required (default: `false`)
- `ttlMs`: Time-to-live for idempotency records in milliseconds
- `excludeFields`: Fields to exclude from fingerprint calculation
- `resilience`: Circuit breaker and retry options

**Returns:** Hono middleware function with `circuit` property for monitoring.

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
   import { idempotency } from "@idempot/hono-middleware";
   ```

3. JSDoc comments provide full type safety: parameter types, return types, and detailed documentation in your IDE.

This approach simplifies maintenance while giving TypeScript users an excellent developer experience.

## License

BSD-3-Clause
