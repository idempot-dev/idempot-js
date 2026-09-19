/**
 * Shared request fixtures for the e2e benchmark modules: one canonical
 * payload shape and body factory so every framework benchmarks the same
 * request, and a settle() helper for middleware whose record completion
 * runs fire-and-forget after the response arrives.
 */

export const BASE_BODY = {
  orderId: "ord-2026-000001",
  amount: 4999,
  currency: "usd",
  items: [{ sku: "SKU-001", qty: 1 }]
};

export const BASE_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json"
};

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
 * Settle delay for beforeAll hooks whose middleware completes the
 * idempotency record fire-and-forget (express res.on("finish"), fastify
 * reply.then()), so the priming request's store write can land just
 * after the response arrives. A short sleep (outside the timed region)
 * keeps the repeat-key task on the cached-replay path from its first
 * iteration. Not needed by the bun harness, whose wrapper awaits
 * store.complete() inside the handler.
 */
export function settle(ms = 50) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
