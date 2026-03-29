# @idempot/deno-mysql-store

MySQL storage backend for idempotency (Deno).

## Installation

Import directly from the repository:

```typescript
import { DenoMysqlIdempotencyStore } from "https://raw.githubusercontent.com/idempot-dev/idempot-js/main/packages/stores/deno-mysql/deno-mysql.js";
```

Or use with a specific version tag:

```typescript
import { DenoMysqlIdempotencyStore } from "https://raw.githubusercontent.com/idempot-dev/idempot-js/v0.1.0/packages/stores/deno-mysql/deno-mysql.js";
```

## Usage

```typescript
import { DenoMysqlIdempotencyStore } from "./deno-mysql.js";
import { idempotencyMiddleware } from "https://raw.githubusercontent.com/idempot-dev/idempot-js/main/packages/frameworks/hono/index.js";

const store = new DenoMysqlIdempotencyStore({
  hostname: "127.0.0.1",
  port: 3306,
  username: "root",
  password: "password",
  db: "myapp"
});

await store.connect();

// Use with Hono
app.use("/api/*", idempotencyMiddleware({ store }));

// Close on shutdown
Deno.addSignalListener("SIGINT", async () => {
  await store.close();
  Deno.exit(0);
});
```

## Schema

The store creates a table named `idempotency_records` with:

- `key` (VARCHAR(255), PRIMARY KEY)
- `fingerprint` (VARCHAR(255), indexed)
- `status` (VARCHAR(50): 'processing' or 'complete')
- `response_status` (INT)
- `response_headers` (TEXT, JSON)
- `response_body` (TEXT)
- `expires_at` (BIGINT, indexed)

## API

### `new DenoMysqlIdempotencyStore(options)`

Creates a new MySQL store for Deno.

**Options:**

- `hostname`: MySQL hostname (default: `"127.0.0.1"`)
- `port`: MySQL port (default: `3306`)
- `username`: MySQL username (default: `"root"`)
- `password`: MySQL password (default: `""`)
- `db`: Database name (default: `"mysql"`)
- `poolSize`: Connection pool size (default: `3`)

### `await store.connect()`

Connect to the database and initialize the schema. Must be called before use.

### `await store.lookup(key, fingerprint)`

Look up an idempotency record by key and fingerprint. Returns `{byKey, byFingerprint}`.

### `await store.startProcessing(key, fingerprint, ttlMs)`

Mark a request as being processed. Creates a new record with status `'processing'`.

### `await store.complete(key, response)`

Mark a request as complete with its response data. Updates the record with status `'complete'`.

### `await store.close()`

Close the database connection.

## Deno Compatibility

This package is designed for Deno runtime only. For Node.js, use `@idempot/node-mysql-store` instead.

## License

BSD-3-Clause
