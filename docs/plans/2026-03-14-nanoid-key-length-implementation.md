# Nanoid Key Length Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Change default minKeyLength from 16 to 21, enforce minimum of 21

**Architecture:** Update default-options.js, add validation in validation.js to reject minKeyLength < 21, update docs

**Tech Stack:** JavaScript (ESM), Node.js test runner

---

### Task 1: Update Default Options

**Files:**
- Modify: `packages/core/src/default-options.js:38`

**Step 1: Change default minKeyLength**

```javascript
/** Minimum allowed length for the Idempotency-Key header value. Default is 21 characters (nanoid default). */
minKeyLength: 21,
```

**Step 2: Commit**

```bash
git add packages/core/src/default-options.js
git commit -m "feat(core): update default minKeyLength to 21 (nanoid default)"
```

---

### Task 2: Add Validation for minKeyLength

**Files:**
- Modify: `packages/core/src/validation.js`
- Test: `packages/core/tests/validation.test.js`

**Step 1: Read current validation.js to find where to add check**

```bash
cat packages/core/src/validation.js
```

**Step 2: Write failing test**

Add to validation tests:

```javascript
test("validateIdempotencyKey - rejects minKeyLength below 21", (t) => {
  const result = validateIdempotencyKey("any-key", { minKeyLength: 20, maxKeyLength: 255 });
  assert.strictEqual(result.valid, false);
  assert.match(result.error, /minKeyLength must be at least 21/);
});
```

**Step 3: Run test to verify it fails**

```bash
npm test -- packages/core/tests/validation.test.js --test-name-pattern="rejects minKeyLength below 21"
```
Expected: FAIL

**Step 4: Add validation in validation.js**

Find the validateIdempotencyKey function and add check after destructuring:

```javascript
if (minKeyLength < 21) {
  return {
    valid: false,
    error: "minKeyLength must be at least 21 (nanoid default)"
  };
}
```

**Step 5: Run test to verify it passes**

```bash
npm test -- packages/core/tests/validation.test.js --test-name-pattern="rejects minKeyLength below 21"
```
Expected: PASS

**Step 6: Commit**

```bash
git add packages/core/src/validation.js packages/core/tests/validation.test.js
git commit -m "feat(validation): enforce minKeyLength minimum of 21"
```

---

### Task 3: Update README.md

**Files:**
- Modify: `README.md`

**Step 1: Update key requirements section (lines 89-101)**

Change:
- "16–255 characters" → "21–255 characters (nanoid default)"
- "minKeyLength: 8" → "minKeyLength: 21"

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): update key length to 21-255 characters"
```

---

### Task 4: Update ARCHITECTURE.md

**Files:**
- Modify: `ARCHITECTURE.md`

**Step 1: Update Key Length Requirements section (lines 216-223)**

Change:
- "Default 16-255" → "Default 21-255 (nanoid default)"
- "16 characters" → "21 characters"
- "16-255 character range" → "21-255 character range"

**Step 2: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs(architecture): update key length requirements"
```

---

### Task 5: Run Full Test Suite

**Step 1: Run tests**

```bash
npm test
```
Expected: ALL PASS

**Step 2: Verify coverage**

```bash
npm run test:verify-coverage
```
Expected: PASS with 100% coverage

**Step 3: Build**

```bash
npm run build
```
Expected: No errors

---

### Task 6: Final Commit

**Step 1: Summary commit if needed**

If any additional changes were made, commit them:

```bash
git add -A
git commit -m "feat: update minKeyLength to 21 (nanoid default)"
```
