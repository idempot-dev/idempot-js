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

/** Scope functions already reported, so a misconfiguration warns once. */
const warnedScopes = new WeakSet();

/**
 * Report a scope function that cannot produce a principal, once per function.
 * Repeating it on every request floods the log, and the first warning is
 * enough to point at the function.
 * @param {Function} scope
 * @param {string} problem
 */
function warnScopeOnce(scope, problem) {
  if (warnedScopes.has(scope)) {
    return;
  }
  warnedScopes.add(scope);
  console.warn(
    `idempotency: scope ${problem}; falling back to the route-only identity`
  );
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function describeType(value) {
  if (value instanceof Promise) {
    return "returned a Promise";
  }
  if (typeof value === "object") {
    return "returned an object";
  }
  return `returned a ${typeof value}`;
}

/**
 * Resolve the principal that owns a request. A missing scope function, an
 * absent principal, and a scope function that throws all mean the same thing:
 * no principal, so the request keeps the route-only identity. A thrown error
 * must not become a 500, and it must not widen the scope to another principal.
 * A non-empty string is a principal, and a finite number is accepted as one;
 * `null`, `undefined`, `''` and any other type are absent. A non-string,
 * non-number return or a throw warns once, because a misconfigured scope
 * silently disables principal isolation.
 * @param {((request: any) => string | number | null | undefined) | null | undefined} scope
 * @param {any} request
 * @returns {string | undefined}
 */
export function resolvePrincipal(scope, request) {
  if (typeof scope !== "function") {
    return undefined;
  }
  let principal;
  try {
    principal = scope(request);
  } catch {
    warnScopeOnce(scope, "threw");
    return undefined;
  }
  if (principal === null || principal === undefined || principal === "") {
    return undefined;
  }
  if (typeof principal === "string") {
    return principal;
  }
  if (typeof principal === "number" && Number.isFinite(principal)) {
    return String(principal);
  }
  warnScopeOnce(scope, describeType(principal));
  return undefined;
}
