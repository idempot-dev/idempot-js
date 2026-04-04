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
 * Validates that a value is a safe integer (not null, within safe range)
 * @param {*} value
 * @param {string} name
 * @returns {boolean}
 */
function isValidInteger(value, name) {
  if (value === null) {
    throw new Error(`${name} cannot be null`);
  }
  if (typeof value !== "number") {
    throw new Error(`${name} must be a number`);
  }
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a safe integer`);
  }
  return true;
}

/**
 * Validates the store object has required methods
 * @param {*} store
 */
function validateStore(store) {
  if (store === null) {
    throw new Error("store cannot be null");
  }
  if (typeof store !== "object" || Array.isArray(store)) {
    throw new Error("store must be an object");
  }

  const requiredMethods = ["lookup", "startProcessing", "complete"];
  for (const method of requiredMethods) {
    if (typeof store[method] !== "function") {
      throw new Error(`store must have a ${method} method`);
    }
  }
}

/**
 * Validates resilience options
 * @param {*} resilience
 */
function validateResilienceOptions(resilience) {
  if (resilience === null) {
    throw new Error("resilience cannot be null");
  }
  if (typeof resilience !== "object" || Array.isArray(resilience)) {
    throw new Error("resilience must be an object");
  }

  // Validate timeoutMs: positive integer
  if ("timeoutMs" in resilience) {
    const { timeoutMs } = resilience;
    if (timeoutMs !== undefined) {
      isValidInteger(timeoutMs, "resilience.timeoutMs");
      if (timeoutMs <= 0) {
        throw new Error("resilience.timeoutMs must be greater than 0");
      }
    }
  }

  // Validate maxRetries: non-negative integer
  if ("maxRetries" in resilience) {
    const { maxRetries } = resilience;
    if (maxRetries !== undefined) {
      isValidInteger(maxRetries, "resilience.maxRetries");
      if (maxRetries < 0) {
        throw new Error(
          "resilience.maxRetries must be greater than or equal to 0"
        );
      }
    }
  }

  // Validate retryDelayMs: non-negative integer
  if ("retryDelayMs" in resilience) {
    const { retryDelayMs } = resilience;
    if (retryDelayMs !== undefined) {
      isValidInteger(retryDelayMs, "resilience.retryDelayMs");
      if (retryDelayMs < 0) {
        throw new Error(
          "resilience.retryDelayMs must be greater than or equal to 0"
        );
      }
    }
  }

  // Validate errorThresholdPercentage: 0 to 100
  if ("errorThresholdPercentage" in resilience) {
    const { errorThresholdPercentage } = resilience;
    if (errorThresholdPercentage !== undefined) {
      isValidInteger(
        errorThresholdPercentage,
        "resilience.errorThresholdPercentage"
      );
      if (errorThresholdPercentage < 0 || errorThresholdPercentage > 100) {
        throw new Error(
          "resilience.errorThresholdPercentage must be between 0 and 100"
        );
      }
    }
  }

  // Validate resetTimeoutMs: positive integer
  if ("resetTimeoutMs" in resilience) {
    const { resetTimeoutMs } = resilience;
    if (resetTimeoutMs !== undefined) {
      isValidInteger(resetTimeoutMs, "resilience.resetTimeoutMs");
      if (resetTimeoutMs <= 0) {
        throw new Error("resilience.resetTimeoutMs must be greater than 0");
      }
    }
  }

  // Validate volumeThreshold: positive integer
  if ("volumeThreshold" in resilience) {
    const { volumeThreshold } = resilience;
    if (volumeThreshold !== undefined) {
      isValidInteger(volumeThreshold, "resilience.volumeThreshold");
      if (volumeThreshold <= 0) {
        throw new Error("resilience.volumeThreshold must be greater than 0");
      }
    }
  }
}

/**
 * Validates idempotency options
 * @param {Object} options
 * @param {boolean} [options.required]
 * @param {number} [options.ttlMs]
 * @param {string[]} [options.excludeFields]
 * @param {Object} [options.store]
 * @param {number} [options.minKeyLength]
 * @param {number} [options.maxKeyLength]
 * @param {Object} [options.resilience]
 * @throws {Error} if any option is invalid
 */
export function validateIdempotencyOptions(options = {}) {
  if (options === null) {
    throw new Error("options cannot be null");
  }
  if (typeof options !== "object" || Array.isArray(options)) {
    throw new Error("options must be an object");
  }

  // Check for unknown options
  const knownOptions = [
    "required",
    "ttlMs",
    "excludeFields",
    "store",
    "minKeyLength",
    "maxKeyLength",
    "resilience"
  ];

  for (const key of Object.keys(options)) {
    if (!knownOptions.includes(key)) {
      throw new Error(`Unknown option: ${key}`);
    }
  }

  // Validate required: boolean
  if ("required" in options) {
    const { required } = options;
    if (required !== undefined) {
      if (required === null) {
        throw new Error("required cannot be null");
      }
      if (typeof required !== "boolean") {
        throw new Error("required must be a boolean");
      }
    }
  }

  // Validate ttlMs: positive integer, max 1 year (365 days in ms)
  const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000; // 31,536,000,000
  if ("ttlMs" in options) {
    const { ttlMs } = options;
    if (ttlMs !== undefined) {
      isValidInteger(ttlMs, "ttlMs");
      if (ttlMs <= 0) {
        throw new Error("ttlMs must be greater than 0");
      }
      if (ttlMs > ONE_YEAR_MS) {
        throw new Error(
          "ttlMs must be less than or equal to 1 year (31536000000ms)"
        );
      }
    }
  }

  // Validate excludeFields: array of strings (delegates to existing function)
  if ("excludeFields" in options) {
    const { excludeFields } = options;
    if (excludeFields !== undefined) {
      if (excludeFields === null) {
        throw new Error("excludeFields cannot be null");
      }
      validateExcludeFields(excludeFields);
    }
  }

  // Validate store: object with required methods
  if ("store" in options) {
    const { store } = options;
    if (store !== undefined) {
      validateStore(store);
    }
  }

  // Validate minKeyLength: integer >= 21
  if ("minKeyLength" in options) {
    const { minKeyLength } = options;
    if (minKeyLength !== undefined) {
      isValidInteger(minKeyLength, "minKeyLength");
      if (minKeyLength < 21) {
        throw new Error("minKeyLength must be at least 21 (nanoid default)");
      }
      if (minKeyLength > 255) {
        throw new Error("minKeyLength must be at most 255");
      }
    }
  }

  // Validate maxKeyLength: integer, must be >= minKeyLength and <= 255
  if ("maxKeyLength" in options) {
    const { maxKeyLength } = options;
    if (maxKeyLength !== undefined) {
      isValidInteger(maxKeyLength, "maxKeyLength");
      if (maxKeyLength > 255) {
        throw new Error("maxKeyLength must be at most 255");
      }
    }
  }

  // Cross-field validation: maxKeyLength >= minKeyLength
  const minKeyLength =
    "minKeyLength" in options ? options.minKeyLength : undefined;
  const maxKeyLength =
    "maxKeyLength" in options ? options.maxKeyLength : undefined;

  if (minKeyLength !== undefined && maxKeyLength !== undefined) {
    if (maxKeyLength < minKeyLength) {
      throw new Error(
        "maxKeyLength must be greater than or equal to minKeyLength"
      );
    }
  }

  // Validate resilience: nested object
  if ("resilience" in options) {
    const { resilience } = options;
    if (resilience !== undefined) {
      validateResilienceOptions(resilience);
    }
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
