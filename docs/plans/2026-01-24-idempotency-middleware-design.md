# Idempotency Middleware Design

Date: 2026-01-24

## Purpose

This middleware implements the IETF Idempotency-Key HTTP header specification (draft-ietf-httpapi-idempotency-key-header-07) for Hono. It prevents duplicate processing of POST and PATCH requests by caching responses and replaying them when clients retry with the same idempotency key.

## Core Design Decisions

### Protected Methods
The middleware intercepts POST and PATCH requests only. These methods change server state and benefit from idempotency protection. GET, DELETE, and other methods pass through unchanged.

### Fingerprinting Strategy
The middleware uses xxHash (XXH3) to fingerprint request bodies. xxHash provides excellent collision resistance at 40-100x the speed of SHA-256. For idempotency keys, we need collision resistance, not cryptographic security.

Users configure field exclusions via:
- Simple field names for root-level fields (`'timestamp'`)
- JSONPath expressions for nested fields (`'$.metadata.requestId'`)

The middleware parses JSON bodies, removes excluded fields, normalizes the remaining object (sorted keys), and hashes the result. Non-JSON bodies are hashed as-is.

### Retention Policy
Records expire after a configurable TTL (default: 24 hours, per IETF recommendation). Users set retention per middleware instance.

### Response Caching
The middleware caches complete responses: status code, headers, and body. It caches all responses (2xx, 4xx, 5xx), preventing repeated processing of failed requests.

### Concurrency Handling
Records track two states: "processing" and "complete." When a request arrives with an idempotency key, the middleware marks it "processing" before calling the handler. If another request arrives with the same key while processing, the middleware returns 409 Conflict.

### Header Requirement
Users configure whether the Idempotency-Key header is required per route. By default, it is optional. Missing headers allow requests to proceed without idempotency protection.

### Conflict Detection
The middleware detects two conflict types:

1. **Same key, different payload**: Client retries with same key but changed request body → 422 Unprocessable Entity
2. **Same fingerprint, different key**: Client sends duplicate request with different key → 409 Conflict

The second check catches clients defeating idempotency by generating new keys for duplicate operations.

### Store Architecture
The middleware defines an `IdempotencyStore` interface. This enables future implementations for Redis, DynamoDB, or other backends. The initial implementation uses in-memory storage with dual indexes (by key and by fingerprint).

## Request Flow

1. Request arrives with POST or PATCH method
2. Middleware extracts `Idempotency-Key` header
   - If missing and required: return 400 Bad Request
   - If missing and optional: proceed without protection
3. Middleware validates key (non-empty, length ≤ 255 characters)
4. Middleware generates fingerprint from request body
5. Middleware queries store with both key and fingerprint
6. Store returns matches by key and by fingerprint
7. Middleware decides action:
   - No matches: mark "processing," call handler, cache response, mark "complete"
   - Match by key (same fingerprint, status "complete"): return cached response
   - Match by key (same fingerprint, status "processing"): return 409 Conflict
   - Match by key (different fingerprint): return 422 Unprocessable Entity
   - Match by fingerprint (different key): return 409 Conflict
8. Cached responses include `X-Idempotent-Replayed: true` header

## Store Interface

```typescript
interface IdempotencyRecord {
  key: string
  fingerprint: string
  status: 'processing' | 'complete'
  response?: {
    status: number
    headers: Record<string, string>
    body: string
  }
  expiresAt: number
}

interface IdempotencyStore {
  lookup(key: string, fingerprint: string): Promise<{
    byKey: IdempotencyRecord | null
    byFingerprint: IdempotencyRecord | null
  }>

  startProcessing(key: string, fingerprint: string, ttlMs: number): Promise<void>

  complete(key: string, response: {
    status: number
    headers: Record<string, string>
    body: string
  }): Promise<void>

  cleanup(): Promise<void>
}
```

The `lookup` method combines key and fingerprint queries in one call. This enables efficient implementations:
- In-memory: query two Maps in parallel
- Redis: pipeline two GET commands
- DynamoDB: use BatchGetItem with both queries

## Configuration API

```typescript
interface IdempotencyOptions {
  required?: boolean              // Default: false
  ttlMs?: number                  // Default: 86400000 (24 hours)
  excludeFields?: string[]        // Default: []
  store?: IdempotencyStore        // Default: MemoryIdempotencyStore
  headerName?: string             // Default: 'idempotency-key'
  maxKeyLength?: number           // Default: 255
}
```

Usage examples:

```typescript
// Optional header, default settings
app.post('/payments', idempotency(), handler)

// Required header, 1-hour TTL
app.post('/transfers', idempotency({
  required: true,
  ttlMs: 60 * 60 * 1000
}), handler)

// Exclude timestamp fields from fingerprint
app.post('/orders', idempotency({
  excludeFields: [
    'timestamp',
    '$.metadata.requestId',
    '$.tracking.correlationId'
  ]
}), handler)

// Custom store
app.post('/api', idempotency({
  store: new RedisIdempotencyStore(redisClient)
}), handler)
```

## Error Responses

| Scenario | Status | Response Body |
|----------|--------|---------------|
| Missing required header | 400 | `{ error: 'Idempotency-Key header is required' }` |
| Invalid key | 400 | `{ error: 'Idempotency-Key must be between 1-255 characters' }` |
| Same key, different payload | 422 | `{ error: 'Idempotency key reused with different request payload' }` |
| Concurrent request | 409 | `{ error: 'A request with this idempotency key is already being processed' }` |
| Duplicate with different key | 409 | `{ error: 'This request was already processed with a different idempotency key' }` |

Cached responses include original status, headers, and body, plus `X-Idempotent-Replayed: true`.

## Implementation Phases

### Phase 1: Store Interface and In-Memory Implementation

Build the store interface and memory-based implementation.

**Deliverables:**
- `IdempotencyStore` interface in `src/store/interface.ts`
- `MemoryIdempotencyStore` class in `src/store/memory.ts`
- Dual-index Maps (by key and fingerprint)
- Cleanup mechanism for expired records

**Verification:**
- Unit tests for all store operations
- Test TTL expiration and cleanup
- Test concurrent access
- Test both lookup paths (by key and by fingerprint)
- Measure coverage: `npm run test:coverage` - achieve 100%
- Fix uncovered branches before proceeding

### Phase 2: Fingerprinting Logic

Build fingerprinting as a standalone module.

**Deliverables:**
- Fingerprint generation in `src/fingerprint.ts`
- JSONPath exclusion support (integrate `jsonpath-plus`)
- xxHash integration (integrate `xxhash-wasm`)
- JSON normalization with sorted keys

**Verification:**
- Unit tests for identical payloads producing identical fingerprints
- Test field exclusions (root level and JSONPath)
- Test non-JSON body handling
- Test edge cases (empty body, invalid JSON, malformed JSONPath)
- Performance test with various payload sizes
- Measure coverage: achieve 100%

### Phase 3: Middleware Core

Build the Hono middleware that orchestrates store and fingerprinting.

**Deliverables:**
- Middleware function in `src/middleware.ts`
- Configuration options in `src/types.ts`
- Header validation and extraction
- Request body reading and fingerprinting
- Store orchestration and decision logic
- Response caching and replay

**Verification:**
- Integration tests with Hono app
- Test all decision paths
- Test response replay (status, headers, body preserved)
- Test method filtering (POST/PATCH protected, others pass through)
- Test header requirement modes
- Measure coverage: achieve 100%

### Phase 4: Error Handling and Edge Cases

Complete error handling and edge case coverage.

**Deliverables:**
- Error response builders in `src/errors.ts`
- `X-Idempotent-Replayed` header on cached responses
- Configuration validation
- Store error handling
- Body reading error handling

**Verification:**
- Test all error scenarios return correct status and messages
- Test middleware handles store failures gracefully
- Test large request bodies
- Test malformed JSON
- Test invalid configuration options
- Measure final coverage: achieve 100% overall
- Document any intentionally uncovered code

## Testing Strategy

Tests use tap framework. Coverage target: 100% across all modules.

Package configuration:

```json
{
  "scripts": {
    "test": "tap",
    "test:coverage": "tap --coverage-report=html"
  }
}
```

Test organization:
- `tests/store.test.ts` - Store implementation
- `tests/fingerprint.test.ts` - Fingerprinting logic
- `tests/middleware.test.ts` - Middleware integration
- `tests/errors.test.ts` - Error handling

Each phase concludes with coverage measurement. Achieve 100% before proceeding.

## Project Structure

```
hono-idempotency/
├── src/
│   ├── index.ts              # Public API exports
│   ├── middleware.ts         # Middleware implementation
│   ├── store/
│   │   ├── index.ts          # Store exports
│   │   ├── interface.ts      # IdempotencyStore interface
│   │   └── memory.ts         # MemoryIdempotencyStore
│   ├── fingerprint.ts        # Fingerprinting logic
│   ├── types.ts              # TypeScript types
│   └── errors.ts             # Error response builders
├── tests/
│   ├── store.test.ts
│   ├── fingerprint.test.ts
│   ├── middleware.test.ts
│   └── errors.test.ts
├── examples/
│   └── basic-app.ts          # Example usage
└── docs/
    └── plans/
        └── 2026-01-24-idempotency-middleware-design.md
```

## Dependencies

Runtime:
- `hono` (peer dependency, >=4.0.0)
- `xxhash-wasm` (fast hashing)
- `jsonpath-plus` (JSONPath support)

Development:
- `tap` (testing)
- `typescript` (compilation)
- `tsx` (examples)

## Public API

The package exports:

```typescript
// Main middleware factory
export { idempotency } from './middleware'

// Types for custom store implementations
export type {
  IdempotencyStore,
  IdempotencyRecord,
  IdempotencyOptions
} from './types'

// Built-in store
export { MemoryIdempotencyStore } from './store'
```

## Package Configuration

```json
{
  "name": "hono-idempotency",
  "version": "0.1.0",
  "description": "Idempotency middleware for Hono implementing IETF draft-ietf-httpapi-idempotency-key-header",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "exports": {
    ".": "./dist/index.js"
  },
  "keywords": ["hono", "middleware", "idempotency", "http"],
  "license": "MIT"
}
```
