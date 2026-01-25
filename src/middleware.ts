import type { MiddlewareHandler } from "hono";
import type { IdempotencyOptions } from "./types.js";

export function idempotency(
  options: IdempotencyOptions = {}
): MiddlewareHandler {
  return async (c, next) => {
    // Pass through for now
    await next();
  };
}
