# @idempot/postgres-store

PostgreSQL storage backend for idempotency.

## Installation

```bash
npm install @idempot/postgres-store pg
```

## Usage

```javascript
import { PostgresIdempotencyStore } from "@idempot/postgres-store";
import { Pool } from "pg";

const pool = new Pool({
  host: "localhost",
  database: "myapp",
  user: "postgres",
  password: "postgres"
});

const store = new PostgresIdempotencyStore({ pool });

// Close on shutdown
process.on("SIGINT", async () => {
  await store.close();
  process.exit(0);
});
```

## Schema

The store creates a table named `idempotency_records` with:

- `key` (TEXT, PRIMARY KEY)
- `fingerprint` (TEXT, indexed)
- `status` (TEXT: 'processing' or 'complete')
- `response_status` (INTEGER)
- `response_headers` (JSONB)
- `response_body` (TEXT)
- `expires_at` (TIMESTAMP, indexed)

## API

### `new PostgresIdempotencyStore(options)`

Creates a new PostgreSQL store.

**Options:**

- `pool`: PostgreSQL connection pool (from `pg` package)

### `store.lookup(key, fingerprint)`

Look up an idempotency record by key and fingerprint. Returns `{byKey, byFingerprint}`.

### `store.startProcessing(key, fingerprint, ttlMs)`

Mark a request as being processed. Creates a new record with status `'processing'`.

### `store.complete(key, response)`

Mark a request as complete with its response data. Updates the record with status `'complete'`.

### `store.close()`

Close the connection pool.

## License

BSD-3-Clause
