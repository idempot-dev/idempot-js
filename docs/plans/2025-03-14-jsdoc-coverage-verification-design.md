# JSDoc Coverage Verification Design

**Date:** 2025-03-14
**Status:** Approved

## Summary

Add static analysis to verify all public API surfaces have complete JSDoc documentation, enforced via ESLint in CI.

## Problem

The library needs to maintain consistent JSDoc coverage on all public exports. Currently there's no automated enforcement, making it easy for undocumented exports to slip through code review.

## Solution

Use `eslint-plugin-jsdoc` with the existing ESLint setup to enforce JSDoc requirements on all exported functions, classes, and their parameters/returns.

## Scope

**What's checked:**
- All exports from package index files
- All exported functions require JSDoc
- All function parameters require `@param`
- All returning functions require `@returns`

**What's not checked:**
- Test files
- Internal (non-exported) functions
- Constructors (redundant with `@param`)

## Implementation

### Dependencies

Add to `package.json` devDependencies:
- `eslint-plugin-jsdoc` - JSDoc linting rules

### ESLint Configuration

Update `eslint.config.js`:

```javascript
import jsdoc from "eslint-plugin-jsdoc";

export default [
  // ... existing config ...
  {
    files: ["packages/*/src/**/*.js"],
    plugins: { jsdoc },
    rules: {
      "jsdoc/require-jsdoc": ["error", {
        publicOnly: true,
        require: { FunctionDeclaration: true, MethodDefinition: true, ClassDeclaration: true },
        checkConstructors: false,
        checkGetters: false,
      }],
      "jsdoc/require-param": ["error", { checkConstructors: false }],
      "jsdoc/require-returns": ["error", { checkConstructors: false }],
    },
  },
];
```

### CI Integration

No changes needed - the existing `npm run lint` command will enforce JSDoc coverage.

**Failure example:**
```
packages/stores/redis/src/index.js
  27:1  error  Missing JSDoc comment  jsdoc/require-jsdoc
  46:10 error  Missing @param "key"    jsdoc/require-param
```

## Files to Change

1. `package.json` - Add eslint-plugin-jsdoc dependency
2. `eslint.config.js` - Add jsdoc rules configuration
3. Source files with missing JSDoc - Add documentation

## Verification

1. `npm run lint` passes with new rules
2. `npm run test:verify-coverage` still passes (100% coverage maintained)

## Alternatives Considered

1. **Custom verification script** - Full control over export scope, but higher maintenance burden.
2. **TypeScript with tsc --declaration** - Would require project migration from JavaScript.

## Risks

- **Initial violation count** - May be many missing JSDoc blocks to fix up front.
- **False positives** - Overly strict rules could slow development. Mitigated by scoping to exports only.

## Success Criteria

- All exports have JSDoc comments
- All function parameters documented with `@param`
- All function returns documented with `@returns`
- `npm run lint` passes
- CI enforces coverage on all future PRs