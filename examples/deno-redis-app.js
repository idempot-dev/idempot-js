import { Hono } from "hono";
import { ulid } from "https://esm.sh/ulid@3";
import { idempotency } from "../packages/frameworks/hono/index.js";
import { RedisIdempotencyStore } from "../packages/stores/redis/deno-redis.js";

const app = new Hono();

app.use(
  "*",
  idempotency({
    store: new RedisIdempotencyStore({
      hostname: Deno.env.get("REDIS_HOST") ?? "127.0.0.1",
      port: parseInt(Deno.env.get("REDIS_PORT") ?? "6379")
    })
  })
);

app.post("/posts", async (c) => {
  const body = await c.req.json();
  return c.json({ id: ulid(), ...body });
});

console.log("Server running at http://localhost:8000");
console.log(
  `Using Redis storage at ${Deno.env.get("REDIS_HOST") ?? "127.0.0.1"}:${Deno.env.get("REDIS_PORT") ?? "6379"}`
);
console.log("");
console.log("Try these requests:");
console.log("");
console.log("# Create post (optional idempotency-key)");
console.log("curl -X POST http://localhost:8000/posts \\");
console.log('  -H "Content-Type: application/json" \\');
console.log('  -H "idempotency-key: post-123" \\');
console.log('  -d \'{"title": "Hello World"}\'');
console.log("");
console.log("# Replay - same key and body returns cached response");
console.log("curl -X POST http://localhost:8000/posts \\");
console.log('  -H "Content-Type: application/json" \\');
console.log('  -H "idempotency-key: post-123" \\');
console.log('  -d \'{"title": "Hello World"}\'');
console.log("");

Deno.serve(app.fetch);
