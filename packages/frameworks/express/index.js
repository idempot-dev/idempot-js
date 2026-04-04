/**
 * @typedef {import("@idempot/core").IdempotencyStore} IdempotencyStore
 * @typedef {import("@idempot/core").ResilienceOptions} ResilienceOptions
 * @typedef {import("@idempot/core").IdempotencyOptions} IdempotencyOptions
 */

// @ts-nocheck
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

/**
 * HTTP header name for idempotency key as defined in
 * https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07
 * @constant
 * @type {string}
 */
const HEADER_NAME = "idempotency-key";

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
    if (key === undefined) {
      if (opts.required) {
        res
          .status(400)
          .set("Content-Type", "application/problem+json")
          .json(missingKeyResponse());
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
      res
        .status(400)
        .set("Content-Type", "application/problem+json")
        .json(
          keyValidationErrorResponse(
            /** @type {string} */ (keyValidation.error)
          )
        );
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
      res.status(503).json({ error: "Service temporarily unavailable" });
      return;
    }

    const conflict = checkLookupConflicts(lookup, key, fingerprint);
    if (conflict.conflict) {
      res
        .status(/** @type {number} */ (conflict.status))
        .set("Content-Type", "application/problem+json")
        .json(
          conflictErrorResponse(
            /** @type {number} */ (conflict.status),
            conflict.error
          )
        );
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
        res.status(503).json({ error: "Service temporarily unavailable" });
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
