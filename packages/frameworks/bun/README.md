# @idempot/bun-handler

Bun.serve handler wrapper for idempotency.

## Installation

```bash
npm install @idempot/bun-handler
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
import { idempotency } from "@idempot/bun-handler";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

const store = new SqliteIdempotencyStore({ path: ":memory:" });
const withIdempotency = idempotency({ store });

Bun.serve({
  routes: {
    "/orders": withIdempotency(async (req) => {
      const orderId = crypto.randomUUID();
      const body = await req.json();
      return Response.json({ id: orderId, ...body }, { status: 201 });
    })
  }
});
```

## API

### `idempotency(options)`

Creates a handler wrapper for idempotency.

**Options:**

- `store` (required): Storage backend implementing `IdempotencyStore`
- `headerName`: Header name for idempotency key (default: `"Idempotency-Key"`)
- `required`: Whether idempotency key is required (default: `false`)
- `ttlMs`: Time-to-live for idempotency records in milliseconds
- `excludeFields`: Fields to exclude from fingerprint calculation
- `resilience`: Circuit breaker and retry options

**Returns:** A wrapper function that accepts a `Request => Response` handler. The wrapper has a `circuit` property for monitoring.

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
   import { idempotency } from "@idempot/bun-handler";
   ```

3. JSDoc comments provide full type safety: parameter types, return types, and detailed documentation in your IDE.

This approach simplifies maintenance while giving TypeScript users an excellent developer experience.

## License

BSD-3-Clause
