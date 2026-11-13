import { hash64 } from "./hash.js";

/**
 * Bumped if the scope inputs ever change meaning, so a stored token can never be
 * mistaken for one produced by a different rule.
 */
const SCOPE_VERSION = "scope:v1";

/** Matches a scheme at the start of an absolute URL, so `//host/path` is not one. */
const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * The path and query as received, without scheme, host or port. Origin-form
 * targets are kept verbatim, so a client that sends `//host/path` cannot be
 * mistaken for `/path`, and dot segments stay as sent. Only an absolute URL is
 * parsed, because the adapters that expose one include the origin and a retry
 * can arrive through a proxy with a different host.
 * @param {string} url
 * @returns {string}
 */
function routeOf(url) {
  if (!ABSOLUTE_URL.test(url)) {
    return url;
  }
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    // A target the parser rejects is still an operation of its own; keeping it
    // verbatim beats throwing inside middleware on a client-supplied value.
    return url;
  }
}

/**
 * Derive the scope a request belongs to: its method, its path and query, and the
 * principal that owns it when one is configured. A principal of `undefined`,
 * `null` or the empty string is treated as absent, so a principal source that
 * can return `''` produces the shared route-only scope rather than isolation.
 * @param {{method: string, url: string, principal?: string | null}} request
 * @returns {Promise<string>} 64 bit hash as 16 lowercase hex characters
 */
export async function deriveScopeToken({ method, url, principal }) {
  const parts = [SCOPE_VERSION, method.toUpperCase(), routeOf(url)];
  if (principal) {
    parts.push(principal);
  }
  return hash64(parts.join("\n"));
}

/**
 * Combine the scope with the client's key, which is what the store holds as the
 * record key. The scope is fixed width, so the prefix can be split off without
 * ambiguity even when the client key contains colons.
 * @param {string} scopeToken
 * @param {string} clientKey
 * @returns {string}
 */
export function buildRecordKey(scopeToken, clientKey) {
  return `${scopeToken}:${clientKey}`;
}
