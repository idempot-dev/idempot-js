/**
 * RFC 7807 Problem Details for HTTP APIs
 * @module problem-json
 */

const SPEC_URL =
  "https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07";

/**
 * @param {number} status - HTTP status code (409 or 422)
 * @param {string} error - Error message
 * @returns {Object} RFC 7807 problem response
 */
export function conflictErrorResponse(status, error) {
  const isConcurrent = error.includes("already being processed");

  if (status === 409 && isConcurrent) {
    return {
      type: `${SPEC_URL}#section-2.6`,
      title: "A request is outstanding for this Idempotency-Key",
      detail: error
    };
  }

  if (status === 409) {
    return {
      type: `${SPEC_URL}#section-2.2`,
      title: "Fingerprint conflict",
      detail: error
    };
  }

  // 422
  return {
    type: `${SPEC_URL}#section-2.2`,
    title: "Idempotency-Key is already used",
    detail: error
  };
}

/**
 * @returns {Object} RFC 7807 problem response
 */
export function missingKeyResponse() {
  return {
    type: `${SPEC_URL}#section-2.1`,
    title: "Idempotency-Key is missing",
    detail:
      "This operation is idempotent and it requires correct usage of Idempotency Key."
  };
}

/**
 * @param {string} error - Validation error message
 * @returns {Object} RFC 7807 problem response
 */
export function keyValidationErrorResponse(error) {
  return {
    type: `${SPEC_URL}#section-2.1`,
    title: "Invalid Idempotency-Key",
    detail: error
  };
}
