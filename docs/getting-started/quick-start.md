# Quick Start

## Express Example

```javascript
import express from "express";
import { idempotency } from "@idempot/express-middleware";
import { SqliteIdempotencyStore } from "@idempot/sqlite-store";

const app = express();
const store = new SqliteIdempotencyStore({ path: ":memory:" });

app.use(express.json());

app.post("/orders", idempotency({ store }), async (req, res) => {
  const orderId = crypto.randomUUID();
  res.status(201).json({ id: orderId, ...req.body });
});

app.listen(3000);
```
