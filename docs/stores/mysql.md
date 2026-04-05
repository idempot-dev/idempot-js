---
title: MySQL Store - idempot-js
description: MySQL-backed storage for idempotency middleware. Compatible with mysql2 package. Supports Node.js and Deno runtimes with connection pooling.
---

# MySQL Store

## Installation

```bash
npm install @idempot/mysql-store mysql2
```

## Usage (Node.js)

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

## Usage (Deno)

For Deno, import from the deno subpath:

```javascript
import { MysqlIdempotencyStore } from "@idempot/mysql-store/deno-mysql.js";

const store = new MysqlIdempotencyStore({
  hostname: "localhost",
  port: 3306,
  db: "myapp",
  username: "root",
  password: "password"
});

await store.connect();
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

### Node.js: `new MysqlIdempotencyStore(options)`

Creates a new MySQL store for Node.js. Options are passed directly to `mysql2.createPool()`.

**Common Options:**

- `connectionString`: MySQL connection string (e.g., `mysql://user:pass@host:port/db`)
- `host`: MySQL host (default: `localhost`)
- `port`: MySQL port (default: `3306`)
- `user`: MySQL user (default: `root`)
- `password`: MySQL password
- `database`: MySQL database name

### Deno: `new MysqlIdempotencyStore(options)`

Creates a new MySQL store for Deno.

**Options:**

- `hostname`: MySQL hostname (default: `"localhost"`)
- `port`: MySQL port (default: `3306`)
- `username`: MySQL username (default: `"root"`)
- `password`: MySQL password (default: `""`)
- `db`: Database name (default: `"mysql"`)
- `poolSize`: Connection pool size (default: `3`)

### `store.close()`

Close the connection pool (Node.js) or database connection (Deno).
