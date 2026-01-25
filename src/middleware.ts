import type { MiddlewareHandler } from "hono";
import type { IdempotencyOptions } from "./types.js";
import { MemoryIdempotencyStore } from "./store/memory.js";
import { generateFingerprint } from "./fingerprint.js";

const DEFAULT_OPTIONS: Required<IdempotencyOptions> = {
  required: false,
  ttlMs: 86400000, // 24 hours
  excludeFields: [],
  store: null as any, // Will be set to MemoryIdempotencyStore
  headerName: "idempotency-key",
  maxKeyLength: 255
};

export function idempotency(
  options: IdempotencyOptions = {}
): MiddlewareHandler {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const store = opts.store ?? new MemoryIdempotencyStore();

  return async (c, next) => {
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
          { error: `Idempotency-Key must be between 1-${opts.maxKeyLength} characters` },
          400
        );
      }
      // Key is valid, implement idempotency logic

      // Read body and generate fingerprint
      const body = await c.req.text();
      const fingerprint = await generateFingerprint(body, opts.excludeFields);

      // Lookup in store
      const lookup = await store.lookup(key, fingerprint);

      // Existing record being processed - reject concurrent request
      if (lookup.byKey?.status === "processing") {
        return c.json(
          { error: "A request with this idempotency key is already being processed" },
          409
        );
      }

      // Same fingerprint, different key - duplicate operation
      if (lookup.byFingerprint && lookup.byFingerprint.key !== key) {
        return c.json(
          { error: "This request was already processed with a different idempotency key" },
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
        return c.body(
          cached.body,
          cached.status as any,
          {
            ...cached.headers,
            "x-idempotent-replayed": "true"
          }
        );
      }

      // No existing record - process new request
      if (!lookup.byKey && !lookup.byFingerprint) {
        await store.startProcessing(key, fingerprint, opts.ttlMs);

        // Call handler
        await next();

        // Clone response to cache it
        const clonedResponse = c.res.clone();
        const response = {
          status: c.res.status,
          headers: Object.fromEntries(c.res.headers.entries()),
          body: await clonedResponse.text()
        };

        await store.complete(key, response);

        // Return original response
        return;
      }

      // TODO: Handle other conflict cases
      await next();
      return;
    }

    // Key not provided
    if (opts.required) {
      return c.json(
        { error: "Idempotency-Key header is required" },
        400
      );
    }

    // Optional and not provided, pass through
    await next();
  };
}
