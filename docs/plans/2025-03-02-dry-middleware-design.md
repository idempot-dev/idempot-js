# DRY Middleware Refactoring Design

## Problem Statement

The three framework-specific middleware files (`hono-middleware.js`, `express-middleware.js`, `fastify-middleware.js`) contain approximately 80% duplicated logic. All three implement the same idempotency validation, lookup conflict checking, and response caching logic, differing only in framework-specific request/response handling.

## Goals

1. Reduce code duplication while maintaining clarity
2. Preserve framework-specific optimizations and idioms
3. Keep the main flow explicit in each middleware file
4. Maintain 100% test coverage (existing requirement)

## Proposed Solution

Extract shared logic into two utility modules:

### 1. Extended `src/validation.js`

Add validation and conflict checking functions that are framework-agnostic:

- `validateIdempotencyKey(key, maxKeyLength)` - Validates key length constraints
- `checkLookupConflicts(lookup, key, fingerprint)` - Checks all lookup result conflicts (processing, fingerprint mismatch, key reuse)

### 2. New `src/core-logic.js`

Create a new module for shared core business logic:

- `shouldProcessRequest(method)` - Checks if method is POST or PATCH
- `getCachedResponse(lookup)` - Extracts cached response from lookup result
- `prepareCachedResponse(cached)` - Adds replay header to cached response

## Impact

Each middleware file will be reduced from ~140 lines to ~60-70 lines:
- Duplicated validation logic moved to shared utilities
- Framework-specific request/response handling remains in place
- Flow remains explicit and easy to follow
- Easier to maintain and test

## Framework-Specific Differences Preserved

- **Hono**: Uses `c.req.text()` for body, `c.res.clone()` for response capture
- **Express**: Uses `req.body` parsing, `res.on('finish')` for response capture
- **Fastify**: Uses `request.body` parsing, `reply.then()` for response capture

## Testing Strategy

The existing test suite will validate the refactored code. New unit tests should be added for the extracted utility functions to ensure they maintain the same behavior across all three middleware implementations.

## Trade-offs

**Pros:**
- Significant reduction in code duplication (~40 lines per file)
- Single source of truth for validation logic
- Easier to add new middleware (e.g., for another framework)

**Cons:**
- Slight increase in indirection
- Need to maintain backward compatibility in shared utilities

## Files to Modify

1. `src/validation.js` - Add shared validation functions
2. `src/core-logic.js` - Create new file with shared core logic (NEW)
3. `src/hono-middleware.js` - Refactor to use shared utilities
4. `src/express-middleware.js` - Refactor to use shared utilities
5. `src/fastify-middleware.js` - Refactor to use shared utilities
6. Add unit tests for new shared utilities
