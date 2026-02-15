# 100% Coverage Pre-commit Hook Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a pre-commit hook that warns when test coverage drops below 100%, but allows the commit to proceed.

**Architecture:** Use Husky to manage git hooks. Create a JavaScript script that runs tap coverage in JSON format, parses the results, and prints a warning if coverage is below 100%.

**Tech Stack:** Husky, Node.js, tap

---

### Task 1: Install and initialize Husky

**Files:**
- Modify: `package.json`
- Create: `.husky/pre-commit`

**Step 1: Install Husky**

Run: `npm install -D husky`
Expected: Package installed successfully

**Step 2: Initialize Husky**

Run: `npx husky init`
Expected: Creates `.husky/` directory and adds prepare script to package.json

---

### Task 2: Create coverage check script

**Files:**
- Create: `scripts/check-coverage.js`

**Step 1: Create scripts directory**

Run: `mkdir -p scripts`
Expected: Directory created

**Step 2: Write coverage check script**

```javascript
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const coverageDir = 'coverage';
const coverageFile = join(coverageDir, 'coverage-final.json');

console.log('Checking test coverage...');

try {
  execSync('tap --coverage-report=json', { stdio: 'inherit' });
} catch (error) {
  console.log('Coverage check failed to run.');
  process.exit(0);
}

if (!existsSync(coverageFile)) {
  console.log('No coverage file found.');
  process.exit(0);
}

const coverage = JSON.parse(readFileSync(coverageFile, 'utf-8'));
const totals = coverage.total;

if (!totals || !totals.pct) {
  console.log('Could not determine coverage percentage.');
  process.exit(0);
}

const percentage = totals.pct;

if (percentage < 100) {
  console.log('');
  console.log(`⚠️  Coverage: ${percentage}% (target: 100%)`);
  console.log('   Consider adding tests before reducing coverage.');
  console.log('   Commit allowed.');
  console.log('');
} else {
  console.log(`✅ Coverage: ${percentage}%`);
}

process.exit(0);
```

**Step 3: Make script executable**

Run: `chmod +x scripts/check-coverage.js`
Expected: Script is now executable

---

### Task 3: Configure pre-commit hook

**Files:**
- Modify: `.husky/pre-commit`

**Step 1: Update pre-commit hook**

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

node scripts/check-coverage.js
```

**Step 2: Make hook executable**

Run: `chmod +x .husky/pre-commit`
Expected: Hook is now executable

---

### Task 4: Test the hook

**Files:**
- No file changes

**Step 1: Run the coverage check manually**

Run: `node scripts/check-coverage.js`
Expected: Prints coverage percentage (should be 100% if all tests pass)

**Step 2: Try a test commit**

Run: `git add -A && git commit -m "test: verify pre-commit hook works"`
Expected: Commit succeeds with coverage warning or success message

---

### Task 5: Commit the changes

**Files:**
- Modified: `package.json`, `.husky/pre-commit`
- Created: `scripts/check-coverage.js`

**Step 1: Stage and commit**

Run: `git add package.json .husky/ scripts/check-coverage.js && git commit -m "feat: add pre-commit hook for 100% coverage warning"`
Expected: Commit successful

---

**Plan complete and saved to `docs/plans/2026-02-15-100-coverage-precommit-hook-implementation.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
