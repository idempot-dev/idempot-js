import type { MiddlewareHandler } from "hono";
import type { IdempotencyOptions } from "./types.js";

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
      // Key is valid, continue to idempotency logic
      // TODO: Implement idempotency logic
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
