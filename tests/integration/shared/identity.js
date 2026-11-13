/**
 * Helpers for asserting and seeding the record the middleware itself writes.
 *
 * The middleware composes the stored key from the request identity (method and
 * path with query) and the client key, and fingerprints the body under that
 * identity. A test that queries the store by the client key alone finds nothing,
 * so it must derive the same identity instead of guessing the stored shape.
 */

import {
  deriveScopeToken,
  buildRecordKey
} from "../../../packages/core/src/identity.js";
import { generateScopedFingerprint } from "../../../packages/core/src/fingerprint.js";

/**
 * The record key the middleware derives for a client key on a route.
 * @param {string} clientKey
 * @param {{method?: string, path?: string}} [route]
 * @returns {Promise<string>}
 */
export async function recordKeyFor(
  clientKey,
  { method = "POST", path = "/api" } = {}
) {
  const scopeToken = await deriveScopeToken({ method, url: path });
  return buildRecordKey(scopeToken, clientKey);
}

/**
 * The fingerprint the middleware derives for a body on a route.
 * @param {string} body
 * @param {{method?: string, path?: string}} [route]
 * @returns {Promise<string>}
 */
export async function scopedFingerprintFor(
  body,
  { method = "POST", path = "/api" } = {}
) {
  const scopeToken = await deriveScopeToken({ method, url: path });
  return generateScopedFingerprint(scopeToken, body);
}
