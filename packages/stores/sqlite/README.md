# @idempot/sqlite-store

SQLite storage backend for idempotency.

## Installation

```bash
npm install @idempot/sqlite-store better-sqlite3
```

## Usage

```javascript
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

// In-memory (development)
const store = new SqliteIdempotencyStore({ path: ":memory:" });

// Persistent file
const store = new SqliteIdempotencyStore({ path: "./idempotency.db" });

// Close on shutdown
process.on("SIGINT", () => {
  store.close();
  process.exit(0);
});
```

## API

### `new SqliteIdempotencyStore(options)`

Creates a new SQLite store.

**Options:**

- `path`: Database path (default: `"./idempotency.db"`, use `":memory:"` for in-memory)

### `store.lookup(key, fingerprint)`

Look up an idempotency record by key and fingerprint. Returns `{byKey, byFingerprint}`.

### `store.startProcessing(key, fingerprint, ttlMs)`

Mark a request as being processed. Creates a new record with status `'processing'`.

### `store.complete(key, response)`

Mark a request as complete with its response data. Updates the record with status `'complete'`.

### `store.close()`

Close the database connection. Call this on shutdown.

## Deno Support

For Deno, use `DenoSqliteIdempotencyStore`:

```javascript
import { DenoSqliteIdempotencyStore } from "@idempot/sqlite-store/deno-sqlite.js";

const store = new DenoSqliteIdempotencyStore({ path: "./idempotency.db" });
```

## License

BSD-3-Clause
