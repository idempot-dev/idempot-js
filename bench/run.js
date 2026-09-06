#!/usr/bin/env node
import { loadModules, runSuite, validateSelection } from "./lib/runner.js";

const args = process.argv.slice(2);
const names = [];
let preset = "full";

for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--preset") {
    preset = args[++index];
  } else if (arg.startsWith("--preset=")) {
    preset = arg.slice("--preset=".length);
  } else {
    names.push(arg);
  }
}

if (preset !== "full" && preset !== "quick") {
  console.error(
    `Unknown preset: ${preset}. Use --preset full or --preset quick.`
  );
  process.exit(1);
}

const modules = await loadModules();
const selection = validateSelection(modules, names);
if (!selection.ok) {
  console.error(selection.error);
  process.exit(1);
}

await runSuite({ preset, modules: selection.selected });
