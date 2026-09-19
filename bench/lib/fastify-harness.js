import Fastify from "fastify";
import { idempotency } from "../../packages/frameworks/fastify/index.js";

const BASE_BODY = {
  orderId: "ord-2026-000001",
  amount: 4999,
  currency: "usd",
  items: [{ sku: "SKU-001", qty: 1 }]
};

/**
 * Build the fastify app used by the e2e benchmarks, driven in-process via
 * app.inject() (light-my-request — no socket, same measurement class as
 * the hono modules). With a store the idempotency plugin runs as the
 * route's preHandler; without one the app is the like-for-like baseline.
 * Mirrors the integration-test apps (fastify -> preHandler -> handler).
 */
export function createFastifyApp(store) {
  const app = Fastify();
  const options = store ? { preHandler: idempotency({ store }) } : {};
  app.post("/pay", options, async () => ({ ok: true }));
  return app;
}

/**
 * Send one request through the app and return the HTTP status code.
 * app.inject() awaits the full fastify lifecycle; the middleware's
 * store.complete() still runs fire-and-forget from reply.then(), so
 * repeat-key priming needs settle() before timing starts.
 */
export async function send(
  app,
  { key, body = JSON.stringify(BASE_BODY) } = {}
) {
  const res = await app.inject({
    method: "POST",
    url: "/pay",
    payload: body,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(key ? { "Idempotency-Key": key } : {})
    }
  });
  return res.statusCode;
}

/**
 * Unique request-body factory for fresh-key tasks: the middleware
 * rejects a fresh key whose payload fingerprint matches an earlier
 * record (checkLookupConflicts returns 409), so each timed iteration
 * needs both a unique key AND a unique body to exercise the full
 * fingerprint -> lookup -> startProcessing -> handler -> complete chain.
 */
export function createBodyFactory() {
  let counter = 0;
  return () => {
    counter += 1;
    return JSON.stringify({
      ...BASE_BODY,
      orderId: `ord-2026-${String(counter).padStart(6, "0")}`
    });
  };
}

/**
 * Settle delay for fastify beforeAll hooks: the middleware completes the
 * idempotency record via reply.then() fire-and-forget, so the priming
 * request's store write can land just after inject() resolves. A short
 * sleep (outside the timed region) keeps the repeat-key task on the
 * cached-replay path from its first iteration.
 */
export function settle(ms = 50) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
