/**
 * RFC 7807 Problem Details for HTTP APIs
 * @module problem-json
 */

/**
 * Builds RFC 7807 problem+json error response for idempotency conflicts
 * @param {number} status - HTTP status code (409 or 422)
 * @param {string} error - Error message
 * @returns {Object} RFC 7807 problem response
 */
export function conflictErrorResponse(status, error) {
  const titles = {
    409: "A request is outstanding for this Idempotency-Key",
    422: "Idempotency-Key is already used"
  };
  return {
    type: "https://developer.example.com/idempotency",
    title: titles[status],
    detail: error
  };
}

/**
 * Builds RFC 7807 problem+json error response for missing idempotency key
 * @returns {Object} RFC 7807 problem response
 */
export function missingKeyResponse() {
  return {
    type: "https://developer.example.com/idempotency",
    title: "Idempotency-Key is missing",
    detail:
      "This operation is idempotent and it requires correct usage of Idempotency Key."
  };
}
