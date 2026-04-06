/**
 * @typedef {import("@idempot/core").IdempotencyStore} IdempotencyStore
 * @typedef {import("@idempot/core").ResilienceOptions} ResilienceOptions
 * @typedef {import("@idempot/core").IdempotencyOptions} IdempotencyOptions
 */

// @ts-nocheck
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
 * @param {import("express").Response} res - Express response
 * @param {number} status - HTTP status code
 * @param {Object} problem - RFC 9457 problem details
 */
function sendErrorResponse(res, status, problem) {
  const acceptHeader = res.req.headers["accept"] || "";
  const format = selectResponseFormat(acceptHeader);

  if (format === "text/markdown") {
    res
      .status(status)
      .set("Content-Type", "text/markdown; charset=utf-8")
      .send(formatAsMarkdown(problem));
  } else {
    const contentType =
      format === "application/problem+json"
        ? "application/problem+json"
        : "application/json";

    res
      .status(status)
      .set("Content-Type", `${contentType}; charset=utf-8`)
      .json(problem);
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
 * Express middleware for idempotency
 * @param {Object} opts - Middleware options
 * @param {IdempotencyStore} opts.store - Storage backend
 * @param {number} [opts.maxKeyLength=255] - Maximum key length
 * @param {number} [opts.minKeyLength=21] - Minimum key length (default: 21 for nanoid)
 * @returns {(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => Promise<void>}
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

  const middleware = async (req, res, next) => {
    const method = req.method;
    if (!shouldProcessRequest(method)) {
      next();
      return;
    }

    const key = /** @type {string} */ (req.headers[HEADER_NAME]);
    const instanceId = generateInstanceId();

    if (key === undefined) {
      if (opts.required) {
        const problem = missingKeyResponse({
          status: 400,
          instance: instanceId
        });
        sendErrorResponse(res, 400, problem);
        return;
      }
      next();
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
      sendErrorResponse(res, 400, problem);
      return;
    }

    const bodyText = req.body
      ? typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body)
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
      sendErrorResponse(res, 503, problem);
      return;
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
      sendErrorResponse(res, /** @type {number} */ (conflict.status), problem);
      return;
    }

    const cached = getCachedResponse(lookup);
    if (cached) {
      const response = prepareCachedResponse(cached);
      res.status(response.status);
      for (const [headerKey, value] of Object.entries(response.headers)) {
        res.set(headerKey, value);
      }
      res.send(response.body);
      return;
    }

    if (!lookup.byKey && !lookup.byFingerprint) {
      try {
        await resilientStore.startProcessing(key, fingerprint, opts.ttlMs);
      } catch {
        const problem = storeUnavailableResponse({
          status: 503,
          instance: instanceId
        });
        sendErrorResponse(res, 503, problem);
        return;
      }

      const originalSend = res.send.bind(res);
      let capturedBody = "";

      res.send = (body) => {
        capturedBody = typeof body === "string" ? body : JSON.stringify(body);
        return originalSend(body);
      };

      next();

      res.on("finish", async () => {
        try {
          await resilientStore.complete(key, {
            status: res.statusCode,
            headers: Object.fromEntries(
              Object.entries(res.getHeaders()).map(([k, v]) => [
                k,
                /** @type {string} */ (v)
              ])
            ),
            body: capturedBody
          });
        } catch (err) {
          console.error("Failed to cache response:", err);
        }
      });
      return;
    }

    next();
  };

  middleware.circuit = circuit;

  return middleware;
}
