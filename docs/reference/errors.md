---
title: Error Reference - idempot-js
description: Complete reference for RFC 9457 compliant error responses including all error types, field descriptions, and examples.
---

# Error Reference

idempot-js returns [RFC 9457](https://datatracker.ietf.org/doc/html/rfc9457) compliant error responses for all error conditions. This standard format makes errors machine-readable and provides clear guidance for both human developers and AI agents.

## Response Format

All error responses include these fields:

| Field             | Type      | Description                                            |
| ----------------- | --------- | ------------------------------------------------------ |
| `type`            | `string`  | URI identifying the error type                         |
| `title`           | `string`  | Short, human-readable summary                          |
| `detail`          | `string`  | Detailed explanation of what happened                  |
| `status`          | `number`  | HTTP status code                                       |
| `instance`        | `string`  | Unique identifier for this error occurrence (UUID)     |
| `retryable`       | `boolean` | Whether retrying the request might succeed             |
| `idempotency_key` | `string`  | The idempotency key from the request (when applicable) |

### Instance ID

The `instance` field contains a unique identifier in the format `urn:uuid:<uuid>`. Use this when contacting support or debugging issues:

```json
{
  "instance": "urn:uuid:550e8400-e29b-41d4-a716-446655440000"
}
```

### Retryable Flag

The `retryable` field indicates whether the error might be transient:

- `retryable: true` - Wait and retry the request. Errors like concurrent processing (409) or store unavailability (503) may resolve on retry.
- `retryable: false` - Correct the issue before retrying. Errors like missing keys (400) or key reuse (422) require client-side changes.

## Error Types

### 400 Bad Request

**Missing Idempotency-Key**

Returned when the `Idempotency-Key` header is required but not provided.

```json
{
  "type": "https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07#section-2.1",
  "title": "Idempotency-Key is missing",
  "detail": "This operation is idempotent and it requires correct usage of Idempotency Key.",
  "status": 400,
  "instance": "urn:uuid:abc123...",
  "retryable": false
}
```

**Invalid Key Format**

Returned when the key fails validation (too short, too long, or contains commas).

```json
{
  "type": "https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07#section-2.1",
  "title": "Invalid Idempotency-Key",
  "detail": "Idempotency key must be between 21 and 255 characters",
  "status": 400,
  "instance": "urn:uuid:def456...",
  "retryable": false,
  "idempotency_key": "short"
}
```

**How to fix:**

- Generate keys using any of these libraries (21+ characters):
  - **UUID v4** - Universally unique identifier (36 characters)
  - **nanoid** - 21 characters by default, collision-resistant
  - **ULID** - Sortable, lexicographically ordered identifiers
- Ensure keys don't contain commas
- Keys must be between 21-255 characters

### 409 Conflict

**Concurrent Request Processing**

Returned when a request with the same idempotency key is already being processed.

```json
{
  "type": "https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07#section-2.6",
  "title": "A request is outstanding for this Idempotency-Key",
  "detail": "A request with this idempotency key is already being processed",
  "status": 409,
  "instance": "urn:uuid:ghi789...",
  "retryable": true,
  "idempotency_key": "my-key-123"
}
```

**How to fix:**

- Wait briefly and retry with the same idempotency key
- The first request will complete and be cached
- Subsequent retries will return the cached response

**Fingerprint Conflict**

Returned when a different idempotency key was used for the same request payload.

```json
{
  "type": "https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07#section-2.2",
  "title": "Fingerprint conflict",
  "detail": "This request was already processed with a different idempotency key",
  "status": 409,
  "instance": "urn:uuid:jkl012...",
  "retryable": false,
  "idempotency_key": "different-key"
}
```

**How to fix:**

- Use the same idempotency key for identical requests
- This prevents accidental duplicate processing
- If intentional, the response shows the original was already handled

### 422 Unprocessable Content

**Key Reuse with Different Payload**

Returned when an idempotency key is reused with a different request body.

```json
{
  "type": "https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07#section-2.2",
  "title": "Idempotency-Key is already used",
  "detail": "Idempotency key reused with different request payload",
  "status": 422,
  "instance": "urn:uuid:mno345...",
  "retryable": false,
  "idempotency_key": "reused-key"
}
```

**How to fix:**

- Generate a new unique idempotency key for different requests
- Idempotency keys must uniquely identify both the operation AND the payload
- This prevents accidental reuse of keys across different operations

### 503 Service Unavailable

**Store Unavailable**

Returned when the idempotency store is temporarily unavailable (circuit breaker open or connection failed).

```json
{
  "type": "https://js.idempot.dev/problems#store-unavailable",
  "title": "Service temporarily unavailable",
  "detail": "The idempotency store is temporarily unavailable. Please retry.",
  "status": 503,
  "instance": "urn:uuid:pqr678...",
  "retryable": true
}
```

**How to fix:**

- Wait and retry the request
- The circuit breaker will test recovery automatically
- Check store health (database connections, Redis availability, etc.)

## Content Negotiation

Request different response formats using the `Accept` header:

### JSON Format

```bash
curl -X POST http://localhost:3000/orders \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"item": "widget"}'
```

Returns `application/json` content type with the same body structure.

### Problem Details Format (Default)

```bash
curl -X POST http://localhost:3000/orders \
  -H "Accept: application/problem+json" \
  -H "Content-Type: application/json" \
  -d '{"item": "widget"}'
```

Returns `application/problem+json` content type (RFC 9457 standard).

### Markdown Format (AI-Friendly)

```bash
curl -X POST http://localhost:3000/orders \
  -H "Accept: text/markdown" \
  -H "Content-Type: application/json" \
  -d '{"item": "widget"}'
```

Returns `text/markdown` with YAML frontmatter containing all fields and human-readable guidance. Ideal for:

- AI agents parsing error responses
- Log analysis tools
- Documentation generation

## Type URIs

Error `type` URIs follow this pattern:

- **Spec errors:** `https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07#section-X.Y`
- **Infrastructure errors:** `https://js.idempot.dev/problems#<error-name>`

The spec errors reference the IETF draft document. Infrastructure errors use the project's own URI space for implementation-specific issues.

## Handling Errors

```javascript
const response = await fetch("/orders", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Idempotency-Key": key
  },
  body: JSON.stringify(data)
});

if (!response.ok) {
  const error = await response.json();

  if (error.retryable) {
    // Wait and retry
    await delay(1000);
    return retryRequest();
  }

  // Log for debugging
  console.error(`Error ${error.status}: ${error.title}`, {
    instance: error.instance,
    detail: error.detail
  });

  throw new Error(error.detail);
}
```

## Debugging with Instance IDs

When reporting issues or debugging:

1. Capture the `instance` field from the error response
2. Include it in support requests
3. Use it to correlate logs across distributed systems
4. The UUID format ensures global uniqueness

Example support request:

> "We're seeing 409 errors for key `order-123`. Instance ID: `urn:uuid:550e8400-e29b-41d4-a716-446655440000`"
