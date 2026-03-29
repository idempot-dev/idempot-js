# Bun SQL Store

A storage backend for idempotency that supports SQLite, PostgreSQL, and MySQL via Bun's native SQL API.

## Installation

```bash
bun add @idempot/bun-sql-store
```

## Usage

```javascript
import { BunSqlIdempotencyStore } from "@idempot/bun-sql-store";

// SQLite (in-memory)
const store = new BunSqlIdempotencyStore("sqlite://:memory:");
// or: new BunSqlIdempotencyStore(":memory:");

// PostgreSQL
const pgStore = new BunSqlIdempotencyStore(
  "postgres://user:pass@localhost:5432/db"
);

// MySQL
const mysqlStore = new BunSqlIdempotencyStore(
  "mysql://user:pass@localhost:3306/db"
);
```

## Connection String Formats

| Database   | Examples                                                             |
| ---------- | -------------------------------------------------------------------- |
| SQLite     | `:memory:`, `sqlite://:memory:`, `sqlite://app.db`, `file://data.db` |
| PostgreSQL | `postgres://user:pass@localhost:5432/db`                             |
| MySQL      | `mysql://user:pass@localhost:3306/db`, `mysql2://...`                |

## API

### `new BunSqlIdempotencyStore(connectionString, options?)`

Creates a new store instance.

- `connectionString`: Database connection string or path (default: `sqlite://idempotency.db`)
- `options.lazy`: Don't create connection until first query (default: `false`)

### `store.lookup(key, fingerprint)`

Look up an idempotency record by key and fingerprint. Returns `{byKey, byFingerprint}`.

### `store.startProcessing(key, fingerprint, ttlMs)`

Mark a request as being processed. Creates a new record with status `'processing'`.

### `store.complete(key, response)`

Mark a request as complete with its response data. Updates the record with status `'complete'`.

### `store.close()`

Close the database connection. Call this on shutdown.

## Example with Hono

```javascript
import { Hono } from "hono";
import { idempotency } from "@idempot/hono";
import { BunSqlIdempotencyStore } from "@idempot/bun-sql-store";

const app = new Hono();
const store = new BunSqlIdempotencyStore("sqlite://:memory:");

app.post("/orders", idempotency({ store }), async (c) => {
  const body = await c.req.json();
  return c.json({ id: crypto.randomUUID(), ...body }, 201);
});

export default {
  port: 3000,
  fetch: app.fetch
};
```

## Requirements

- Bun runtime (uses `bun:sqlite` and `bun` package for SQL)

## License

BSD-3-Clause
