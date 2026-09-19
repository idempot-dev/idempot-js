# Benchmarks

Benchmark suite for idempotency-js: core hot-path micro-benchmarks plus end-to-end
request benchmarks through real middleware, driven by
[tinybench](https://github.com/tinylibs/tinybench) with a thin wrapper.

## Usage

```bash
pnpm bench            # full preset: warmup, 7 repeats, median + spread (couple of minutes)
pnpm bench:quick      # quick preset: single pass, few iterations (a few seconds)
pnpm bench --preset quick   # explicit preset override
pnpm bench:quick fixture    # run selected benchmark modules by name
pnpm bench:smoke      # self-check: METRIC output shape + selection/exit-code matrix
```

Both presets print a human-readable table and `METRIC name=value` lines to stdout,
and write `bench/results.md`. Pass `--no-results-file` to run without rewriting
the committed baseline (the smoke self-check uses this and asserts the baseline
survives the run).

## Presets and trust

- **full** — warmup discarded (`warmupTime`/`warmupIterations`), the suite repeats
  7 times in one process, per-benchmark median of medians is reported with the
  relative spread (`spread_pct`) and tinybench's relative margin of error
  (`rme_pct`) as secondary metrics. The ±15% variance gate is a
  run-to-run discipline, not an in-run check: medians from two identical
  full-preset runs on the same machine are expected to agree within ±15%
  (validated at ±2%). The in-table `spread_pct` is a different, diagnostic
  quantity — the spread across the 7 in-run repeats — and legitimate
  values exceed 15% for fast paths; compare medians, not spread.
- **quick** — single pass, few iterations. Numbers are **noisier by design** so the
  preset runs in seconds for optimization loops (pi-autoresearch) that run the
  suite hundreds of times. Treat quick-preset swings as noise, not regressions;
  validate with the full preset before acting.

Laptop numbers are comparative, not absolute; `bench/results.md` records the
machine context for each run.

## Prerequisites

- `e2e.hono-sqlite` — no external services (sqlite runs in-memory).

## METRIC grammar

Each line has the form:

```
METRIC <module>.<benchmark>.<metric>=<value>
```

- `<module>` — benchmark module name (`fixture`, `micro.fingerprint`, `e2e.hono-sqlite`, ...)
- `<benchmark>` — task name with spaces replaced by `_`
- Names are restricted to `[A-Za-z0-9_.+()-]` — lowercase, whitespace collapsed
  to `_`; task names keep their plus signs and parentheses — so a consumer may
  split each line on the first `=`.
- `<metric>` — one of:
  - throughput — unit-explicit: `req_s` for e2e modules (requests per second);
    `ops_s` or `ops_ms` for micro modules, with `ops_ms` chosen once the raw
    rate reaches 1,000,000 ops/s (primary)
  - `median_ms` — median milliseconds per operation
  - `rme_pct` — tinybench relative margin of error, percent
  - `spread_pct` — (max − min) / median across full-preset repeats, percent; full preset only
- Derived metrics from a module's `derive()` hook use `METRIC <name>=<value>` with
  the module defining the full name (for example `e2e.hono-sqlite.overhead_pct`).

The lines are parseable by a pi-autoresearch `.auto/measure.sh` script
(`METRIC name=value` convention).

## Adding a benchmark

Create `bench/<module>.js` with a default export:

```js
export default {
  name: "micro.example",
  register(bench, preset) {
    bench.add("my op", () => {
      /* timed code */
    });
  }
  // optional: derive(moduleResults) returns [{ name: "<full metric name>", value }]
};
```

Add the filename to `MODULE_FILES` in `bench/lib/runner.js`. The module contract is
`{ name, register(bench, preset), derive?(moduleResults) }` where `register` adds
tinybench tasks and `derive` returns extra metric pairs computed from the module's
own aggregated results.

Timed functions must be real `async` arrow functions when they await anything:
tinybench probe-calls a non-async function once at `add()` and thenable-checks
the result, so a plain arrow returning a promise gets measured on the sync
path (only up to the first await), producing meaningless numbers.

Sub-microsecond tasks quantize to the timer tick: the presets use the
`hrtimeNow` timestamp provider for nanosecond resolution, but rows whose
throughput values are bit-identical across different operations are
timer-saturated — compare their medians with that in mind.

## Layout

- `bench/run.js` — CLI (`--preset full|quick`, module names as positional args, `--no-results-file`)
- `bench/lib/runner.js` — presets, selection, METRIC emission, results file
- `bench/fixture.demo.js` — harness smoke fixture

Bench code is dev tooling: it is excluded from the tap coverage gate (never added to
`.taprc` `files:` globs) and verified by smoke runs, not tap unit tests.
