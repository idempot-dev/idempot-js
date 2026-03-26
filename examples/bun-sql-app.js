import { Hono } from "hono";
import { idempotency } from "../packages/frameworks/hono/index.js";
import { BunSqlIdempotencyStore } from "../packages/stores/bun-sql/index.js";
import { ulid } from "ulid";

const DATABASE_URL = process.env.DATABASE_URL || "sqlite://:memory:";

const app = new Hono();
const store = new BunSqlIdempotencyStore(DATABASE_URL);

const dbType = DATABASE_URL.includes("postgres")
  ? "PostgreSQL"
  : DATABASE_URL.includes("mysql")
    ? "MySQL"
    : "SQLite";

app.post("/orders", idempotency({ store }), async (c) => {
  const body = await c.req.json();
  const orderId = ulid();

  console.log(`Creating order: ${orderId}`);

  return c.json(
    {
      id: orderId,
      status: "created",
      ...body
    },
    201
  );
});

export default {
  port: 3000,
  fetch: app.fetch
};

console.log("Server running at http://localhost:3000");
console.log(`Using ${dbType} storage`);
console.log(`DATABASE_URL: ${DATABASE_URL}`);
console.log("");
console.log("Try these requests:");
console.log("");
console.log("# Create order (optional idempotency-key)");
console.log("curl -X POST http://localhost:3000/orders \\");
console.log('  -H "Content-Type: application/json" \\');
console.log('  -H "idempotency-key: order-123" \\');
console.log('  -d \'{"item": "widget", "quantity": 5}\'');
console.log("");
console.log("# Replay - same key and body returns cached response");
console.log("curl -X POST http://localhost:3000/orders \\");
console.log('  -H "Content-Type: application/json" \\');
console.log('  -H "idempotency-key: order-123" \\');
console.log('  -d \'{"item": "widget", "quantity": 5}\'');
console.log("");
console.log("# Environment variables:");
console.log("#   DATABASE_URL=sqlite://:memory:   # SQLite (default)");
console.log("#   DATABASE_URL=postgres://...       # PostgreSQL");
console.log("#   DATABASE_URL=mysql://...         # MySQL");
console.log("");

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Closing database...");
  store.close();
  process.exit(0);
});
