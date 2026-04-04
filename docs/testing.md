# Testing Guide

## Test Structure

This project uses shared test suites to avoid duplication across similar implementations.

### Store Tests

All store implementations (SQLite, PostgreSQL, MySQL, Redis) run the shared test suite defined in `packages/core/tests/store-adapter-suite.js` via the `runStoreTests()` function.

Individual store test files should:

1. Call `runStoreTests()` with their adapter configuration
2. Add only store-specific edge case tests

Example pattern:

```javascript
// Run shared tests
runStoreTests({
  name: "postgres",
  createStore: () => {
    const pool = createFakePgPool();
    return new PostgresIdempotencyStore({ pool });
  }
});

// Add store-specific tests only
test("PostgresIdempotencyStore - parseRecord handles null response_headers", async (t) => {
  // PostgreSQL-specific edge case
});
```

### Framework Tests

All framework adapters (Express, Fastify, Hono) run the shared test suite defined in `packages/core/tests/framework-adapter-suite.js` via the `runAdapterTests()` function.

Individual framework test files should:

1. Call `runAdapterTests()` with their adapter configuration
2. Add only framework-specific edge case tests

### Why This Pattern?

- **DRY**: Common interface behavior is tested once, not duplicated N times
- **Consistency**: All implementations are tested against the same interface contract
- **Maintainability**: Changes to interface behavior only need updating in one place
- **Coverage**: 100% coverage is still achieved without redundant tests

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm run test:coverage

# Verify 100% coverage
pnpm run test:verify-coverage

# Run specific test file
pnpm test packages/stores/postgres/postgres.test.js
```
