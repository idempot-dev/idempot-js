import { DEFAULT_OPTIONS } from "./default-options.js";

const HEADER_NAME = "idempotency-key";

export function idempotency(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (request, reply) => {
    const method = request.method;
    if (method !== "POST" && method !== "PATCH") {
      return; // Let request continue
    }

    const key = request.headers[HEADER_NAME];
    if (!key) {
      return reply
        .code(400)
        .send({ error: "Idempotency-Key header is required" });
    }
  };
}
