/**
 * HTTP Content Negotiation for RFC 9457 responses
 * @module content-negotiation
 */

export const SUPPORTED_FORMATS = [
  "application/problem+json",
  "application/json",
  "text/markdown"
];

/**
 * Parse Accept header into sorted list of media types with q-values
 * @param {string} acceptHeader - The Accept header value
 * @returns {Array<{type: string, q: number}>} Sorted by q descending
 */
export function parseAcceptHeader(acceptHeader) {
  if (!acceptHeader || acceptHeader.trim() === "") {
    return [];
  }

  const types = acceptHeader.split(",").map((part) => {
    const [type, ...params] = part.trim().split(";");
    const typeClean = type.trim();

    // Parse q-value, default to 1.0
    let q = 1;
    for (const param of params) {
      const [key, value] = param.trim().split("=");
      if (key.trim() === "q" && value) {
        const qValue = parseFloat(value.trim());
        if (!isNaN(qValue) && qValue >= 0 && qValue <= 1) {
          q = qValue;
        }
      }
    }

    return { type: typeClean, q };
  });

  // Sort by q descending
  return types.sort((a, b) => b.q - a.q);
}

/**
 * Select best response format based on Accept header
 * @param {string} acceptHeader - The Accept header value
 * @returns {string} Selected format
 */
export function selectResponseFormat(acceptHeader) {
  const parsed = parseAcceptHeader(acceptHeader);

  if (parsed.length === 0) {
    return "application/problem+json";
  }

  // Check each preferred type in order
  for (const { type } of parsed) {
    // Wildcard fallback
    if (type === "*/*") {
      return "application/problem+json";
    }

    // Direct match
    if (SUPPORTED_FORMATS.includes(type)) {
      return type;
    }

    // Check for type/* wildcard (e.g., application/*)
    if (type.endsWith("/*")) {
      const prefix = type.slice(0, -1);
      const match = SUPPORTED_FORMATS.find((fmt) => fmt.startsWith(prefix));
      if (match) return match;
    }
  }

  // No match found, use default
  return "application/problem+json";
}
