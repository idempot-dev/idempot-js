# @idempot/node-mysql-store

MySQL storage backend for idempotency (Node.js).

## Installation

```bash
npm install @idempot/node-mysql-store mysql2
```

## Usage

```javascript
import { NodeMysqlIdempotencyStore } from "@idempot/node-mysql-store";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "localhost",
  database: "myapp",
  user: "root",
  password: "password"
});

const store = new NodeMysqlIdempotencyStore({ pool });

// Close on shutdown
process.on("SIGINT", async () => {
  await store.close();
  process.exit(0);
});
```

## Schema

The store creates a table named `idempotency_records` with:

- `key` (VARCHAR(255), PRIMARY KEY)
- `fingerprint` (VARCHAR(64), indexed)
- `status` (ENUM: 'processing', 'complete')
- `response_status` (INT)
- `response_headers` (JSON)
- `response_body` (TEXT)
- `expires_at` (BIGINT, indexed)

## API

### `new NodeMysqlIdempotencyStore(options)`

Creates a new MySQL store.

**Options:**

- `pool`: MySQL connection pool (from `mysql2` package)

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
