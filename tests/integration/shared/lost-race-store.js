/**
 * Thin wrapper around a real idempotency store that simulates the lost-race
 * interleaving required to exercise the middleware's catch-and-reroute path
 * deterministically against a real driver:
 *
 *   - The FIRST `lookup` misses, as if the loser checked before the winner's
 *     record was inserted. This routes the loser into `startProcessing`.
 *   - `startProcessing` delegates to the real store, so a pre-created winner
 *     record makes the real driver raise its duplicate-key constraint, which
 *     the store translates to `IdempotencyKeyExistsError`.
 *   - Subsequent `lookup`s delegate to the real store (the reroute re-lookup),
 *     unless `missRecheck` is set, in which case the re-lookup also resolves
 *     null to simulate the winner's record having expired (TTL) before the
 *     loser re-checked (KTD2: 409).
 *
 * All other store operations pass straight through to the underlying store.
 */

/**
 * @param {import("@idempot/core").IdempotencyStore} store
 * @param {{ missRecheck?: boolean }} [options]
 */
export function createLostRaceStore(store, { missRecheck = false } = {}) {
  let lookupCount = 0;
  return {
    async lookup(key, fingerprint) {
      lookupCount += 1;
      if (lookupCount === 1) {
        return { byKey: null, byFingerprint: null };
      }
      if (missRecheck) {
        return { byKey: null, byFingerprint: null };
      }
      return store.lookup(key, fingerprint);
    },
    async startProcessing(key, fingerprint, ttlMs) {
      return store.startProcessing(key, fingerprint, ttlMs);
    },
    async complete(key, response) {
      return store.complete(key, response);
    },
    async close() {
      return store.close();
    }
  };
}
