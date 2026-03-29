# @idempot/core

**Internal shared package. Do not use directly.**

This package contains framework-agnostic idempotency logic used internally by framework adapters and storage backends. It is published as a transitive dependency only.

## For End Users

You should not install or import from this package directly. Instead, use the framework and store packages:

```bash
# Correct: Install framework and store packages
npm install @idempot/hono-middleware @idempot/sqlite-store

# Incorrect: Do not install core directly
npm install @idempot/core  # ❌
```

```javascript
// Correct: Import from framework package
import { idempotency } from "@idempot/hono-middleware";

// Incorrect: Do not import from core
import { generateFingerprint } from "@idempot/core"; // ❌
```

## For Package Maintainers

Framework adapters and storage backends depend on this package for:

- Request fingerprinting (`generateFingerprint`)
- Validation logic (`validateIdempotencyKey`, `checkLookupConflicts`)
- Resilience patterns (`withResilience`)
- Default configuration (`defaultOptions`)
- Store interface definition (`IdempotencyStore`)

### Design Constraints

This package **must not** export anything intended for direct user consumption. All exports are for internal use by:

1. Framework adapters (`@idempot/hono-middleware`, `@idempot/express-middleware`, `@idempot/fastify-middleware`)
2. Storage backends (`@idempot/sqlite-store`, `@idempot/redis-store`, etc.)

TypeScript types are bundled into framework and store packages, so users can access them without importing from core.

## License

BSD-3-Clause
