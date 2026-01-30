# Design: Convert TypeScript to JavaScript with JSDoc

**Date:** 2026-01-30
**Status:** Approved

## Overview

Convert hono-idempotency from TypeScript to JavaScript with JSDoc comments to maintain full TypeScript support for library consumers while achieving:

- **Reduced build complexity** - Eliminate transpilation, ship source directly
- **Better runtime compatibility** - Deno/Bun/Workers can import JS directly
- **Lower contributor barrier** - No TypeScript knowledge required
- **Maintained type safety** - Full TypeScript support via generated `.d.ts` files

## Motivation

As a library (not an application), we want to:
1. Ship source code directly without compilation
2. Support multiple runtimes natively
3. Lower barriers for contributors
4. Maintain excellent TypeScript DX for consumers

This aligns with modern library trends (Vite, Playwright, Astro have made similar moves).

## Type Definition Strategy

**Approach:** JSDoc-only with TypeScript generating `.d.ts` files

Define all types inline in JSDoc comments. TypeScript reads JSDoc and generates type definition files during build, providing a single source of truth.

### Example Conversions

**Interfaces to @typedef:**

```typescript
// BEFORE (types.ts)
export interface IdempotencyRecord {
  key: string;
  fingerprint: string;
  status: "processing" | "complete";
  response?: {
    status: number;
    headers: Record<string, string>;
    body: string;
  };
  expiresAt: number;
}
```

```javascript
// AFTER (types.js)
/**
 * @typedef {Object} IdempotencyRecord
 * @property {string} key
 * @property {string} fingerprint
 * @property {"processing" | "complete"} status
 * @property {{status: number, headers: Record<string, string>, body: string}} [response]
 * @property {number} expiresAt
 */
```

**Type imports:**

```typescript
// BEFORE
import type { IdempotencyOptions } from "./types.js";
```

```javascript
// AFTER
/** @typedef {import("./types.js").IdempotencyOptions} IdempotencyOptions */
```

**Function signatures:**

```javascript
/**
 * @param {import("./types.js").IdempotencyOptions} [options]
 * @returns {import("hono").MiddlewareHandler}
 */
export function idempotency(options = {}) {
  // implementation
}
```

**Classes:**

```javascript
/**
 * @implements {IdempotencyStore}
 */
export class SqliteIdempotencyStore {
  /**
   * @param {{path: string}} options
   */
  constructor(options) {
    /** @type {import("better-sqlite3").Database} */
    this.db = new Database(options.path);
  }

  /**
   * @param {string} key
   * @param {string} fingerprint
   * @returns {Promise<{byKey: IdempotencyRecord | null, byFingerprint: IdempotencyRecord | null}>}
   */
  async lookup(key, fingerprint) {
    // implementation
  }
}
```

## Build Process

**New pipeline:**

1. **Type generation:** `tsc --emitDeclarationOnly` to generate `.d.ts` from JSDoc
2. **Source copying:** Copy `.js` files from `src/` to `dist/`
3. **No transpilation** - Ship source JavaScript directly

**package.json scripts:**

```json
{
  "scripts": {
    "build": "npm run build:types && npm run build:copy",
    "build:types": "tsc --emitDeclarationOnly",
    "build:copy": "cp -r src/* dist/",
    "test": "tap",
    "test:coverage": "tap --coverage-report=html"
  }
}
```

**tsconfig.json:**

```json
{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "declaration": true,
    "declarationMap": true,
    "emitDeclarationOnly": true,
    "outDir": "./dist",
    "maxNodeModuleJsDepth": 0,
    "target": "ESNext",
    "module": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.js"],
  "exclude": ["node_modules", "dist"]
}
```

**Dependencies:**

Remove:
- `tsx` (unnecessary)
- `@typescript-eslint/parser`
- `@typescript-eslint/eslint-plugin`

Keep:
- `typescript` (generates types)
- `@types/*` packages (ambient types)

## Code Conversion Scope

**Convert everything at once** for easier validation:

- All source files in `src/`
- All test files in `test/`
- All examples in `examples/`

Clean cut-over avoids the complexity of a mixed TS/JS codebase.

## Test Strategy

**Keep tap, run JS directly:**

- Convert test files from `.ts` to `.js`
- Run `tap` directly on `.js` files (tsx unnecessary)
- Faster execution, simpler tooling

Update test scripts:

```json
{
  "scripts": {
    "test": "tap",
    "test:coverage": "tap --coverage-report=html",
    "test:bun": "bun test test/bun/",
    "test:lambda": "bun test test/lambda/"
  }
}
```

## ESLint Configuration

Switch from TypeScript ESLint to standard JavaScript:

```javascript
// eslint.config.js
import js from "@eslint/js";
import globals from "globals";
import prettierConfig from "eslint-config-prettier";

export default [
  js.configs.recommended,
  prettierConfig,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    }
  }
];
```

## Migration Checklist

### 1. Preparation
- [ ] Create git branch for conversion
- [ ] Document current test coverage baseline
- [ ] Run full test suite to establish passing state

### 2. Convert Source Files (src/)
- [ ] Rename all `.ts` → `.js`
- [ ] Convert interfaces to `@typedef`
- [ ] Convert `export type` to JSDoc exports
- [ ] Add JSDoc to all class properties and methods
- [ ] Add JSDoc to all exported functions
- [ ] Add JSDoc to function parameters and return types

### 3. Convert Tests
- [ ] Rename `.test.ts` → `.test.js`
- [ ] Add JSDoc where helpful for type safety
- [ ] Update any import paths if needed

### 4. Convert Examples
- [ ] Rename `.ts` → `.js`
- [ ] Update package.json scripts to use `node` instead of `tsx`

### 5. Update Configuration
- [ ] Modify `tsconfig.json` for checkJs + emitDeclarationOnly
- [ ] Update `package.json` scripts (build, test, examples)
- [ ] Create/update ESLint configuration for JavaScript
- [ ] Remove TypeScript-specific dev dependencies
- [ ] Update `.gitignore` if needed

### 6. Validation
- [ ] Run `npm run build` - verify `.d.ts` files generated correctly
- [ ] Run all tests - must pass with same or better coverage
- [ ] Run all examples - verify they execute correctly
- [ ] Test installation in external project - verify types work in VSCode/IDEs
- [ ] Run linting - verify clean
- [ ] Check that imports work in Deno/Bun

### 7. Documentation
- [ ] Update README examples (now show `.js` files)
- [ ] Update CONTRIBUTING.md if it exists
- [ ] Add migration notes to CHANGELOG
- [ ] Update any other docs that reference TypeScript

## Expected Benefits

✅ **No build step for source** - Ship directly, faster development
✅ **Faster tests** - No tsx overhead, native execution
✅ **Lower barrier** - Contributors don't need TypeScript knowledge
✅ **Better runtime compatibility** - Deno/Bun can import directly
✅ **Full TypeScript support maintained** - Generated `.d.ts` files
✅ **Single source of truth** - Types live with code in JSDoc

## Risk Mitigation

**Type Safety:**
TypeScript's `checkJs` validates JSDoc during development and catches type errors during build.

**Consumer Types:**
Generated `.d.ts` files provide identical types. TypeScript consumers face no breaking changes.

**Testing:**
The comprehensive test suite catches conversion issues. Tests run on the actual JavaScript we ship.

**Validation:**
External installation tests verify that types work correctly in consumer projects.

## Implementation Notes

- Keep `.js` extensions in imports (required for ESM)
- Use `/** @type {Type} */` for variable type annotations
- Use `@implements` for classes implementing interfaces
- Use `@param`, `@returns`, `@template` for functions
- Use `[paramName]` for optional properties in JSDoc
- Complex types can reference imported types via `import("./types.js").TypeName`
