---
title: MySQL Store - idempot-js
description: MySQL-backed storage for idempotency middleware. Compatible with mysql2 package. Supports Node.js and Bun runtimes with connection pooling.
---

# MySQL Store

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

The store expects a table named `idempotency_records` with:

- `key` (VARCHAR(512), PRIMARY KEY)
- `fingerprint` (VARCHAR(64), indexed)
- `status` (ENUM: 'processing', 'complete')
- `response_status` (INT)
- `response_headers` (JSON)
- `response_body` (TEXT)
- `expires_at` (BIGINT, indexed)

### Upgrading an Existing Table

A scoped record key is the 16-character operation token, a colon, and the client key. New tables use `VARCHAR(512)`. An upgrade from an earlier release must widen an existing table before the new version serves traffic: the default `maxKeyLength` is 255, so a client key of 239 characters or more does not fit the old `VARCHAR(255)` column. Without `STRICT_TRANS_TABLES`, MySQL truncates the composed key instead of failing, so two requests can share one record.

Audit the table first:

```sql
SELECT MAX(CHAR_LENGTH(`key`)) FROM idempotency_records;
```

Then widen it:

```sql
ALTER TABLE idempotency_records
  MODIFY `key` VARCHAR(512) NOT NULL;
```

Growing a `VARCHAR` across the 255-character boundary is a full table rebuild, not an in-place metadata change. It needs a 2048-byte index key, which requires DYNAMIC or COMPRESSED row format with InnoDB large prefix; on COMPACT row format, or MariaDB 10.1 and earlier, it fails with ER 1071. The rebuild blocks writes for its duration, so use a maintenance window, or `pt-online-schema-change` or `gh-ost` for a large table. If the column uses a non-default charset or collation, repeat them in the `MODIFY` clause; otherwise MySQL applies the table default.

Verify the width afterwards:

```sql
SELECT CHARACTER_MAXIMUM_LENGTH
FROM information_schema.COLUMNS
WHERE table_schema = DATABASE()
  AND table_name = 'idempotency_records'
  AND column_name = 'key';
```

The result must be `512`.

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

### `store.close()`

Close the connection pool.
