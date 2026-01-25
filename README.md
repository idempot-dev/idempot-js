# hono-idempotency

IETF-compliant idempotency middleware for Hono with persistent SQLite storage.

## Installation

```bash
npm install hono-idempotency better-sqlite3
```

## Quick Start

```typescript
import { Hono } from "hono";
import { idempotency, SqliteIdempotencyStore } from "hono-idempotency";

const app = new Hono();
const store = new SqliteIdempotencyStore({ path: ":memory:" });

app.post("/orders", idempotency({ store }), async (c) => {
  // Your handler - protected from duplicate requests
  return c.json({ id: "order-123" }, 201);
});
```

## Features

- IETF-compliant idempotency key handling
- SQLite storage (in-memory for dev, file-based for production)
- Request fingerprinting for conflict detection
- Automatic response caching and replay
- TypeScript support with full type definitions

## Examples

See `examples/` directory for complete usage examples:
- `basic-app.ts` - In-memory development setup
- `sqlite-app.ts` - Production file-based persistence

## Documentation

See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) for complete feature documentation.

## License

MIT
