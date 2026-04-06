import { describe, it } from "node:test";
import assert from "node:assert";
import { formatAsMarkdown } from "../src/markdown-formatter.js";

describe("markdown-formatter", () => {
  it("should format problem JSON as markdown with YAML frontmatter", () => {
    const problem = {
      type: "https://example.com/probs/out-of-credit",
      title: "You do not have enough credit",
      detail: "Your current balance is 30",
      status: 403,
      instance: "urn:uuid:test-123",
      retryable: false
    };

    const result = formatAsMarkdown(problem);

    assert.ok(result.startsWith("---\n"));
    assert.ok(
      result.includes('type: "https://example.com/probs/out-of-credit"')
    );
    assert.ok(result.includes("status: 403"));
    assert.ok(result.includes('instance: "urn:uuid:test-123"'));
    assert.ok(result.includes("retryable: false"));
    assert.ok(result.includes("# You do not have enough credit"));
    assert.ok(result.includes("## What Happened"));
    assert.ok(result.includes("Your current balance is 30"));
  });

  it("should include retryable guidance", () => {
    const problem = {
      type: "https://example.com/probs/rate-limited",
      title: "Rate limited",
      detail: "Too many requests",
      status: 429,
      instance: "urn:uuid:test-456",
      retryable: true
    };

    const result = formatAsMarkdown(problem);

    assert.ok(result.includes("retryable: true"));
    assert.ok(result.includes("Wait and retry"));
  });

  it("should include non-retryable guidance", () => {
    const problem = {
      type: "https://example.com/probs/invalid-key",
      title: "Invalid key",
      detail: "Key format is wrong",
      status: 400,
      instance: "urn:uuid:test-789",
      retryable: false
    };

    const result = formatAsMarkdown(problem);

    assert.ok(result.includes("retryable: false"));
    assert.ok(result.includes("Correct the issue"));
  });

  it("should include idempotency_key when present", () => {
    const problem = {
      type: "https://example.com/probs/conflict",
      title: "Conflict",
      status: 409,
      instance: "urn:uuid:test-abc",
      retryable: false,
      idempotency_key: "my-key-123"
    };

    const result = formatAsMarkdown(problem);

    assert.ok(result.includes('idempotency_key: "my-key-123"'));
  });
});
