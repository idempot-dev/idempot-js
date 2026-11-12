#!/usr/bin/env node
/**
 * Self-check for scripts/check-spec-classification.js.
 *
 * The checker is the only thing between a misclassified feature file and green CI,
 * so its branches are pinned by fixtures instead of by hand. Lives outside the tap
 * include globs: dev tooling is verified by its own check (like bench/smoke.js),
 * not by the library coverage gate.
 *
 * Run via `pnpm test:spec-classification-checker`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "check-spec-classification.js"
);

const SPEC = [
  "# Draft",
  "",
  "2.1. The key value",
  "",
  "2.6. Idempotency enforcement",
  "",
  "2.7. Error handling",
  "",
  "2.10. Later section",
  ""
].join("\n");

const dir = mkdtempSync(join(tmpdir(), "spec-classification-"));
const specPath = join(dir, "SPEC.md");
writeFileSync(specPath, SPEC);

/**
 * @param {string} name fixture name, also the file name
 * @param {string} body fixture feature text
 * @returns {{status: number|null, stdout: string, stderr: string}}
 */
function run(name, body) {
  const featurePath = join(dir, `${name}.feature`);
  writeFileSync(featurePath, body);
  const result = spawnSync(process.execPath, [SCRIPT, featurePath, specPath], {
    encoding: "utf8"
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

const CLASSIFIED = `Feature: Compliance
  @draft @section:2.1
  Rule: Draft section 2.1 - The key value
    Scenario: Accepts a well-formed key
      Given a request

  @library
  Rule: Library policy - Method scope
    Scenario: Accepts POST
      Given a request
`;

test("reports counts and exits zero for a classified file", () => {
  const { status, stdout } = run("classified", CLASSIFIED);
  assert.equal(status, 0);
  assert.match(stdout, /2 scenarios, 1 draft, 1 library/);
});

test("lists sections in numeric order", () => {
  const { stdout } = run(
    "numeric-order",
    `Feature: Compliance
  @draft @section:2.10
  Rule: Later
    Scenario: a
      Given x

  @draft @section:2.6
  Rule: Earlier
    Scenario: b
      Given x

  @draft @section:2.7
  Rule: Middle
    Scenario: c
      Given x
`
  );
  assert.match(
    stdout,
    /@draft @section:2\.6[\s\S]*@draft @section:2\.7[\s\S]*@draft @section:2\.10/
  );
});

test("fails when the feature file holds no scenarios", () => {
  const { status, stderr } = run("empty", "Feature: Compliance\n");
  assert.equal(status, 1);
  assert.match(stderr, /no scenarios/i);
});

test("fails when no Rule is draft-mandated", () => {
  const { status, stderr } = run(
    "all-library",
    `Feature: Compliance
  @library
  Rule: Library policy - Method scope
    Scenario: Accepts POST
      Given a request
`
  );
  assert.equal(status, 1);
  assert.match(stderr, /no @draft Rule/i);
});

test("fails when a Rule carries no class tag", () => {
  const { status, stderr } = run(
    "no-class",
    `Feature: Compliance
  Rule: Unclassified
    Scenario: a
      Given x
`
  );
  assert.equal(status, 1);
  assert.match(stderr, /carries 0 class tags/);
});

test("fails when a Rule carries two class tags", () => {
  const { status, stderr } = run(
    "two-classes",
    `Feature: Compliance
  @draft @library @section:2.1
  Rule: Conflicted
    Scenario: a
      Given x
`
  );
  assert.equal(status, 1);
  assert.match(stderr, /carries 2 class tags/);
});

test("fails when a scenario adds a class tag", () => {
  const { status, stderr } = run(
    "scenario-class",
    `Feature: Compliance
  @library
  Rule: Library policy - Method scope
    @draft
    Scenario: a
      Given x
`
  );
  assert.equal(status, 1);
  assert.match(stderr, /inherited/);
});

test("fails when a scenario cites a section", () => {
  const { status, stderr } = run(
    "scenario-section",
    `Feature: Compliance
  @library
  Rule: Library policy - Method scope
    @section:2.1
    Scenario: a
      Given x
`
  );
  assert.equal(status, 1);
  assert.match(stderr, /scenario "a" cites/);
});

test("fails when a draft Rule cites no section", () => {
  const { status, stderr } = run(
    "draft-no-section",
    `Feature: Compliance
  @draft
  Rule: Draft without a section
    Scenario: a
      Given x
`
  );
  assert.equal(status, 1);
  assert.match(stderr, /0 @section tags/);
});

test("fails when a section is absent from the draft", () => {
  const { status, stderr } = run(
    "unknown-section",
    `Feature: Compliance
  @draft @section:9.9
  Rule: Cites nothing
    Scenario: a
      Given x
`
  );
  assert.equal(status, 1);
  assert.match(stderr, /SPEC\.md does not declare/);
});

test("fails when a library Rule cites a section", () => {
  const { status, stderr } = run(
    "library-section",
    `Feature: Compliance
  @library @section:2.1
  Rule: Library claiming draft
    Scenario: a
      Given x
`
  );
  assert.equal(status, 1);
  assert.match(stderr, /must not cite/);
});

test("fails when a Rule holds no scenarios", () => {
  const { status, stderr } = run(
    "empty-rule",
    `Feature: Compliance
  @library
  Rule: Nothing here
`
  );
  assert.equal(status, 1);
  assert.match(stderr, /holds no scenarios/);
});

test("fails when a scenario sits outside a Rule", () => {
  const { status, stderr } = run(
    "orphan",
    `Feature: Compliance
  Scenario: Orphaned
    Given x
`
  );
  assert.equal(status, 1);
  assert.match(stderr, /outside a Rule/);
});

test("fails when the Feature line carries a class tag", () => {
  const { status, stderr } = run(
    "feature-tag",
    `@draft
Feature: Compliance
  @library
  Rule: Library policy - Method scope
    Scenario: a
      Given x
`
  );
  assert.equal(status, 1);
  assert.match(stderr, /Feature line/);
});

test("ignores tag-shaped lines inside a doc string", () => {
  const { status } = run(
    "doc-string",
    `Feature: Compliance
  @draft @section:2.1
  Rule: Draft section 2.1 - The key value
    Scenario: a
      Given a request
      """
      @library
      """
  @library
  Rule: Library policy - Method scope
    Scenario: b
      Given a request
`
  );
  assert.equal(status, 0);
});

test("pins the counts the published claim quotes", () => {
  const result = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /49 scenarios, 13 draft, 36 library/);
});
