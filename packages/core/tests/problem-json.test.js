import { describe, it } from "node:test";
import assert from "node:assert";
import {
  conflictErrorResponse,
  keyValidationErrorResponse,
  missingKeyResponse,
  storeUnavailableResponse
} from "../src/problem-json.js";

describe("problem-json", () => {
  describe("missingKeyResponse", () => {
    it("should include RFC 9457 fields", () => {
      const result = missingKeyResponse({
        status: 400,
        instance: "urn:uuid:test-123"
      });

      assert.strictEqual(result.status, 400);
      assert.strictEqual(result.instance, "urn:uuid:test-123");
      assert.strictEqual(result.retryable, false);
      assert.ok(result.type.includes("section-2.1"));
    });
  });

  describe("keyValidationErrorResponse", () => {
    it("should include idempotency_key when provided", () => {
      const result = keyValidationErrorResponse("Key too short", {
        status: 400,
        instance: "urn:uuid:test-456",
        idempotencyKey: "short"
      });

      assert.strictEqual(result.idempotency_key, "short");
      assert.strictEqual(result.retryable, false);
    });
  });

  describe("conflictErrorResponse", () => {
    it("should mark concurrent requests as retryable", () => {
      const result = conflictErrorResponse(
        409,
        "A request with this idempotency key is already being processed",
        { instance: "urn:uuid:test-789" }
      );

      assert.strictEqual(result.retryable, true);
      assert.strictEqual(result.status, 409);
    });

    it("should mark fingerprint conflict as not retryable", () => {
      const result = conflictErrorResponse(
        409,
        "This request was already processed with a different idempotency key",
        { instance: "urn:uuid:test-abc" }
      );

      assert.strictEqual(result.retryable, false);
    });

    it("should mark 422 as not retryable", () => {
      const result = conflictErrorResponse(422, "Idempotency key reused", {
        instance: "urn:uuid:test-def"
      });

      assert.strictEqual(result.retryable, false);
      assert.strictEqual(result.status, 422);
    });
  });

  describe("storeUnavailableResponse", () => {
    it("should use custom type URI and be retryable", () => {
      const result = storeUnavailableResponse({
        status: 503,
        instance: "urn:uuid:test-503"
      });

      assert.strictEqual(
        result.type,
        "https://js.idempot.dev/problems#store-unavailable"
      );
      assert.strictEqual(result.retryable, true);
    });
  });
});
