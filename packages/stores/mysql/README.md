# @idempot/mysql-store

MySQL storage backend for idempotency.

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
  hostname: "127.0.0.1",
  port: 3306,
  username: "root",
  password: "password",
  db: "myapp"
});

await store.connect();
```

Or import directly from GitHub:

```javascript
import { MysqlIdempotencyStore } from "https://raw.githubusercontent.com/idempot-dev/idempot-js/main/packages/stores/mysql/deno-mysql.js";
```

Or with a version tag:

```javascript
import { MysqlIdempotencyStore } from "https://raw.githubusercontent.com/idempot-dev/idempot-js/v0.1.0/packages/stores/mysql/deno-mysql.js";
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

**Pool Options:**

- `connectionLimit`: Maximum connections in pool (default: `10`)
- `queueLimit`: Maximum queued connections
- `waitForConnections`: Wait for available connection (default: `true`)

See [mysql2 documentation](https://github.com/sidorares/node-mysql2#connection-options) for all available options.

### Deno: `new MysqlIdempotencyStore(options)`

Creates a new MySQL store for Deno.

**Options:**

- `hostname`: MySQL hostname (default: `"127.0.0.1"`)
- `port`: MySQL port (default: `3306`)
- `username`: MySQL username (default: `"root"`)
- `password`: MySQL password (default: `""`)
- `db`: Database name (default: `"mysql"`)
- `poolSize`: Connection pool size (default: `3`)

### `store.lookup(key, fingerprint)`

Look up an idempotency record by key and fingerprint. Returns `{byKey, byFingerprint}`.

### `store.startProcessing(key, fingerprint, ttlMs)`

Mark a request as being processed. Creates a new record with status `'processing'`.

### `store.complete(key, response)`

Mark a request as complete with its response data. Updates the record with status `'complete'`.

### `store.close()`

Close the connection pool (Node.js) or database connection (Deno).

## License

BSD-3-Clause
