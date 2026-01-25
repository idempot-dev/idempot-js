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

    // Check if header is required
    if (opts.required && !key) {
      return c.json(
        { error: "Idempotency-Key header is required" },
        400
      );
    }

    // If no key and optional, pass through
    if (!key) {
      await next();
      return;
    }

    // TODO: Implement idempotency logic
    await next();
  };
}
