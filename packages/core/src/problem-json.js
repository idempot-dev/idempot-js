/**
 * RFC 9457 Problem Details for HTTP APIs
 * @module problem-json
 */

const SPEC_URL =
  "https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07";

/**
 * @param {number} status - HTTP status code (409 or 422)
 * @param {string} error - Error message
 * @param {Object} options
 * @param {string} options.instance - Unique error instance URI
 * @param {string} [options.idempotencyKey] - The idempotency key from request
 * @returns {Object} RFC 9457 problem response
 */
export function conflictErrorResponse(status, error, options = {}) {
  const { instance, idempotencyKey } = options;
  const isConcurrent = error.includes("already being processed");

  const response = {
    type: `${SPEC_URL}#section-${status === 409 && isConcurrent ? "2.6" : "2.2"}`,
    title: isConcurrent
      ? "A request is outstanding for this Idempotency-Key"
      : status === 409
        ? "Fingerprint conflict"
        : "Idempotency-Key is already used",
    detail: error,
    status,
    instance,
    retryable: isConcurrent
  };

  if (idempotencyKey !== undefined) {
    response.idempotency_key = idempotencyKey;
  }

  return response;
}

/**
 * @param {Object} options
 * @param {number} options.status - HTTP status code
 * @param {string} options.instance - Unique error instance URI
 * @returns {Object} RFC 9457 problem response
 */
export function missingKeyResponse(options = {}) {
  const { status, instance } = options;

  return {
    type: `${SPEC_URL}#section-2.1`,
    title: "Idempotency-Key is missing",
    detail:
      "This operation is idempotent and it requires correct usage of Idempotency Key.",
    status,
    instance,
    retryable: false
  };
}

/**
 * @param {string} error - Validation error message
 * @param {Object} options
 * @param {number} options.status - HTTP status code
 * @param {string} options.instance - Unique error instance URI
 * @param {string} [options.idempotencyKey] - The idempotency key from request
 * @returns {Object} RFC 9457 problem response
 */
export function keyValidationErrorResponse(error, options = {}) {
  const { status, instance, idempotencyKey } = options;

  const response = {
    type: `${SPEC_URL}#section-2.1`,
    title: "Invalid Idempotency-Key",
    detail: error,
    status,
    instance,
    retryable: false
  };

  if (idempotencyKey !== undefined) {
    response.idempotency_key = idempotencyKey;
  }

  return response;
}

/**
 * Store unavailable error (infrastructure error, not in spec)
 * @param {Object} options
 * @param {number} options.status - HTTP status code
 * @param {string} options.instance - Unique error instance URI
 * @returns {Object} RFC 9457 problem response
 */
export function storeUnavailableResponse(options = {}) {
  const { status, instance } = options;

  return {
    type: "https://js.idempot.dev/problems#store-unavailable",
    title: "Service temporarily unavailable",
    detail: "The idempotency store is temporarily unavailable. Please retry.",
    status,
    instance,
    retryable: true
  };
}
