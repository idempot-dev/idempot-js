/**
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

/**
 * HTTP header name for idempotency key as defined in
 * https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07
 * @constant
 * @type {string}
 */
const HEADER_NAME = "idempotency-key";

/**
 * Build an error Response in the appropriate format based on the Accept header
 * @param {string} acceptHeader - Value of the Accept request header
 * @param {number} status - HTTP status code
 * @param {Object} problem - RFC 9457 problem details
 * @returns {Response}
 */
const buildErrorResponse = (acceptHeader, status, problem) => {
  const format = selectResponseFormat(acceptHeader);

  if (format === "text/markdown") {
    return new Response(formatAsMarkdown(problem), {
      status,
      headers: { "Content-Type": "text/markdown; charset=utf-8" }
    });
  }

  const contentType =
    format === "application/problem+json"
      ? "application/problem+json"
      : "application/json";

  return Response.json(problem, {
    status,
    headers: { "Content-Type": `${contentType}; charset=utf-8` }
  });
};

const generateInstanceId = () => {
  return `urn:uuid:${randomUUID()}`;
};

/**
 * Create an idempotency wrapper for Bun `Request => Response` handlers.
 *
 * Returns a function that wraps a handler with idempotency enforcement.
 * The returned wrapper has a `circuit` property for circuit-breaker monitoring.
 *
 * @example
 * const withIdempotency = idempotency({ store });
 * Bun.serve({
 *   routes: {
 *     "/orders": withIdempotency(async (req) => Response.json({ id: "1" }, { status: 201 })),
 *   }
 * });
 *
 * @param {Object} [options] - Idempotency options
 * @param {IdempotencyStore} options.store - Storage backend
 * @param {number} [options.maxKeyLength=255] - Maximum key length
 * @param {number} [options.minKeyLength=21] - Minimum key length (default: 21 for nanoid)
 * @returns {((handler: (req: Request) => Response | Promise<Response>) => (req: Request) => Response | Promise<Response>) & { circuit: import("opossum").CircuitBreaker | null }}
 */
export const idempotency = (options = {}) => {
  const opts = { ...defaultOptions, ...options };
  if (!opts.store) {
    throw new Error(
      "IdempotencyStore must be provided. " +
        "Use SqliteIdempotencyStore({ path: ':memory:' }) for development"
    );
  }
  validateExcludeFields(opts.excludeFields);
  validateIdempotencyOptions(opts);
  const { minKeyLength, maxKeyLength } = opts;
  const { store: resilientStore, circuit } = withResilience(
    opts.store,
    opts.resilience
  );

  /**
   * @param {(req: Request) => Response | Promise<Response>} handler
   * @returns {(req: Request) => Response | Promise<Response>}
   */
  const wrap = (handler) => {
    const wrappedHandler = async (/** @type {Request} */ req) => {
      if (!shouldProcessRequest(req.method)) {
        return handler(req);
      }

      const key = req.headers.get(HEADER_NAME) ?? undefined;
      const instanceId = generateInstanceId();
      const acceptHeader = req.headers.get("accept") ?? "";

      if (key === undefined) {
        if (opts.required) {
          const problem = missingKeyResponse({
            status: 400,
            instance: instanceId
          });
          return buildErrorResponse(acceptHeader, 400, problem);
        }
        return handler(req);
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
        return buildErrorResponse(acceptHeader, 400, problem);
      }

      const bodyText = await req.text();
      const fingerprint = await generateFingerprint(
        bodyText,
        opts.excludeFields
      );

      let lookup;
      try {
        lookup = await resilientStore.lookup(key, fingerprint);
      } catch {
        const problem = storeUnavailableResponse({
          status: 503,
          instance: instanceId
        });
        return buildErrorResponse(acceptHeader, 503, problem);
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
        return buildErrorResponse(
          acceptHeader,
          /** @type {number} */ (conflict.status),
          problem
        );
      }

      const cached = getCachedResponse(lookup);
      if (cached) {
        const response = prepareCachedResponse(cached);
        return new Response(response.body, {
          status: response.status,
          headers: response.headers
        });
      }

      if (!lookup.byKey && !lookup.byFingerprint) {
        try {
          await resilientStore.startProcessing(key, fingerprint, opts.ttlMs);
        } catch {
          const problem = storeUnavailableResponse({
            status: 503,
            instance: instanceId
          });
          return buildErrorResponse(acceptHeader, 503, problem);
        }

        // Re-create the request so the handler can read the body again
        const replayedReq = new Request(req.url, {
          method: req.method,
          headers: req.headers,
          body: bodyText || undefined
        });

        const response = await handler(replayedReq);

        const responseBody = await response.clone().text();
        /** @type {Record<string, string>} */
        const responseHeaders = {};
        response.headers.forEach((value, headerKey) => {
          responseHeaders[headerKey] = value;
        });

        try {
          await resilientStore.complete(key, {
            status: response.status,
            headers: responseHeaders,
            body: responseBody
          });
        } catch (err) {
          console.error("Failed to cache response:", err);
        }

        return response;
      }

      return handler(req);
    };

    return wrappedHandler;
  };

  wrap.circuit = circuit;

  return wrap;
};
