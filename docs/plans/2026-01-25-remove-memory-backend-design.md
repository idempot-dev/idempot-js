# Remove MemoryIdempotencyStore Design

**Date:** 2026-01-25
**Status:** Approved
**Type:** Breaking Change

## Summary

Remove MemoryIdempotencyStore. SQLite provides better functionality for all scenarios: development, testing, and production.

## Rationale

SQLite's `:memory:` mode duplicates MemoryIdempotencyStore functionality with advantages:
- Query capabilities (inspect records, debug state)
- Durability (survives store instance recreation with same path)
- Same interface, same performance
- Reduces maintenance burden (one store implementation)

## Scope

### Delete Completely

**src/store/memory.ts** - The entire in-memory implementation.

**tests/store.test.ts** - All 7 MemoryIdempotencyStore tests. Redundant with tests/sqlite.test.ts (9 equivalent tests).

### Modify

**src/store/index.ts** - Remove MemoryIdempotencyStore export.

**src/index.ts** - Remove MemoryIdempotencyStore export.

**examples/basic-app.ts** - Replace MemoryIdempotencyStore with SQLite using `:memory:` mode. Demonstrates lightweight development usage.

**IMPLEMENTATION_SUMMARY.md** - Rewrite store section. Position SQLite as the storage solution. Update test counts (77 → 70).

**README.md** - Add installation and quick-start example using `:memory:` SQLite.

## Implementation

Single atomic commit:
1. Delete files (memory.ts, store.test.ts)
2. Update exports (remove memory store)
3. Update examples (switch to `:memory:` SQLite)
4. Update documentation

**Commit message:** `refactor!: remove MemoryIdempotencyStore, use SQLite for all scenarios`

**Migration note:** Use `SqliteIdempotencyStore` with `path: ':memory:'` for in-memory behavior.

## Verification

1. `npm test` → 70 tests passing
2. `npm run build` → Clean compilation
3. `npm run example` → Works with `:memory:` SQLite
4. `npm run example:sqlite` → Production file-based mode works
5. Verify exports → `SqliteIdempotencyStore` present, `MemoryIdempotencyStore` absent

**Expected coverage:** 98%+ (deleting fully-covered code preserves coverage)

## Trade-offs

**Dependency cost:** better-sqlite3 becomes required (was optional). Acceptable trade-off for simpler architecture and better functionality.

**Breaking change:** Existing users must update. Pre-1.0 status permits aggressive simplification.

## Default Configuration

No default store. Users must explicitly create `new SqliteIdempotencyStore()`. Clear, explicit API avoids magic behavior.
