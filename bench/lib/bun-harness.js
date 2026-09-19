import { idempotency } from "../../packages/frameworks/bun/index.js";

const BASE_BODY = {
  orderId: "ord-2026-000001",
  amount: 4999,
  currency: "usd",
  items: [{ sku: "SKU-001", qty: 1 }]
};

/**
 * Build the bun handler used by the e2e benchmarks, driven in-process by
 * calling the wrapped `Request => Response` handler directly (no socket —
 * same measurement class as the hono and fastify modules). With a store
 * the idempotency wrapper runs before the handler; without one the
 * handler is the like-for-like baseline. Mirrors the README usage
 * (withIdempotency around a Request => Response handler).
 */
export function createHandler(store) {
  const handler = async () => Response.json({ ok: true });
  return store ? idempotency({ store })(handler) : handler;
}

/**
 * Send one request through the wrapped handler and return the HTTP
 * status code. Unlike the express and fastify middleware, the bun
 * wrapper awaits store.complete() inside the handler, so the priming
 * request's record is already stored when send() resolves — no settle
 * delay is needed before the repeat-key timing starts.
 */
export async function send(
  handler,
  { key, body = JSON.stringify(BASE_BODY) } = {}
) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  if (key) {
    headers["Idempotency-Key"] = key;
  }
  const req = new Request("http://localhost/pay", {
    method: "POST",
    headers,
    body
  });
  const res = await handler(req);
  // Drain the body so the Response is fully consumed.
  await res.arrayBuffer();
  return res.status;
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
