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
  const body1 = JSON.stringify({ foo: "bar", timestamp: "2024-01-01", baz: 123 });
  const body2 = JSON.stringify({ foo: "bar", timestamp: "2024-01-02", baz: 123 });

  const fp1 = await generateFingerprint(body1, ["timestamp"]);
  const fp2 = await generateFingerprint(body2, ["timestamp"]);

  t.equal(fp1, fp2, "fingerprints should match when excluded field differs");
});
