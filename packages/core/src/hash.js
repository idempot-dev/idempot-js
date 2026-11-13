import xxhash from "xxhash-wasm";

/** @typedef {import("xxhash-wasm").XXHashAPI} XXHashAPI */

/** @type {XXHashAPI | null} */
let instance = null;

/**
 * Initialise the hasher once and reuse it, since the wasm module is expensive to
 * instantiate and every fingerprint needs it.
 * @returns {Promise<XXHashAPI>}
 */
async function getHasher() {
  if (!instance) {
    instance = await xxhash();
  }
  return instance;
}

/**
 * @param {string} input
 * @returns {Promise<string>} 64 bit hash as 16 lowercase hex characters
 */
export async function hash64(input) {
  const hasher = await getHasher();
  return hasher.h64ToString(input);
}
