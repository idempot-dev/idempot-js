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

const { modules, hiddenBunCount } = await loadModules();
const selection = validateSelection(modules, names);
if (!selection.ok) {
  console.error(selection.error);
  if (hiddenBunCount > 0) {
    console.error(
      `Note: ${hiddenBunCount} bun-only benchmark modules are excluded under Node; run \`pnpm bench:bun\` to include them.`
    );
  }
  process.exit(1);
}

await runSuite({ preset, modules: selection.selected, resultsFile });
