import {
  generateFingerprint,
  validateExcludeFields,
  validateIdempotencyKey,
  validateIdempotencyOptions,
  checkLookupConflicts,
  shouldProcessRequest,
  getCachedResponse,
  prepareCachedResponse,
  withResilience,
  defaultOptions
} from "@idempot/core";

/**
 * @typedef {import("@idempot/core/store/interface.js").IdempotencyStore} IdempotencyStore
 * @typedef {import("@idempot/core/resilience.js").ResilienceOptions} ResilienceOptions
 * @typedef {import("@idempot/core/default-options.js").IdempotencyOptions} IdempotencyOptions
 */

/**
 * HTTP header name for idempotency key as defined in
 * https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07
 * @constant
 * @type {string}
 */
const HEADER_NAME = "idempotency-key";

/**
 * Hono middleware for idempotency
 * @param {Object} opts - Middleware options
 * @param {IdempotencyStore} opts.store - Storage backend
 * @param {string} [opts.headerName="Idempotency-Key"] - Header name
 * @param {number} [opts.maxKeyLength=255] - Maximum key length
 * @param {number} [opts.minKeyLength=21] - Minimum key length (default: 21 for nanoid)
 * @returns {(c: any, next: any) => Promise<void>}
 */
export function idempotency(options = {}) {
  const opts = { ...defaultOptions, ...options };
  if (!opts.store) {
    throw new Error(
      "IdempotencyStore must be provided. " +
        "Use SqliteIdempotencyStore({ path: ':memory:' }) for development"
    );
  }
  validateExcludeFields(opts.excludeFields);
  validateIdempotencyOptions(opts);
  const store = opts.store;
  const { store: resilientStore, circuit } = withResilience(
    store,
    opts.resilience
  );

  /**
   * @param {any} c
   * @param {() => Promise<void>} next
   */
  const middleware = async (c, next) => {
    const method = c.req.method;
    if (!shouldProcessRequest(method)) {
      await next();
      return;
    }

    const key = c.req.header(HEADER_NAME);
    if (key === undefined) {
      if (opts.required) {
        return c.json({ error: "Idempotency-Key header is required" }, 400);
      }
      await next();
      return;
    }

    const keyValidation = validateIdempotencyKey(key, {
      minKeyLength: opts.minKeyLength,
      maxKeyLength: opts.maxKeyLength
    });
    if (!keyValidation.valid) {
      return c.json({ error: keyValidation.error }, 400);
    }

    const body = await c.req.text();
    const fingerprint = await generateFingerprint(body, opts.excludeFields);

    let lookup;
    try {
      lookup = await resilientStore.lookup(key, fingerprint);
    } catch {
      return c.json({ error: "Service temporarily unavailable" }, 503);
    }

    const conflict = checkLookupConflicts(lookup, key, fingerprint);
    if (conflict.conflict) {
      return c.json({ error: conflict.error }, conflict.status);
    }

    const cached = getCachedResponse(lookup);
    if (cached) {
      const response = prepareCachedResponse(cached);
      return c.body(response.body, response.status, response.headers);
    }

    if (!lookup.byKey && !lookup.byFingerprint) {
      try {
        await resilientStore.startProcessing(key, fingerprint, opts.ttlMs);
      } catch {
        return c.json({ error: "Service temporarily unavailable" }, 503);
      }

      await next();

      const clonedResponse = c.res.clone();
      const response = {
        status: c.res.status,
        headers: Object.fromEntries(c.res.headers.entries()),
        body: await clonedResponse.text()
      };

      try {
        await resilientStore.complete(key, response);
      } catch (err) {
        console.error("Failed to cache response:", err);
      }

      return;
    }

    await next();
  };

  middleware.circuit = circuit;

  return middleware;
}
