import { generateFingerprint } from "./fingerprint.js";
import { validateExcludeFields } from "./validation.js";
import { withResilience } from "./resilience.js";
import { DEFAULT_OPTIONS } from "./default-options.js";

/**
 * @typedef {import("./store/interface.js").IdempotencyStore} IdempotencyStore
 * @typedef {import("./resilience.js").ResilienceOptions} ResilienceOptions
 * @typedef {import("./default-options.js").IdempotencyOptions} IdempotencyOptions
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
 * @param {IdempotencyOptions} [options]
 * @returns {(c: any, next: any) => Promise<void>}
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

  /**
   * @param {any} c
   * @param {() => Promise<void>} next
   */
  const middleware = async (c, next) => {
    const method = c.req.method;
    if (method !== "POST" && method !== "PATCH") {
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

    if (key.length === 0 || key.length > opts.maxKeyLength) {
      return c.json(
        {
          error: `Idempotency-Key must be between 1-${opts.maxKeyLength} characters`
        },
        400
      );
    }

    const body = await c.req.text();
    const fingerprint = await generateFingerprint(body, opts.excludeFields);

    let lookup;
    try {
      lookup = await resilientStore.lookup(key, fingerprint);
    } catch {
      return c.json({ error: "Service temporarily unavailable" }, 503);
    }

    if (lookup.byKey?.status === "processing") {
      return c.json(
        {
          error:
            "A request with this idempotency key is already being processed"
        },
        409
      );
    }

    if (lookup.byFingerprint && lookup.byFingerprint.key !== key) {
      return c.json(
        {
          error:
            "This request was already processed with a different idempotency key"
        },
        409
      );
    }

    if (lookup.byKey && lookup.byKey.fingerprint !== fingerprint) {
      return c.json(
        { error: "Idempotency key reused with different request payload" },
        422
      );
    }

    if (lookup.byKey?.status === "complete" && lookup.byKey.response) {
      const cached = lookup.byKey.response;
      return c.body(cached.body, cached.status, {
        ...cached.headers,
        "x-idempotent-replayed": "true"
      });
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
