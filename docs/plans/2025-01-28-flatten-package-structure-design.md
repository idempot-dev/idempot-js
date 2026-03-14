# Flatten Store and Framework Package Structure

**Date:** 2025-01-28

## Problem

The individual store and framework packages currently use a `src/` directory structure with only 1-3 files. This creates unnecessary nesting and visual clutter for such small packages.

## Solution

Flatten the directory structure by moving files from `src/` directly to the package root for store and framework packages.

## Scope

### Packages to Flatten

**Store packages:**
- `@idempot/bun-sqlite-store` (1 file)
- `@idempot/postgres-store` (1 file)
- `@idempot/redis-store` (3 files)
- `@idempot/sqlite-store` (2 files)

**Framework packages:**
- `@idempot/express-middleware` (1 file)
- `@idempot/fastify-middleware` (1 file)
- `@idempot/hono-middleware` (1 file)

### Packages Unchanged

**Core package:**
- `@idempot/core` - Keeps `src/` structure (7 files including `store/` subdirectory)

## Changes Required

### File Structure

**Before:**
```
packages/stores/bun-sqlite/
├── src/
│   └── index.js
├── package.json
└── README.md
```

**After:**
```
packages/stores/bun-sqlite/
├── index.js
├── package.json
└── README.md
```

### package.json Updates

Each flattened package requires these changes:

```json
{
  "main": "./index.js",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./index.js"
    }
  },
  "files": [
    "index.js",
    "dist",
    "README.md",
    "LICENSE"
  ]
}
```

### Test Updates

Tests in `/tests` that reference these packages via deep imports need path updates:

**Before:**
```javascript
import { BunSqliteStore } from '@idempot/bun-sqlite-store/src';
```

**After:**
```javascript
import { BunSqliteStore } from '@idempot/bun-sqlite-store';
```

### TypeScript Considerations

Type definition paths remain unchanged since `dist/` is not moved:
- `"types": "./dist/index.d.ts"` (unchanged)

## Rationale

1. **Simplicity:** Removes unnecessary directory nesting for packages with very few files
2. **Consistency:** All flattened packages follow the same simple structure
3. **Maintainability:** Easier to navigate and understand package contents
4. **Convention:** Common pattern for small npm packages

## Approach Selected

**Direct Flattening (Approach 1)**
- Move files from `src/` to package root
- Update package.json references
- Update test imports
- **Pros:** Cleanest solution, matches user's intent
- **Cons:** Requires updating test imports (straightforward)

## Alternatives Considered

1. **Rename src/ to lib/** - Doesn't solve the core problem of unnecessary nesting
2. **Keep current structure** - Doesn't address the clutter concern

## Testing Strategy

1. Run existing tests to ensure imports resolve correctly
2. Verify package.json exports work as expected
3. Confirm TypeScript definitions are still found

## Implementation Notes

- Test files remain centralized in `/tests` at root level
- Core package structure is intentionally unchanged
- No breaking changes to public API - only internal file paths change
