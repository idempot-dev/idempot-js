# Storage Backends

The idempotency middleware uses a pluggable storage architecture. Choose the backend that fits your runtime and infrastructure.

## Why Pluggable Storage?

Different deployment environments offer different storage options:

- **Serverless** (Cloudflare Workers, AWS Lambda) — KV stores, managed databases
- **Traditional servers** — Redis, PostgreSQL, SQLite
- **Edge runtimes** — Cloudflare KV, Deno KV

This middleware defines a simple interface. Any storage backend can implement it.

## Design Principles

1. **Minimal interface** — Only four methods: `lookup`, `startProcessing`, `complete`, `cleanup`
2. **Idiomatic implementations** — Each store uses its native client or SDK
3. **No locking overhead** — The middleware handles concurrency; stores persist state only
4. **Time-based expiration** — Records expire automatically

## Creating a Custom Store

Implement a class with this interface:

```javascript
/**
 * @typedef {Object} IdempotencyRecord
 * @property {string} key
 * @property {string} fingerprint
 * @property {"processing" | "complete"} status
 * @property {{status: number, headers: Record<string, string>, body: string}} [response]
 * @property {number} expiresAt
 */

/**
 * @typedef {Object} IdempotencyStore
 * @property {(key: string, fingerprint: string) => Promise<{byKey: IdempotencyRecord | null, byFingerprint: IdempotencyRecord | null}>} lookup
 * @property {(key: string, fingerprint: string, ttlMs: number) => Promise<void>} startProcessing
 * @property {(key: string, response: {status: number, headers: Record<string, string>, body: string}) => Promise<void>} complete
 * @property {() => Promise<void>} cleanup
 */
```

### Required Methods

#### lookup(key, fingerprint)

Check for existing idempotency records at the start of each request.

**Parameters:**

- `key` — Idempotency key from the request header
- `fingerprint` — Hash of the request payload

**Returns:** `{ byKey: IdempotencyRecord | null, byFingerprint: IdempotencyRecord | null }`

- `byKey` — Record matching the exact key
- `byFingerprint` — Record matching only the fingerprint (detects key collisions)

**Behavior:**

- Return `null` for both if no record exists
- Filter out expired records (`expiresAt < Date.now()`)
- Delete expired records during lookup

#### startProcessing(key, fingerprint, ttlMs)

Mark that processing has begun when no existing record exists.

**Parameters:**

- `key` — The idempotency key
- `fingerprint` — Hash of the request payload
- `ttlMs` — Time-to-live in milliseconds

**Behavior:**

- Create a new record with `status: "processing"`
- Store the fingerprint for collision detection
- Set expiration based on `ttlMs`

#### complete(key, response)

Store the response after the handler succeeds.

**Parameters:**

- `key` — The idempotency key
- `response` — Object with `{ status, headers, body }`

**Behavior:**

- Update the existing record
- Set `status: "complete"`
- Store the response object

**Errors:** Throw if the record is missing or not in "processing" state.

#### cleanup()

Remove expired records periodically.

**Behavior:**

- Delete records where `expiresAt < Date.now()`
- Skip if the backend handles TTL automatically (e.g., Redis)

### Example

```javascript
/**
 * @implements {IdempotencyStore}
 */
export class MyIdempotencyStore {
  /** @param {MyClient} client */
  constructor(client) {
    this.client = client;
  }

  async lookup(key, fingerprint) {
    // Fetch by key and fingerprint
  }

  async startProcessing(key, fingerprint, ttlMs) {
    // Create processing record
  }

  async complete(key, response) {
    // Update record with response
  }

  async cleanup() {
    // Delete expired records
  }
}
```

## Available Stores

| Store                          | Runtime            | Package                     |
| ------------------------------ | ------------------ | --------------------------- |
| `SqliteIdempotencyStore`       | Node.js            | `better-sqlite3`            |
| `RedisIdempotencyStore`        | Node.js            | `ioredis`                   |
| `DynamoDbIdempotencyStore`     | Node.js / Lambda   | `@aws-sdk/lib-dynamodb`     |
| `PostgresIdempotencyStore`     | Node.js            | `pg`                        |
| `CloudflareKvIdempotencyStore` | Cloudflare Workers | `@cloudflare/workers-types` |

## Usage

```javascript
import { idempotency } from "./src/hono-middleware.js";
import { MyIdempotencyStore } from "./src/store/my-custom-store.js";

const store = new MyIdempotencyStore({
  /* options */
});

app.use("*", idempotency({ store }));
```
