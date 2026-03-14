# Flatten Package Structure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Flatten the directory structure for store and framework packages by moving files from `src/` to package root.

**Architecture:** Move all source files from `src/` directories directly into package roots using `git mv` to preserve history, update package.json exports atomically, verify with tests and build.

**Tech Stack:** Node.js, ESM modules, pnpm workspaces, tap testing framework

---

## Task 1: Flatten Store Packages

**Files to modify:**
- Move: `packages/stores/*/src/*.js` → `packages/stores/*/`
- Modify: `packages/stores/*/package.json`
- Remove: `packages/stores/*/src/` directories

**Step 1: Move files using git mv (preserves history)**

```bash
# bun-sqlite
git mv packages/stores/bun-sqlite/src/index.js packages/stores/bun-sqlite/index.js
rmdir packages/stores/bun-sqlite/src 2>/dev/null || true

# postgres
git mv packages/stores/postgres/src/index.js packages/stores/postgres/index.js
rmdir packages/stores/postgres/src 2>/dev/null || true

# sqlite
git mv packages/stores/sqlite/src/index.js packages/stores/sqlite/index.js
git mv packages/stores/sqlite/src/deno-sqlite.js packages/stores/sqlite/deno-sqlite.js
rmdir packages/stores/sqlite/src 2>/dev/null || true

# redis
git mv packages/stores/redis/src/index.js packages/stores/redis/index.js
git mv packages/stores/redis/src/interface.js packages/stores/redis/interface.js
git mv packages/stores/redis/src/deno-redis.js packages/stores/redis/deno-redis.js
rmdir packages/stores/redis/src 2>/dev/null || true
```

**Step 2: Update package.json files atomically**

Edit each of these files:
- `packages/stores/bun-sqlite/package.json`
- `packages/stores/postgres/package.json`
- `packages/stores/sqlite/package.json`
- `packages/stores/redis/package.json`

Changes for ALL packages:
```json
{
  "main": "./index.js",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./index.js"
    }
  },
  "files": ["index.js", "dist", "README.md", "LICENSE"]
}
```

**For packages with multiple files (sqlite, redis), be explicit:**

sqlite:
```json
"files": ["index.js", "deno-sqlite.js", "dist", "README.md", "LICENSE"]
```

redis:
```json
"files": ["index.js", "interface.js", "deno-redis.js", "dist", "README.md", "LICENSE"]
```

**Step 3: Stage all changes**
```bash
git add packages/stores/
```

**Step 4: Commit**
```bash
git commit -m "refactor(stores): flatten package structure

Move source files from src/ to package root for all store packages:
- @idempot/bun-sqlite-store
- @idempot/postgres-store  
- @idempot/redis-store
- @idempot/sqlite-store

Core package structure unchanged."
```

---

## Task 2: Flatten Framework Packages

**Files to modify:**
- Move: `packages/frameworks/*/src/index.js` → `packages/frameworks/*/index.js`
- Modify: `packages/frameworks/*/package.json`
- Remove: `packages/frameworks/*/src/` directories

**Step 1: Move files using git mv**

```bash
# hono
git mv packages/frameworks/hono/src/index.js packages/frameworks/hono/index.js
rmdir packages/frameworks/hono/src 2>/dev/null || true

# express  
git mv packages/frameworks/express/src/index.js packages/frameworks/express/index.js
rmdir packages/frameworks/express/src 2>/dev/null || true

# fastify
git mv packages/frameworks/fastify/src/index.js packages/frameworks/fastify/index.js
rmdir packages/frameworks/fastify/src 2>/dev/null || true
```

**Step 2: Update package.json files**

Edit:
- `packages/frameworks/hono/package.json`
- `packages/frameworks/express/package.json`
- `packages/frameworks/fastify/package.json`

Changes for ALL:
```json
{
  "main": "./index.js",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./index.js"
    }
  },
  "files": ["index.js", "dist", "README.md", "LICENSE"]
}
```

**Step 3: Stage and commit**
```bash
git add packages/frameworks/
git commit -m "refactor(frameworks): flatten package structure

Move source files from src/ to package root for all framework packages:
- @idempot/express-middleware
- @idempot/fastify-middleware
- @idempot/hono-middleware

Core package structure unchanged."
```

---

## Task 3: Verify Everything Works

**Step 1: Run tests**
```bash
npm run test:verify-coverage
```
Expected: All tests pass, 100% coverage

**Step 2: Run build to ensure TypeScript definitions generate**
```bash
npm run build
```
Expected: Build succeeds, `dist/` directories created/updated in packages

**Step 3: Verify package exports resolve correctly**
```bash
node -e "import('@idempot/hono-middleware').then(m => console.log('hono:', typeof m)).catch(e => console.error('hono failed:', e.message))"
node -e "import('@idempot/bun-sqlite-store').then(m => console.log('bun-sqlite:', typeof m)).catch(e => console.error('bun-sqlite failed:', e.message))"
```
Expected: Both log types (not errors)

**Step 4: Verify structure**
```bash
echo "=== Store packages (should have index.js at root, no src/) ==="
for pkg in bun-sqlite postgres sqlite redis; do
  echo "$pkg:"
  ls packages/stores/$pkg/*.js 2>/dev/null || echo "  No .js files at root"
  test -d packages/stores/$pkg/src && echo "  ERROR: src/ still exists!" || echo "  OK: no src/"
done

echo ""
echo "=== Framework packages (should have index.js at root, no src/) ==="
for pkg in hono express fastify; do
  echo "$pkg:"
  ls packages/frameworks/$pkg/*.js 2>/dev/null || echo "  No .js files at root"
  test -d packages/frameworks/$pkg/src && echo "  ERROR: src/ still exists!" || echo "  OK: no src/"
done

echo ""
echo "=== Core package (should STILL have src/) ==="
test -d packages/core/src && echo "OK: core/src/ exists" || echo "WARNING: core/src/ missing!"
```

**Step 5: Check for any missed references**
```bash
# Search for any remaining references to /src in package configs
grep -r '"main": "./src/' packages/*/package.json && echo "ERROR: Found /src references!" || echo "OK: No /src references in package.json files"
grep -r '"import": "./src/' packages/*/package.json && echo "ERROR: Found /src references!" || echo "OK: No /src references in package.json files"
```

---

## Task 4: Summary

After completion:
- ✅ 4 store packages flattened (files at root, no src/)
- ✅ 3 framework packages flattened (files at root, no src/)  
- ✅ Core package unchanged (keeps src/ structure)
- ✅ All tests pass with 100% coverage
- ✅ Build succeeds
- ✅ Package exports resolve correctly
- ✅ Only 2 commits in git history

**Packages affected:**
- `@idempot/bun-sqlite-store`
- `@idempot/postgres-store`
- `@idempot/redis-store`
- `@idempot/sqlite-store`
- `@idempot/express-middleware`
- `@idempot/fastify-middleware`
- `@idempot/hono-middleware`
