# Bun Runtime Support Design

**Date**: 2026-01-25
**Status**: Approved
**Goal**: Add Bun runtime support with native performance while maintaining architecture for future per-runtime packages.

## Overview

This design adds Bun runtime support to hono-idempotency middleware, enabling production users to deploy on Bun with native performance optimizations. The architecture supports future extraction into runtime-specific npm packages (e.g., `idempotency-bun-hono-redis`).

## Scope

**In Scope**:
- Bun runtime support for core middleware
- Bun-native SQLite store using `bun:sqlite`
- Example apps demonstrating Bun usage
- Tests running on Bun runtime
- Documentation for Bun users

**Out of Scope** (future work):
- Other runtimes (Deno, Cloudflare Workers, AWS Lambda)
- Runtime-specific packages on npm
- Bun-specific Redis/DynamoDB stores (unless compatibility issues found)

## Architecture

### Core Middleware
The core middleware is already runtime-agnostic and requires no changes.

### Storage Backend Strategy
- Create Bun-specific store implementations alongside Node versions
- Use Bun's native APIs where available for performance
- Keep Node versions unchanged for backward compatibility
- Verify existing libraries (ioredis, AWS SDK) work on Bun before creating Bun-specific versions

### File Structure

```
src/
  store/
    sqlite.ts              # Existing (better-sqlite3)
    bun-sqlite.ts          # NEW: Bun-native (bun:sqlite)
    redis.ts               # Existing (ioredis) - likely works on Bun
    bun-redis.ts           # NEW: Only if ioredis has issues on Bun
    dynamodb.ts            # Existing (AWS SDK) - likely works on Bun

examples/
  basic-app.ts             # Existing Node example
  bun-basic-app.ts         # NEW: Bun with native server
  bun-sqlite-app.ts        # NEW: Bun with native SQLite

test/
  bun/                     # NEW: Bun-specific tests
```

### Export Strategy

```typescript
// src/index.ts
export { SqliteIdempotencyStore } from "./store/sqlite.js";
export { BunSqliteIdempotencyStore } from "./store/bun-sqlite.js";
export { RedisIdempotencyStore } from "./store/redis.js";
export { DynamoDbIdempotencyStore } from "./store/dynamodb.js";
```

## Implementation Details

### BunSqliteIdempotencyStore

**Implementation**:
- Uses `bun:sqlite` native module
- Implements `IdempotencyStore` interface
- Matches table schema and queries from `SqliteIdempotencyStore`
- Delivers 2-3x faster performance than better-sqlite3

**API**:
```typescript
import { Database } from "bun:sqlite";
import type { IdempotencyStore } from "../types.js";

export class BunSqliteIdempotencyStore implements IdempotencyStore {
  constructor(options: { path?: string })
  async get(key: string): Promise<IdempotencyRecord | null>
  async set(key: string, record: IdempotencyRecord): Promise<void>
  async cleanup(): Promise<void>
}
```

### Redis & DynamoDB Stores

**Testing approach**:
1. Test `ioredis` on Bun (likely works)
2. Test AWS SDK v3 on Bun (likely works)
3. Create Bun-specific versions only if we find compatibility issues
4. Document runtime compatibility in README

### Example Apps

**examples/bun-basic-app.ts**:
- Uses `BunSqliteIdempotencyStore`
- Uses Bun's native HTTP server instead of `@hono/node-server`
- Demonstrates same functionality as Node examples
- Shows Bun-specific server setup

**examples/bun-sqlite-app.ts**:
- Demonstrates file-based SQLite persistence on Bun
- Provides production-ready example with cleanup

### Testing Strategy

**Existing tests on Bun**:
- Run full test suite with `bun test`
- Verify core middleware is runtime-agnostic
- Catch Node-specific assumptions

**New Bun-specific tests**:
- Test `BunSqliteIdempotencyStore` implementation
- Verify behavior matches `SqliteIdempotencyStore`
- Test native `bun:sqlite` integration
- Verify example apps start and respond correctly

**Package scripts**:
```json
{
  "scripts": {
    "example:bun": "bun run examples/bun-basic-app.ts",
    "example:bun:sqlite": "bun run examples/bun-sqlite-app.ts",
    "test:bun": "bun test",
    "test:bun:coverage": "bun test --coverage"
  }
}
```

## Documentation Updates

### README Changes

**Add Bun section**:
```markdown
## Using with Bun

Install and run with Bun's native performance:

\`\`\`bash
bun add hono-idempotency
\`\`\`

\`\`\`typescript
import { Hono } from "hono";
import { idempotency, BunSqliteIdempotencyStore } from "hono-idempotency";

const app = new Hono();
const store = new BunSqliteIdempotencyStore({ path: ":memory:" });

app.post("/orders", idempotency({ store }), async (c) => {
  return c.json({ id: "order-123" }, 201);
});

export default {
  port: 3000,
  fetch: app.fetch,
};
\`\`\`
```

**Update storage backend table**:
| Backend | Best For | Node.js | Bun | Deno | Workers |
|---------|----------|---------|-----|------|---------|
| SQLite | Development, single-server | ✅ | ✅ | 🔄 | ❌ |
| Redis | Multi-server, high performance | ✅ | ✅ | 🔄 | 🔄 |
| DynamoDB | AWS-native, serverless | ✅ | ✅ | 🔄 | 🔄 |

**Store selection guidance**:
- Node.js: Use `SqliteIdempotencyStore` (better-sqlite3)
- Bun: Use `BunSqliteIdempotencyStore` (native bun:sqlite, 2-3x faster)
- Redis/DynamoDB: Use same stores across runtimes (runtime-agnostic)

### New Documentation Files

**docs/bun-setup.md**:
- Complete Bun setup guide
- Installation instructions
- Example code for each backend
- Running tests on Bun
- Performance comparison

## Dependencies

**No new npm dependencies**:
- `bun:sqlite` is built into Bun runtime
- `better-sqlite3` remains a dependency for Node users
- Bun users skip installing better-sqlite3

**Peer dependency note**:
Document that Bun does not require `better-sqlite3`.

## Migration Path for Future Packages

This design enables clean extraction to separate packages:

**Phase 1** (this design):
- Single package with runtime-specific store classes
- Clear boundaries between implementations

**Phase 2** (future):
- Extract to `@hono-idempotency/bun-sqlite`
- Extract to `@hono-idempotency/node-sqlite`
- Core package depends on interfaces only

Separate classes make this extraction straightforward because each class is already isolated.

## Success Criteria

1. ✅ `BunSqliteIdempotencyStore` works with Bun's native SQLite
2. ✅ Example apps run successfully on Bun
3. ✅ All existing tests pass when run with `bun test`
4. ✅ Bun-specific tests verify native store behavior
5. ✅ README documents Bun usage clearly
6. ✅ Architecture ready for future package extraction

## Open Questions

None. All questions resolved during design phase.

## Future Work

- Add Deno runtime support
- Add Cloudflare Workers support
- Add AWS Lambda support
- Extract into per-runtime npm packages
- Add runtime-specific optimizations (Deno KV, CF KV, etc.)
