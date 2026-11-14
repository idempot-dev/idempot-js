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

> **MySQL on Bun >= 1.4:** Bun's MySQL client refuses the `caching_sha2_password` RSA public-key handshake over insecure connections by default. Either pass `allowPublicKeyRetrieval: true` in the store options, or enable TLS on the connection. Bun <= 1.3 and TLS connections are unaffected.

## MySQL Key Length

The MySQL backend creates `idempotency_records` with a `VARCHAR(512)` primary key. A scoped record key is the 16-character operation token, a colon, and the client key, so a client key of 239 characters or more does not fit the old `VARCHAR(255)` column. An upgrade must widen an existing table before the new version serves traffic; without `STRICT_TRANS_TABLES`, MySQL truncates the composed key instead of failing.

Audit the table first:

```sql
SELECT MAX(CHAR_LENGTH(`key`)) FROM idempotency_records;
```

Then widen it:

```sql
ALTER TABLE idempotency_records
  MODIFY `key` VARCHAR(512) NOT NULL;
```

Growing a `VARCHAR` across the 255-character boundary rebuilds the table and blocks writes for its duration. It needs a 2048-byte index key, which requires DYNAMIC or COMPRESSED row format with InnoDB large prefix; on COMPACT row format, or MariaDB 10.1 and earlier, it fails with ER 1071. If the column uses a non-default charset or collation, repeat them in the `MODIFY` clause; otherwise MySQL applies the table default.

Verify the width afterwards:

```sql
SELECT CHARACTER_MAXIMUM_LENGTH
FROM information_schema.COLUMNS
WHERE table_schema = DATABASE()
  AND table_name = 'idempotency_records'
  AND column_name = 'key';
```

The result must be `512`. Client keys of 238 characters or fewer fit the old column, but run the ALTER with the upgrade so the schema does not depend on the key lengths in use.

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
   import { BunSqlIdempotencyStore } from "@idempot/bun-sql-store";
   ```

3. JSDoc comments provide full type safety: parameter types, return types, and detailed documentation in your IDE.

This approach simplifies maintenance while giving TypeScript users an excellent developer experience.

## License

BSD-3-Clause
