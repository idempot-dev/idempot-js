import { generateFingerprint } from "../packages/core/src/fingerprint.js";

// ~1KB representative JSON payment body with the nested shapes the
// exclusion paths operate on.
const BODY = JSON.stringify({
  requestId: "req-b7f2c9a4-1d3e-4f5a-8b6c-2e9d0a7f4c1b",
  user: {
    id: "usr_84213",
    email: "customer@example.com",
    profile: {
      ssn: "***-**-4213",
      tier: "gold",
      address: { street: "1 Market St", city: "SF", zip: "94103" }
    }
  },
  items: [
    { sku: "SKU-001", qty: 2, price: 1999, traceId: "tr_0001" },
    { sku: "SKU-002", qty: 1, price: 4999, traceId: "tr_0002" },
    { sku: "SKU-003", qty: 5, price: 299, traceId: "tr_0003" }
  ],
  payment: {
    method: "card",
    currency: "usd",
    amount: 9494,
    metadata: { source: "web", campaign: "summer-2026", sessionId: "s_9931" }
  }
});

const NON_JSON_BODY =
  '<order><id>req-b7f2c9a4</id><user id="usr_84213" tier="gold"/><payment method="card" amount="9494" currency="usd"/></order>';

// Mixed root-level and JSONPath (`$.`-prefixed nested) exclusions so both
// the root `delete` path and the jsonpath-plus callback path are exercised.
const EXCLUDE_FIELDS = [
  "requestId",
  "$.user.email",
  "$.user.profile.ssn",
  "$.items[*].traceId"
];

// Warm the lazy xxhash-wasm singleton once, outside any timed task, so
// one-time async init cost is excluded from every benchmark below. (A cold
// call measures init as part of its own latency.)
await generateFingerprint(BODY);

/**
 * Fingerprint hot-path benchmarks.
 *
 * - "parse+hash": the default generateFingerprint path on JSON input.
 * - "raw hash": non-JSON input takes the parse-failure branch and hashes
 *   the raw string — the parse+hash minus raw-hash gap isolates JSON.parse
 *   cost for diagnosis.
 * - "exclusion filtering": JSON input plus excludeFields, isolating the
 *   jsonpath-plus exclusion cost.
 */
export default {
  name: "micro.fingerprint",
  register(bench) {
    // All timed fns are real `async` arrows: tinybench classifies a task as
    // async by the AsyncFunction constructor, and a plain arrow returning a
    // promise would be measured on the sync path (only up to the first
    // await), producing meaningless numbers.
    bench.add("parse+hash (steady state)", async () => {
      await generateFingerprint(BODY);
    });
    bench.add("exclusion filtering", async () => {
      await generateFingerprint(BODY, EXCLUDE_FIELDS);
    });
    bench.add("raw hash (non-JSON body)", async () => {
      await generateFingerprint(NON_JSON_BODY);
    });
  }
};
