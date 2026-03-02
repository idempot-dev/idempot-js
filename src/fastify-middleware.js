import { generateFingerprint } from "./fingerprint.js";
import { DEFAULT_OPTIONS } from "./default-options.js";

const HEADER_NAME = "idempotency-key";

export function idempotency(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  if (!opts.store) {
    throw new Error(
      "IdempotencyStore must be provided. " +
        "Use SqliteIdempotencyStore({ path: ':memory:' }) for development"
    );
  }
  const store = opts.store;

  return async (request, reply) => {
    const method = request.method;
    if (method !== "POST" && method !== "PATCH") {
      return;
    }

    const key = request.headers[HEADER_NAME];
    if (key === undefined) {
      if (opts.required) {
        return reply
          .code(400)
          .send({ error: "Idempotency-Key header is required" });
      }
      return;
    }

    if (key.length === 0 || key.length > opts.maxKeyLength) {
      return reply.code(400).send({
        error: `Idempotency-Key must be between 1-${opts.maxKeyLength} characters`
      });
    }

    const bodyText = request.body
      ? typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body)
      : "";
    const fingerprint = await generateFingerprint(bodyText, opts.excludeFields);

    const lookup = await store.lookup(key, fingerprint);

    if (lookup.byKey?.status === "processing") {
      return reply.code(409).send({
        error: "A request with this idempotency key is already being processed"
      });
    }

    if (lookup.byFingerprint && lookup.byFingerprint.key !== key) {
      return reply.code(409).send({
        error:
          "This request was already processed with a different idempotency key"
      });
    }

    if (lookup.byKey && lookup.byKey.fingerprint !== fingerprint) {
      return reply.code(422).send({
        error: "Idempotency key reused with different request payload"
      });
    }

    if (lookup.byKey?.status === "complete" && lookup.byKey.response) {
      const cached = lookup.byKey.response;
      reply.code(cached.status);
      for (const [headerKey, value] of Object.entries(cached.headers)) {
        reply.header(headerKey, value);
      }
      reply.header("x-idempotent-replayed", "true");
      return reply.send(cached.body);
    }

    if (!lookup.byKey && !lookup.byFingerprint) {
      await store.startProcessing(key, fingerprint, opts.ttlMs);

      // Store key for completion after response
      request.idempotencyKey = key;

      // Hook into response to cache it
      const originalSend = reply.send.bind(reply);
      reply.send = (payload) => {
        const capturedBody =
          typeof payload === "string" ? payload : JSON.stringify(payload);
        request.idempotencyBody = capturedBody;
        return originalSend(payload);
      };

      // Use Fastify's onSend hook to capture response
      reply.then(
        () => {
          if (request.idempotencyKey) {
            store
              .complete(request.idempotencyKey, {
                status: reply.statusCode,
                headers: Object.fromEntries(
                  Object.entries(reply.getHeaders()).map(([k, v]) => [k, v])
                ),
                body: request.idempotencyBody || ""
              })
              .catch((err) => {
                console.error("Failed to cache response:", err);
              });
          }
        },
        () => {}
      );
    }
  };
}
