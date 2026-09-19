#!/usr/bin/env node
import {
  PRESETS,
  loadModules,
  runSuite,
  runtimeInfo,
  validateSelection
} from "./lib/runner.js";
import {
  compareRuns,
  formatComparison,
  guardComparison,
  readBaseline
} from "./lib/compare.js";

const args = process.argv.slice(2);
const names = [];
let preset = "full";
let resultsFile = true;
let saveBaselinePath = null;
let comparePath = null;
let label = null;
let saveBaselineSeen = false;
let compareSeen = false;

for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--preset") {
    preset = args[++index];
  } else if (arg.startsWith("--preset=")) {
    preset = arg.slice("--preset=".length);
  } else if (arg === "--no-results-file") {
    resultsFile = false;
  } else if (arg === "--save-baseline") {
    saveBaselineSeen = true;
    saveBaselinePath = args[++index];
  } else if (arg.startsWith("--save-baseline=")) {
    saveBaselineSeen = true;
    saveBaselinePath = arg.slice("--save-baseline=".length);
  } else if (arg === "--compare") {
    compareSeen = true;
    comparePath = args[++index];
  } else if (arg.startsWith("--compare=")) {
    compareSeen = true;
    comparePath = arg.slice("--compare=".length);
  } else if (arg === "--label") {
    label = args[++index];
  } else if (arg.startsWith("--label=")) {
    label = arg.slice("--label=".length);
  } else {
    names.push(arg);
  }
}

// A valueless flag must fail loudly: a silently skipped baseline capture
// or comparison is discovered only after the work it was supposed to
// serve is gone.
if (saveBaselineSeen && !saveBaselinePath) {
  console.error("--save-baseline requires a file path.");
  process.exit(1);
}
if (compareSeen && !comparePath) {
  console.error("--compare requires a baseline file path.");
  process.exit(1);
}

if (!Object.hasOwn(PRESETS, preset)) {
  console.error(
    `Unknown preset: ${preset}. Use --preset ${Object.keys(PRESETS).join(" or --preset ")}.`
  );
  process.exit(1);
}

// Guard mismatches before the run: both refused dimensions (preset,
// runtime) are known at argument-parse time, so a comparison that cannot
// be valid fails in under a second instead of after the whole suite.
if (comparePath) {
  const reference = readBaseline(comparePath);
  const preRunProblems = guardComparison(reference, {
    version: 1,
    preset,
    runtime: runtimeInfo()
  });
  if (preRunProblems.length > 0) {
    for (const problem of preRunProblems) {
      console.error(`Cannot compare against ${comparePath}: ${problem}`);
    }
    process.exit(1);
  }
}

const { modules, hiddenBunCount } = await loadModules();
const selection = validateSelection(modules, names);
if (!selection.ok) {
  console.error(selection.error);
  // A bun-only module matches a requested name while running under Node,
  // or the caller is discovering the suite: point at the bun entry point.
  const wantsBunOnly = names.some(
    (name) =>
      !modules.some((module) => module.name.includes(name)) &&
      (name.includes("bun") || name.includes("bunsql"))
  );
  if (wantsBunOnly) {
    console.error(
      "The selected benchmark requires the Bun runtime. Run it with `pnpm bench:bun` (add --preset quick as needed)."
    );
  } else if (hiddenBunCount > 0) {
    console.error(
      `Note: ${hiddenBunCount} bun-only benchmark modules are excluded under Node; run \`pnpm bench:bun\` to include them.`
    );
  }
  process.exit(1);
}

const { baseline } = await runSuite({
  preset,
  modules: selection.selected,
  resultsFile,
  label,
  saveBaselinePath
});

if (comparePath) {
  const reference = readBaseline(comparePath);
  const problems = guardComparison(reference, baseline);
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(`Cannot compare against ${comparePath}: ${problem}`);
    }
    process.exit(1);
  }
  console.log("");
  console.log(
    formatComparison(compareRuns(reference, baseline), {
      baselinePath: comparePath
    })
  );
}
