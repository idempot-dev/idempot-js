# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code), OpenCode (opencode.ai), etc. when working with code in this repository.

## Project Overview

IETF-compliant idempotency middleware for Hono with pluggable storage backends.

**Supported backends:**

- Redis
- DynamoDB
- SQLite
- Bun SQLite

## Development Commands

**Run tests:**

```bash
npm test
```

**Run tests with coverage:**

```bash
npm run test:coverage
```

**Run Bun tests:**

```bash
npm run test:bun
```

**Run Lambda tests:**

```bash
npm run test:lambda
```

**Lint:**

```bash
npm run lint
npm run lint:fix  # auto-fix
```

**Format check:**

```bash
npm run format:check
npm run format  # auto-format
```

**Full check (format + lint):**

```bash
npm run check
```

## Quality Requirements

**All commits must pass tests with 100% code coverage.** Run `npm run test:verify-coverage` before committing.

**Build:**

```bash
npm run build
```

**Examples:**

```bash
npm run example
npm run example:sqlite
npm run example:redis
npm run example:bun
npm run example:bun:sqlite
npm run example:lambda:apigateway
npm run example:lambda:url
```

## Architecture

- **Framework**: Hono v4.11.5 middleware
- **Language**: JavaScript with JSDoc
- **Module System**: ESM (type: "module" in package.json, NodeNext module resolution)
- **Build Output**: `./dist/` (TypeScript compiled to JS + type definitions)

## Project Structure

- `src/index.js` - Main entry point, exports middleware factory
- `src/middleware.js` - Core idempotency middleware implementation
- `src/fingerprint.js` - Request fingerprinting (method, URL, body hash)
- `src/store/interface.js` - Storage backend interface contract
- `src/store/index.js` - Backend registry and factory
- `src/store/redis.js` - Redis storage backend
- `src/store/dynamodb.js` - DynamoDB storage backend
- `src/store/sqlite.js` - SQLite storage backend (better-sqlite3)
- `src/store/bun-sqlite.js` - Bun SQLite storage backend
- `tests/` - Node.js tests (tap)
- `test/bun/` - Bun-specific tests
- `test/lambda/` - Lambda runtime tests
- `examples/` - Usage examples for each backend
