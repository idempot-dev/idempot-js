#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const CLASS_TAGS = ["@draft", "@library"];
const SECTION_PREFIX = "@section:";

/**
 * @param {string} line
 * @returns {string[]}
 */
function tagsOn(line) {
  return line
    .trim()
    .split(/\s+/)
    .filter((token) => token.startsWith("@"));
}

/**
 * @param {string} text
 * @returns {Set<string>}
 */
function declaredSections(text) {
  const sections = new Set();
  for (const line of text.split("\n")) {
    const match = /^\s*(\d+(?:\.\d+)+)\.\s/.exec(line);
    if (match) sections.add(match[1]);
  }
  return sections;
}

/**
 * Tags are inherited, so a Rule carries the class of every scenario inside it.
 * @param {string} text
 * @returns {{title: string, tags: string[], scenarios: {name: string, tags: string[], line: number}[], line: number}[]}
 */
function parseRules(text) {
  /** @type {ReturnType<typeof parseRules>} */
  const rules = [];
  let pending = [];
  let current = null;

  text.split("\n").forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    if (line.startsWith("@")) {
      pending.push(...tagsOn(line));
      return;
    }
    if (line.startsWith("Rule:")) {
      current = {
        title: line.slice("Rule:".length).trim(),
        tags: pending,
        scenarios: [],
        line: index + 1
      };
      rules.push(current);
      pending = [];
      return;
    }
    if (line.startsWith("Scenario:") || line.startsWith("Scenario Outline:")) {
      const scenario = {
        name: line.replace(/^Scenario(?: Outline)?:\s*/, ""),
        tags: pending,
        line: index + 1
      };
      if (current) {
        current.scenarios.push(scenario);
      } else {
        rules.push({
          title: "",
          tags: [],
          scenarios: [scenario],
          line: index + 1
        });
      }
      pending = [];
    }
  });

  return rules;
}

/**
 * @param {string} featurePath
 * @param {string} draftPath
 * @returns {number}
 */
function main(featurePath, draftPath) {
  const rules = parseRules(readFileSync(featurePath, "utf8"));
  const sections = declaredSections(readFileSync(draftPath, "utf8"));
  /** @type {string[]} */
  const problems = [];
  /** @type {Map<string, number>} */
  const bySection = new Map();
  let draft = 0;
  let library = 0;

  for (const rule of rules) {
    const classes = rule.tags.filter((tag) => CLASS_TAGS.includes(tag));
    const ruleSections = rule.tags
      .filter((tag) => tag.startsWith(SECTION_PREFIX))
      .map((tag) => tag.slice(SECTION_PREFIX.length));

    if (!rule.title) {
      problems.push(
        `line ${rule.line}: scenario "${rule.scenarios[0]?.name}" is outside a Rule, so it has no class`
      );
    } else if (classes.length !== 1) {
      problems.push(
        `line ${rule.line}: Rule "${rule.title}" carries ${classes.length} class tags (${classes.join(", ") || "none"}), expected exactly one`
      );
    } else if (classes[0] === "@draft") {
      if (ruleSections.length !== 1) {
        problems.push(
          `line ${rule.line}: Rule "${rule.title}" is @draft and carries ${ruleSections.length} @section tags, expected exactly one`
        );
      }
      for (const section of ruleSections) {
        if (!sections.has(section)) {
          problems.push(
            `line ${rule.line}: Rule "${rule.title}" cites section ${section}, which SPEC.md does not declare`
          );
        }
        bySection.set(
          section,
          (bySection.get(section) ?? 0) + rule.scenarios.length
        );
      }
    } else if (ruleSections.length > 0) {
      problems.push(
        `line ${rule.line}: Rule "${rule.title}" is @library and must not cite a draft section`
      );
    }

    if (rule.scenarios.length === 0) {
      problems.push(
        `line ${rule.line}: Rule "${rule.title}" holds no scenarios`
      );
    }

    for (const scenario of rule.scenarios) {
      const own = scenario.tags.filter((tag) => CLASS_TAGS.includes(tag));
      if (own.length > 0) {
        problems.push(
          `line ${scenario.line}: scenario "${scenario.name}" carries ${own.join(", ")}, but tags are inherited and a scenario must not add a class`
        );
      }
    }

    if (classes[0] === "@draft") draft += rule.scenarios.length;
    if (classes[0] === "@library") library += rule.scenarios.length;
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    console.error(
      `\n${problems.length} classification problem(s) in ${featurePath}`
    );
    return 1;
  }

  console.log(
    `spec classification: ${draft + library} scenarios, ${draft} draft, ${library} library`
  );
  for (const [section, count] of [...bySection].sort()) {
    const label = `@draft @section:${section}`;
    console.log(`  ${label.padEnd(22)}${count}`);
  }
  console.log(`  ${"@library".padEnd(22)}${library}`);
  return 0;
}

process.exitCode = main(
  process.argv[2]
    ? resolve(process.argv[2])
    : resolve(root, "tests/spec/idempotency.feature"),
  process.argv[3] ? resolve(process.argv[3]) : resolve(root, "SPEC.md")
);
