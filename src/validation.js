/**
 * @param {unknown} fields
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
