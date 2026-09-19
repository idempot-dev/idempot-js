import Fastify from "fastify";
import { idempotency } from "../../packages/frameworks/fastify/index.js";
import { BASE_BODY, createBodyFactory, settle } from "./fixtures.js";

export { createBodyFactory, settle };

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
