# JSDoc Coverage Verification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add ESLint rules to enforce JSDoc coverage on all public exports.

**Architecture:** Use eslint-plugin-jsdoc with rules set to "error" from the start. Fix all violations in one pass.

**Tech Stack:** ESLint v10 (flat config), eslint-plugin-jsdoc

---

### Task 1: Add eslint-plugin-jsdoc dependency

**Files:**
- Modify: `package.json`

**Step 1: Install the dependency**

Run: `pnpm add -D eslint-plugin-jsdoc`

Expected: Dependency added to devDependencies, lockfile updated.

**Step 2: Commit**

```bash
git add pnpm-lock.yaml package.json
git commit -m "chore: add eslint-plugin-jsdoc for JSDoc enforcement"
```

---

### Task 2: Update ESLint configuration

**Files:**
- Modify: `eslint.config.js`

**Step 1: Add jsdoc plugin import**

Add at the top of eslint.config.js:

```javascript
import jsdoc from "eslint-plugin-jsdoc";
```

**Step 2: Add jsdoc configuration object**

Add a new config object after `prettier`:

```javascript
{
  files: ["packages/*/src/**/*.js"],
  plugins: { jsdoc },
  rules: {
    "jsdoc/require-jsdoc": [
      "error",
      {
        publicOnly: true,
        require: {
          FunctionDeclaration: true,
          MethodDefinition: true,
          ClassDeclaration: true,
        },
        checkConstructors: false,
        checkGetters: false,
      },
    ],
    "jsdoc/require-param": ["error", { checkConstructors: false }],
    "jsdoc/require-returns": ["error", { checkConstructors: false }],
  },
},
```

**Step 3: Verify config loads**

Run: `npm run lint 2>&1 | head -30`

Expected: Shows JSDoc errors (not config parse errors).

**Step 4: Commit**

```bash
git add eslint.config.js
git commit -m "feat: add JSDoc linting rules for public exports"
```

---

### Task 3: Fix JSDoc violations

**Files:**
- Modify: All source files in `packages/*/src/` with missing JSDoc

**Step 1: List all violations**

Run: `npm run lint 2>&1 | grep "jsdoc/"`

Expected: List of files and line numbers with missing JSDoc.

**Step 2: Fix each file systematically**

For exported functions/classes without JSDoc, add:

```javascript
/**
 * Brief description of what this does
 * @param {Type} paramName - Description
 * @returns {Type} Description
 */
export function myFunction(paramName) { ... }
```

For re-exports (`export { foo } from "./bar.js"`):
- JSDoc is inherited from the source file
- If source has JSDoc, re-export needs nothing
- If source lacks JSDoc, add it to the source

**Step 3: Verify all violations fixed**

Run: `npm run lint`

Expected: Pass with no errors.

**Step 4: Commit**

```bash
git add packages/*/src/
git commit -m "docs: add JSDoc to all public exports"
```

---

### Task 4: Final verification

**Files:**
- None (verification only)

**Step 1: Run lint**

Run: `npm run lint`

Expected: Pass with no errors.

**Step 2: Run test coverage**

Run: `npm run test:verify-coverage`

Expected: Pass with 100% coverage.

**Step 3: Run format check**

Run: `npm run format:check`

Expected: Pass.

**Step 4: Fix formatting if needed**

If format:check fails:

```bash
npm run format
git add .
git commit -m "style: format code"
```

---

## Verification Checklist

- [ ] `eslint-plugin-jsdoc` installed
- [ ] ESLint config updated with jsdoc rules (errors)
- [ ] All exports have JSDoc comments
- [ ] All function parameters have `@param`
- [ ] All function returns have `@returns`
- [ ] `npm run lint` passes
- [ ] `npm run test:verify-coverage` passes
- [ ] `npm run format:check` passes