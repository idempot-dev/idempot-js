# @idempot/mysql-store

MySQL storage backend for idempotency.

## Installation

```bash
npm install @idempot/mysql-store mysql2
```

## Usage

```javascript
import { MysqlIdempotencyStore } from "@idempot/mysql-store";

const store = new MysqlIdempotencyStore({
  host: "localhost",
  port: 3306,
  database: "myapp",
  user: "root",
  password: "password"
});

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

### `new MysqlIdempotencyStore(options)`

Creates a new MySQL store. Options are passed directly to `mysql2.createPool()`.

**Common Options:**

- `connectionString`: MySQL connection string (e.g., `mysql://user:pass@host:port/db`)
- `host`: MySQL host (default: `localhost`)
- `port`: MySQL port (default: `3306`)
- `user`: MySQL user (default: `root`)
- `password`: MySQL password
- `database`: MySQL database name

**Pool Options:**

- `connectionLimit`: Maximum connections in pool (default: `10`)
- `queueLimit`: Maximum queued connections
- `waitForConnections`: Wait for available connection (default: `true`)

See [mysql2 documentation](https://github.com/sidorares/node-mysql2#connection-options) for all available options.

When the store creates its own pool it enables `multipleStatements` so the
expired-record cleanup and the record lookup run in one round trip (all
values are bound placeholders). Pools passed via the `pool` option keep
mysql2's defaults; lookups then use a single `key = ? OR fingerprint = ?`
SELECT instead.

### `store.lookup(key, fingerprint)`

Look up an idempotency record by key and fingerprint. Returns `{byKey, byFingerprint}`.

### `store.startProcessing(key, fingerprint, ttlMs)`

Mark a request as being processed. Creates a new record with status `'processing'`.

### `store.complete(key, response)`

Mark a request as complete with its response data. Updates the record with status `'complete'`.

### `store.close()`

Close the connection pool.

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
   import { MysqlIdempotencyStore } from "@idempot/mysql-store";
   ```

3. JSDoc comments provide full type safety: parameter types, return types, and detailed documentation in your IDE.

This approach simplifies maintenance while giving TypeScript users an excellent developer experience.

## License

BSD-3-Clause
