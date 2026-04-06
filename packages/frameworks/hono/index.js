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
 * Send error response in appropriate format based on Accept header
 * @param {import("hono").Context} c - Hono context
 * @param {number} status - HTTP status code
 * @param {Object} problem - RFC 9457 problem details
 * @returns {import("hono").Response}
 */
function sendErrorResponse(c, status, problem) {
  const acceptHeader = c.req.header("accept") || "";
  const format = selectResponseFormat(acceptHeader);

  if (format === "text/markdown") {
    return c.text(formatAsMarkdown(problem), status, {
      "Content-Type": "text/markdown; charset=utf-8"
    });
  } else {
    const contentType =
      format === "application/problem+json"
        ? "application/problem+json"
        : "application/json";

    return c.json(problem, status, {
      "Content-Type": `${contentType}; charset=utf-8`
    });
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
 * Hono middleware for idempotency
 * @param {Object} opts - Middleware options
 * @param {IdempotencyStore} opts.store - Storage backend
 * @param {number} [opts.maxKeyLength=255] - Maximum key length
 * @param {number} [opts.minKeyLength=21] - Minimum key length (default: 21 for nanoid)
 * @returns {(c: import("hono").Context, next: () => Promise<void>) => Promise<void>}
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

  const middleware = async (c, next) => {
    const method = c.req.method;
    if (!shouldProcessRequest(method)) {
      await next();
      return;
    }

    const key = c.req.header(HEADER_NAME);
    const instanceId = generateInstanceId();

    if (key === undefined) {
      if (opts.required) {
        const problem = missingKeyResponse({
          status: 400,
          instance: instanceId
        });
        return sendErrorResponse(c, 400, problem);
      }
      await next();
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
      return sendErrorResponse(c, 400, problem);
    }

    const body = await c.req.text();
    const fingerprint = await generateFingerprint(body, opts.excludeFields);

    let lookup;
    try {
      lookup = await resilientStore.lookup(key, fingerprint);
    } catch {
      const problem = storeUnavailableResponse({
        status: 503,
        instance: instanceId
      });
      return sendErrorResponse(c, 503, problem);
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
        c,
        /** @type {number} */ (conflict.status),
        problem
      );
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
        const problem = storeUnavailableResponse({
          status: 503,
          instance: instanceId
        });
        return sendErrorResponse(c, 503, problem);
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
