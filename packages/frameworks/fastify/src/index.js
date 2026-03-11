import {
  generateFingerprint,
  validateExcludeFields,
  validateIdempotencyKey,
  checkLookupConflicts,
  shouldProcessRequest,
  getCachedResponse,
  prepareCachedResponse,
  withResilience,
  defaultOptions
} from "@idempot/core";

const HEADER_NAME = "idempotency-key";

/**
 * @typedef {import("@idempot/core/store/interface.js").IdempotencyRecord} IdempotencyRecord
 * @typedef {import("@idempot/core/store/interface.js").IdempotencyStore} IdempotencyStore
 * @typedef {import("@idempot/core/resilience.js").ResilienceOptions} ResilienceOptions
 * @typedef {import("@idempot/core/default-options.js").IdempotencyOptions} IdempotencyOptions
 */

/**
 * Fastify middleware for idempotency
 * @param {Object} opts - Middleware options
 * @param {IdempotencyStore} opts.store - Storage backend
 * @param {string} [opts.headerName="Idempotency-Key"] - Header name
 * @param {number} [opts.maxKeyLength=255] - Maximum key length
 * @param {number} [opts.minKeyLength=16] - Minimum key length (default: 16 for entropy)
 * @returns {(request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => Promise<void>}
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
  const store = opts.store;
  const { store: resilientStore, circuit } = withResilience(
    store,
    opts.resilience
  );

  /**
   * @param {import("fastify").FastifyRequest} request
   * @param {import("fastify").FastifyReply} reply
   */
  const middleware = async (request, reply) => {
    const method = request.method;
    if (!shouldProcessRequest(method)) {
      return;
    }

    /**
     * Fastify returns duplicate headers as a comma-separated string per RFC 7230.
     * The TypeScript type is string | string[] for compatibility, but Fastify
     * normalizes to a single string at runtime.
     */
    const key = /** @type {string} */ (request.headers[HEADER_NAME]);
    if (key === undefined) {
      if (opts.required) {
        return reply
          .code(400)
          .send({ error: "Idempotency-Key header is required" });
      }
      return;
    }

    const keyValidation = validateIdempotencyKey(key, {
      minKeyLength: opts.minKeyLength,
      maxKeyLength: opts.maxKeyLength
    });
    if (!keyValidation.valid) {
      return reply.code(400).send({ error: keyValidation.error });
    }

    const bodyText = request.body
      ? typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body)
      : "";
    const fingerprint = await generateFingerprint(bodyText, opts.excludeFields);

    let lookup;
    try {
      lookup = await resilientStore.lookup(key, fingerprint);
    } catch {
      return reply.code(503).send({ error: "Service temporarily unavailable" });
    }

    const conflict = checkLookupConflicts(lookup, key, fingerprint);
    if (conflict.conflict) {
      return reply.code(/** @type {number} */ (conflict.status)).send({ error: conflict.error });
    }

    const cached = getCachedResponse(lookup);
    if (cached) {
      const response = prepareCachedResponse(cached);
      reply.code(response.status);
      for (const [headerKey, value] of Object.entries(response.headers)) {
        reply.header(headerKey, /** @type {string} */ (value));
      }
      return reply.send(response.body);
    }

    if (!lookup.byKey && !lookup.byFingerprint) {
      try {
        await resilientStore.startProcessing(key, fingerprint, opts.ttlMs);
      } catch {
        return reply
          .code(503)
          .send({ error: "Service temporarily unavailable" });
      }

      /** @type {any} */ (request).idempotencyKey = key;

      const originalSend = reply.send.bind(reply);
      reply.send = (/** @type {any} */ payload) => {
        const capturedBody =
          typeof payload === "string" ? payload : JSON.stringify(payload);
        /** @type {any} */ (request).idempotencyBody = capturedBody;
        return originalSend(payload);
      };

      reply.then(
        () => {
          const req = /** @type {any} */ (request);
          if (req.idempotencyKey) {
            resilientStore
              .complete(req.idempotencyKey, {
                status: reply.statusCode,
                headers: Object.fromEntries(
                  Object.entries(reply.getHeaders()).map(([k, v]) => [
                    k,
                    String(v)
                  ])
                ),
                body: req.idempotencyBody || ""
              })
              .catch((err) => {
                console.error("Failed to cache response:", err);
              });
          }
        },
        () => {}
      );
    }
  };

  middleware.circuit = circuit;
  return middleware;
}
