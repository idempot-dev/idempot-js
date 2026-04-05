---
title: Installation - idempot-js
description: Install idempotency middleware for Express, Fastify, or Hono. Choose from Redis, PostgreSQL, MySQL, SQLite, or Bun SQL storage backends. Supports Node.js, Bun, and Deno.
---

# Installation

## Requirements

- Node.js 18+, Bun, or Deno
- Any package manager (npm, yarn, pnpm)

## Combinations

You can use any combination of runtime, framework, and store:

| Runtime | Frameworks             | Stores                                    |
| ------- | ---------------------- | ----------------------------------------- |
| Node.js | Express, Fastify, Hono | Redis, PostgreSQL, MySQL, SQLite          |
| Bun     | Express, Fastify, Hono | Redis, PostgreSQL, MySQL, SQLite, Bun SQL |
| Deno    | Hono                   | Redis, PostgreSQL, MySQL, SQLite          |

<sup>1</sup> Express and Fastify require Node.js runtime APIs. Hono is cross-platform and works on all supported runtimes.

### Bun SQL Recommendation

When using Bun with SQL-based stores (PostgreSQL, MySQL, SQLite), we recommend `@idempot/bun-sql-store`. It uses Bun's native SQL implementation, which is significantly faster than library-based alternatives.

## Install

### Framework

Choose one:

```bash
npm install @idempot/express-middleware
npm install @idempot/fastify-middleware
npm install @idempot/hono-middleware
```

### Store

Choose one:

```bash
npm install @idempot/redis-store
npm install @idempot/postgres-store
npm install @idempot/mysql-store
npm install @idempot/sqlite-store
npm install @idempot/bun-sql-store
```
