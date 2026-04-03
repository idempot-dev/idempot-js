# Duplicated vs Repeated Operations

Idempotency protects against **duplicated** operations from network retries, while still allowing **repeated** operations—legitimate new requests with the same business parameters.

## The Difference

| Duplicated                                                                            | Repeated                                               |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Same request sent multiple times due to network failures, timeouts, or client retries | New operation that happens to have the same parameters |
| Should return the same response                                                       | Should create a new result                             |
| Protected by idempotency                                                              | Allowed by idempotency                                 |

## Example: Monthly Invoice Payments

Your company pays the same vendor each month:

- **January**: Transfer €100 to DE89370400440532013000 for invoice INV-001
- **February**: Transfer €100 to DE89370400440532013000 for invoice INV-002

Same IBAN, same amount, same currency—but two distinct operations.

### Request Model

```javascript
// POST /api/transfers
{
  "iban": "DE89370400440532013000",
  "amount": 10000,           // cents
  "currency": "EUR",
  "description": "Monthly consulting fee",
  "internal_reason": "invoice-550e8400-e29b-41d4-a716-446655440000"
}
```

The `internal_reason` field uniquely identifies this payment in your system.

## How Idempotency Works

### Duplicated Request (Retry)

```http
POST /api/transfers
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "iban": "DE89370400440532013000",
  "amount": 10000,
  "currency": "EUR",
  "description": "Monthly consulting fee",
  "internal_reason": "invoice-550e8400-e29b-41d4-a716-446655440000"
}
```

Network timeout occurs. Client retries:

```http
POST /api/transfers
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "iban": "DE89370400440532013000",
  "amount": 10000,
  "currency": "EUR",
  "description": "Monthly consulting fee",
  "internal_reason": "invoice-550e8400-e29b-41d4-a716-446655440000"
}
```

**Same key, same body** → server returns cached response. No double payment.

### Repeated Operation (New Invoice)

```http
POST /api/transfers
Idempotency-Key: a1b2c3d4-e5f6-7890-abcd-ef1234567890
Content-Type: application/json

{
  "iban": "DE89370400440532013000",
  "amount": 10000,
  "currency": "EUR",
  "description": "Monthly consulting fee",
  "internal_reason": "invoice-a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Different key, different body** (different `internal_reason`) → server processes as new transfer.

## Client Key Strategies

The client is responsible for generating idempotency keys. Both strategies create a transfer record first, then use its ID:

### Strategy 1: Database ID as Key

Create a transfer record first, use its database-generated ID:

```javascript
// Create transfer record first
const transfer = await db.transfers.create({
  supplier_id: supplierId,
  invoice_id: invoiceId,
  iban,
  amount: 10000,
  currency: "EUR",
  description: "Monthly consulting fee",
  internal_reason: `invoice-${supplierId}-${invoiceId}`,
  status: "pending"
});

// Use transfer ID directly
const idempotencyKey = transfer.id;

await fetch("/api/transfers", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey
  },
  body: JSON.stringify({
    iban: transfer.iban,
    amount: transfer.amount,
    currency: transfer.currency,
    description: transfer.description,
    internal_reason: transfer.internal_reason
  })
});
```

**Benefit**: Single source of truth — the transfer ID is your idempotency key.

### Strategy 2: Prefixed Key

Prefix the database ID for clarity across different operation types:

```javascript
// Create transfer record first
const transfer = await db.transfers.create({
  supplier_id: supplierId,
  invoice_id: invoiceId,
  iban,
  amount: 10000,
  currency: "EUR",
  description: "Monthly consulting fee",
  internal_reason: `invoice-${supplierId}-${invoiceId}`,
  status: "pending"
});

// Prefix for semantic clarity
const idempotencyKey = `transfer-${transfer.id}`;

await fetch("/api/transfers", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey
  },
  body: JSON.stringify({
    iban: transfer.iban,
    amount: transfer.amount,
    currency: transfer.currency,
    description: transfer.description,
    internal_reason: transfer.internal_reason
  })
});
```

**Benefit**: Semantic prefix helps distinguish transfers from refunds, payments, etc. when reviewing logs.

## Server Implementation

```javascript
import { Hono } from "hono";
import { idempotency } from "idempot-js/hono";
import { RedisIdempotencyStore } from "idempot-js/stores/redis";

const app = new Hono();
const store = new RedisIdempotencyStore({ client: redis });

app.post("/api/transfers", idempotency({ store }), async (c) => {
  const { iban, amount, currency, description, internal_reason } =
    await c.req.json();

  // Process transfer - only executed once per unique idempotency key
  const transferId = await processTransfer({
    iban,
    amount,
    currency,
    internal_reason
  });

  return c.json(
    {
      transferId,
      status: "completed",
      internal_reason
    },
    201
  );
});
```

## Summary

| Scenario              | Idempotency Key | Request Body                | Fingerprint | Result          |
| --------------------- | --------------- | --------------------------- | ----------- | --------------- |
| Retry of same request | Same            | Same                        | Same        | Cached response |
| New invoice payment   | Different       | Different `internal_reason` | Different   | New operation   |

The combination of **new key per operation** and **unique `internal_reason` per request body** ensures:

- **Retries are protected** — same key + same body returns cached response
- **New operations are allowed** — different key + different body processes as new request
