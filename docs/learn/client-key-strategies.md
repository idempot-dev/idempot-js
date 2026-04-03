# Client Key Strategies

The client generates idempotency keys. Both strategies create a transfer record first:

## Strategy 1: Random Keys

Create a transfer record, generate a random UUID, store it on the record:

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
  idempotency_key: crypto.randomUUID(),
  status: "pending"
});

await fetch("/api/transfers", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Idempotency-Key": transfer.idempotency_key
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

**Benefit**: No coupling between your database IDs and external API contracts — you can change your ID scheme without affecting idempotency.

## Strategy 2: Database ID as Key

Use the transfer's database-generated ID directly:

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
