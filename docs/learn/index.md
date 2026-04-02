# Learn

Understanding idempotency is essential for building reliable distributed systems. When networks fail and retries happen, idempotency ensures your API behaves correctly—no double charges, no duplicate orders.

## Key Concepts

### Why Idempotency Matters

Every API that processes payments, creates orders, or modifies state needs idempotency. Without it, network failures and client retries create duplicate transactions. **[Learn why →](/learn/why)**

### IETF Specification

This library implements the IETF draft standard for idempotency keys. Understanding the spec helps you implement idempotency correctly and interoperate with other systems. **[Read the spec compliance guide →](/learn/spec)**

## What You'll Learn

- The problem duplicates create in distributed systems
- How the idempotency-key pattern works
- What the IETF specification requires
- How idempot-js implements each requirement
