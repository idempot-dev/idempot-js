# Idempotency Key Length: Update to Nanoid Default

**Date:** 2026-03-14  
**Status:** Pending Approval

## Problem

Current default `minKeyLength` is 16 characters. Nanoid's default is 21 characters, which is widely adopted. Users generating keys with nanoid need 21 characters by default.

## Solution

Change default `minKeyLength` from 16 to 21, with validation preventing configuration below 21.

## Changes

### 1. Default Options
- `minKeyLength`: 16 → 21

### 2. Validation
- Add check in `validateIdempotencyKey` to reject `minKeyLength < 21`
- Error: `"minKeyLength must be at least 21 (nanoid default)"`

### 3. API

```javascript
idempotency({
  store,
  minKeyLength: 21  // Cannot configure below 21
})
```

## Files to Modify

- `packages/core/src/default-options.js`
- `packages/core/src/validation.js`
- `README.md`
- `ARCHITECTURE.md`

## Verification

- Run tests: `npm test`
- Verify coverage: `npm run test:verify-coverage`
- Build: `npm run build`
