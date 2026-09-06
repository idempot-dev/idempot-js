import { validateIdempotencyKey } from "../packages/core/src/validation.js";

// 24 characters: inside the default 21-255 window.
const VALID_KEY = "V8st4XqY2pQz9wLm5nRc1KjD";
const TOO_SHORT_KEY = "short-key";
const TOO_LONG_KEY = "k".repeat(256);

/**
 * Key validation benchmarks covering the accept path and both
 * length-rejection branches of validateIdempotencyKey.
 */
export default {
  name: "micro.validation",
  register(bench) {
    bench.add("key validation accept", () => validateIdempotencyKey(VALID_KEY));
    bench.add("key validation reject (too short)", () =>
      validateIdempotencyKey(TOO_SHORT_KEY)
    );
    bench.add("key validation reject (too long)", () =>
      validateIdempotencyKey(TOO_LONG_KEY)
    );
  }
};
