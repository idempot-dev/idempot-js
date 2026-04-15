# @idempot/core

Core idempotency logic for framework adapters and storage backends.

## Usage

Install alongside a framework adapter:

```bash
npm install @idempot/hono-middleware @idempot/sqlite-store
```

```javascript
import { idempotency } from "@idempot/hono-middleware";
```

## For Package Maintainers

Framework adapters and storage backends depend on this package for:

- Request fingerprinting (`generateFingerprint`)
- Validation logic (`validateIdempotencyKey`, `checkLookupConflicts`)
- Resilience patterns (`withResilience`)
- Default configuration (`defaultOptions`)
- Store interface definition (`IdempotencyStore`)

## TypeScript Support

This library uses JavaScript with JSDoc comments for type information. Each package ships `.d.ts` declaration files generated from the JSDoc-annotated source.
TypeScript picks them up automatically via the `types` field in each `package.json`.

```typescript
import { idempotency } from "@idempot/core";
```

The declarations are generated at publish time to ensure types match the published version.

## License

BSD-3-Clause
