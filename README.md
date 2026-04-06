# idempot

Idempotency middleware for Hono, Express, and Fastify.

## Features

- Implements the IETF draft [draft-ietf-httpapi-idempotency-key-header-07](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07) specification
- Request fingerprinting for conflict detection
- Built-in resilience: retries, timeouts, circuit breaker
- Modular packages reduce install time and dependencies

## TypeScript Support

This library uses JavaScript with JSDoc comments for type information. Enable `allowJs` in your TypeScript configuration to use these types directly—no separate .d.ts files needed.

To use this library in a TypeScript project:

1. Add these settings to your `tsconfig.json`:

   ```json
   {
     "allowJs": true,
     "checkJs": true
   }
   ```

2. Import the library as you normally would:

   ```typescript
   import { idempotency } from "@idempot/express-middleware";
   ```

3. JSDoc comments provide full type safety: parameter types, return types, and detailed documentation in your IDE.

This approach simplifies maintenance while giving TypeScript users an excellent developer experience.

## Supported Runtimes, Frameworks, and Stores

| Category       | Options                                                             |
| -------------- | ------------------------------------------------------------------- |
| **Runtimes**   | Node.js, Bun, Deno (Lambda & Cloudflare Workers planned)            |
| **Frameworks** | Express, Hono, Fastify                                              |
| **Stores**     | Redis, PostgreSQL, MySQL, SQLite (DynamoDB & Cloudflare KV planned) |

## Response Headers

Duplicate requests return cached responses with `x-idempotent-replayed: true`.

## Error Responses (RFC 9457)

Error responses follow [RFC 9457](https://datatracker.ietf.org/doc/html/rfc9457) (Problem Details for HTTP APIs) and include:

- `type` - URI identifying the problem type
- `title` - Short human-readable summary
- `detail` - Detailed explanation
- `status` - HTTP status code
- `instance` - Unique identifier for this error occurrence
- `retryable` - Whether retrying might succeed
- `idempotency_key` - The idempotency key from the request (when applicable)

### Content Negotiation

The middleware supports content negotiation via the `Accept` header:

**Default (application/problem+json):**

```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"item": "widget"}'
```

Response:

```json
{
  "type": "https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07#section-2.1",
  "title": "Idempotency-Key is missing",
  "detail": "This operation is idempotent and it requires correct usage of Idempotency Key.",
  "status": 400,
  "instance": "urn:uuid:550e8400-e29b-41d4-a716-446655440000",
  "retryable": false
}
```

**Markdown format (for AI agents):**

```bash
curl -X POST http://localhost:3000/orders \
  -H "Accept: text/markdown" \
  -H "Content-Type: application/json" \
  -d '{"item": "widget"}'
```

Response:

```markdown
---
type: "https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07#section-2.1"
status: 400
instance: "urn:uuid:550e8400-e29b-41d4-a716-446655440000"
retryable: false
---

# Idempotency-Key is missing

## What Happened

This operation is idempotent and it requires correct usage of Idempotency Key.

## What You Should Do

**Correct the issue.** This error requires changes to your request. Do not retry with the same idempotency key until the issue is resolved.
```

The markdown format includes YAML frontmatter with all error fields and human-readable guidance for AI agents.

## Quick Start

```bash
npm install @idempot/hono-middleware @idempot/sqlite-store
```

```javascript
import { Hono } from "hono";
import { idempotency } from "@idempot/hono-middleware";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

const app = new Hono();
const store = new SqliteIdempotencyStore({ path: ":memory:" });

app.post("/orders", idempotency({ store }), async (c) => {
  return c.json({ id: "order-123" }, 201);
});
```

## Configuration

The middleware accepts an options object with the following properties:

| Option          | Type               | Default               | Description                                          |
| --------------- | ------------------ | --------------------- | ---------------------------------------------------- |
| `store`         | `IdempotencyStore` | required              | Storage backend (Redis, PostgreSQL, MySQL, SQLite)   |
| `required`      | `boolean`          | `true`                | Whether the `Idempotency-Key` header is required     |
| `ttlMs`         | `number`           | `86400000` (24 hours) | Time-to-live for idempotency records in milliseconds |
| `minKeyLength`  | `number`           | `21`                  | Minimum length for idempotency keys                  |
| `maxKeyLength`  | `number`           | `255`                 | Maximum length for idempotency keys                  |
| `excludeFields` | `string[]`         | `[]`                  | Body fields to exclude from request fingerprint      |
| `resilience`    | `object`           | see below             | Circuit breaker and retry configuration              |

**Resilience options:**

| Option                     | Type     | Default | Description                              |
| -------------------------- | -------- | ------- | ---------------------------------------- |
| `timeoutMs`                | `number` | `500`   | Timeout per store operation              |
| `maxRetries`               | `number` | `3`     | Retry attempts for failed operations     |
| `retryDelayMs`             | `number` | `100`   | Delay between retries                    |
| `errorThresholdPercentage` | `number` | `50`    | Error rate to trigger circuit breaker    |
| `resetTimeoutMs`           | `number` | `30000` | Time before testing recovery             |
| `volumeThreshold`          | `number` | `10`    | Minimum requests before circuit can open |

**Example with custom configuration:**

```javascript
app.post(
  "/orders",
  idempotency({
    store,
    ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    excludeFields: ["timestamp", "$.metadata.requestId"],
    resilience: {
      timeoutMs: 1000,
      maxRetries: 5
    }
  }),
  handler
);
```

Monitor circuit breaker state:

```javascript
const middleware = idempotency({ store });
console.log(middleware.circuit.status); // 'closed', 'open', or 'half-open'
```

See the [full configuration guide](https://js.idempot.dev/guide/configuration) for detailed documentation.

## Examples

See the `examples/` directory for complete examples.

## Changelog

See [GitHub Releases](https://github.com/idempot-dev/idempot-js/releases) for the changelog.

## License

BSD-3
