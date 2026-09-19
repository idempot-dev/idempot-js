#!/usr/bin/env node
/**
 * Smoke self-check for the benchmark harness: asserts the METRIC output is
 * well-formed and positive, that it survives a strict consumer-side parse
 * (emit → parse → re-serialize round-trip, as an external METRIC consumer
 * such as pi-autoresearch must implement), and that selection/error exit
 * codes behave.
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

/**
 * Consumer-side METRIC parser: the grammar an external consumer (e.g. a
 * pi-autoresearch measure script) implements against runner output. Names
 * use only [A-Za-z0-9_.+()-] — slug() lowercases and collapses whitespace,
 * leaving letters, digits, dots, plus, dash, and the parentheses that real
 * task names carry (e.g. "parse+hash (steady state)") — so the first "="
 * separates name from value. Kept here — independent of runner.js — so
 * grammar drift between producer and consumer fails this check instead of
 * surfacing mid-optimization-loop.
 */
function parseMetricLines(stdout) {
  const parsed = [];
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("METRIC ")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) {
      parsed.push({ name: "", value: "", line });
      continue;
    }
    parsed.push({
      name: line.slice("METRIC ".length, eq),
      value: line.slice(eq + 1),
      line
    });
  }
  return parsed;
}

const METRIC_NAME = /^[A-Za-z0-9_.+()-]+$/;

/**
 * Round-trip each METRIC line through the consumer-side parser: the name
 * must match the documented charset, the value must survive Number() →
 * String() unchanged (finite, no formatting surprises for a consumer that
 * parses numerics), names must be unique across the run, and re-serializing
 * the parsed pair must reproduce the emitted line byte-for-byte.
 * Does not assert positivity: derived overhead metrics may be zero or
 * negative by design.
 */
function roundTripMetrics(label, stdout) {
  const parsed = parseMetricLines(stdout);
  check(
    `${label}: METRIC lines parse`,
    parsed.length >= 2,
    `got ${parsed.length}`
  );
  const names = parsed.map(({ name }) => name);
  check(`${label}: METRIC names unique`, new Set(names).size === names.length);
  for (const { name, value, line } of parsed) {
    const num = Number(value);
    const ok =
      METRIC_NAME.test(name) &&
      Number.isFinite(num) &&
      String(num) === value &&
      `METRIC ${name}=${value}` === line;
    check(`${label}: METRIC round-trip: ${name}`, ok);
  }
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
  // slug() emits plus, dash, and parentheses from real task names (e.g.
  // "parse+hash (steady state)"), so the name charset is [\w.+()-],
  // not [\w.].
  const match = /^METRIC ([\w.+()-]+)=([\d.eE+-]+)$/.exec(line);
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
roundTripMetrics("fixture", fixture.stdout);

// 2. Selection matrix.
const fingerprint = runBench(["--preset", "quick", "fingerprint"]);
check("substring selection exits 0", fingerprint.status === 0);
check(
  "substring selection runs only micro.fingerprint",
  fingerprint.stdout.includes("micro.fingerprint") &&
    !fingerprint.stdout.includes("micro.validation") &&
    !fingerprint.stdout.includes("e2e.hono-sqlite")
);
// Reuses the selection run: its task names contain "+" ("parse+hash"),
// exercising the name charset the fixture run cannot.
roundTripMetrics("fingerprint", fingerprint.stdout);
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

// 3. End-to-end run: exercises the derived-metric emission path — overhead
// names bypass slug() entirely and their values may be zero or negative.
const e2e = runBench(["--preset", "quick", "e2e.hono-sqlite"]);
check("e2e run exits 0", e2e.status === 0, e2e.stderr);
check(
  "e2e emits derived overhead metrics",
  /^METRIC e2e\.hono-sqlite\.overhead_delta_ms=/m.test(e2e.stdout) &&
    /^METRIC e2e\.hono-sqlite\.overhead_pct=/m.test(e2e.stdout)
);
roundTripMetrics("e2e", e2e.stdout);

if (failures > 0) {
  console.error(`\n${failures} smoke check(s) failed.`);
  process.exit(1);
}
console.log("\nAll smoke checks passed.");
