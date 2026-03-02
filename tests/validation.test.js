import { test } from "tap";
import {
  validateExcludeFields,
  validateIdempotencyKey,
  checkLookupConflicts,
  shouldProcessRequest,
  getCachedResponse,
  prepareCachedResponse
} from "../src/validation.js";

test("validateExcludeFields - accepts valid array", (t) => {
  t.doesNotThrow(() => validateExcludeFields(["foo", "bar"]));
  t.doesNotThrow(() => validateExcludeFields([]));
  t.doesNotThrow(() => validateExcludeFields(["$.foo", "$.bar"]));
  t.doesNotThrow(() =>
    validateExcludeFields(["timestamp", "$.data.timestamp"])
  );
  t.end();
});

test("validateExcludeFields - accepts null and undefined in array", (t) => {
  t.doesNotThrow(() => validateExcludeFields([null]));
  t.doesNotThrow(() => validateExcludeFields([undefined]));
  t.doesNotThrow(() => validateExcludeFields(["foo", null, undefined]));
  t.end();
});

test("validateExcludeFields - throws if not an array", (t) => {
  t.throws(() => validateExcludeFields("foo"), {
    message: "excludeFields must be an array"
  });
  t.throws(() => validateExcludeFields({}), {
    message: "excludeFields must be an array"
  });
  t.throws(() => validateExcludeFields(123), {
    message: "excludeFields must be an array"
  });
  t.end();
});

test("validateExcludeFields - throws for non-string values", (t) => {
  t.throws(() => validateExcludeFields([123]), {
    message: "excludeFields must contain only strings"
  });
  t.throws(() => validateExcludeFields([{}]), {
    message: "excludeFields must contain only strings"
  });
  t.throws(() => validateExcludeFields([[]]), {
    message: "excludeFields must contain only strings"
  });
  t.end();
});

test("validateExcludeFields - throws for invalid JSONPath", (t) => {
  t.throws(() => validateExcludeFields(["$."]), {
    message: "Invalid JSONPath: $."
  });
  t.end();
});

// validateIdempotencyKey tests
test("validateIdempotencyKey - accepts valid key", (t) => {
  const result = validateIdempotencyKey("valid-key", 255);
  t.equal(result.valid, true);
  t.equal(result.error, undefined);
  t.end();
});

test("validateIdempotencyKey - rejects empty key", (t) => {
  const result = validateIdempotencyKey("", 255);
  t.equal(result.valid, false);
  t.match(result.error, /between 1-255 characters/i);
  t.end();
});

test("validateIdempotencyKey - rejects too long key", (t) => {
  const longKey = "x".repeat(256);
  const result = validateIdempotencyKey(longKey, 255);
  t.equal(result.valid, false);
  t.match(result.error, /between 1-255 characters/i);
  t.end();
});

// checkLookupConflicts tests
test("checkLookupConflicts - no conflicts when lookup is empty", (t) => {
  const lookup = { byKey: null, byFingerprint: null };
  const result = checkLookupConflicts(lookup, "key", "fp");
  t.equal(result.conflict, false);
  t.end();
});

test("checkLookupConflicts - detects processing conflict", (t) => {
  const lookup = {
    byKey: { status: "processing" },
    byFingerprint: null
  };
  const result = checkLookupConflicts(lookup, "key", "fp");
  t.equal(result.conflict, true);
  t.equal(result.status, 409);
  t.match(result.error, /already being processed/i);
  t.end();
});

test("checkLookupConflicts - detects fingerprint mismatch", (t) => {
  const lookup = {
    byKey: null,
    byFingerprint: { key: "different-key" }
  };
  const result = checkLookupConflicts(lookup, "key", "fp");
  t.equal(result.conflict, true);
  t.equal(result.status, 409);
  t.match(result.error, /different idempotency key/i);
  t.end();
});

test("checkLookupConflicts - detects key reuse with different payload", (t) => {
  const lookup = {
    byKey: { status: "complete", fingerprint: "different-fp" },
    byFingerprint: null
  };
  const result = checkLookupConflicts(lookup, "key", "fp");
  t.equal(result.conflict, true);
  t.equal(result.status, 422);
  t.match(result.error, /different request payload/i);
  t.end();
});

test("checkLookupConflicts - no conflict for matching key and fingerprint", (t) => {
  const lookup = {
    byKey: { status: "complete", fingerprint: "fp" },
    byFingerprint: { key: "key" }
  };
  const result = checkLookupConflicts(lookup, "key", "fp");
  t.equal(result.conflict, false);
  t.end();
});

// shouldProcessRequest tests
test("shouldProcessRequest - returns true for POST", (t) => {
  t.equal(shouldProcessRequest("POST"), true);
  t.end();
});

test("shouldProcessRequest - returns true for PATCH", (t) => {
  t.equal(shouldProcessRequest("PATCH"), true);
  t.end();
});

test("shouldProcessRequest - returns false for GET", (t) => {
  t.equal(shouldProcessRequest("GET"), false);
  t.end();
});

test("shouldProcessRequest - returns false for PUT", (t) => {
  t.equal(shouldProcessRequest("PUT"), false);
  t.end();
});

// getCachedResponse tests
test("getCachedResponse - returns cached response when complete", (t) => {
  const cached = { status: 200, body: "{}" };
  const lookup = {
    byKey: { status: "complete", response: cached },
    byFingerprint: null
  };
  t.equal(getCachedResponse(lookup), cached);
  t.end();
});

test("getCachedResponse - returns null when not complete", (t) => {
  const lookup = {
    byKey: { status: "processing" },
    byFingerprint: null
  };
  t.equal(getCachedResponse(lookup), null);
  t.end();
});

test("getCachedResponse - returns null when no response", (t) => {
  const lookup = {
    byKey: { status: "complete" },
    byFingerprint: null
  };
  t.equal(getCachedResponse(lookup), null);
  t.end();
});

// prepareCachedResponse tests
test("prepareCachedResponse - adds replay header", (t) => {
  const cached = {
    status: 200,
    headers: { "content-type": "application/json" },
    body: "{}"
  };
  const result = prepareCachedResponse(cached);
  t.equal(result.status, 200);
  t.equal(result.headers["x-idempotent-replayed"], "true");
  t.equal(result.headers["content-type"], "application/json");
  t.equal(result.body, "{}");
  t.end();
});

test("prepareCachedResponse - handles empty headers", (t) => {
  const cached = {
    status: 201,
    body: "created"
  };
  const result = prepareCachedResponse(cached);
  t.equal(result.status, 201);
  t.equal(result.headers["x-idempotent-replayed"], "true");
  t.equal(result.body, "created");
  t.end();
});
