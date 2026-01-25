import xxhash from "xxhash-wasm";
import type { XXHashAPI } from "xxhash-wasm";
import { JSONPath } from "jsonpath-plus";

let xxhashInstance: XXHashAPI | null = null;

async function getXXHash() {
  if (!xxhashInstance) {
    xxhashInstance = await xxhash();
  }
  return xxhashInstance;
}

export async function generateFingerprint(
  body: string,
  excludeFields: string[]
): Promise<string> {
  const hasher = await getXXHash();

  let normalized: string;
  try {
    let parsed = JSON.parse(body);

    // Exclude root-level fields
    const rootExclusions = excludeFields.filter((f) => !f.startsWith("$."));
    for (const field of rootExclusions) {
      delete parsed[field];
    }

    // Exclude nested fields via JSONPath
    const jsonPathExclusions = excludeFields.filter((f) => f.startsWith("$."));
    for (const path of jsonPathExclusions) {
      try {
        JSONPath({
          path,
          json: parsed,
          callback: (value, type, payload) => {
            if (payload.parent && payload.parentProperty) {
              delete payload.parent[payload.parentProperty];
            }
          }
        });
      } catch {
        // Ignore invalid JSONPath
      }
    }

    // Normalize: sort keys
    normalized = JSON.stringify(sortKeys(parsed));
  } catch {
    // Not JSON, use as-is
    normalized = body;
  }

  return hasher.h64ToString(normalized);
}

function sortKeys(obj: any): any {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortKeys);
  }

  const sorted: Record<string, any> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}
