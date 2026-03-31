# Core API

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
