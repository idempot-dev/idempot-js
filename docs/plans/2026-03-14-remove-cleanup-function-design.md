# Design: Remove Cleanup Function from All Stores

Date: 2026-03-14

## Summary

Remove the explicit `cleanup()` method from all idempotency store implementations, interfaces, and related code. Cleanup of stale keys already happens automatically via:
- **SQLite/Postgres/Bun-SQLite**: `lookup()` deletes up to 10 expired records per call
- **Redis**: Native TTL auto-expires keys

## Motivation

The cleanup function was originally added as a manual way to clean up expired idempotency records. However, this is unnecessary because:

1. **Automatic cleanup in lookup()**: SQL-based stores (SQLite, Postgres, Bun-SQLite) already delete up to 10 expired records during each `lookup()` call, providing incremental cleanup without manual intervention.

2. **Native TTL in Redis**: Redis handles key expiration natively via TTL, so no cleanup is needed.

3. **Simplified API**: Removing cleanup reduces the store interface complexity and removes a method that users might incorrectly think they need to call.

4. **Removed from examples**: Users were previously shown example code with `setInterval` calling cleanup every 10 minutes — this is no longer needed.

## Scope

### Files to Modify

**Core Interface (2 files)**
- `packages/core/src/interface.js` — Remove `cleanup` from `IdempotencyStore` typedef
- `packages/core/src/resilience.js` — Remove `cleanup` from wrapped store

**Store Implementations (7 files)**
- `packages/stores/sqlite/src/index.js` — Remove `cleanup()` method + JSDoc typedef
- `packages/stores/bun-sqlite/src/index.js` — Remove `cleanup()` method + JSDoc typedef
- `packages/stores/postgres/src/index.js` — Remove `cleanup()` method + JSDoc typedef
- `packages/stores/redis/src/index.js` — Remove `cleanup()` method + JSDoc typedef
- `packages/stores/redis/src/interface.js` — Remove `cleanup` from typedef
- `packages/stores/sqlite/src/deno-sqlite.js` — Remove `cleanup()` method
- `packages/stores/redis/src/deno-redis.js` — Remove `cleanup()` method

**Examples (4 files)**
- `examples/basic-app.js` — Remove setInterval cleanup block
- `examples/sqlite-app.js` — Remove cleanup interval
- `examples/bun-basic-app.js` — Remove cleanup interval
- `examples/bun-sqlite-app.js` — Remove cleanup interval

**Documentation (2 files)**
- `ARCHITECTURE.md` — Remove cleanup from IdempotencyStore interface description
- `docs/bun-setup.md` — Remove cleanup code example

**Tests**
Tests that directly test cleanup functionality will be removed:
- `packages/stores/sqlite/tests/sqlite.test.js` — "cleanup removes expired records" and "limited cleanup during lookup" tests
- `packages/stores/postgres/tests/postgres.test.js` — "cleanup removes expired records" test
- `packages/stores/redis/tests/redis.test.js` — "cleanup is no-op" test
- `packages/core/tests/resilience.test.js` — "withResilience - cleanup is not wrapped" test
- `tests/runtime/bun/bun-sqlite.test.js` — "cleanup removes expired records" and "limited cleanup during lookup" tests
- `tests/runtime/deno/redis.test.js` — "cleanup is no-op" test

Test stores that mock cleanup will need the mock removed:
- `packages/frameworks/hono/tests/hono-middleware.test.js` — mock cleanup in test stores
- `packages/frameworks/express/tests/express-middleware.test.js` — mock cleanup in test stores
- `packages/core/tests/resilience.test.js` — mock cleanup in test stores

## Key Design Decisions

1. **Keep automatic cleanup in lookup()**: SQLite/Postgres/Bun-SQLite stores will continue deleting up to 10 expired records during each lookup. This provides incremental cleanup without requiring manual intervention.

2. **Remove entirely, not deprecate**: Since cleanup is no longer needed, remove it entirely rather than marking it as deprecated. This keeps the API clean.

3. **Redis unchanged behavior**: Redis already had a no-op cleanup() method. This change removes the method entirely, but the behavior (no cleanup needed) remains the same.
