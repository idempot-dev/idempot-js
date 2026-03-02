import { generateFingerprint } from "./fingerprint.js";
import {
  validateExcludeFields,
  validateIdempotencyKey,
  checkLookupConflicts,
  shouldProcessRequest,
  getCachedResponse,
  prepareCachedResponse
} from "./validation.js";
import { withResilience } from "./resilience.js";
import { DEFAULT_OPTIONS } from "./default-options.js";

const HEADER_NAME = "idempotency-key";

/**
 * Fastify middleware for idempotency
 * @param {Object} opts - Middleware options
 * @param {IdempotencyStore} opts.store - Storage backend
 * @param {string} [opts.headerName="Idempotency-Key"] - Header name
 * @param {number} [opts.maxKeyLength=255] - Maximum key length
 * @param {number} [opts.minKeyLength=16] - Minimum key length (default: 16 for entropy)
 * @returns {(request: any, reply: any) => Promise<void>}
 */
export function idempotency(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
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

  const middleware = async (request, reply) => {
    const method = request.method;
    if (!shouldProcessRequest(method)) {
      return;
    }

    const key = request.headers[HEADER_NAME];
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
      return reply.code(conflict.status).send({ error: conflict.error });
    }

    const cached = getCachedResponse(lookup);
    if (cached) {
      const response = prepareCachedResponse(cached);
      reply.code(response.status);
      for (const [headerKey, value] of Object.entries(response.headers)) {
        reply.header(headerKey, value);
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

      request.idempotencyKey = key;

      const originalSend = reply.send.bind(reply);
      reply.send = (payload) => {
        const capturedBody =
          typeof payload === "string" ? payload : JSON.stringify(payload);
        request.idempotencyBody = capturedBody;
        return originalSend(payload);
      };

      reply.then(
        () => {
          if (request.idempotencyKey) {
            resilientStore
              .complete(request.idempotencyKey, {
                status: reply.statusCode,
                headers: Object.fromEntries(
                  Object.entries(reply.getHeaders()).map(([k, v]) => [k, v])
                ),
                body: request.idempotencyBody || ""
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
