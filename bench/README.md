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
```

Both presets print a human-readable table and `METRIC name=value` lines to stdout,
and write `bench/results.md`.

## Presets and trust

- **full** — warmup discarded (`warmupTime`/`warmupIterations`), the suite repeats
  7 times in one process, per-benchmark median of medians is reported with the
  relative spread (`spread_pct`) and tinybench's relative margin of error
  (`rme_pct`) as secondary metrics. Repeated identical runs are expected to agree
  within ±15%.
- **quick** — single pass, few iterations. Numbers are **noisier by design** so the
  preset runs in seconds for optimization loops (pi-autoresearch) that run the
  suite hundreds of times. Treat quick-preset swings as noise, not regressions;
  validate with the full preset before acting.

Laptop numbers are comparative, not absolute; `bench/results.md` records the
machine context for each run.

### Variance validation (2026-09-06, Apple M1, Node v24.16.0)

Two consecutive full-preset runs agreed within ±2% on every raw metric
(±15% gate: pass). Delta metrics (`overhead_delta_ms`, `overhead_pct`) held
within ±2% here too, but note: a delta of two timings amplifies relative
variance when overhead is small versus the baseline, so treat delta swings
more leniently than raw-timing swings.

Sub-microsecond tasks (key validation rejects) quantize to tinybench's timer
granularity, which shows as large `spread_pct` while the median stays stable —
compare medians, not spread, on those rows.

## METRIC grammar

Each line has the form:

```
METRIC <module>.<benchmark>.<metric>=<value>
```

- `<module>` — benchmark module name (`fixture`, `micro.fingerprint`, `e2e.hono-sqlite`, ...)
- `<benchmark>` — task name with spaces replaced by `_`
- `<metric>` — one of:
  - `median_hz` — median operations per second (primary)
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

## Layout

- `bench/run.js` — CLI (`--preset full|quick`, module names as positional args)
- `bench/lib/runner.js` — presets, selection, METRIC emission, results file
- `bench/fixture.demo.js` — harness smoke fixture
- `bench/results.md` — output of the most recent run (committed, prettier-ignored)

Bench code is dev tooling: it is excluded from the tap coverage gate (never added to
`.taprc` `files:` globs) and verified by smoke runs, not tap unit tests.
