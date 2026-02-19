# Postgres Store Design

## Overview

Add Postgres as a new storage backend for the hono-idempotency middleware, following the existing store patterns.

## Approach

Use the `pg` (node-postgres) library with connection pooling. Follow the SQLite store pattern since both are relational databases.

### Configuration

- Single `connectionString` option (standard Postgres connection string)
- Uses pg's built-in connection pooling

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS idempotency_records (
  key TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'complete')),
  response_status INTEGER,
  response_headers TEXT,
  response_body TEXT,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fingerprint ON idempotency_records(fingerprint);
CREATE INDEX IF NOT EXISTS idx_expires_at ON idempotency_records(expires_at);
```

## Files

| File | Action |
|------|--------|
| `src/store/postgres.js` | New - Postgres store implementation |
| `src/store/index.js` | Modify - export Postgres store |
| `tests/test-store-postgres.js` | New - tests |
| `examples/postgres/` | New - example using Apple Container |

## Example Usage

```js
import { PostgresIdempotencyStore } from "hono-idempotency";

const store = new PostgresIdempotencyStore({
  connectionString: process.env.DATABASE_URL
});
```

## Local Development

Use Apple Container to run Postgres locally without Docker:

```bash
# Start Postgres container
container run -d --name postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=idempotency \
  -p 5432:5432 \
  docker.io/postgres:latest

# Get connection string
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/idempotency"
```
