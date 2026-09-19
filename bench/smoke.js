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
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BENCH_DIR = path.dirname(fileURLToPath(import.meta.url));
const RUN = path.join(BENCH_DIR, "run.js");
const RESULTS_PATH = path.join(BENCH_DIR, "results.md");

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
  // Self-check runs must never rewrite the committed results baseline.
  // A timeout keeps a wedged child from hanging the guard forever; the
  // existing status checks treat a timed-out child (status null) as a
  // failure, and result.error names the cause.
  return spawnSync(process.execPath, [RUN, ...args, "--no-results-file"], {
    encoding: "utf8",
    timeout: 180_000
  });
}

// Smoke runs would silently rewrite the committed results baseline without
// the --no-results-file flag; assert the baseline survives the whole run.
const resultsBefore = fs.readFileSync(RESULTS_PATH, "utf8");

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

// 4. Fastify harness: the fastify modules share the inject-based harness;
// exercise one end-to-end (sqlite in-memory) so harness drift fails here.
const fastify = runBench(["--preset", "quick", "e2e.fastify-sqlite"]);
check("fastify run exits 0", fastify.status === 0, fastify.stderr);
check(
  "fastify emits derived overhead metrics",
  /^METRIC e2e\.fastify-sqlite\.overhead_delta_ms=/m.test(fastify.stdout) &&
    /^METRIC e2e\.fastify-sqlite\.overhead_pct=/m.test(fastify.stdout)
);
roundTripMetrics("fastify", fastify.stdout);

// 4b. Express harness: the express modules serve real HTTP on an
// ephemeral port; exercise the in-memory sqlite module so an
// express-harness regression (server lifecycle, body drain, settle)
// fails here instead of only on manual module runs.
const express = runBench(["--preset", "quick", "e2e.express-sqlite"]);
check(
  "express run exits 0",
  express.status === 0,
  express.stderr ?? express.error?.message
);
check(
  "express emits derived overhead metrics",
  /^METRIC e2e\.express-sqlite\.overhead_delta_ms=/m.test(express.stdout) &&
    /^METRIC e2e\.express-sqlite\.overhead_pct=/m.test(express.stdout)
);
roundTripMetrics("express", express.stdout);

// 5. Bun harness (only when the bun binary is available): the bun-only
// modules need the Bun runtime, so the suite runs under `bun` for these.
// e2e.bun-bunsql-sqlite needs no external services.
const bunCheck = spawnSync("bun", ["--version"], {
  encoding: "utf8",
  timeout: 30_000
});
if (bunCheck.status === 0) {
  const bunSuite = spawnSync(
    "bun",
    [RUN, "--preset", "quick", "e2e.bun-bunsql-sqlite", "--no-results-file"],
    { encoding: "utf8", timeout: 180_000 }
  );
  check(
    "bun run exits 0",
    bunSuite.status === 0,
    bunSuite.stderr ?? bunSuite.error?.message
  );
  check(
    "bun emits derived overhead metrics",
    /^METRIC e2e\.bun-bunsql-sqlite\.overhead_delta_ms=/m.test(
      bunSuite.stdout
    ) && /^METRIC e2e\.bun-bunsql-sqlite\.overhead_pct=/m.test(bunSuite.stdout)
  );
  roundTripMetrics("bun", bunSuite.stdout);
} else {
  console.log("ok: bun binary not available, skipping bun harness checks");
}

// 6. Baseline save + compare mode (fixture quick runs are cheap).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-smoke-"));
const baselinePath = path.join(tmpDir, "baseline.json");
const saved = runBench([
  "--preset",
  "quick",
  "fixture",
  "--save-baseline",
  baselinePath
]);
check(
  "save-baseline run exits 0",
  saved.status === 0,
  saved.stderr ?? saved.error?.message
);
// A guard that crashes on its first failure reports less than one that
// continues: never let a missing or malformed artifact kill the run.
let baselineObj = null;
if (!fs.existsSync(baselinePath)) {
  check(
    "save-baseline wrote the baseline file",
    false,
    "baseline file missing"
  );
} else {
  try {
    baselineObj = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  } catch (e) {
    check("save-baseline wrote valid JSON", false, String(e));
  }
}
check(
  "baseline JSON shape",
  baselineObj !== null &&
    baselineObj.version === 1 &&
    baselineObj.preset === "quick" &&
    typeof baselineObj.runtime?.cpu === "string" &&
    Array.isArray(baselineObj.results) &&
    baselineObj.results.some(
      (row) =>
        row.module === "fixture" && typeof row.metrics?.median_ms === "number"
    )
);
const compared = runBench([
  "--preset",
  "quick",
  "fixture",
  "--compare",
  baselinePath
]);
check("compare exits 0", compared.status === 0, compared.stderr);
check(
  "compare prints deltas",
  /delta/.test(compared.stdout) && /fixture/.test(compared.stdout)
);
// Guards: refuse comparisons that would produce misleading deltas, and
// refuse valueless flag invocations instead of silently no-oping. The
// valueless case must run with --compare genuinely last (spawnSync
// directly, without runBench's appended --no-results-file).
const noValue = spawnSync(
  process.execPath,
  [RUN, "--preset", "quick", "fixture", "--compare"],
  {
    encoding: "utf8"
  }
);
check(
  "valueless --compare exits 1",
  noValue.status === 1 && /--compare requires/.test(noValue.stderr)
);
if (baselineObj !== null) {
  const mismatched = structuredClone(baselineObj);
  mismatched.preset = "full";
  const mismatchPath = path.join(tmpDir, "mismatch.json");
  fs.writeFileSync(mismatchPath, JSON.stringify(mismatched));
  const refusedPreset = runBench([
    "--preset",
    "quick",
    "fixture",
    "--compare",
    mismatchPath
  ]);
  check(
    "compare refuses preset mismatch",
    refusedPreset.status === 1 && /preset mismatch/.test(refusedPreset.stderr)
  );
  const otherMachine = structuredClone(baselineObj);
  otherMachine.runtime = { ...otherMachine.runtime, cpu: "Other CPU" };
  const otherPath = path.join(tmpDir, "other.json");
  fs.writeFileSync(otherPath, JSON.stringify(otherMachine));
  const refusedMachine = runBench([
    "--preset",
    "quick",
    "fixture",
    "--compare",
    otherPath
  ]);
  check(
    "compare refuses machine mismatch",
    refusedMachine.status === 1 &&
      /hardware\/runtime mismatch/.test(refusedMachine.stderr)
  );
}
fs.rmSync(tmpDir, { recursive: true, force: true });

// 6b. Compare flag gate: pin the +-15% flag math directly against
// compare.js so a sign flip or threshold change cannot pass silently.
const { compareRuns, formatComparison } = await import("./lib/compare.js");
const flagBaseline = {
  version: 1,
  preset: "quick",
  runtime: {
    kind: "node",
    version: "0",
    platform: "test",
    arch: "test",
    cpu: "test"
  },
  results: [
    {
      module: "fixture",
      task: "regressed",
      metrics: { median_ms: 1.0, rme_pct: 0 }
    },
    {
      module: "fixture",
      task: "improved",
      metrics: { median_ms: 1.0, rme_pct: 0 }
    },
    {
      module: "fixture",
      task: "within-gate",
      metrics: { median_ms: 1.0, rme_pct: 0 }
    }
  ],
  derived: []
};
const flagCurrent = {
  version: 1,
  preset: "quick",
  runtime: {
    kind: "node",
    version: "0",
    platform: "test",
    arch: "test",
    cpu: "test"
  },
  results: [
    {
      module: "fixture",
      task: "regressed",
      metrics: { median_ms: 1.2, rme_pct: 0 }
    },
    {
      module: "fixture",
      task: "improved",
      metrics: { median_ms: 0.9, rme_pct: 0 }
    },
    {
      module: "fixture",
      task: "within-gate",
      metrics: { median_ms: 1.1, rme_pct: 0 }
    }
  ],
  derived: []
};
const flagRows = compareRuns(flagBaseline, flagCurrent);
const byTask = Object.fromEntries(flagRows.map((row) => [row.task, row]));
check(
  "compare flags a beyond-gate regression",
  byTask.regressed.flagged === true &&
    Math.abs(byTask.regressed.delta_pct - 20) < 1e-6
);
check(
  "compare leaves an improvement unflagged",
  byTask.improved.flagged === false &&
    Math.abs(byTask.improved.delta_pct + 10) < 1e-6
);
check(
  "compare leaves a within-gate delta unflagged",
  byTask["within-gate"].flagged === false &&
    Math.abs(byTask["within-gate"].delta_pct - 10) < 1e-6
);
check(
  "formatComparison renders the gate note",
  formatComparison(flagRows).includes("beyond \u00b115% gate")
);
check(
  "compare guards a zero-baseline row",
  compareRuns(
    {
      ...flagBaseline,
      results: [
        {
          module: "fixture",
          task: "zero",
          metrics: { median_ms: 0, rme_pct: 0 }
        }
      ]
    },
    {
      ...flagCurrent,
      results: [
        {
          module: "fixture",
          task: "zero",
          metrics: { median_ms: 0.5, rme_pct: 0 }
        }
      ]
    }
  )[0].delta_pct === null
);

// 7. Baseline preservation.
const resultsAfter = fs.readFileSync(RESULTS_PATH, "utf8");
check(
  "smoke leaves bench/results.md untouched",
  resultsAfter === resultsBefore
);

if (failures > 0) {
  console.error(`\n${failures} smoke check(s) failed.`);
  process.exit(1);
}
console.log("\nAll smoke checks passed.");
