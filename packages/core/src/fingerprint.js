import { JSONPath } from "jsonpath-plus";
import { hash64 } from "./hash.js";
import { validateExcludeFields } from "./validation.js";

/**
 * Bumped if the fingerprint inputs ever change meaning, so a scoped hash can
 * never be mistaken for one produced by a different rule.
 */
const FINGERPRINT_VERSION = "fp:v2";

/** The shape `deriveScopeToken` produces; anything else collapses scopes. */
const SCOPE_TOKEN = /^[0-9a-f]{16}$/;

/**
 * @param {string} body
 * @param {string[]} [excludeFields]
 * @returns {string}
 */
function canonicalizeBody(body, excludeFields = []) {
  validateExcludeFields(excludeFields);

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }

  // Exclude root-level fields
  let parsedObj;
  if (typeof parsed === "object" && parsed !== null) {
    parsedObj = parsed;
    const rootExclusions = excludeFields.filter(
      (f) => f && !f.startsWith("$.")
    );
    for (const field of rootExclusions) {
      delete parsedObj[field];
    }
  }

  // Exclude nested fields via JSONPath
  const jsonPathExclusions = excludeFields.filter(
    (f) => f && f.startsWith("$.")
  );
  for (const path of jsonPathExclusions) {
    JSONPath({
      path,
      json: parsed,
      callback: (value, type, payload) => {
        if (payload.parent && payload.parentProperty) {
          delete payload.parent[payload.parentProperty];
        }
      }
    });
  }

  // Normalize: sort keys
  return JSON.stringify(sortKeys(parsed));
}

/**
 * The fingerprint a record written before scoping was stored with: the body
 * alone, with exclusions applied. Existing records are compared against this
 * value for their remaining lifetime, so the hash must not change.
 * @param {string} body
 * @param {string[]} [excludeFields]
 * @returns {Promise<string>}
 */
export async function generateFingerprint(body, excludeFields = []) {
  return hash64(canonicalizeBody(body, excludeFields));
}

/**
 * The scoped fingerprint: the operation's scope token and the canonical body, so
 * one payload under two operations cannot collide and a comparison cannot reach
 * another operation's record.
 * @param {string} scopeToken
 * @param {string} body
 * @param {string[]} [excludeFields]
 * @returns {Promise<string>}
 */
export async function generateScopedFingerprint(
  scopeToken,
  body,
  excludeFields = []
) {
  if (!SCOPE_TOKEN.test(scopeToken)) {
    throw new TypeError(
      "scopeToken must be the 16 character hex token from deriveScopeToken"
    );
  }
  const canonical = canonicalizeBody(body, excludeFields);
  return hash64(`${FINGERPRINT_VERSION}\n${scopeToken}\n${canonical}`);
}

/**
 * @param {any} obj
 * @returns {any}
 */
function sortKeys(obj) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortKeys);
  }

  /** @type {Record<string, any>} */
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}
