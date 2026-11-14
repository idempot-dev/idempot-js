import { generateFingerprint } from "./fingerprint.js";
import { reconcileLookup } from "./validation.js";

/**
 * A scoped record key is `<scope token>:<client key>`. A pre-scoping record was
 * keyed by the client key alone, so its key never carries a token.
 * @param {any} record
 * @param {string} scopeToken
 * @returns {boolean}
 */
function belongsToScope(record, scopeToken) {
  return (
    typeof record?.key === "string" && record.key.startsWith(`${scopeToken}:`)
  );
}

/**
 * Look a record up under the scoped identity, then, on a miss, under the
 * pre-scoping identity so a record written before this release still answers a
 * retry for its remaining TTL.
 *
 * A store's fingerprint index spans every operation and both hash domains, so
 * a hit there can name a record this request must not conflict with. A scoped
 * lookup keeps only fingerprint hits that carry this operation's scope token.
 * The fallback returns the record keyed by the client key, even when its
 * fingerprint differs, so a changed payload still answers 422. It ignores the
 * fallback's fingerprint hit: that index mixes both domains, and a different
 * key with the same body is a miss during the window rather than the old 409.
 *
 * Returns the identity the lookup actually used, so the caller compares
 * conflicts against the key and fingerprint that produced the record rather
 * than the scoped ones.
 *
 * @param {{lookup: (key: string, fingerprint: string) => Promise<{byKey: any, byFingerprint: any}>}} store
 * @param {Object} options
 * @param {string} options.recordKey - scoped record key
 * @param {string} options.fingerprint - scoped fingerprint
 * @param {string} options.scopeToken - 16 character token from deriveScopeToken
 * @param {string} options.key - client idempotency key
 * @param {string} options.body - request body
 * @param {string[]} [options.excludeFields]
 * @returns {Promise<{lookup: {byKey: any, byFingerprint: any}, key: string, fingerprint: string}>}
 */
export async function lookupWithLegacyFallback(store, options) {
  const { recordKey, fingerprint, scopeToken, key, body, excludeFields } =
    options;

  const found = reconcileLookup(
    await store.lookup(recordKey, fingerprint),
    recordKey
  );
  const scoped = belongsToScope(found.byFingerprint, scopeToken)
    ? found
    : { ...found, byFingerprint: null };
  if (scoped.byKey || scoped.byFingerprint) {
    return { lookup: scoped, key: recordKey, fingerprint };
  }

  // Only a miss pays for the pre-scoping hash.
  const legacyFingerprint = await generateFingerprint(body, excludeFields);
  const legacy = reconcileLookup(
    await store.lookup(key, legacyFingerprint),
    key
  );
  if (legacy.byKey) {
    return {
      lookup: { byKey: legacy.byKey, byFingerprint: null },
      key,
      fingerprint: legacyFingerprint
    };
  }
  return { lookup: scoped, key: recordKey, fingerprint };
}
