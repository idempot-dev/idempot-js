/**
 * Cloudflare Workers KV Store Example
 * 
 * This demonstrates the API pattern for Cloudflare Workers.
 * To run locally, use Miniflare or Wrangler dev.
 * 
 * Usage with wrangler.toml:
 * kv_namespaces = [{ binding = "IDEMPOTENCY", id = "your-kv-namespace-id" }]
 * 
 * Run with: npx wrangler dev examples/cloudflare-kv-app.js
 * Or deploy: npx wrangler deploy examples/cloudflare-kv-app.js
 */

import { Hono } from "hono";
import { idempotency } from "../src/hono-middleware.js";
import { CloudflareKvIdempotencyStore } from "../src/store/cloudflare-kv.js";

const app = new Hono();

app.use("*", async (c, next) => {
  c.res.headers.set("Access-Control-Allow-Origin", "*");
  await next();
});

// Note: In Workers, the store is initialized at startup with the KV binding
// The KV binding (c.env.IDEMPOTENCY) is available at runtime
const store = new CloudflareKvIdempotencyStore({ kv: c.env.IDEMPOTENCY });

app.use("/api/*", idempotency({ store }));

app.post("/api/data", async (c) => {
  const body = await c.req.json();
  return c.json({ received: body, timestamp: Date.now() });
});

export default app;
