# AGENTS.md

## Project Overview

IETF-compliant idempotency middleware for Hono with pluggable storage backends.

## Quality Requirements

**All commits must pass tests with 100% code coverage.** Run `npm run test:verify-coverage` before committing.

When trying to learn which lines are uncovered, use `npm run test:coverage`, which will report full coverage details for all files.

**Build:**

```bash
npm run build
```

## Architecture

- **Framework**: Hono v4.11.5 middleware
- **Language**: JavaScript with JSDoc
- **Module System**: ESM (type: "module" in package.json, NodeNext module resolution)
