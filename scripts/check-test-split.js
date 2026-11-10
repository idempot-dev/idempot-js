#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Split a shell command into arguments, honouring single and double quotes.
 * @param {string} command
 * @returns {string[]}
 */
function tokenize(command) {
  const tokens = [];
  let current = "";
  let quote = null;
  for (const char of command) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
// Reuse the real `test` script so the guard cannot drift from the command it guards.
const tapArgs = tokenize(pkg.scripts.test).slice(1);

const listed = execFileSync(
  process.execPath,
  [resolve(root, "node_modules/tap/dist/esm/run.mjs"), "list", ...tapArgs],
  { cwd: root, encoding: "utf8" }
);

const files = listed
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

if (files.length === 0) {
  console.error("check-test-split: `pnpm test` would run no suites");
  process.exit(1);
}

const integration = files.filter((file) =>
  file.startsWith("tests/integration/")
);
if (integration.length > 0) {
  console.error("check-test-split: `pnpm test` would run integration suites:");
  for (const file of integration) console.error(`  ${file}`);
  process.exit(1);
}

console.log(
  `check-test-split: ${files.length} unit suites, no integration suites`
);
