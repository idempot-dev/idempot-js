# Postgres Store Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Postgres as a storage backend for hono-idempotency using the `pg` library with connection pooling.

**Architecture:** Follow the existing SQLite store pattern - same table schema, similar API, but with async operations and connection pooling via `pg`. Add `pg` as a peer dependency (optional), similar to Redis.

**Tech Stack:** `pg` (node-postgres), standard Postgres connection string

---

## Task 1: Add `pg` peer dependency

**Files:**
- Modify: `package.json`

**Step 1: Add pg to peerDependenciesMeta**

Add to `peerDependenciesMeta` in package.json:

```json
"pg": {
  "optional": true
}
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "chore: add pg as optional peer dependency"
```

---

## Task 2: Write tests (TDD - tests first)

**Files:**
- Create: `tests/postgres.test.js`

**Step 1: Write tests following existing store patterns**

Look at `tests/sqlite.test.js` or `tests/redis.test.js` for the mocking pattern used. The project uses `tap` with manual mocks, not Vitest.

Key tests needed:
- initialization with connection string
- lookup with empty store returns null
- startProcessing creates record
- complete updates record
- complete throws on missing key
- cleanup removes expired records

```js
// Mock pg module - use same pattern as other stores
const mockQuery = {
  mock: () => {}
};

// Manual mock approach (no vi.fn())
test.beforeEach(() => {
  // Reset mocks
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test
```
Expected: FAIL - PostgresIdempotencyStore not found

**Step 3: Commit**

```bash
git add tests/postgres.test.js
git commit -m "test: add Postgres store tests"
```

---

## Task 3: Create Postgres store implementation

**Files:**
- Create: `src/store/postgres.js`

**Step 1: Write implementation**

Key considerations:
- Await `initSchema()` in constructor (use an async factory pattern or init method)
- Use parameterized queries throughout
- Handle missing `pg` module gracefully

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
    if (!pg) {
      throw new Error("pg module not found. Install it: npm install pg");
    }
    this.pool = new pg.Pool({
      connectionString: options.connectionString
    });
  }

  /**
   * Initialize the store (call after construction or use factory)
   * @returns {Promise<void>}
   */
  async init() {
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
  // ... rest of implementation
}
```

**Step 2: Run tests**

```bash
npm test
```

**Step 3: Commit**

```bash
git add src/store/postgres.js
git commit -m "feat: add Postgres store implementation"
```

---

## Task 4: Export Postgres store

**Files:**
- Modify: `src/store/index.js`, `src/index.js`

**Step 1: Add exports**

Add to both files following existing patterns.

**Step 2: Commit**

```bash
git add src/store/index.js src/index.js
git commit -m "feat: export Postgres store"
```

---

## Task 5: Build and verify

**Step 1: Run build**

```bash
npm run build
```

**Step 2: Run tests and verify coverage**

```bash
npm run test:verify-coverage
```

**Step 3: Run lint and format**

```bash
npm run check
```

**Step 4: Commit**

```bash
git add dist/
git commit -m "build: add Postgres store to dist"
```

---

## Task 6: Add example with Apple Container (optional, can follow later)

**Files:**
- Create: `examples/postgres-app.js`
- Create: `examples/postgres-setup.sh`
- Modify: `package.json`

**Step 1: Create example**

```js
import { Hono } from "hono";
import { idempotency } from "../src/index.js";
import { PostgresIdempotencyStore } from "../src/store/postgres.js";

const app = new Hono();

const store = new PostgresIdempotencyStore({
  connectionString: process.env.DATABASE_URL
});
await store.init();

app.use("*", idempotency({ store }));

app.post("/api/data", async (c) => {
  const body = await c.req.json();
  return c.json({ message: "created", data: body });
});

export default app;
```

**Step 2: Create setup script**

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

```json
"example:postgres": "DATABASE_URL=postgres://postgres:postgres@localhost:5432/idempotency node examples/postgres-app.js",
"example:postgres:setup": "bash examples/postgres-setup.sh"
```

**Step 4: Commit**

```bash
git add examples/postgres-app.js examples/postgres-setup.sh package.json
git commit -m "feat: add Postgres example with Apple Container"
```

---

## Notes

- The `pg` module should be installed by users who want to use Postgres: `npm install pg`
- The Apple Container setup requires macOS 26 and Apple Silicon
- Consider adding a note in README about the Postgres option
