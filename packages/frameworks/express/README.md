# @idempot/express-middleware

Express middleware for idempotency.

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
- `headerName`: Header name for idempotency key (default: `"Idempotency-Key"`)
- `required`: Whether idempotency key is required (default: `false`)
- `ttlMs`: Time-to-live for idempotency records in milliseconds
- `excludeFields`: Fields to exclude from fingerprint calculation
- `resilience`: Circuit breaker and retry options

**Returns:** Express middleware function with `circuit` property for monitoring.

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
