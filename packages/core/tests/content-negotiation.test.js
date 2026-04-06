import { describe, it } from "node:test";
import assert from "node:assert";
import {
  parseAcceptHeader,
  selectResponseFormat
} from "../src/content-negotiation.js";

describe("content-negotiation", () => {
  describe("parseAcceptHeader", () => {
    it("should parse single type without q-value", () => {
      const result = parseAcceptHeader("application/json");
      assert.deepStrictEqual(result, [{ type: "application/json", q: 1 }]);
    });

    it("should parse multiple types with q-values", () => {
      const result = parseAcceptHeader(
        "text/markdown;q=0.9, application/json;q=0.8"
      );
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].type, "text/markdown");
      assert.strictEqual(result[0].q, 0.9);
      assert.strictEqual(result[1].type, "application/json");
      assert.strictEqual(result[1].q, 0.8);
    });

    it("should sort by q-value descending", () => {
      const result = parseAcceptHeader(
        "application/json;q=0.5, text/markdown;q=0.9"
      );
      assert.strictEqual(result[0].type, "text/markdown");
      assert.strictEqual(result[1].type, "application/json");
    });

    it("should handle wildcard */*", () => {
      const result = parseAcceptHeader("*/*");
      assert.deepStrictEqual(result, [{ type: "*/*", q: 1 }]);
    });

    it("should return empty array for empty header", () => {
      const result = parseAcceptHeader("");
      assert.deepStrictEqual(result, []);
    });
  });

  describe("selectResponseFormat", () => {
    it("should default to problem+json for empty header", () => {
      const result = selectResponseFormat("");
      assert.strictEqual(result, "application/problem+json");
    });

    it("should select problem+json when specified", () => {
      const result = selectResponseFormat("application/problem+json");
      assert.strictEqual(result, "application/problem+json");
    });

    it("should select markdown when specified", () => {
      const result = selectResponseFormat("text/markdown");
      assert.strictEqual(result, "text/markdown");
    });

    it("should select based on highest q-value", () => {
      const result = selectResponseFormat(
        "application/json;q=0.8, text/markdown;q=0.9"
      );
      assert.strictEqual(result, "text/markdown");
    });

    it("should fallback to problem+json for unsupported types", () => {
      const result = selectResponseFormat("text/html");
      assert.strictEqual(result, "application/problem+json");
    });

    it("should handle */* wildcard", () => {
      const result = selectResponseFormat("*/*");
      assert.strictEqual(result, "application/problem+json");
    });

    it("should handle application/* wildcard", () => {
      const result = selectResponseFormat("application/*");
      assert.ok(result.startsWith("application/"));
    });

    it("should select json when explicitly requested", () => {
      const result = selectResponseFormat("application/json");
      assert.strictEqual(result, "application/json");
    });
  });
});
