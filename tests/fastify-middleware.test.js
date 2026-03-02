import { test } from "tap";
import Fastify from "fastify";
import { idempotency } from "../src/fastify-middleware.js";
import { SqliteIdempotencyStore } from "../src/store/sqlite.js";

test("returns 400 if idempotency-key is missing and required", async (t) => {
  const store = new SqliteIdempotencyStore({ path: ":memory:" });
  const fastify = Fastify();

  fastify.post(
    "/test",
    { preHandler: idempotency({ store, required: true }) },
    async (request, reply) => {
      return reply.send({ ok: true });
    }
  );

  const response = await fastify.inject({
    method: "POST",
    url: "/test",
    payload: { foo: "bar" }
  });

  t.equal(response.statusCode, 400);
  t.match(response.json(), { error: /Idempotency-Key header is required/ });
});
