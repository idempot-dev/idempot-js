/**
 * @typedef {Object} RequestAdapter
 * @property {string} method
 * @property {(name: string) => string | undefined} header
 * @property {() => Promise<string>} body
 */

/**
 * @typedef {Object} ResponseAdapter
 * @property {number} status
 * @property {Headers} headers
 */

/**
 * Creates a request adapter for Express
 * @param {import("express").Request} req
 * @returns {RequestAdapter}
 */
export function createRequestAdapter(req) {
  return {
    method: req.method,
    header: (name) => {
      const lowerName = name.toLowerCase();
      const value = req.headers[lowerName];
      if (Array.isArray(value)) {
        return value[0];
      }
      return value;
    },
    body: async () => {
      if (req.body === undefined) {
        return "";
      }
      if (typeof req.body === "string") {
        return req.body;
      }
      return JSON.stringify(req.body);
    }
  };
}

/**
 * Creates a response adapter for Express
 * @param {import("express").Response} res
 * @returns {ResponseAdapter}
 */
export function createResponseAdapter(res) {
  return {
    get status() {
      return res.statusCode;
    },
    get headers() {
      const headers = new Headers();
      const expressHeaders = res.getHeaders();
      for (const [key, value] of Object.entries(expressHeaders)) {
        if (Array.isArray(value)) {
          value.forEach(v => headers.append(key, v));
        } else {
          headers.set(key, String(value));
        }
      }
      return headers;
    }
  };
}
