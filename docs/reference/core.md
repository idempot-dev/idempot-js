# Core API

> **Note:** This package is not intended for direct use by library consumers. It is a transitive dependency of the framework integrations (Express, Fastify, Hono) and stores. You should install one of those instead.

The `@idempot/core` package provides the underlying idempotency implementation. It handles:

- Idempotency key validation and parsing
- Request fingerprinting (hash of method + path + body)
- Response caching and retrieval
- Key generation for clients

## IdempotencyKey

```typescript
class IdempotencyKey {
  constructor(options?: IdempotencyKeyOptions);

  middleware(): (context: Context, next: Next) => Promise<Response>;
}
```

### Options

| Option        | Type   | Default           | Description     |
| ------------- | ------ | ----------------- | --------------- |
| store         | Store  | required          | Storage backend |
| keyHeader     | string | "Idempotency-Key" | Header name     |
| expirySeconds | number | 86400             | Response TTL    |
| hashAlgorithm | string | "xxhash64"        | Key hashing     |

## Store Interface

All stores implement:

```typescript
interface Store {
  get(key: string): Promise<Response | null>;
  set(key: string, response: Response, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
}
```

## Usage

If you're building a new framework integration or store, you'll need `@idempot/core` as a peer dependency:

```javascript
import { IdempotencyKey } from "@idempot/core";

const middleware = new IdempotencyKey({
  store: myCustomStore,
  keyHeader: "Idempotency-Key",
  expirySeconds: 86400
});
```

For regular usage, see the [Express](/frameworks/express), [Fastify](/frameworks/fastify), or [Hono](/frameworks/hono) guides.
