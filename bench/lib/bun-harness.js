import { idempotency } from "../../packages/frameworks/bun/index.js";
import { BASE_BODY, createBodyFactory } from "./fixtures.js";

export { createBodyFactory };

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
