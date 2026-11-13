import { test } from "tap";
import { generateFingerprint, generateScopedFingerprint } from "@idempot/core";

test("generateFingerprint - identical JSON produces identical hash", async (t) => {
  const body1 = JSON.stringify({ foo: "bar", baz: 123 });
  const body2 = JSON.stringify({ baz: 123, foo: "bar" });

  const fp1 = await generateFingerprint(body1, []);
  const fp2 = await generateFingerprint(body2, []);

  t.equal(fp1, fp2, "fingerprints should match for equivalent JSON");
  t.ok(fp1.length > 0, "fingerprint should be non-empty");
});

test("generateFingerprint - excludes root-level fields", async (t) => {
  const body1 = JSON.stringify({
    foo: "bar",
    timestamp: "2024-01-01",
    baz: 123
  });
  const body2 = JSON.stringify({
    foo: "bar",
    timestamp: "2024-01-02",
    baz: 123
  });

  const fp1 = await generateFingerprint(body1, ["timestamp"]);
  const fp2 = await generateFingerprint(body2, ["timestamp"]);

  t.equal(fp1, fp2, "fingerprints should match when excluded field differs");
});

test("generateFingerprint - excludes nested fields via JSONPath", async (t) => {
  const body1 = JSON.stringify({
    foo: "bar",
    metadata: { requestId: "req-1", clientId: "client-a" }
  });
  const body2 = JSON.stringify({
    foo: "bar",
    metadata: { requestId: "req-2", clientId: "client-a" }
  });

  const fp1 = await generateFingerprint(body1, ["$.metadata.requestId"]);
  const fp2 = await generateFingerprint(body2, ["$.metadata.requestId"]);

  t.equal(fp1, fp2, "fingerprints should match when nested field excluded");
});

test("generateFingerprint - handles non-JSON bodies", async (t) => {
  const body1 = "plain text body";
  const body2 = "plain text body";
  const body3 = "different text";

  const fp1 = await generateFingerprint(body1, []);
  const fp2 = await generateFingerprint(body2, []);
  const fp3 = await generateFingerprint(body3, []);

  t.equal(fp1, fp2, "identical plain text should have same fingerprint");
  t.not(fp1, fp3, "different plain text should have different fingerprint");
});

test("generateFingerprint - handles empty body", async (t) => {
  const fp1 = await generateFingerprint("", []);
  const fp2 = await generateFingerprint("{}", []);

  t.ok(fp1, "should handle empty string");
  t.ok(fp2, "should handle empty JSON");
  t.not(fp1, fp2, "empty string and empty JSON should differ");
});

test("generateFingerprint - handles arrays", async (t) => {
  const body1 = JSON.stringify({ items: [1, 2, 3] });
  const body2 = JSON.stringify({ items: [1, 2, 3] });

  const fp1 = await generateFingerprint(body1, []);
  const fp2 = await generateFingerprint(body2, []);

  t.equal(fp1, fp2, "arrays should be handled correctly");
});

test("generateFingerprint - a JSONPath exclusion that matches nothing leaves the hash unchanged", async (t) => {
  const body = JSON.stringify({ foo: "bar" });

  const plain = await generateFingerprint(body, []);
  const withMissing = await generateFingerprint(body, ["$.missing.field"]);

  t.equal(
    withMissing,
    plain,
    "an exclusion that matches nothing must not change the hash"
  );
});

test("generateFingerprint - pins the hash the released version produced", async (t) => {
  t.equal(
    await generateFingerprint(""),
    "ef46db3751d8e999",
    "the pre-scoping hash must not change, because stored records depend on it"
  );
});

test("generateFingerprint - pins the released hash for JSON and non-JSON bodies", async (t) => {
  t.equal(
    await generateFingerprint('{"b":2,"a":{"z":1,"y":[3,2]}}'),
    "bdefd44d08ffb620",
    "unsorted nested JSON covers canonicalizeBody's parse, sort and stringify path"
  );
  t.equal(
    await generateFingerprint('{"b":2,"a":1}', ["b"]),
    "ca0b885a32fc8b48",
    "a root exclusion covers the delete path"
  );
  t.equal(
    await generateFingerprint('{"foo":"bar","metadata":{"requestId":"one"}}', [
      "$.metadata.requestId"
    ]),
    "9dbc235ebab77988",
    "a JSONPath exclusion covers the nested delete path"
  );
  t.equal(
    await generateFingerprint("not json"),
    "7081b0bbfc04ee78",
    "a non-JSON body is hashed as sent"
  );
});

test("generateScopedFingerprint - identical scope and body agree", async (t) => {
  const first = await generateScopedFingerprint("0123456789abcdef", '{"a":1}');
  const second = await generateScopedFingerprint("0123456789abcdef", '{"a":1}');

  t.equal(first, second, "same operation and body should match");
  t.equal(first.length, 16, "fingerprint should be a fixed-width hash");
});

test("generateScopedFingerprint - one body under two scopes differs", async (t) => {
  const orders = await generateScopedFingerprint("0123456789abcdef", '{"a":1}');
  const payments = await generateScopedFingerprint(
    "fedcba9876543210",
    '{"a":1}'
  );

  t.not(orders, payments, "a shared payload must not collide across scopes");
});

test("generateScopedFingerprint - differs from the unscoped fingerprint", async (t) => {
  const unscoped = await generateFingerprint('{"a":1}');
  const scoped = await generateScopedFingerprint("0123456789abcdef", '{"a":1}');

  t.not(scoped, unscoped, "a scoped hash must not equal a legacy hash");
});

test("generateScopedFingerprint - still applies root exclusions", async (t) => {
  const body1 = JSON.stringify({ foo: "bar", timestamp: "2024-01-01" });
  const body2 = JSON.stringify({ foo: "bar", timestamp: "2024-01-02" });

  const fp1 = await generateScopedFingerprint("0123456789abcdef", body1, [
    "timestamp"
  ]);
  const fp2 = await generateScopedFingerprint("0123456789abcdef", body2, [
    "timestamp"
  ]);

  t.equal(fp1, fp2, "an excluded field must not change the fingerprint");
});

test("generateScopedFingerprint - still applies JSONPath exclusions", async (t) => {
  const body1 = JSON.stringify({
    foo: "bar",
    metadata: { requestId: "one" }
  });
  const body2 = JSON.stringify({
    foo: "bar",
    metadata: { requestId: "two" }
  });

  const fp1 = await generateScopedFingerprint("0123456789abcdef", body1, [
    "$.metadata.requestId"
  ]);
  const fp2 = await generateScopedFingerprint("0123456789abcdef", body2, [
    "$.metadata.requestId"
  ]);

  t.equal(fp1, fp2, "a JSONPath exclusion must not change the fingerprint");
});

test("generateScopedFingerprint - a non-JSON body is hashed as sent", async (t) => {
  const first = await generateScopedFingerprint("0123456789abcdef", "not json");
  const second = await generateScopedFingerprint(
    "0123456789abcdef",
    "not jsoN"
  );

  t.ok(first, "a non-JSON body should still produce a fingerprint");
  t.not(first, second, "a non-JSON body should be compared as sent");
});

test("generateScopedFingerprint - rejects a malformed scope token", async (t) => {
  await t.rejects(
    generateScopedFingerprint(undefined, "{}"),
    /scopeToken/,
    "an undefined token must not collapse every operation into one scope"
  );
  await t.rejects(
    generateScopedFingerprint("not-a-token", "{}"),
    /scopeToken/,
    "a token of the wrong shape must be rejected"
  );
});

test("generateScopedFingerprint - rejects invalid exclusions", async (t) => {
  await t.rejects(
    generateScopedFingerprint("0123456789abcdef", '{"a":1}', [42]),
    /excludeFields/,
    "the exclusion list should be validated for the scoped hash too"
  );
});
