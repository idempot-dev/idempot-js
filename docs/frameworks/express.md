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
- `headerName`: Header name for idempotency key (default: `"Idempotency-Key"`)
- `required`: Whether idempotency key is required (default: `false`)
- `ttlMs`: Time-to-live for idempotency records in milliseconds
- `excludeFields`: Fields to exclude from fingerprint calculation
- `resilience`: Circuit breaker and retry options

**Returns:** Express middleware function with `circuit` property for monitoring.
