# Idempotency Key Minimum Length

**Date:** 2026-03-02  
**Status:** Approved  
**Related:** `validateIdempotencyKey` function in `src/validation.js`

## Problem

The current `validateIdempotencyKey` function accepts keys as short as 1 character. A single character provides only ~62 possible values (a-z, A-Z, 0-9), which:
- Exhausts quickly under any real traffic
- Creates security risks through predictable/guessable keys
- Fails to align with real-world idempotency key generators

## Research

Popular ID generators use these lengths:

| Generator | Length | Entropy |
|-----------|--------|---------|
| UUID v4 | 36 chars | 122 bits |
| ULID | 26 chars | 128 bits |
| NanoID (default) | 21 chars | ~126 bits |
| CUID | 25 chars | 160 bits |
| KSUID | 27 chars | 160 bits |

A minimum of 16 characters provides ~95 bits of entropy (base64), sufficient for security while accommodating common generators.

## Solution

Refactor `validateIdempotencyKey` to accept an options object with configurable `minKeyLength`.

### API Changes

**Before:**
```javascript
validateIdempotencyKey(key, maxKeyLength)
```

**After:**
```javascript
validateIdempotencyKey(key, { minKeyLength = 16, maxKeyLength = 255 })
```

### Middleware Options

All middleware (Hono, Express, Fastify) will support:

```javascript
idempotency({
  store,
  minKeyLength: 16,  // NEW: default 16, configurable 1-255
  maxKeyLength: 255  // existing
})
```

### Error Messages

Update validation errors to reflect the configured range:

```
"Idempotency-Key must be between 16-255 characters"
```

### Default Value Rationale

**16 characters** was chosen because it:
- Matches NanoID's widely-adopted default
- Provides ~95 bits of entropy (sufficient for security)
- Accommodates all major ID generators (UUID, ULID, CUID, KSUID)
- Is short enough to not burden clients
- Is long enough to prevent exhaustion attacks

## Implementation Plan

1. Refactor `validateIdempotencyKey` function signature in `src/validation.js`
2. Update all three middleware files to pass `minKeyLength` option
3. Update error message generation to use dynamic range
4. Add/update validation tests in `tests/validation.test.js`
5. Add/update middleware tests in `tests/*-middleware.test.js`
6. Verify 100% test coverage with `npm run test:verify-coverage`

## Files to Modify

- `src/validation.js` - Core validation logic
- `src/hono-middleware.js` - Hono middleware
- `src/express-middleware.js` - Express middleware  
- `src/fastify-middleware.js` - Fastify middleware
- `tests/validation.test.js` - Validation tests
- `tests/hono-middleware.test.js` - Hono middleware tests
- `tests/express-middleware.test.js` - Express middleware tests
- `tests/fastify-middleware.test.js` - Fastify middleware tests
