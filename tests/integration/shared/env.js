/**
 * Read a TCP port from the environment, falling back to a default.
 * Malformed values fail here with the variable name instead of becoming NaN
 * deep inside a connection attempt.
 *
 * @param {string} name - Environment variable name
 * @param {number} fallback - Port to use when the variable is unset
 * @returns {number}
 */
export function readPort(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `${name} must be a port number between 1 and 65535, got "${raw}"`
    );
  }
  return port;
}
