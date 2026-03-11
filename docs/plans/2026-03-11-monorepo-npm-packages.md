# Monorepo Reorganization Plan

**Date:** 2026-03-11
**Status:** Pending

## Goal

Publish project to npm as multiple packages using pnpm workspaces with changesets for versioning.

## Packages to Publish to npm

| Package | Location | Dependencies | Peer Dependencies |
|---------|----------|--------------|-------------------|
| `@idempot/core` | packages/core | `jsonpath-plus`, `xxhash-wasm`, `opossum` | - |
| `@idempot/hono-middleware` | packages/frameworks/hono | `@idempot/core` | `hono` |
| `@idempot/express-middleware` | packages/frameworks/express | `@idempot/core` | `express` |
| `@idempot/fastify-middleware` | packages/frameworks/fastify | `@idempot/core` | `fastify` |
| `@idempot/redis-store` | packages/stores/redis | `@idempot/core` | `ioredis` |
| `@idempot/dynamodb-store` | packages/stores/dynamodb | `@idempot/core`, `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb` | - |
| `@idempot/postgres-store` | packages/stores/postgres | `@idempot/core` | `pg` |
| `@idempot/sqlite-store` | packages/stores/sqlite | `@idempot/core` | `better-sqlite3` |
| `@idempot/bun-sqlite-store` | packages/stores/bun-sqlite | `@idempot/core` | - |
| `@idempot/cloudflare-kv-store` | packages/stores/cloudflare-kv | `@idempot/core` | - |

## Bun Support

Some stores use Bun-specific APIs (`bun:sqlite`). These are published as separate packages:

| Package | Location | Notes |
|---------|----------|-------|
| `@idempot/bun-sqlite-store` | packages/stores/bun-sqlite | Bun's `bun:sqlite` driver |
| `@idempot/bun-kv-store` | packages/stores/bun-kv | Bun's built-in KV (optional) |

For stores that work identically on Node/Bun, a single package suffices.

## Private Packages (Not Published to npm)

None - all packages are published.

## Deno Support

Deno stores use Deno-specific imports (`@db/redis`, etc.) and are handled via **conditional exports** in the npm packages, not separate Deno-only packages:

```js
// packages/stores/redis/package.json
{
  "exports": {
    "import": "./src/index.js",
    "deno": "./src/deno/index.js"  // Deno-specific imports
  }
}
```

This approach:
- Uses a single package (`@idempot/redis-store`) for both Node and Deno
- Deno imports are in `src/deno/` subdirectory
- No separate `@idempot/deno-*` packages needed

If conditional exports don't work for your use case, publish to deno.land as a fallback:
- `@idempot/deno-redis-store` → deno.land/x/redis
- `@idempot/deno-sqlite-store` → deno.land/x/sqlite
- `@idempot/deno-dynamodb-store` → deno.land/x/dynamodb

## Directory Structure

```
/packages/
  core/
    package.json
    src/
      fingerprint.js
      validation.js
      resilience.js
      default-options.js
      store/
        interface.js
    tests/
      fingerprint.test.js
      validation.test.js

  frameworks/
    hono/
      package.json
      src/index.js
      tests/hono-middleware.test.js
    express/
      package.json
      src/index.js
      tests/express-middleware.test.js
    fastify/
      package.json
      src/index.js
      tests/fastify-middleware.test.js

  stores/
    redis/
      package.json
      src/index.js
      tests/redis.test.js
    dynamodb/
      package.json
      src/index.js
      tests/dynamodb.test.js
    postgres/
      package.json
      src/index.js
      tests/postgres.test.js
    sqlite/
      package.json
      src/index.js
      tests/sqlite.test.js
    bun-sqlite/
      package.json
      src/index.js
      tests/bun-sqlite.test.js
    cloudflare-kv/
      package.json
      src/index.js
      src/deno/index.js  (Deno-specific imports)
      tests/cloudflare-kv.test.js

test/
  lambda/
  bun/
  deno/
```

## Files to Create/Modify

### New Files

1. `pnpm-workspace.yaml`
   ```yaml
   packages:
     - 'packages/*'
   ```

2. 13 packages under `packages/`:
   - Each has `package.json` with exports, dependencies, peerDependencies
   - Each has `src/index.js` (copied from original with updated imports)
   - Each has `tests/` (moved from root with updated imports)

### Modified Files

1. Root `package.json`:
   - Add `private: true`
   - Remove `main`, `types`, `exports`, `files` fields
   - Keep scripts for running tests

2. Source files - update imports to use `@idempot/core` or relative paths

3. Test files - update imports to use `@idempot/*` packages

### Keep Unchanged

- Root: `README.md`, `LICENSE`, `tsconfig.json`, `eslint.config.js`, `.taprc`
- `test/` directory (lambda, bun, deno runtime tests)
- `examples/`

## Implementation Steps

1. Create `pnpm-workspace.yaml`
2. Create framework packages (hono, express, fastify)
3. Create store packages (redis, dynamodb, postgres, sqlite, bun-sqlite, cloudflare-kv)
4. Add Deno-specific source files to stores that need them (`src/deno/index.js`)
5. Update root `package.json`
6. Update imports in test files
7. Update runtime test imports (test/lambda, test/bun, test/deno)
8. Verify build and tests pass

## Notes

- Each package builds to its own `dist/` directory
- No `@idempot/all` meta-package - splitting is preferred
- Tests colocated in each package (Option A)
- Deno stores use Deno-specific imports (`@db/redis`, etc.) handled via conditional exports

### Workspace Hoisting Strategy

By default, pnpm hoists dependencies to the root `node_modules/`. For this monorepo:

- **Hoist shared dependencies** (e.g., `xxhash-wasm`, `jsonpath-plus`) to root for faster installs
- **Keep peer dependencies** (express, hono, fastify, ioredis, pg, etc.) in each package—consumers install their runtime of choice
- **Isolate large SDKs** (`@aws-sdk/*`) in specific packages to avoid polluting root

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
```

### Build Output Handling

Each package has its own build step. Options:

1. **Per-package builds**: Each package has a `build` script in its `package.json`
2. **Root build script**: `pnpm -r run build` runs all package builds
3. **nx/turbo** (optional): For incremental builds and caching—add only if build times become slow

```json
// Example: packages/core/package.json
{
  "scripts": {
    "build": "tsc --noEmit && node build.js"
  }
}
```

For ESM-only packages (recommended): no build step needed if using `.js` source with JSDoc.

### Runtime Test Imports

Tests in `test/lambda/`, `test/bun/`, `test/deno/` must reference packages via:

- **npm/dnpm**: `import { xxx } from '@idempot/core'`
- **Deno**: `import { xxx } from 'npm:@idempot/core'` or import maps

Update import paths in each runtime test file to use the new package paths. Verify tests pass for each runtime before considering the migration complete.

### Package Type: ESM-Only

All packages are **ESM-only** (`"type": "module"` in package.json). This simplifies:
- No dual-package complexity (CommonJS + ESM)
- Tree-shaking works out of the box
- Consistent behavior across Node, Bun, Deno

If a consumer needs CommonJS, they can use dynamic `import()` or a bundler transformation.

If tests share reusable utilities (mock stores, test fixtures that don't depend on internal APIs), consider creating a `packages/test-helpers/` package later.

## Versioning with Changesets

Use [changesets](https://github.com/changesets/changesets) for coordinated releases:

1. Install changesets: `pnpm add -Dw @changesets/cli && pnpm changeset init`
2. Run `pnpm changeset` to create a changeset (prompts for package and version bump)
3. On merge to main: changesets creates a PR with version bumps and changelog
4. Publish: `pnpm -r publish` or let changesets handle it

Example workflow:
```bash
# Make changes to packages/core
pnpm changeset
# Select packages, bump type (patch/minor/major), add description
git add .changeset/*.md && git commit -m "feat: add new feature"
# On merge to main, changesets bot creates PR with version bumps
```
