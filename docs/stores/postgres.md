---
title: PostgreSQL Store - idempot-js
description: PostgreSQL-backed storage for idempotency middleware. Persistent storage with automatic schema creation. Uses JSONB for response headers.
---

# PostgreSQL Store

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

**Options:**

- `pool`: PostgreSQL connection pool (from `pg` package)

### `store.lookup(key, fingerprint)`

Look up an idempotency record. Returns `{byKey, byFingerprint}`.

### `store.startProcessing(key, fingerprint, ttlMs)`

Mark a request as being processed.

### `store.complete(key, response)`

Mark a request as complete.

### `store.close()`

Close the connection pool.
