# @idempot/hono-middleware

Hono middleware for idempotency.

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
- `headerName`: Header name for idempotency key (default: `"Idempotency-Key"`)
- `required`: Whether idempotency key is required (default: `false`)
- `ttlMs`: Time-to-live for idempotency records in milliseconds
- `excludeFields`: Fields to exclude from fingerprint calculation
- `resilience`: Circuit breaker and retry options

**Returns:** Hono middleware function with `circuit` property for monitoring.

## TypeScript Support

This library is written in JavaScript with JSDoc comments that provide rich type information. TypeScript users can leverage these types directly without needing separate .d.ts files by enabling the `allowJs` option in their TypeScript configuration.

To use this library in a TypeScript project:

1. Ensure your `tsconfig.json` has these settings:

   ```json
   {
     "allowJs": true,
     "checkJs": true
   }
   ```

2. Import the library as you normally would:

   ```typescript
   import { idempotency } from "@idempot/core";
   ```

3. The JSDoc comments will provide full type safety, including parameter types, return types, and detailed documentation in your IDE.

This approach simplifies maintenance while providing excellent TypeScript developer experience.

## License

BSD-3-Clause
