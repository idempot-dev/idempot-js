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
  defaultOptions,
  conflictErrorResponse,
  keyValidationErrorResponse,
  missingKeyResponse
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
 * @param {number} [opts.minKeyLength=21] - Minimum key length (default: 21 for nanoid)
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
  validateIdempotencyOptions(opts);
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
    const requestMeta = new WeakMap();
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
          .header("Content-Type", "application/problem+json")
          .send(missingKeyResponse());
      }
      return;
    }

    const keyValidation = validateIdempotencyKey(key, {
      minKeyLength: opts.minKeyLength,
      maxKeyLength: opts.maxKeyLength
    });
    if (!keyValidation.valid) {
      return reply
        .code(400)
        .header("Content-Type", "application/problem+json")
        .send(keyValidationErrorResponse(keyValidation.error));
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
      const status = /** @type {409|422} */ (conflict.status);
      const errorMsg = /** @type {string} */ (conflict.error);
      return reply
        .code(status)
        .header("Content-Type", "application/problem+json")
        .send(conflictErrorResponse(status, errorMsg));
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

      requestMeta.set(request, { idempotencyKey: key });

      const originalSend = reply.send.bind(reply);
      let capturedBody = "";

      reply.send = (payload) => {
        capturedBody =
          typeof payload === "string" ? payload : JSON.stringify(payload);
        const meta = requestMeta.get(request);
        meta.idempotencyBody = capturedBody;
        requestMeta.set(request, meta);
        return originalSend(payload);
      };

      reply.then(
        () => {
          const meta = requestMeta.get(request);
          if (meta?.idempotencyKey) {
            resilientStore
              .complete(meta.idempotencyKey, {
                status: reply.statusCode,
                headers: Object.fromEntries(
                  Object.entries(reply.getHeaders()).map(([k, v]) => [
                    k,
                    String(v)
                  ])
                ),
                body: meta.idempotencyBody || ""
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
