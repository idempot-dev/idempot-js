/**
 * Format RFC 9457 problem details as markdown with YAML frontmatter
 * Optimized for AI agent consumption
 * @module markdown-formatter
 */

/**
 * Convert a problem details object to markdown format
 * @param {Object} problem - RFC 9457 problem details
 * @param {string} problem.type - Problem type URI
 * @param {string} problem.title - Short title
 * @param {string} [problem.detail] - Detailed explanation
 * @param {number} problem.status - HTTP status code
 * @param {string} problem.instance - Error instance URI
 * @param {boolean} problem.retryable - Whether retry might succeed
 * @param {string} [problem.idempotency_key] - The idempotency key
 * @returns {string} Markdown document with YAML frontmatter
 */
export function formatAsMarkdown(problem) {
  const { type, title, detail, status, instance, retryable, idempotency_key } =
    problem;

  // Build YAML frontmatter with known fields only
  const frontmatter = {
    type,
    status,
    instance,
    retryable
  };

  if (idempotency_key !== undefined) {
    frontmatter.idempotency_key = idempotency_key;
  }

  const yamlLines = Object.entries(frontmatter).map(([key, value]) => {
    if (typeof value === "string") {
      return `${key}: "${value}"`;
    }
    return `${key}: ${value}`;
  });

  // Build guidance based on retryable flag
  const guidance = retryable
    ? `**Wait and retry.** This error may be transient. Wait a moment before retrying with the same idempotency key.`
    : `**Correct the issue.** This error requires changes to your request. Do not retry with the same idempotency key until the issue is resolved.`;

  // Build markdown body
  return `---
${yamlLines.join("\n")}
---

# ${title}

## What Happened

${detail || title}

## What You Should Do

${guidance}
`;
}
