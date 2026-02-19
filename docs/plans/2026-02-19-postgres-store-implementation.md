# Postgres Store Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Postgres as a storage backend for hono-idempotency using the `pg` library with connection pooling.

**Architecture:** Follow the existing SQLite store pattern - same table schema, similar API, but with async operations and connection pooling via `pg`.

**Tech Stack:** `pg` (node-postgres), standard Postgres connection string

---

## Task 1: Add `pg` dependency

**Files:**
- Modify: `package.json`

**Step 1: Add pg to dependencies**

Add `"pg": "^8.13.0"` to the `dependencies` section in package.json.

**Step 2: Commit**

```bash
git add package.json
git commit -m "chore: add pg dependency"
```

---

## Task 2: Create Postgres store implementation

**Files:**
- Create: `src/store/postgres.js`

**Step 1: Write minimal implementation**

```js
import pg from "pg";

/** @typedef {import("../types.js").IdempotencyStore} IdempotencyStore */
/** @typedef {import("../types.js").IdempotencyRecord} IdempotencyRecord */

/**
 * @typedef {Object} PostgresIdempotencyStoreOptions
 * @property {string} connectionString - Postgres connection string
 */

/**
 * @implements {IdempotencyStore}
 */
export class PostgresIdempotencyStore {
  /**
   * @type {pg.Pool}
   */
  pool;

  /**
   * @param {PostgresIdempotencyStoreOptions} options
   */
  constructor(options) {
    this.pool = new pg.Pool({
      connectionString: options.connectionString
    });
    this.initSchema();
  }

  /**
   * Initialize database schema
   * @private
   * @returns {Promise<void>}
   */
  async initSchema() {
    await this.pool.query(`
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
    `);
  }

  /**
   * Close the database connection
   * @returns {Promise<void>}
   */
  async close() {
    await this.pool.end();
  }

  /**
   * Parse a database row into an IdempotencyRecord
   * @private
   * @param {any} row
   * @returns {IdempotencyRecord | null}
   */
  parseRecord(row) {
    if (!row) return null;

    return {
      key: row.key,
      fingerprint: row.fingerprint,
      status: row.status,
      response: row.response_status
        ? {
            status: row.response_status,
            headers: JSON.parse(row.response_headers),
            body: row.response_body
          }
        : undefined,
      expiresAt: row.expires_at
    };
  }

  /**
   * Look up an idempotency record
   * @param {string} key
   * @param {string} fingerprint
   * @returns {Promise<{byKey: IdempotencyRecord | null, byFingerprint: IdempotencyRecord | null}>}
   */
  async lookup(key, fingerprint) {
    // Delete up to 10 expired records
    await this.pool.query(
      "DELETE FROM idempotency_records WHERE expires_at <= $1 LIMIT 10",
      [Date.now()]
    );

    const [byKeyResult, byFingerprintResult] = await Promise.all([
      this.pool.query("SELECT * FROM idempotency_records WHERE key = $1", [key]),
      this.pool.query(
        "SELECT * FROM idempotency_records WHERE fingerprint = $1",
        [fingerprint]
      )
    ]);

    return {
      byKey: this.parseRecord(byKeyResult.rows[0]),
      byFingerprint: this.parseRecord(byFingerprintResult.rows[0])
    };
  }

  /**
   * Start processing a request
   * @param {string} key
   * @param {string} fingerprint
   * @param {number} ttlMs
   * @returns {Promise<void>}
   */
  async startProcessing(key, fingerprint, ttlMs) {
    await this.pool.query(
      `INSERT INTO idempotency_records (key, fingerprint, status, expires_at)
       VALUES ($1, $2, 'processing', $3)`,
      [key, fingerprint, Date.now() + ttlMs]
    );
  }

  /**
   * Mark a request as complete
   * @param {string} key
   * @param {{status: number, headers: Record<string, string>, body: string}} response
   * @returns {Promise<void>}
   */
  async complete(key, response) {
    const result = await this.pool.query(
      `UPDATE idempotency_records
       SET status = 'complete',
           response_status = $1,
           response_headers = $2,
           response_body = $3
       WHERE key = $4`,
      [response.status, JSON.stringify(response.headers), response.body, key]
    );

    if (result.rowCount === 0) {
      throw new Error(`No record found for key: ${key}`);
    }
  }

  /**
   * Clean up expired records
   * @returns {Promise<void>}
   */
  async cleanup() {
    await this.pool.query(
      "DELETE FROM idempotency_records WHERE expires_at <= $1",
      [Date.now()]
    );
  }
}
```

**Step 2: Commit**

```bash
git add src/store/postgres.js
git commit -m "feat: add Postgres store implementation"
```

---

## Task 3: Export Postgres store

**Files:**
- Modify: `src/store/index.js`

**Step 1: Add export**

Add to `src/store/index.js`:

```js
export { PostgresIdempotencyStore } from "./postgres.js";
/**
 * @typedef {import("./postgres.js").PostgresIdempotencyStoreOptions} PostgresIdempotencyStoreOptions
 */
```

**Step 2: Commit**

```bash
git add src/store/index.js
git commit -m "feat: export Postgres store"
```

---

## Task 4: Export from main entry point

**Files:**
- Modify: `src/index.js`

**Step 1: Add export**

Add to `src/index.js` (after the DynamoDB export):

```js
export { PostgresIdempotencyStore } from "./store/postgres.js";
/**
 * @typedef {import("./store/postgres.js").PostgresIdempotencyStoreOptions} PostgresIdempotencyStoreOptions
 */
```

**Step 2: Commit**

```bash
git add src/index.js
git commit -m "feat: export Postgres store from main entry"
```

---

## Task 5: Build the project

**Files:**
- Run: `npm run build`

**Step 1: Run build**

```bash
npm run build
```

**Step 2: Commit**

```bash
git add dist/
git commit -m "build: add Postgres store to dist"
```

---

## Task 6: Write tests

**Files:**
- Create: `tests/postgres.test.js`

**Step 1: Write failing tests**

```js
import { test } from "tap";
import { PostgresIdempotencyStore } from "../src/store/postgres.js";

test("PostgresIdempotencyStore - initialization", async (t) => {
  // Mock pg.Pool to avoid real connection
  t.plan(1);
  t.ok("store should be created");
});

test("PostgresIdempotencyStore - lookup with empty store", async (t) => {
  t.plan(2);
  t.equal("byKey should be null", "byKey should be null");
  t.equal("byFingerprint should be null", "byFingerprint should be null");
});
```

Actually, let's follow the SQLite pattern - mock the pg pool. Create:

```js
import { test } from "tap";
import { PostgresIdempotencyStore } from "../src/store/postgres.js";

// Mock pg module
const mockQuery = vi.fn();
const mockEnd = vi.fn();

vi.mock("pg", () => ({
  default: {
    Pool: vi.fn().mockImplementation(() => ({
      query: mockQuery,
      end: mockEnd
    }))
  }
}));

test.beforeEach(() => {
  mockQuery.mockReset();
  mockEnd.mockReset();
});

test("PostgresIdempotencyStore - initialization", async (t) => {
  mockQuery.mockResolvedValue({ rows: [] });
  
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test"
  });
  
  t.ok(store, "store should be created");
  t.ok(store.pool, "pool should be created");
});

test("PostgresIdempotencyStore - lookup with empty store", async (t) => {
  mockQuery.mockResolvedValue({ rows: [] });
  
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test"
  });
  
  const result = await store.lookup("key", "fingerprint");
  
  t.equal(result.byKey, null, "byKey should be null");
  t.equal(result.byFingerprint, null, "byFingerprint should be null");
});

test("PostgresIdempotencyStore - startProcessing creates record", async (t) => {
  mockQuery.mockResolvedValue({ rows: [] });
  
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test"
  });
  
  await store.startProcessing("key", "fingerprint", 60000);
  
  t.ok(mockQuery.mock.calls.length > 0, "should have called query");
});

test("PostgresIdempotencyStore - complete updates record", async (t) => {
  mockQuery
    .mockResolvedValueOnce({ rows: [] }) // initSchema
    .mockResolvedValueOnce({ rowCount: 1 }); // complete
  
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test"
  });
  
  await store.complete("key", {
    status: 200,
    headers: { "content-type": "application/json" },
    body: '{"success":true}'
  });
  
  t.equal(mockQuery.mock.calls.length, 2, "should have called query twice");
});

test("PostgresIdempotencyStore - complete throws on missing key", async (t) => {
  mockQuery
    .mockResolvedValueOnce({ rows: [] }) // initSchema
    .mockResolvedValueOnce({ rowCount: 0 }); // complete
  
  const store = new PostgresIdempotencyStore({
    connectionString: "postgres://localhost/test"
  });
  
  await t.rejects(
    store.complete("missing", { status: 200, headers: {}, body: "" }),
    /No record found/,
    "should throw error for missing key"
  );
});
```

**Step 2: Run tests**

```bash
npm test
```

**Step 3: Commit**

```bash
git add tests/postgres.test.js
git commit -m "test: add Postgres store tests"
```

---

## Task 7: Add example with Apple Container

**Files:**
- Create: `examples/postgres-app.js`

**Step 1: Create example script**

```js
import { Hono } from "hono";
import { idempotency } from "../src/index.js";
import { PostgresIdempotencyStore } from "../src/store/postgres.js";

const app = new Hono();

const store = new PostgresIdempotencyStore({
  connectionString: process.env.DATABASE_URL
});

app.use("*", idempotency({ store }));

app.post("/api/data", async (c) => {
  const body = await c.req.json();
  return c.json({ message: "created", data: body });
});

export default app;
```

**Step 2: Create setup script**

Create `examples/postgres-setup.sh`:

```bash
#!/bin/bash
set -e

echo "Starting Postgres with Apple Container..."
container run -d --name postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=idempotency \
  -p 5432:5432 \
  docker.io/postgres:latest

echo "Waiting for Postgres to be ready..."
sleep 5

echo "Postgres is ready!"
echo "Connection string: postgres://postgres:postgres@localhost:5432/idempotency"
```

**Step 3: Add npm scripts**

Add to `package.json`:

```json
"example:postgres": "DATABASE_URL=postgres://postgres:postgres@localhost:5432/idempotency node examples/postgres-app.js",
"example:postgres:setup": "bash examples/postgres-setup.sh"
```

**Step 4: Commit**

```bash
git add examples/postgres-app.js examples/postgres-setup.sh package.json
git commit -m "feat: add Postgres example with Apple Container setup"
```

---

## Task 8: Verify coverage

**Step 1: Run coverage verification**

```bash
npm run test:verify-coverage
```

Expected: 100% coverage

**Step 2: Run lint and format**

```bash
npm run check
```

**Step 3: Commit**

```bash
git add -A
git commit -m "test: verify coverage and fix any issues"
```
