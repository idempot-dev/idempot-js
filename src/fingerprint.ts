import xxhash from "xxhash-wasm";
import type { XXHashAPI } from "xxhash-wasm";

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

  // Try to parse as JSON
  let normalized: string;
  try {
    const parsed = JSON.parse(body);
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
