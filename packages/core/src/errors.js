/**
 * Error thrown when two requests race to insert the same idempotency key and
 * the store raises a duplicate-key integrity error. The middleware treats this
 * as a spec-compliant request conflict (409/200) rather than a store outage.
 * @module errors
 */

/**
 * Raised by a store when an insert races an existing idempotency key. Carries
 * the original driver error as `cause` for diagnostics.
 */
export class IdempotencyKeyExistsError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "IdempotencyKeyExistsError";
  }
}
