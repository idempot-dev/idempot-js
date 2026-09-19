import express from "express";
import { idempotency } from "../../packages/frameworks/express/index.js";
import {
  BASE_BODY,
  BASE_HEADERS,
  createBodyFactory,
  settle
} from "./fixtures.js";

export { createBodyFactory, settle };

/**
 * Build the express app used by the e2e benchmarks. With a store the
 * idempotency middleware runs before the handler; without one the app is
 * the like-for-like baseline. Mirrors the integration-test apps
 * (express.json() -> idempotency -> handler).
 */
export function createExpressApp(store) {
  const app = express();
  app.use(express.json());
  if (store) {
    app.use(idempotency({ store }));
  }
  app.post("/api", (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

/**
 * Start the app on an ephemeral port and return a fetch-based sender.
 * undici keep-alive reuses the connection across calls, so the timed
 * region measures request -> response, not TCP setup.
 */
export async function startServer(app) {
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    // A listen failure (EACCES, fd exhaustion) must fail the run, not
    // hang the benchmark forever.
    server.once("error", reject);
    server.on("listening", resolve);
  });
  const port = server.address().port;
  const send = async ({ key, body = JSON.stringify(BASE_BODY) } = {}) => {
    const headers = { ...BASE_HEADERS };
    if (key) {
      headers["Idempotency-Key"] = key;
    }
    const res = await fetch(`http://127.0.0.1:${port}/api`, {
      method: "POST",
      headers,
      body
    });
    const status = res.status;
    // Drain the body so undici returns the connection to the pool.
    await res.arrayBuffer();
    return status;
  };
  return { server, port, send };
}

export async function stopServer(server) {
  await new Promise((resolve) => server.close(resolve));
}
