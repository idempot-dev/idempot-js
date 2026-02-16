/** @typedef {import("./types.js").IdempotencyOptions} IdempotencyOptions */

import { generateFingerprint } from "./fingerprint.js";
import { validateExcludeFields } from "./validation.js";
import { withResilience } from "./resilience.js";

/** @type {Required<IdempotencyOptions>} */
const DEFAULT_OPTIONS = {
  required: false,
  ttlMs: 86400000, // 24 hours
  excludeFields: [],
  store: /** @type {any} */ (null),
  headerName: "idempotency-key",
  maxKeyLength: 255
};

/**
 * @param {IdempotencyOptions} [options]
 * @returns {import("hono").MiddlewareHandler}
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

  const middleware = async (c, next) => {
    const method = c.req.method;

    // Only intercept POST and PATCH
    if (method !== "POST" && method !== "PATCH") {
      await next();
      return;
    }

    const key = c.req.header(opts.headerName);

    // Check if key provided and validate
    if (key !== undefined) {
      // Key was provided, must be valid
      if (key.length === 0 || key.length > opts.maxKeyLength) {
        return c.json(
          {
            error: `Idempotency-Key must be between 1-${opts.maxKeyLength} characters`
          },
          400
        );
      }
      // Key is valid, implement idempotency logic

      // Read body and generate fingerprint
      const body = await c.req.text();
      const fingerprint = await generateFingerprint(body, opts.excludeFields);

      // Lookup in store
      let lookup;
      try {
        lookup = await resilientStore.lookup(key, fingerprint);
      } catch {
        return c.json(
          { error: "Service temporarily unavailable" },
          503
        );
      }

      // Existing record being processed - reject concurrent request
      if (lookup.byKey?.status === "processing") {
        return c.json(
          {
            error:
              "A request with this idempotency key is already being processed"
          },
          409
        );
      }

      // Same fingerprint, different key - duplicate operation
      if (lookup.byFingerprint && lookup.byFingerprint.key !== key) {
        return c.json(
          {
            error:
              "This request was already processed with a different idempotency key"
          },
          409
        );
      }

      // Same key, different fingerprint - payload mismatch
      if (lookup.byKey && lookup.byKey.fingerprint !== fingerprint) {
        return c.json(
          { error: "Idempotency key reused with different request payload" },
          422
        );
      }

      // Existing complete record - replay
      if (lookup.byKey?.status === "complete" && lookup.byKey.response) {
        const cached = lookup.byKey.response;
        return c.body(cached.body, /** @type {any} */ (cached.status), {
          ...cached.headers,
          "x-idempotent-replayed": "true"
        });
      }

      // No existing record - process new request
      if (!lookup.byKey && !lookup.byFingerprint) {
        try {
          await resilientStore.startProcessing(key, fingerprint, opts.ttlMs);
        } catch {
          return c.json(
            { error: "Service temporarily unavailable" },
            503
          );
        }

        // Call handler
        await next();

        // Clone response to cache it
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

        // Return original response
        return;
      }

      // TODO: Handle other conflict cases
      await next();
      return;
    }

    // Key not provided
    if (opts.required) {
      return c.json({ error: "Idempotency-Key header is required" }, 400);
    }

    // Optional and not provided, pass through
    await next();
  };

  middleware.circuit = circuit;

  return middleware;
}
