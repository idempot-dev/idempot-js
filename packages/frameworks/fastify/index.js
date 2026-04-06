/**
 * @typedef {import("@idempot/core").IdempotencyRecord} IdempotencyRecord
 * @typedef {import("@idempot/core").IdempotencyStore} IdempotencyStore
 * @typedef {import("@idempot/core").ResilienceOptions} ResilienceOptions
 * @typedef {import("@idempot/core").IdempotencyOptions} IdempotencyOptions
 */

import { randomUUID } from "node:crypto";
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
  missingKeyResponse,
  storeUnavailableResponse,
  selectResponseFormat,
  formatAsMarkdown
} from "@idempot/core";

const HEADER_NAME = "idempotency-key";

/**
 * Send error response in appropriate format based on Accept header
 * @param {import("fastify").FastifyReply} reply - Fastify reply
 * @param {number} status - HTTP status code
 * @param {Object} problem - RFC 9457 problem details
 * @returns {import("fastify").FastifyReply}
 */
function sendErrorResponse(reply, status, problem) {
  const acceptHeader = reply.request.headers["accept"] || "";
  const format = selectResponseFormat(acceptHeader);

  if (format === "text/markdown") {
    return reply
      .code(status)
      .header("Content-Type", "text/markdown; charset=utf-8")
      .send(formatAsMarkdown(problem));
  } else {
    const contentType =
      format === "application/problem+json"
        ? "application/problem+json"
        : "application/json";

    return reply
      .code(status)
      .header("Content-Type", `${contentType}; charset=utf-8`)
      .send(problem);
  }
}

/**
 * Generate unique instance identifier
 * @returns {string} URI in the format urn:uuid:<uuid>
 */
function generateInstanceId() {
  return `urn:uuid:${randomUUID()}`;
}

/**
 * Fastify middleware for idempotency
 * @param {Object} opts - Middleware options
 * @param {IdempotencyStore} opts.store - Storage backend
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
  const { minKeyLength, maxKeyLength } = opts;
  const { store: resilientStore, circuit } = withResilience(
    store,
    opts.resilience
  );

  const middleware = async (request, reply) => {
    const requestMeta = new WeakMap();
    const method = request.method;
    if (!shouldProcessRequest(method)) {
      return;
    }

    const key = /** @type {string} */ (request.headers[HEADER_NAME]);
    const instanceId = generateInstanceId();

    if (key === undefined) {
      if (opts.required) {
        const problem = missingKeyResponse({
          status: 400,
          instance: instanceId
        });
        return sendErrorResponse(reply, 400, problem);
      }
      return;
    }

    const keyValidation = validateIdempotencyKey(key, {
      minKeyLength,
      maxKeyLength
    });
    if (!keyValidation.valid) {
      const problem = keyValidationErrorResponse(
        /** @type {string} */ (keyValidation.error),
        {
          status: 400,
          instance: instanceId,
          idempotencyKey: key
        }
      );
      return sendErrorResponse(reply, 400, problem);
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
      const problem = storeUnavailableResponse({
        status: 503,
        instance: instanceId
      });
      return sendErrorResponse(reply, 503, problem);
    }

    const conflict = checkLookupConflicts(lookup, key, fingerprint);
    if (conflict.conflict) {
      const problem = conflictErrorResponse(
        /** @type {number} */ (conflict.status),
        /** @type {string} */ (conflict.error),
        {
          instance: instanceId,
          idempotencyKey: key
        }
      );
      return sendErrorResponse(
        reply,
        /** @type {number} */ (conflict.status),
        problem
      );
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
        const problem = storeUnavailableResponse({
          status: 503,
          instance: instanceId
        });
        return sendErrorResponse(reply, 503, problem);
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
