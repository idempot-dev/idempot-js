/**
 * Unique-key factory for benchmark state: each call returns a fresh key
 * with the form `<prefix>-<zero-padded counter>`, unique within the
 * factory (and long enough for the 21-255 key-validation window).
 *
 * @param {number} padTo minimum digit count of the counter
 * @returns {(prefix: string) => string}
 */
export function createKeyFactory(padTo) {
  let counter = 0;
  return (prefix) => {
    counter += 1;
    return `${prefix}-${String(counter).padStart(padTo, "0")}`;
  };
}
