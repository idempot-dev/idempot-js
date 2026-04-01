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

This library uses JavaScript with JSDoc comments for type information. Enable `allowJs` in your TypeScript configuration to use these types directly—no separate .d.ts files needed.

To use this library in a TypeScript project:

1. Add these settings to your `tsconfig.json`:

   ```json
   {
     "allowJs": true,
     "checkJs": true
   }
   ```

2. Import the library as you normally would:

   ```typescript
   import { idempotency } from "@idempot/core";
   ```

3. JSDoc comments provide full type safety: parameter types, return types, and detailed documentation in your IDE.

This approach simplifies maintenance while giving TypeScript users an excellent developer experience.

## License

BSD-3-Clause
