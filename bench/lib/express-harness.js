import express from "express";
import { idempotency } from "../../packages/frameworks/express/index.js";

const BASE_BODY = {
  orderId: "ord-2026-000001",
  amount: 4999,
  currency: "usd",
  items: [{ sku: "SKU-001", qty: 1 }]
};

const BASE_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json"
};

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
  await new Promise((resolve) => server.on("listening", resolve));
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
 * Settle delay for express beforeAll hooks: the express middleware
 * completes the idempotency record via res.on("finish") fire-and-forget,
 * so the priming request's store write can land just after the response
 * arrives. A short sleep (outside the timed region) keeps the repeat-key
 * task on the cached-replay path from its first iteration.
 */
export function settle(ms = 50) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
