# Examples

This directory contains example applications demonstrating various ways to use the `idempot` middleware with different storage backends and deployment environments.

## Overview

The examples showcase:

- **Multiple Storage Backends**: SQLite, Redis, DynamoDB, PostgreSQL, Cloudflare KV
- **Deployment Patterns**: Node.js servers, AWS Lambda, Deno, Bun
- **Idempotency Features**: Optional/required keys, field exclusions, custom headers

## Quick Start

All examples follow a similar pattern. To run any example:

1. **Install dependencies** (from project root):
   ```bash
   npm install
   ```

2. **Run the example** (example-specific setup may be required):
   ```bash
   node examples/basic-app.js
   ```

## Example Files

### Node.js Server Examples

| File | Storage | Description |
|------|---------|-------------|
| `basic-app.js` | SQLite (in-memory) | Basic Node.js server with SQLite, demonstrating optional/required keys and field exclusions |
| `sqlite-app.js` | SQLite (file-based) | Node.js server with persistent SQLite storage |
| `bun-sqlite-app.js` | SQLite (file-based) | Bun runtime with SQLite storage |
| `redis-app.js` | Redis | Node.js server with Redis persistence (requires Redis server) |
| `postgres-app.js` | PostgreSQL | Node.js server with PostgreSQL persistence |
| `dynamodb-app.js` | DynamoDB | Node.js server with AWS DynamoDB persistence |

### Deno Examples

| File | Storage | Description |
|------|---------|-------------|
| `deno-sqlite-app.ts` | SQLite (file-based) | Deno runtime with SQLite storage |
| `deno-redis-app.ts` | Redis | Deno runtime with Redis persistence |

### AWS Lambda Examples

| File | Storage | Description |
|------|---------|-------------|
| `lambda-apigateway-dynamodb.js` | DynamoDB | Lambda + API Gateway with DynamoDB persistence |
| `lambda-apigateway-redis.js` | Redis | Lambda + API Gateway with Redis persistence |
| `lambda-url-dynamodb.js` | DynamoDB | Lambda Function URLs with DynamoDB persistence |
| `lambda-url-redis.js` | Redis | Lambda Function URLs with Redis persistence |

### Cloudflare Examples

| File | Storage | Description |
|------|---------|-------------|
| `cloudflare-kv-app.js` | Cloudflare KV | Cloudflare Workers with KV storage |

### Setup Scripts

| File | Description |
|------|-------------|
| `postgres-setup.sh` | SQL script to create PostgreSQL tables for idempotency records |

## Running Examples

### Basic SQLite Example (Node.js)

```bash
node examples/basic-app.js
```

Then test with curl:

```bash
# Create order (optional idempotency-key)
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -H "idempotency-key: order-123" \
  -d '{"item": "widget", "quantity": 5}'

# Replay - same key and body returns cached response
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -H "idempotency-key: order-123" \
  -d '{"item": "widget", "quantity": 5}'
```

### Redis Example (Node.js)

Requires a Redis server running locally or via environment variables:

```bash
# Start Redis (if not running)
redis-server

# Run the example
node examples/redis-app.js
```

Environment variables:
- `REDIS_HOST` (default: localhost)
- `REDIS_PORT` (default: 6379)
- `REDIS_PASSWORD`

### Deno Example

```bash
deno run --allow-all examples/deno-sqlite-app.ts
```

### Bun Example

```bash
bun run examples/bun-sqlite-app.js
```

### AWS Lambda Example

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Package and deploy** using your preferred tool (SAM, CDK, Serverless Framework, Terraform)

3. **Configure environment variables**:
   - `AWS_REGION` (default: us-east-1)
   - `IDEMPOTENCY_TABLE` (default: idempotency-records)

4. **Ensure DynamoDB table exists** with the correct schema (see DynamoDB setup docs)

## Storage Backend Setup

### SQLite

No setup required - SQLite databases are created automatically.

### Redis

Ensure Redis server is accessible. For local development:

```bash
# Install and start Redis
brew install redis
redis-server
```

### PostgreSQL

Run the setup script to create the required table:

```bash
psql -d your_database -f examples/postgres-setup.sh
```

### DynamoDB

Create a DynamoDB table with:
- Table name: `idempotency-records` (or custom via `IDEMPOTENCY_TABLE`)
- Primary key: `idempotency_key` (String)
- TTL attribute: `expiration` (Number)

### Cloudflare KV

Requires a Cloudflare Workers project with KV namespace binding.

## Feature Demonstrations

### Optional vs Required Idempotency Keys

- **Optional**: All endpoints accept requests with or without `idempotency-key` header
- **Required**: Configure middleware with `required: true` for sensitive operations

### Field Exclusions

Exclude specific fields from the idempotency fingerprint:

```javascript
idempotency({
  store,
  excludeFields: ["timestamp", "$.metadata.requestId"]
})
```

### Custom Header Names

Override the default `Idempotency-Key` header:

```javascript
idempotency({
  store,
  headerName: "X-Idempotency-Key"
})
```
