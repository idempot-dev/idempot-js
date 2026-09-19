#!/usr/bin/env node
import {
  PRESETS,
  loadModules,
  runSuite,
  validateSelection
} from "./lib/runner.js";

const args = process.argv.slice(2);
const names = [];
let preset = "full";
let resultsFile = true;

for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--preset") {
    preset = args[++index];
  } else if (arg.startsWith("--preset=")) {
    preset = arg.slice("--preset=".length);
  } else if (arg === "--no-results-file") {
    resultsFile = false;
  } else {
    names.push(arg);
  }
}

if (!Object.hasOwn(PRESETS, preset)) {
  console.error(
    `Unknown preset: ${preset}. Use --preset ${Object.keys(PRESETS).join(" or --preset ")}.`
  );
  process.exit(1);
}

const modules = await loadModules();
const selection = validateSelection(modules, names);
if (!selection.ok) {
  // A bun-only module matches a requested name while running under Node;
  // point at the bun entry point instead of just listing what is missing.
  const wantsBunOnly = names.some(
    (name) =>
      !modules.some((module) => module.name.includes(name)) &&
      (name.includes("bun") || name.includes("bunsql"))
  );
  console.error(selection.error);
  if (wantsBunOnly) {
    console.error(
      "The selected benchmark requires the Bun runtime. Run it with `pnpm bench:bun` (add --preset quick as needed)."
    );
  }
  process.exit(1);
}

await runSuite({ preset, modules: selection.selected, resultsFile });
