# Learn

Idempotency is essential for reliable distributed systems. When networks fail and clients retry requests, idempotency prevents duplicate transactions—no double charges, no duplicate orders.

## Key Concepts

### Why Idempotency Matters

Every API that processes payments, creates orders, or modifies state needs idempotency. Without it, network failures and client retries create duplicate transactions. **[Learn why →](/learn/why)**

### Duplicated vs Repeated Operations

Idempotency protects against duplicates from retries while allowing legitimate repeated operations. Use a different idempotency key for each distinct business operation. **[Learn the difference →](/learn/duplicated-vs-repeated)**

### Client Key Strategies

How should you generate idempotency keys? Learn patterns for managing keys in your client applications. **[See strategies →](/learn/client-key-strategies)**

### IETF Specification

This library implements the IETF draft standard for idempotency keys. Understanding the spec helps you implement idempotency correctly and interoperate with other systems. **[Read the spec compliance guide →](/learn/spec)**

## What You'll Learn

- The problem duplicates create in distributed systems
- How the idempotency-key pattern works
- What the IETF specification requires
- Implementation details for each requirement
