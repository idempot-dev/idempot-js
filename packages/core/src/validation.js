/**
 * @param {string[]} fields
 * @returns {asserts fields is string[]}
 */
export function validateExcludeFields(fields) {
  if (!Array.isArray(fields)) {
    throw new Error("excludeFields must be an array");
  }
  for (const field of fields) {
    if (field !== null && field !== undefined && typeof field !== "string") {
      throw new Error("excludeFields must contain only strings");
    }
    if (typeof field === "string" && field.startsWith("$.")) {
      if (field === "$.") {
        throw new Error(`Invalid JSONPath: ${field}`);
      }
    }
  }
}

/**
 * Validates idempotency options
 * @param {Object} options
 * @param {number} [options.minKeyLength]
 * @param {number} [options.maxKeyLength]
 * @throws {Error} if minKeyLength is below 21
 */
export function validateIdempotencyOptions(options = {}) {
  const { minKeyLength } = options;
  if (minKeyLength !== undefined && minKeyLength < 21) {
    throw new Error("minKeyLength must be at least 21 (nanoid default)");
  }
}

/**
 * @param {string} key
 * @param {Object} options
 * @param {number} [options.minKeyLength=21] - Minimum allowed key length (default: 21 for nanoid)
 * @param {number} [options.maxKeyLength=255] - Maximum allowed key length (default: 255)
 * @returns {{valid: boolean, error?: string}}
 */
export function validateIdempotencyKey(key, options = {}) {
  const { minKeyLength = 21, maxKeyLength = 255 } = options;
  if (key.length < minKeyLength || key.length > maxKeyLength) {
    return {
      valid: false,
      error: `Idempotency-Key must be between ${minKeyLength}-${maxKeyLength} characters`
    };
  }
  if (key.includes(",")) {
    return {
      valid: false,
      error: "Idempotency-Key cannot contain commas (multiple keys not allowed)"
    };
  }
  return { valid: true };
}

/**
 * @param {{byKey: any, byFingerprint: any}} lookup
 * @param {string} key
 * @param {string} fingerprint
 * @returns {{conflict: boolean, status?: number, error?: string}}
 */
export function checkLookupConflicts(lookup, key, fingerprint) {
  if (lookup.byKey?.status === "processing") {
    return {
      conflict: true,
      status: 409,
      error: "A request with this idempotency key is already being processed"
    };
  }

  if (lookup.byFingerprint && lookup.byFingerprint.key !== key) {
    return {
      conflict: true,
      status: 409,
      error:
        "This request was already processed with a different idempotency key"
    };
  }

  if (lookup.byKey && lookup.byKey.fingerprint !== fingerprint) {
    return {
      conflict: true,
      status: 422,
      error: "Idempotency key reused with different request payload"
    };
  }

  return { conflict: false };
}

/**
 * @param {string} method
 * @returns {boolean}
 */
export function shouldProcessRequest(method) {
  return method === "POST" || method === "PATCH";
}

/**
 * @param {{byKey: any, byFingerprint: any}} lookup
 * @returns {any | null}
 */
export function getCachedResponse(lookup) {
  if (lookup.byKey?.status === "complete" && lookup.byKey.response) {
    return lookup.byKey.response;
  }
  return null;
}

/**
 * @param {{status: number, headers?: Record<string, string>, body: string}} cached
 * @returns {{status: number, headers: Record<string, string>, body: string}}
 */
export function prepareCachedResponse(cached) {
  return {
    ...cached,
    headers: {
      ...(cached.headers || {}),
      "x-idempotent-replayed": "true"
    }
  };
}
