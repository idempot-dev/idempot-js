import { generateFingerprint } from "./fingerprint.js";
import { validateExcludeFields } from "./validation.js";
import { withResilience } from "./resilience.js";
import { DEFAULT_OPTIONS } from "./default-options.js";

/**
 * @typedef {import("./store/interface.js").IdempotencyStore} IdempotencyStore
 * @typedef {import("./resilience.js").ResilienceOptions} ResilienceOptions
 */

/**
 * @typedef {Object} ExpressIdempotencyOptions
 * @property {boolean} [required]
 * @property {number} [ttlMs]
 * @property {string[]} [excludeFields]
 * @property {IdempotencyStore} [store]
 * @property {number} [maxKeyLength]
 * @property {ResilienceOptions} [resilience]
 */

/**
 * Express middleware for idempotency
 * @param {ExpressIdempotencyOptions} [options]
 * @returns {(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => Promise<void>}
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

  return async (req, res, next) => {
    const method = req.method;

    if (method !== "POST" && method !== "PATCH") {
      next();
      return;
    }

    const HEADER_NAME = "Idempotency-Key";
    const key = req.headers[HEADER_NAME.toLowerCase()];

    if (key !== undefined) {
      if (key.length === 0 || key.length > opts.maxKeyLength) {
        res.status(400).json({
          error: `Idempotency-Key must be between 1-${opts.maxKeyLength} characters`
        });
        return;
      }

      const bodyText = req.body 
        ? (typeof req.body === "string" ? req.body : JSON.stringify(req.body))
        : "";
      const fingerprint = await generateFingerprint(bodyText, opts.excludeFields);

      let lookup;
      try {
        lookup = await resilientStore.lookup(key, fingerprint);
      } catch {
        res.status(503).json({ error: "Service temporarily unavailable" });
        return;
      }

      if (lookup.byKey?.status === "processing") {
        res.status(409).json({
          error: "A request with this idempotency key is already being processed"
        });
        return;
      }

      if (lookup.byFingerprint && lookup.byFingerprint.key !== key) {
        res.status(409).json({
          error: "This request was already processed with a different idempotency key"
        });
        return;
      }

      if (lookup.byKey && lookup.byKey.fingerprint !== fingerprint) {
        res.status(422).json({
          error: "Idempotency key reused with different request payload"
        });
        return;
      }

      if (lookup.byKey?.status === "complete" && lookup.byKey.response) {
        const cached = lookup.byKey.response;
        res.status(cached.status);
        for (const [key, value] of Object.entries(cached.headers)) {
          res.set(key, value);
        }
        res.set("x-idempotent-replayed", "true");
        res.send(cached.body);
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
        /** @type {string} */
        let capturedBody = "";

        res.send = (/** @type {any} */ body) => {
          capturedBody = typeof body === "string" ? body : JSON.stringify(body);
          return originalSend(body);
        };

        next();

        res.on("finish", async () => {
          try {
            await resilientStore.complete(key, {
              status: res.statusCode,
              headers: Object.fromEntries(
                Object.entries(res.getHeaders()).map(([k, v]) => [k, /** @type {string} */ (v)])
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
      return;
    }

    if (opts.required) {
      res.status(400).json({ error: "Idempotency-Key header is required" });
      return;
    }

    next();
  };
}
