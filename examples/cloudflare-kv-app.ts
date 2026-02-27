/**
 * Cloudflare Workers KV Store Example
 * 
 * This demonstrates the API pattern for Cloudflare Workers.
 * To run locally, use Miniflare or Wrangler dev.
 * 
 * Usage with wrangler.toml:
 * kv_namespaces = [{ binding = "IDEMPOTENCY", id = "your-kv-namespace-id" }]
 * 
 * Run with: npx wrangler dev examples/cloudflare-kv-app.ts
 * Or deploy: npx wrangler deploy examples/cloudflare-kv-app.ts
 */

import { Hono } from "hono";
import { idempotency } from "../src/middleware.js";
import { CloudflareKvIdempotencyStore } from "../src/store/cloudflare-kv.js";

const app = new Hono<{ Bindings: { IDEMPOTENCY: any } }>();

app.use("*", async (c, next) => {
  c.res.headers.set("Access-Control-Allow-Origin", "*");
  await next();
});

const store = new CloudflareKvIdempotencyStore({ kv: c.env.IDEMPOTENCY });

app.use("/api/*", idempotency({ store }));

app.post("/api/data", async (c) => {
  const body = await c.req.json();
  return c.json({ received: body, timestamp: Date.now() });
});

export default app;
