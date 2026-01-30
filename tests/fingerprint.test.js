import { test } from "tap";
import { generateFingerprint } from "../src/fingerprint.js";

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
