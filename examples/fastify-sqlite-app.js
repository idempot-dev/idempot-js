import Fastify from "fastify";
import { idempotency } from "../packages/frameworks/fastify/index.js";
import { SqliteIdempotencyStore } from "../packages/stores/sqlite/index.js";

const fastify = Fastify();
const store = new SqliteIdempotencyStore({ path: "./examples/idempotency.db" });

fastify.register(idempotency, { store });

fastify.post("/orders", async (request, reply) => {
  const orderId = crypto.randomUUID();
  console.log(`Creating order: ${orderId}`);
  return reply
    .code(201)
    .send({ id: orderId, status: "created", ...request.body });
});

fastify.listen({ port: 3000 }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server running at ${address}`);
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
});

process.on("SIGINT", () => {
  console.log("Closing database...");
  store.close();
  process.exit(0);
});
