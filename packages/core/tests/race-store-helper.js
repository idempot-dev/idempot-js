import { IdempotencyKeyExistsError } from "@idempot/core";

/**
 * Shared key used by framework middleware race tests.
 */
export const RACE_KEY = "race-test-key-1234567890-abcdef";

/**
 * Creates a stub idempotency store that deterministically exercises the
 * middleware's catch-and-reroute path. The first `lookup()` always misses so
 * the request reaches `startProcessing`; subsequent lookups simulate the
 * re-check after a duplicate-key error.
 *
 * @param {Object} opts
 * @param {{status: string, fingerprint?: string, response?: any} | null} opts.secondLookup - record returned by the re-lookup (null = no record)
 * @param {Error | null} [opts.relookupError] - error thrown by the re-lookup
 * @param {Error | null} [opts.startError] - error thrown by startProcessing
 * @returns {import("@idempot/core").IdempotencyStore}
 */
export function createRaceStubStore(opts) {
  let fingerprintSeen = null;
  let lookupCount = 0;
  return {
    async lookup(key, fingerprint) {
      lookupCount++;
      if (lookupCount === 1) {
        fingerprintSeen = fingerprint;
        return { byKey: null, byFingerprint: null };
      }
      if (opts.relookupError) {
        throw opts.relookupError;
      }
      if (!opts.secondLookup) {
        return { byKey: null, byFingerprint: null };
      }
      const record = { key, fingerprint: fingerprintSeen };
      if (opts.secondLookup.status === "complete") {
        record.status = "complete";
        record.response = opts.secondLookup.response;
      } else {
        record.status = "processing";
      }
      return { byKey: record, byFingerprint: null };
    },
    async startProcessing() {
      throw opts.startError ?? new IdempotencyKeyExistsError("duplicate key");
    },
    async complete() {},
    async close() {}
  };
}
