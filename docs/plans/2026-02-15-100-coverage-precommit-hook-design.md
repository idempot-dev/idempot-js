# 100% Coverage Pre-commit Hook Design

## Overview

Add a pre-commit hook that warns when test coverage drops below 100%, but allows the commit to proceed.

## Components

1. **Husky** — Git hooks manager
   - Install: `npm install -D husky && npx husky init`
   - Creates `.husky/` directory with hook scripts

2. **Coverage check script** (`scripts/check-coverage.js`)
   - Runs `tap --coverage-report=json`
   - Parses `coverage/coverage-final.json`
   - Extracts overall coverage percentage
   - Prints warning if < 100% but exits 0

3. **Pre-commit hook** (`.husky/pre-commit`)
   - Runs `node scripts/check-coverage.js`

## Workflow

```
git commit
  → husky triggers pre-commit
  → check-coverage.js runs tap --coverage-report=json
  → parses coverage/coverage-final.json
  → if coverage >= 100%: exit 0, commit proceeds
  → if coverage < 100%: print warning, exit 0, commit proceeds
```

## Example Output

```
⚠️  Coverage: 98.5% (target: 100%)
   Consider adding tests before reducing coverage.
   Commit allowed.
```

## Acceptance Criteria

- [ ] Husky installed and initialized
- [ ] Pre-commit hook runs on every commit
- [ ] Hook warns when coverage < 100%
- [ ] Hook allows commit regardless of coverage
- [ ] Hook exits cleanly (no errors in git output)
