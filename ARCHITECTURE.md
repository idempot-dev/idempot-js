# Architecture

## Overview

`idempot-js` is a monorepo containing framework-agnostic idempotency middleware with pluggable storage backends. This project uses **pnpm workspaces** for package management. The architecture follows a **layered plugin pattern** where:

- **Core** defines the idempotency logic and store interface
- **Framework adapters** integrate the middleware into web frameworks
- **Storage backends** persist idempotency records

## Monorepo Structure (pnpm Workspaces)

This project uses **pnpm workspaces** (not npm workspaces). Key implications:

- Use `pnpm install` instead of `npm install`
- Workspace packages are linked via `node_modules/@idempot/*`
- Dependencies between packages use `workspace:*` protocol
- Run `pnpm -r build` to build all packages
- Each package has its own `package.json` with workspace dependencies

When creating a git worktree, always run `pnpm install` in the worktree directory to properly link workspace packages.

```
┌─────────────────────────────────────────────────────────────┐
│             Storage Backend Layer                           │
│  ┌──────────┐  ┌──────┐  ┌─────────┐                     │
│  │  Redis   │  │SQLite│  │ Postgres│                     │
│  └──────────┘  └──────┘  └─────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
idempot-js/
├── packages/
│   ├── core/                    # Framework-agnostic idempotency logic
│   │   ├── src/
│   │   │   ├── fingerprint.js   # Request fingerprinting
│   │   │   ├── validation.js    # Key validation & conflict detection
│   │   │   ├── resilience.js    # Circuit breaker & retry logic
│   │   │   ├── interface.js     # Store interface definition
│   │   │   └── default-options.js
│   │   └── tests/
│   │
│   ├── frameworks/              # Framework adapters
│   │   ├── hono/
│   │   ├── express/
│   │   └── fastify/
│   │
│   └── stores/                  # Storage backend implementations
│       ├── sqlite/
│       ├── redis/
│       ├── postgres/
│       └── bun-sqlite/
│
├── examples/                    # Usage examples
└── tests/                       # Integration tests
```

## Core Package

The core package contains the framework-agnostic idempotency logic. All framework adapters use these core functions.

### fingerprint.js

Generates a deterministic fingerprint from the request body. This fingerprint detects when the same idempotency key is used with different payloads.

**Key features:**

- Uses SHA-256 hashing for collision resistance
- Supports JSONPath expressions for field exclusion
- Handles non-JSON payloads (plain text, etc.)
- Canonicalizes JSON to ensure consistent hashing

### validation.js

Handles request validation and conflict detection. Functions include idempotency key validation, field exclusion validation, conflict detection, and cached response handling.

### resilience.js

Provides resilience against storage backend failures using [opossum](https://nodeshift.dev/opossum/) circuit breaker:

**Features:**

- **Retry logic**: Failed operations retry up to 3 times with configurable delay
- **Timeout**: Operations timeout after 500ms (configurable) to prevent hanging
- **Circuit breaker**: Opens after 50% failure rate over 10 requests
- **Fail-fast**: While circuit is open, requests fail immediately without calling store
- **Auto-recovery**: Circuit resets after 30 seconds

### interface.js

Defines the `IdempotencyStore` interface that all storage backends must implement. The interface includes methods for lookup, startProcessing, and complete.

## Framework Adapters

Each framework adapter implements the idempotency middleware pattern for its framework.

### Hono Adapter (`packages/frameworks/hono/`)

**Key characteristics:**

- Uses Hono's middleware pattern
- Accesses request via `c.req` context
- Returns responses via `c.json()` or `c.body()`
- Exposes circuit breaker via `middleware.circuit`

### Express Adapter (`packages/frameworks/express/`)

**Key characteristics:**

- Uses Express middleware pattern (`(req, res, next)`)
- Accesses request via `req` and `res` objects
- Handles async handlers properly
- Supports `preHandler` style for Fastify compatibility

### Fastify Adapter (`packages/frameworks/fastify/`)

**Key characteristics:**

- Uses Fastify's `preHandler` hook
- Handles both sync and async handlers
- Properly clones responses for caching

## Storage Backends

All storage backends implement the `IdempotencyStore` interface. Each has different characteristics:

### SQLite (`packages/stores/sqlite/`)

**Best for:** Single-server, local development, lightweight applications

**Implementation:**

- Uses `better-sqlite3` (synchronous, high-performance)
- Stores records in a single table with indexes on `fingerprint` and `expires_at`
- JSON-serializes response headers for storage

**Persistence considerations:** Use litestream or similar for production deployment.

### Redis (`packages/stores/redis/`)

**Best for:** High-performance, distributed systems, microservices

**Implementation:**

- Uses `ioredis` client
- Stores two keys per request: one by key, one by fingerprint
- Uses Redis TTL for automatic expiration

**Persistence considerations:** Configure AOF (Append Only File) for reliability.

### PostgreSQL (`packages/stores/postgres/`)

**Best for:** Multi-server deployments, existing Postgres infrastructure

**Implementation:**

- Uses `pg` pool for connection management
- JSONB column for response headers
- Indexed queries on key and fingerprint

**Similar schema to SQLite but with:**

- JSONB type for headers (more efficient than TEXT)
- Connection pooling via `pg.Pool`

### Bun SQLite (`packages/stores/bun-sqlite/`)

**Best for:** Bun runtime applications

**Implementation:**

- Uses Bun's built-in SQLite via `bun:sqlite`
- Same schema as Node.js SQLite
- Maximum performance for Bun environment

## Request Flow

### Normal Request (First Request with Key)

1. Request arrives at framework adapter
2. Framework adapter calls middleware
3. Core: Extract idempotency key from header
4. Core: Validate key length (16-255 chars)
5. Core: Generate fingerprint from request body
6. Core: Call store.lookup(key, fingerprint)
7. Store: Query database by key and fingerprint
8. Core: Check for conflicts (none found)
9. Core: Call store.startProcessing(key, fingerprint, ttlMs)
10. Store: Insert record with status='processing'
11. Core: Call next() to pass to handler
12. Handler: Execute business logic
13. Framework adapter: Capture response
14. Core: Clone response body and headers
15. Core: Call store.complete(key, response)
16. Store: Update record with status='complete' and response data
17. Framework adapter: Return response to client

### Duplicate Request (Same Key, Same Payload)

1-7. Same as above 8. Core detects byKey exists with same fingerprint 9. Core extracts cached response 10. Core adds x-idempotent-replayed: true header 11. Framework adapter returns cached response without calling handler

### Conflict Scenario (Same Key, Different Payload)

1-7. Same as above 8. Core detects byKey exists with different fingerprint 9. Core returns 422 Unprocessable Entity with error message 10. Framework adapter returns error response

### Concurrent Request (Same Key, Simultaneous Requests)

1. Request A arrives, starts processing
2. Request B arrives with same key
3. Core detects byKey with status='processing'
4. Core returns 409 Conflict (request already in progress)
5. Client should retry after delay

## Key Design Decisions

### IETF Draft Compliance

The library follows [draft-ietf-httpapi-idempotency-key-header-07](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07):

- Uses `Idempotency-Key` header (case-insensitive)
- Returns `409 Conflict` for concurrent processing
- Returns `422 Unprocessable Entity` for key reuse with different payload
- Adds `x-idempotent-replayed: true` header on cached responses

### Key Length Requirements

Default 21-255 character range (nanoid default) provides ~126 bits of entropy, preventing:

- Key exhaustion attacks (short keys)
- Collision attacks (insufficient entropy)

The minimum of 21 is enforced at middleware initialization - values below 21 will throw an error.

### Resilience Pattern

The circuit breaker pattern provides graceful degradation:

1. **Fail-fast on storage failures** - Prevents cascading failures
2. **Retry with backoff** - Transient failures are handled automatically
3. **Automatic recovery** - System recovers when storage becomes available
4. **Monitoring** - Exposes circuit state for observability

### Runtime Support Strategy

- **Node.js**: Full support via better-sqlite3, ioredis, pg
- **Bun**: Native SQLite via `bun:sqlite`, ioredis support
- **Deno**: Native SQLite via `deno-sqlite`, native Redis support
- **AWS Lambda**: Planned (DynamoDB or Redis via AWS SDK)
- **Cloudflare Workers**: Planned (KV storage)

### Store Interface Design

The `IdempotencyStore` interface is intentionally simple:

- **Key-based lookups** enable O(1) performance
- **Fingerprint-based lookups** detect key collisions
- **Atomic operations** prevent race conditions
- **TTL-based expiration** avoids manual cleanup

### Middleware Composition

Framework adapters follow middleware patterns where idempotency wraps the handler and can be combined with other middleware like authentication.

The middleware:

1. Checks request method (only POST/PATCH protected)
2. Validates idempotency key (if present)
3. Generates fingerprint
4. Checks storage for conflicts or cached response
5. Either returns cached response or calls handler

## Testing Strategy

### Reusable Framework Adapter Test Suite

All framework adapters (Hono, Express, Fastify) share a common test suite defined in `packages/core/tests/framework-adapter-suite.js`. This ensures consistent behavior across all adapters while reducing test code duplication by ~85%.

**Usage:**

```javascript
import { runAdapterTests } from "@idempot/core/tests/framework-adapter-suite.js";

runAdapterTests({
  name: "framework-name",
  setup: async () => ({
    mount: (method, path, middleware, handler) => {
      /* framework-specific */
    },
    request: async (options) => {
      /* return { status, headers, body } */
    },
    teardown: async () => {
      /* cleanup */
    }
  }),
  createMiddleware: (options) => idempotency(options),
  createStore: () => new SqliteIdempotencyStore({ path: ":memory:" })
});
```

**Test Coverage (20 shared tests):**

- HTTP method handling (GET pass-through)
- Key validation (length, empty, commas, required/optional)
- Caching behavior (first request, replay, call count)
- Conflict detection (concurrent, payload mismatch, fingerprint collision)
- Error handling (lookup failure, startProcessing failure, complete failure)
- Configuration (field exclusion, PATCH method, body types)

**Benefits:**

- Consistent behavior across all adapters
- ~85% reduction in test code (1,822 lines → ~280 lines)
- Easy to add new framework adapters (only ~30 lines needed)
- Single source of truth for idempotency behavior

### Unit Tests

- Core functions tested in isolation
- Storage backends tested with mocks
- Edge cases (empty body, non-JSON, timeouts)

### Integration Tests

- Each framework adapter tested with real handlers
- Each storage backend tested with real database
- End-to-end request/response cycles

### Runtime Tests

- Bun-specific tests run with Bun runtime
- Deno-specific tests run with Deno
- AWS Lambda and Cloudflare Workers tests planned

### Local Development

For local development, integration tests run against Redis and Postgres containers managed by [apple/container](https://github.com/apple/container).

**Container Configuration:**

- Container name: `idempot-js-dev`
- Redis: `arm64v8/redis:7-alpine` on port 6379
- Postgres: `postgres:16-alpine` on port 5432
- Database: `test` with user `idempot` / password `idempot`

**npm Scripts:**

| Script                   | Description                         |
| ------------------------ | ----------------------------------- |
| `test:container:start`   | Start Redis and Postgres containers |
| `test:container:stop`    | Stop and remove containers          |
| `test:container:restart` | Restart containers                  |
| `test:integration`       | Run integration tests               |

**Usage:**

```bash
# Start containers, run tests, stop containers
npm run test:container:start && npm run test:integration && npm run test:container:stop

# Just start containers for manual testing
npm run test:container:start
```

The containers use arm64 architecture (native to Apple Silicon) to avoid Rosetta translation overhead.

## Extensibility

### Adding a New Storage Backend

1. Implement `IdempotencyStore` interface
2. Follow existing patterns (see `packages/stores/sqlite/`)
3. Write unit tests
4. Add to `examples/` directory
5. Update README with backend matrix

### Adding a New Framework Adapter

1. Import core functions from `@idempot/core`
2. Implement middleware following framework pattern
3. Handle request/response lifecycle
4. Expose circuit breaker for monitoring
5. Write integration tests

### Custom Fingerprinting

Override `excludeFields` to customize what's included in fingerprint. Supports JSONPath expressions for root-level fields, nested fields, and deep nesting.
