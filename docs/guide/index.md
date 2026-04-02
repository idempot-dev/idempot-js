# Guide

idempot-js ships with production-ready defaults so you can focus on your application, not infrastructure configuration.

## Philosophy: Secure by Default

The library enforces sensible defaults that prioritize security and reliability:

### Required Idempotency Keys

By default, the middleware rejects requests without an `Idempotency-Key` header. This prevents accidental non-idempotent operations and ensures every mutating request is protected.

### Key Length Validation

Keys must be 21-255 characters. The 21-character minimum matches nanoid's default length, providing sufficient entropy to prevent collision attacks. The 255-character maximum prevents abuse through oversized keys.

### 24-Hour Retention

Idempotency records expire after 24 hours. This balances storage costs against the practical usefulness of replay protection—long enough for genuine retries, short enough to avoid indefinite state accumulation.

### Built-in Resilience

Every store operation includes:

- **Circuit breaker** - Trips after 50% error rate, recovers after 30 seconds
- **Automatic retries** - Up to 3 attempts with 100ms backoff
- **Operation timeout** - 500ms limit per store call

These defaults protect your application from cascading failures when the backing store experiences issues.

### Spec Compliance

All behaviors conform to the [IETF Idempotency-Key Header draft specification](/learn/spec). You get interoperable, standards-based idempotency without reading RFCs.

## Next Steps

**[Installation](/guide/installation)** - Add idempot-js to your project
