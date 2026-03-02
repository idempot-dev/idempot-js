import xxhash from "xxhash-wasm";
import { JSONPath } from "jsonpath-plus";
import { validateExcludeFields } from "./validation.js";

/** @typedef {import("xxhash-wasm").XXHashAPI} XXHashAPI */

/** @type {XXHashAPI | null} */
let xxhashInstance = null;

/**
 * @returns {Promise<XXHashAPI>}
 */
async function getXXHash() {
  if (!xxhashInstance) {
    xxhashInstance = await xxhash();
  }
  return xxhashInstance;
}

/**
 * @param {string} body
 * @param {string[]} [excludeFields]
 * @returns {Promise<string>}
 */
export async function generateFingerprint(body, excludeFields = []) {
  validateExcludeFields(excludeFields);
  const hasher = await getXXHash();

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return hasher.h64ToString(body);
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
  const normalized = JSON.stringify(sortKeys(parsed));

  return hasher.h64ToString(normalized);
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
