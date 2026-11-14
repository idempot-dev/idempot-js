import { test } from "tap";
import { generateFingerprint } from "../src/fingerprint.js";
import { buildRecordKey } from "../src/identity.js";
import { lookupWithLegacyFallback } from "../src/lookup.js";
import { checkLookupConflicts } from "../src/validation.js";

const SCOPE_TOKEN = "0123456789abcdef";
const CLIENT_KEY = "client-key-123456789012";
const BODY = JSON.stringify({ foo: "bar" });
const RECORD_KEY = buildRecordKey(SCOPE_TOKEN, CLIENT_KEY);
const SCOPED_FINGERPRINT = "aaaaaaaaaaaaaaaa";

function record(overrides = {}) {
  return {
    key: RECORD_KEY,
    fingerprint: SCOPED_FINGERPRINT,
    status: "complete",
    response: { status: 201, headers: {}, body: BODY },
    ...overrides
  };
}

function storeWith(...responses) {
  const calls = [];
  return {
    calls,
    async lookup(key, fingerprint) {
      calls.push({ key, fingerprint });
      return responses.shift() ?? { byKey: null, byFingerprint: null };
    }
  };
}

function lookupOptions(overrides = {}) {
  return {
    recordKey: RECORD_KEY,
    fingerprint: SCOPED_FINGERPRINT,
    scopeToken: SCOPE_TOKEN,
    key: CLIENT_KEY,
    body: BODY,
    ...overrides
  };
}

test("lookupWithLegacyFallback - returns a scoped record found by key", async (t) => {
  const scoped = record();
  const store = storeWith({ byKey: scoped, byFingerprint: scoped });

  const result = await lookupWithLegacyFallback(store, lookupOptions());

  t.equal(result.lookup.byKey, scoped, "returns the keyed record");
  t.equal(result.key, RECORD_KEY, "compares against the scoped key");
  t.equal(
    result.fingerprint,
    SCOPED_FINGERPRINT,
    "compares against the scoped fingerprint"
  );
  t.equal(store.calls.length, 1, "does not pay for a fallback lookup");
});

test("lookupWithLegacyFallback - keeps a same-scope fingerprint hit", async (t) => {
  const otherKey = buildRecordKey(SCOPE_TOKEN, "other-key-123456789012");
  const scoped = record({ key: otherKey });
  const store = storeWith({ byKey: null, byFingerprint: scoped });

  const result = await lookupWithLegacyFallback(store, lookupOptions());

  t.equal(
    result.lookup.byFingerprint,
    scoped,
    "keeps the record so the caller can answer 409"
  );
  t.equal(result.key, RECORD_KEY, "compares against the scoped key");
  t.equal(store.calls.length, 1, "does not pay for a fallback lookup");
});

test("lookupWithLegacyFallback - drops a foreign fingerprint and replays a legacy record", async (t) => {
  const legacyFingerprint = await generateFingerprint(BODY);
  const legacy = record({
    key: CLIENT_KEY,
    fingerprint: legacyFingerprint
  });
  const foreign = record({ key: "legacy-other-key-123456789" });
  const store = storeWith(
    { byKey: null, byFingerprint: foreign },
    { byKey: legacy, byFingerprint: null }
  );

  const result = await lookupWithLegacyFallback(store, lookupOptions());

  t.equal(result.lookup.byKey, legacy, "returns the legacy record");
  t.equal(
    result.lookup.byFingerprint,
    null,
    "does not let the legacy fingerprint index answer"
  );
  t.equal(result.key, CLIENT_KEY, "compares against the client key");
  t.equal(
    result.fingerprint,
    legacyFingerprint,
    "compares against the legacy fingerprint"
  );
  t.equal(
    store.calls.length,
    2,
    "retries the lookup under the legacy identity"
  );
  t.equal(store.calls[1].key, CLIENT_KEY, "looks the legacy record up by key");
  t.equal(
    store.calls[1].fingerprint,
    legacyFingerprint,
    "looks the legacy record up by the pre-scoping fingerprint"
  );
});

test("lookupWithLegacyFallback - returns a miss when neither identity has a record", async (t) => {
  const store = storeWith(
    { byKey: null, byFingerprint: null },
    { byKey: null, byFingerprint: null }
  );

  const result = await lookupWithLegacyFallback(store, lookupOptions());

  t.equal(result.lookup.byKey, null, "no keyed record");
  t.equal(result.lookup.byFingerprint, null, "no fingerprint record");
  t.equal(result.key, RECORD_KEY, "compares against the scoped key");
  t.equal(
    result.fingerprint,
    SCOPED_FINGERPRINT,
    "compares against the scoped fingerprint"
  );
  t.equal(store.calls.length, 2, "checked both identities");
});

test("lookupWithLegacyFallback - returns a legacy hit with a different fingerprint for 422", async (t) => {
  const legacy = record({ fingerprint: "bbbbbbbbbbbbbbbb" });
  const store = storeWith(
    { byKey: null, byFingerprint: null },
    { byKey: legacy, byFingerprint: null }
  );

  const result = await lookupWithLegacyFallback(store, lookupOptions());
  const conflict = checkLookupConflicts(
    result.lookup,
    result.key,
    result.fingerprint
  );

  t.equal(result.lookup.byKey, legacy, "returns the keyed record");
  t.equal(result.key, CLIENT_KEY, "compares against the client key");
  t.equal(conflict.conflict, true, "a changed payload still conflicts");
  t.equal(conflict.status, 422, "with the pre-upgrade 422");
});

test("lookupWithLegacyFallback - ignores a foreign legacy fingerprint hit", async (t) => {
  const legacyFingerprint = await generateFingerprint(BODY);
  const foreign = record({
    key: "legacy-other-key-123456789",
    fingerprint: legacyFingerprint
  });
  const store = storeWith(
    { byKey: null, byFingerprint: null },
    { byKey: null, byFingerprint: foreign }
  );

  const result = await lookupWithLegacyFallback(store, lookupOptions());

  t.equal(result.lookup.byKey, null, "no keyed record");
  t.equal(
    result.lookup.byFingerprint,
    null,
    "does not adopt a foreign fingerprint hit"
  );
  t.equal(result.key, RECORD_KEY, "compares against the scoped key");
});

test("lookupWithLegacyFallback - applies exclusions to the pre-scoping fingerprint", async (t) => {
  const body = JSON.stringify({ foo: "bar", timestamp: "2024-01-01" });
  const legacyFingerprint = await generateFingerprint(body, ["timestamp"]);
  const legacy = record({
    key: CLIENT_KEY,
    fingerprint: legacyFingerprint
  });
  const store = storeWith(
    { byKey: null, byFingerprint: null },
    { byKey: legacy, byFingerprint: null }
  );

  const result = await lookupWithLegacyFallback(
    store,
    lookupOptions({ body, excludeFields: ["timestamp"] })
  );

  t.equal(
    result.lookup.byKey,
    legacy,
    "matches a record written with the same exclusions"
  );
  t.equal(
    store.calls[1].fingerprint,
    legacyFingerprint,
    "hashes the body with the configured exclusions"
  );
});

test("lookupWithLegacyFallback - promotes a torn legacy fingerprint hit", async (t) => {
  const legacyFingerprint = await generateFingerprint(BODY);
  const legacy = record({
    key: CLIENT_KEY,
    fingerprint: legacyFingerprint
  });
  const store = storeWith(
    { byKey: null, byFingerprint: null },
    { byKey: null, byFingerprint: legacy }
  );

  const result = await lookupWithLegacyFallback(store, lookupOptions());

  t.equal(
    result.lookup.byKey,
    legacy,
    "promotes the fingerprint record that carries the client key"
  );
  t.equal(result.key, CLIENT_KEY, "compares against the client key");
});
