# Remove MemoryIdempotencyStore Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove MemoryIdempotencyStore and convert all examples to use SQLite, simplifying the codebase to a single storage backend.

**Architecture:** Single atomic refactoring that deletes memory store implementation and tests, updates all exports and examples to use SQLite with `:memory:` mode for development, and updates documentation to reflect the simplified architecture.

**Tech Stack:** Existing - SQLite (better-sqlite3) becomes the only storage backend.

---

## Phase 1: Delete Memory Store Implementation

### Task 1: Delete Memory Store Files

**Files:**
- Delete: `src/store/memory.ts`
- Delete: `tests/store.test.ts`

**Step 1: Delete memory store implementation**

Run: `rm src/store/memory.ts`

Expected: File removed

**Step 2: Delete memory store tests**

Run: `rm tests/store.test.ts`

Expected: File removed

**Step 3: Verify tests fail due to missing files**

Run: `npm test`

Expected: Tests fail due to import errors (MemoryIdempotencyStore not found)

**Step 4: Commit deletion**

```bash
git add -A
git commit -m "refactor!: remove MemoryIdempotencyStore implementation"
```

---

## Phase 2: Update Exports

### Task 2: Remove Memory Store from Store Index

**Files:**
- Modify: `src/store/index.ts`

**Step 1: Read current exports**

Read: `src/store/index.ts`

Expected: Contains export of MemoryIdempotencyStore

**Step 2: Remove memory store export**

Update `src/store/index.ts`:

```typescript
export * from "./interface.js";
export { SqliteIdempotencyStore } from "./sqlite.js";
```

**Step 3: Verify tests still fail (but different error)**

Run: `npm test`

Expected: Still fails but now due to main index.ts export

**Step 4: Commit export change**

```bash
git add src/store/index.ts
git commit -m "refactor: remove MemoryIdempotencyStore from store exports"
```

---

### Task 3: Remove Memory Store from Main Index

**Files:**
- Modify: `src/index.ts`

**Step 1: Read current exports**

Read: `src/index.ts`

Expected: Contains both memory and sqlite store exports

**Step 2: Remove memory store export**

Update `src/index.ts` - remove line:
```typescript
export { MemoryIdempotencyStore } from "./store/memory.js";
```

Keep only:
```typescript
export { SqliteIdempotencyStore } from "./store/sqlite.js";
```

**Step 3: Verify build succeeds**

Run: `npm run build`

Expected: TypeScript compiles successfully

**Step 4: Commit export change**

```bash
git add src/index.ts
git commit -m "refactor: remove MemoryIdempotencyStore from public API"
```

---

## Phase 3: Update Examples

### Task 4: Convert Basic Example to SQLite

**Files:**
- Modify: `examples/basic-app.ts`

**Step 1: Read current example**

Read: `examples/basic-app.ts` (first 10 lines)

Expected: Uses MemoryIdempotencyStore

**Step 2: Update imports**

Change line 3 from:
```typescript
import { idempotency, MemoryIdempotencyStore } from "../src/index.js";
```

To:
```typescript
import { idempotency, SqliteIdempotencyStore } from "../src/index.js";
```

**Step 3: Update store initialization**

Change line 6 from:
```typescript
const store = new MemoryIdempotencyStore();
```

To:
```typescript
const store = new SqliteIdempotencyStore({ path: ":memory:" });
```

**Step 4: Test example runs**

Run: `timeout 3 npm run example 2>&1 || true`

Expected: Server starts with "Server running at http://localhost:3000"

**Step 5: Commit example update**

```bash
git add examples/basic-app.ts
git commit -m "refactor: convert basic example to use SQLite :memory: mode"
```

---

## Phase 4: Update Documentation

### Task 5: Update IMPLEMENTATION_SUMMARY.md - Store Section

**Files:**
- Modify: `IMPLEMENTATION_SUMMARY.md`

**Step 1: Read current store section**

Read: `IMPLEMENTATION_SUMMARY.md` (lines 23-33)

Expected: Contains both MemoryIdempotencyStore and SqliteIdempotencyStore

**Step 2: Replace store section**

Replace lines 23-33 with:

```markdown
### 2. Store Layer
- Interface-driven design (src/store/interface.ts)
- **SqliteIdempotencyStore** - Production-ready persistent storage
  - SQLite database with dual indexes (key + fingerprint)
  - In-memory mode (`:memory:`) for testing and development
  - File-based mode for production persistence
  - Limited cleanup during lookups (max 10 expired records)
  - Full cleanup available via manual `cleanup()` method
  - Default database path: `./idempotency.db`
```

**Step 3: Commit store section update**

```bash
git add IMPLEMENTATION_SUMMARY.md
git commit -m "docs: update store section to reflect SQLite-only architecture"
```

---

### Task 6: Update IMPLEMENTATION_SUMMARY.md - Public API Section

**Files:**
- Modify: `IMPLEMENTATION_SUMMARY.md`

**Step 1: Read current public API section**

Read: `IMPLEMENTATION_SUMMARY.md` (lines 52-57)

Expected: Lists both MemoryIdempotencyStore and SqliteIdempotencyStore

**Step 2: Update public API section**

Change lines 52-57:

```markdown
### 5. Public API (src/index.ts)
- Exports middleware function
- Exports all types
- Exports SqliteIdempotencyStore
- Exports generateFingerprint utility
```

**Step 3: Commit API section update**

```bash
git add IMPLEMENTATION_SUMMARY.md
git commit -m "docs: update public API section for SQLite-only exports"
```

---

### Task 7: Update IMPLEMENTATION_SUMMARY.md - Examples Section

**Files:**
- Modify: `IMPLEMENTATION_SUMMARY.md`

**Step 1: Read current examples section**

Read: `IMPLEMENTATION_SUMMARY.md` (lines 59-71)

Expected: Separates memory and SQLite examples

**Step 2: Update examples section**

Replace lines 59-71 with:

```markdown
### 6. Example Applications
- **examples/basic-app.ts** - In-memory SQLite for development
  - Uses `:memory:` mode for lightweight local testing
  - Demonstrates all middleware features
  - Shows optional and required idempotency keys
  - Custom header name example
  - Field exclusion example
  - PATCH endpoint protection
  - Includes helpful curl examples
- **examples/sqlite-app.ts** - Production file-based persistence
  - Persistent storage with SQLite
  - Periodic cleanup (hourly)
  - Graceful shutdown handling
  - Database at `./data/idempotency.db`
```

**Step 3: Commit examples section update**

```bash
git add IMPLEMENTATION_SUMMARY.md
git commit -m "docs: update examples section to show SQLite usage patterns"
```

---

### Task 8: Update IMPLEMENTATION_SUMMARY.md - Test Results

**Files:**
- Modify: `IMPLEMENTATION_SUMMARY.md`

**Step 1: Read current test results section**

Read: `IMPLEMENTATION_SUMMARY.md` (lines 82-90)

Expected: Shows 77 total tests

**Step 2: Update test count**

Change "Total Tests: 56 (all passing)" to "Total Tests: 70 (all passing)"

Update test breakdown:
- Remove "Memory store tests: 7 tests" line
- Keep "SQLite store tests: 9 tests"

**Step 3: Run actual test count to verify**

Run: `npm test 2>&1 | grep "# {"`

Expected: Shows actual final test count

**Step 4: Commit test results update**

```bash
git add IMPLEMENTATION_SUMMARY.md
git commit -m "docs: update test results for SQLite-only implementation"
```

---

### Task 9: Rewrite README.md

**Files:**
- Modify: `README.md`

**Step 1: Read current README**

Read: `README.md`

Expected: Minimal content

**Step 2: Write new README with quick-start**

Replace entire contents with:

```markdown
# hono-idempotency

IETF-compliant idempotency middleware for Hono with persistent SQLite storage.

## Installation

```bash
npm install hono-idempotency better-sqlite3
```

## Quick Start

```typescript
import { Hono } from "hono";
import { idempotency, SqliteIdempotencyStore } from "hono-idempotency";

const app = new Hono();
const store = new SqliteIdempotencyStore({ path: ":memory:" });

app.post("/orders", idempotency({ store }), async (c) => {
  // Your handler - protected from duplicate requests
  return c.json({ id: "order-123" }, 201);
});
```

## Features

- IETF-compliant idempotency key handling
- SQLite storage (in-memory for dev, file-based for production)
- Request fingerprinting for conflict detection
- Automatic response caching and replay
- TypeScript support with full type definitions

## Examples

See `examples/` directory for complete usage examples:
- `basic-app.ts` - In-memory development setup
- `sqlite-app.ts` - Production file-based persistence

## Documentation

See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) for complete feature documentation.

## License

MIT
```

**Step 3: Commit README**

```bash
git add README.md
git commit -m "docs: add quick-start guide and feature overview to README"
```

---

## Phase 5: Verification

### Task 10: Run Complete Test Suite

**Files:**
- None (verification only)

**Step 1: Run all tests**

Run: `npm test`

Expected: 70 tests passing, 0 failures

**Step 2: Check test output**

Verify output shows:
- `# { total: 70, pass: 70 }`
- Coverage remains ~98%+
- No MemoryIdempotencyStore tests

**Step 3: Verify build**

Run: `npm run build`

Expected: Clean compilation, no errors

**Step 4: Verify exports**

Run: `node -e "import('./dist/index.js').then(m => console.log('Exports:', Object.keys(m).sort().join(', ')))"`

Expected: `Exports: SqliteIdempotencyStore, generateFingerprint, idempotency`
(MemoryIdempotencyStore should be absent)

**Step 5: Test both examples**

Run basic example:
```bash
timeout 3 npm run example 2>&1 || true
```

Expected: Server starts successfully

Run SQLite example:
```bash
timeout 3 npm run example:sqlite 2>&1 || true
```

Expected: Server starts successfully

**Step 6: Final commit**

```bash
git add -A
git commit -m "chore: verify complete removal of MemoryIdempotencyStore"
```

---

## Completion Checklist

After completing all tasks, verify:

- [ ] `src/store/memory.ts` deleted
- [ ] `tests/store.test.ts` deleted
- [ ] `src/store/index.ts` exports only SqliteIdempotencyStore
- [ ] `src/index.ts` exports only SqliteIdempotencyStore
- [ ] `examples/basic-app.ts` uses `:memory:` SQLite
- [ ] IMPLEMENTATION_SUMMARY.md updated (store, API, examples, tests)
- [ ] README.md has quick-start guide
- [ ] 70 tests passing
- [ ] Build succeeds
- [ ] Both examples run
- [ ] MemoryIdempotencyStore absent from exports

**Breaking Change Notice:** This is a breaking change. Users must migrate from `MemoryIdempotencyStore` to `SqliteIdempotencyStore` with `path: ':memory:'` for equivalent behavior.
