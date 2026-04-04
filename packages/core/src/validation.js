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
 * Validates an integer option with a minimum constraint
 * @param {*} value
 * @param {string} name
 * @param {number} min
 * @param {string} minError
 */
function validatePositiveInteger(value, name, min, minError) {
  isValidInteger(value, name);
  if (value < min) {
    throw new Error(minError);
  }
}

/**
 * Validates an integer option within a range
 * @param {*} value
 * @param {string} name
 * @param {number} min
 * @param {number} max
 */
function validateIntegerInRange(value, name, min, max) {
  isValidInteger(value, name);
  if (value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
}

/**
 * Validates an optional option if present
 * @param {Object} obj
 * @param {string} key
 * @param {Function} validator
 */
function validateOptional(obj, key, validator) {
  if (key in obj) {
    const value = obj[key];
    if (value !== undefined) {
      validator(value, key);
    }
  }
}

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
 * Validates the store object has required methods
 * @param {*} store - expected to be non-null (null check done by caller)
 */
function validateStore(store) {
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
 * @param {*} resilience - expected to be non-null (null check done by caller)
 */
function validateResilienceOptions(resilience) {
  if (typeof resilience !== "object" || Array.isArray(resilience)) {
    throw new Error("resilience must be an object");
  }

  // Validate positive integer options
  validateOptional(resilience, "timeoutMs", (v) =>
    validatePositiveInteger(
      v,
      "resilience.timeoutMs",
      1,
      "resilience.timeoutMs must be greater than 0"
    )
  );

  validateOptional(resilience, "resetTimeoutMs", (v) =>
    validatePositiveInteger(
      v,
      "resilience.resetTimeoutMs",
      1,
      "resilience.resetTimeoutMs must be greater than 0"
    )
  );

  validateOptional(resilience, "volumeThreshold", (v) =>
    validatePositiveInteger(
      v,
      "resilience.volumeThreshold",
      1,
      "resilience.volumeThreshold must be greater than 0"
    )
  );

  // Validate non-negative integer options
  validateOptional(resilience, "maxRetries", (v) =>
    validatePositiveInteger(
      v,
      "resilience.maxRetries",
      0,
      "resilience.maxRetries must be greater than or equal to 0"
    )
  );

  validateOptional(resilience, "retryDelayMs", (v) =>
    validatePositiveInteger(
      v,
      "resilience.retryDelayMs",
      0,
      "resilience.retryDelayMs must be greater than or equal to 0"
    )
  );

  // Validate percentage option
  validateOptional(resilience, "errorThresholdPercentage", (v) =>
    validateIntegerInRange(v, "resilience.errorThresholdPercentage", 0, 100)
  );
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
  validateOptional(options, "required", (v, name) => {
    if (v === null) {
      throw new Error(`${name} cannot be null`);
    }
    if (typeof v !== "boolean") {
      throw new Error(`${name} must be a boolean`);
    }
  });

  // Validate ttlMs: positive integer, max 1 year
  const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
  validateOptional(options, "ttlMs", (v, name) => {
    isValidInteger(v, name);
    if (v <= 0) {
      throw new Error(`${name} must be greater than 0`);
    }
    if (v > ONE_YEAR_MS) {
      throw new Error(
        `${name} must be less than or equal to 1 year (31536000000ms)`
      );
    }
  });

  // Validate excludeFields: array of strings
  validateOptional(options, "excludeFields", (v, name) => {
    if (v === null) {
      throw new Error(`${name} cannot be null`);
    }
    validateExcludeFields(v);
  });

  // Validate store: object with required methods
  validateOptional(options, "store", (v, name) => {
    if (v === null) {
      throw new Error(`${name} cannot be null`);
    }
    validateStore(v);
  });

  // Validate minKeyLength: integer >= 21
  validateOptional(options, "minKeyLength", (v, name) => {
    isValidInteger(v, name);
    if (v < 21) {
      throw new Error(`${name} must be at least 21 (nanoid default)`);
    }
    if (v > 255) {
      throw new Error(`${name} must be at most 255`);
    }
  });

  // Validate maxKeyLength: integer <= 255
  validateOptional(options, "maxKeyLength", (v, name) => {
    isValidInteger(v, name);
    if (v > 255) {
      throw new Error(`${name} must be at most 255`);
    }
  });

  // Cross-field validation: maxKeyLength >= minKeyLength
  const { minKeyLength, maxKeyLength } = options;
  if (minKeyLength !== undefined && maxKeyLength !== undefined) {
    if (maxKeyLength < minKeyLength) {
      throw new Error(
        "maxKeyLength must be greater than or equal to minKeyLength"
      );
    }
  }

  // Validate resilience: nested object
  validateOptional(options, "resilience", (v, name) => {
    if (v === null) {
      throw new Error(`${name} cannot be null`);
    }
    validateResilienceOptions(v);
  });
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
