# Contributing

## Tests

Tests for this package are located in the monorepo root at `tests/runtime/bun/`, not within this package directory. This is because Bun-specific test utilities require the Bun runtime.

### Test Files

| File | Purpose |
|------|---------|
| `tests/runtime/bun/bun-sql.test.js` | Unit tests forBunSqlIdempotencyStore |
| `tests/runtime/bun/bun-sql-integration.test.js` | Integration tests with Hono framework |
| `tests/runtime/bun/examples.test.js` | Example app tests |

### Running Tests

From the monorepo root:

```bash
npm run test:bun
```

Or directly with Bun:

```bash
bun test tests/runtime/bun/
```

### Running Specific Tests

```bash
bun test tests/runtime/bun/bun-sql.test.js
```

## Development

This package uses JavaScript with JSDoc for type annotations. TypeScript definitions are generated during build via `npm run build`.