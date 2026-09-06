#!/usr/bin/env node
/**
 * Smoke self-check for the benchmark harness: asserts the METRIC output is
 * well-formed and positive, and that selection/error exit codes behave.
 * Run via `pnpm bench:smoke`. Excluded from tap coverage like the rest of
 * bench/ (verified by execution, not unit tests).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BENCH_DIR = path.dirname(fileURLToPath(import.meta.url));
const RUN = path.join(BENCH_DIR, "run.js");

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) {
    failures += 1;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    console.log(`ok: ${name}`);
  }
}

function runBench(args) {
  return spawnSync(process.execPath, [RUN, ...args], { encoding: "utf8" });
}

// 1. Fixture run: METRIC lines exist, well-formed, and numerically sane.
const fixture = runBench(["--preset", "quick", "fixture"]);
check("fixture run exits 0", fixture.status === 0, fixture.stderr);
const metricLines = fixture.stdout
  .split("\n")
  .filter((line) => line.startsWith("METRIC "));
check(
  "fixture emits METRIC lines",
  metricLines.length >= 2,
  `got ${metricLines.length}`
);
for (const line of metricLines) {
  const match = /^METRIC ([\w.]+)=([\d.eE+-]+)$/.exec(line);
  check(`METRIC grammar: ${line.slice(0, 60)}`, match !== null);
  if (match) {
    const value = Number(match[2]);
    check(
      `METRIC value positive: ${match[1]}`,
      Number.isFinite(value) && value > 0,
      String(value)
    );
  }
}

// 2. Selection matrix.
const fingerprint = runBench(["--preset", "quick", "fingerprint"]);
check("substring selection exits 0", fingerprint.status === 0);
check(
  "substring selection runs only micro.fingerprint",
  fingerprint.stdout.includes("micro.fingerprint") &&
    !fingerprint.stdout.includes("micro.validation") &&
    !fingerprint.stdout.includes("e2e.hono-sqlite")
);
const ambiguous = runBench(["--preset", "quick", "micro"]);
check("ambiguous selection exits 1", ambiguous.status === 1);
check("ambiguous selection explains", /Ambiguous/.test(ambiguous.stderr));
const unknown = runBench(["--preset", "quick", "nope"]);
check("unknown module exits 1", unknown.status === 1);
check(
  "unknown module explains",
  /Unknown benchmark module/.test(unknown.stderr)
);
const badPreset = runBench(["--preset", "bogus"]);
check("unknown preset exits 1", badPreset.status === 1);
check("unknown preset explains", /Unknown preset/.test(badPreset.stderr));

if (failures > 0) {
  console.error(`\n${failures} smoke check(s) failed.`);
  process.exit(1);
}
console.log("\nAll smoke checks passed.");
