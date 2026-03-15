# SvelteKit Adapter Design

> **Goal:** Create `@idempot/sveltekit-middleware` - an idempotency adapter for SvelteKit

**Architecture:** The adapter exports a `handle` function compatible with SvelteKit's server hooks. Users add it to their `src/hooks.server.ts`. The middleware intercepts POST/PATCH requests, validates idempotency keys, and caches responses. Works with both API routes and form actions.

**Tech Stack:** JavaScript ESM, `@idempot/core`, SvelteKit hooks

---

## Integration Pattern

SvelteKit has no auto-registration mechanism. Users must explicitly create `src/hooks.server.ts`:

```typescript
// src/hooks.server.ts
import { idempotency } from "@idempot/sveltekit-middleware";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

export const handle = idempotency({
  store: new SqliteIdempotencyStore({ path: "./idempotency.db" }),
  // options: headerName, maxKeyLength, minKeyLength, etc.
});
```

---

## Request Flow

1. Client sends POST/PATCH with `Idempotency-Key` header
2. `handle` hook receives `{ event, resolve }`
3. Extract key from `event.request.headers.get("idempotency-key")`
4. Read body via `await event.request.text()`
5. Generate fingerprint, check store
6. If cached: return cached response with `X-Idempotency-Replayed` header
7. If new: call `await resilientStore.startProcessing()`, then `await resolve(event)`
8. Capture response from `resolve(event)`, store in cache, return

This flow works for both:
- API routes (`+server.ts`)
- Form actions (`+page.server.ts`)

---

## API Surface

```javascript
import { idempotency } from "@idempot/sveltekit-middleware";
```

### Options (same as other adapters)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `store` | `IdempotencyStore` | **required** | Storage backend |
| `headerName` | `string` | `"Idempotency-Key"` | Header for idempotency key |
| `maxKeyLength` | `number` | `255` | Maximum key length |
| `minKeyLength` | `number` | `21` | Minimum key length |
| `required` | `boolean` | `false` | Require idempotency key |
| `excludeFields` | `string[]` | `[]` | Body fields to exclude from fingerprint |
| `ttlMs` | `number` | `86400000` | Cache TTL (24 hours) |
| `resilience` | `ResilienceOptions` | `{}` | Retry/circuit breaker options |

### Return value

Returns a SvelteKit `Handle` function with an attached `circuit` property for circuit breaker access:

```typescript
export const handle = idempotency({ store });
handle.circuit // => CircuitBreaker instance
```

---

## Implementation Notes

### Body Reading

SvelteKit's `RequestEvent` provides:
- `event.request.text()` - raw body string
- `event.request.formData()` - FormData (for form actions)
- `event.request.json()` - parsed JSON

For idempotency, we use `text()` to generate consistent fingerprints regardless of content type.

### Response Capture

Unlike Express/Hono where response is a simple object, SvelteKit uses the Web Response API:

```javascript
const response = await resolve(event);
// response is a standard Response object
```

We clone the response to capture the body:

```javascript
const cloned = response.clone();
const body = await cloned.text();
```

### Response Types

The adapter handles both HTML pages and JSON responses. The cached response is returned as-is, preserving content type.

---

## File Structure

```
packages/frameworks/sveltekit/
├── index.js           # Main adapter (idempotency function)
├── package.json       # Package metadata
├── README.md          # Documentation
└── tests/
    └── sveltekit-middleware.test.js
```

---

## Testing Strategy

Reuse existing `framework-adapter-suite.js` test suite:

```javascript
import { runAdapterTests } from "../../../core/tests/framework-adapter-suite.js";
import { idempotency } from "../index.js";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

runAdapterTests({
  name: "sveltekit",
  setup: async () => {
    // Create SvelteKit-like test server
    // Return { mount, request, teardown }
  },
  createMiddleware: (options) => idempotency(options),
});
```

The test harness simulates SvelteKit's `handle` hook behavior without requiring a full SvelteKit app.

---

## Related Files

- `packages/frameworks/express/index.js` - Reference adapter
- `packages/frameworks/hono/index.js` - Reference adapter  
- `packages/core/tests/framework-adapter-suite.js` - Shared test suite
