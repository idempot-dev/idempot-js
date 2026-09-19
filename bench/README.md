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
pnpm bench:bun        # full preset under the Bun runtime (adds the bun-only modules)
pnpm bench:bun:quick  # quick preset under the Bun runtime
pnpm bench:baseline   # capture a baseline: quick preset -> bench/baseline.local.json
pnpm bench:compare    # rerun quick preset and diff against bench/baseline.local.json
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

## Baselines and comparing runs

Capture a baseline before a change, then compare after it:

```bash
pnpm bench:baseline             # quick preset -> bench/baseline.local.json (gitignored)
# ...make your change...
pnpm bench:compare              # rerun quick preset, print per-task deltas
```

Both scripts accept any path via `--save-baseline <path>` and `--compare <path>`,
and pass through preset/module selection (`pnpm bench:quick <module>` style also
works with `--save-baseline`). Deltas beyond ±15% on median latency are flagged,
matching the full preset's variance discipline; the comparison is informational —
validate anything promising with the full preset before acting.

The compare mode refuses preset or hardware/runtime mismatches: medians are only
comparable within one preset on one machine and runtime. Committed reference
baselines live in `bench/baselines/`; refresh them deliberately (full preset,
one file per machine and runtime, `--label <name>` redirects the markdown
results file to `bench/results/<label>.md`).

## Reference numbers

Full-preset reference baselines for two machines. Numbers are comparable only
within a machine — different hardware produces different absolute values, so
treat these as magnitude references, not machine comparisons. Machine-readable
versions live in `bench/baselines/`.

### nuc-linux, node 24.20.0, linux x64, Intel i7-10710U (2026-09-19)

| module               | task                              | median_ms | throughput | unit   |
| -------------------- | --------------------------------- | --------: | ---------: | ------ |
| fixture              | noop                              |  0.000027 |      37037 | ops/ms |
| micro.fingerprint    | parse+hash (steady state)         |  0.009240 |     108225 | ops/s  |
| micro.fingerprint    | exclusion filtering               |  0.017581 |      56880 | ops/s  |
| micro.fingerprint    | raw hash (non-JSON body)          |  0.007053 |     141784 | ops/s  |
| micro.validation     | key validation accept             |  0.000044 |      22727 | ops/ms |
| micro.validation     | key validation reject (too short) |  0.000052 |      19231 | ops/ms |
| micro.validation     | key validation reject (too long)  |  0.000052 |      19231 | ops/ms |
| micro.resilience     | lookup (bare)                     |  0.037689 |      26533 | ops/s  |
| micro.resilience     | lookup (resilient)                |  0.046541 |      21486 | ops/s  |
| micro.resilience     | startProcessing (bare)            |  0.014958 |      66854 | ops/s  |
| micro.resilience     | startProcessing (resilient)       |  0.020011 |      49973 | ops/s  |
| micro.resilience     | complete (bare)                   |  0.013550 |      73801 | ops/s  |
| micro.resilience     | complete (resilient)              |  0.018624 |      53694 | ops/s  |
| e2e.hono-sqlite      | middleware (fresh key)            |  0.185370 |       5395 | req/s  |
| e2e.hono-sqlite      | middleware (repeat key)           |  0.096023 |      10414 | req/s  |
| e2e.hono-sqlite      | baseline (no middleware)          |  0.015048 |      66454 | req/s  |
| e2e.hono-postgres    | middleware (fresh key)            |     3.013 |        332 | req/s  |
| e2e.hono-postgres    | middleware (repeat key)           |  0.327018 |       3058 | req/s  |
| e2e.hono-postgres    | baseline (no middleware)          |  0.015438 |      64775 | req/s  |
| e2e.hono-mysql       | middleware (fresh key)            |    13.953 |         72 | req/s  |
| e2e.hono-mysql       | middleware (repeat key)           |  0.434368 |       2302 | req/s  |
| e2e.hono-mysql       | baseline (no middleware)          |  0.015241 |      65612 | req/s  |
| e2e.hono-redis       | middleware (fresh key)            |  0.325269 |       3074 | req/s  |
| e2e.hono-redis       | middleware (repeat key)           |  0.141960 |       7044 | req/s  |
| e2e.hono-redis       | baseline (no middleware)          |  0.015140 |      66050 | req/s  |
| e2e.express-sqlite   | middleware (fresh key)            |     2.273 |        440 | req/s  |
| e2e.express-sqlite   | middleware (repeat key)           |     2.162 |        463 | req/s  |
| e2e.express-sqlite   | baseline (no middleware)          |     1.942 |        515 | req/s  |
| e2e.express-postgres | middleware (fresh key)            |     4.005 |        250 | req/s  |
| e2e.express-postgres | middleware (repeat key)           |     2.869 |        349 | req/s  |
| e2e.express-postgres | baseline (no middleware)          |     2.023 |        494 | req/s  |
| e2e.express-mysql    | middleware (fresh key)            |    12.349 |         81 | req/s  |
| e2e.express-mysql    | middleware (repeat key)           |     2.371 |        422 | req/s  |
| e2e.express-mysql    | baseline (no middleware)          |     1.819 |        550 | req/s  |
| e2e.express-redis    | middleware (fresh key)            |     1.757 |        569 | req/s  |
| e2e.express-redis    | middleware (repeat key)           |     2.262 |        442 | req/s  |
| e2e.express-redis    | baseline (no middleware)          |     1.910 |        523 | req/s  |
| e2e.fastify-sqlite   | middleware (fresh key)            |  0.246186 |       4062 | req/s  |
| e2e.fastify-sqlite   | middleware (repeat key)           |  0.164859 |       6066 | req/s  |
| e2e.fastify-sqlite   | baseline (no middleware)          |  0.055251 |      18099 | req/s  |
| e2e.fastify-postgres | middleware (fresh key)            |     2.320 |        431 | req/s  |
| e2e.fastify-postgres | middleware (repeat key)           |  0.398749 |       2508 | req/s  |
| e2e.fastify-postgres | baseline (no middleware)          |  0.053038 |      18855 | req/s  |
| e2e.fastify-mysql    | middleware (fresh key)            |     9.935 |        101 | req/s  |
| e2e.fastify-mysql    | middleware (repeat key)           |  0.495694 |       2017 | req/s  |
| e2e.fastify-mysql    | baseline (no middleware)          |  0.053912 |      18549 | req/s  |
| e2e.fastify-redis    | middleware (fresh key)            |  0.282695 |       3537 | req/s  |
| e2e.fastify-redis    | middleware (repeat key)           |  0.195144 |       5124 | req/s  |
| e2e.fastify-redis    | baseline (no middleware)          |  0.051960 |      19246 | req/s  |

Express modules serve real HTTP on a localhost socket, so their numbers include
a round trip the in-process hono and fastify modules do not; compare within a
framework, not across them.

### nuc-linux, bun 1.4.2, linux x64, Intel i7-10710U (2026-09-19)

| module                  | task                     | median_ms | throughput | unit  |
| ----------------------- | ------------------------ | --------: | ---------: | ----- |
| e2e.bun-bunsql-sqlite   | middleware (fresh key)   |  0.106735 |       9369 | req/s |
| e2e.bun-bunsql-sqlite   | middleware (repeat key)  |  0.061103 |      16366 | req/s |
| e2e.bun-bunsql-sqlite   | baseline (no middleware) |  0.002398 |     417014 | req/s |
| e2e.bun-bunsql-postgres | middleware (fresh key)   |     2.422 |        413 | req/s |
| e2e.bun-bunsql-postgres | middleware (repeat key)  |  0.160610 |       6226 | req/s |
| e2e.bun-bunsql-postgres | baseline (no middleware) |  0.002421 |     413052 | req/s |
| e2e.bun-bunsql-mysql    | middleware (fresh key)   |    13.010 |         77 | req/s |
| e2e.bun-bunsql-mysql    | middleware (repeat key)  |  0.187570 |       5331 | req/s |
| e2e.bun-bunsql-mysql    | baseline (no middleware) |  0.002408 |     415282 | req/s |
| e2e.bun-redis           | middleware (fresh key)   |  0.199493 |       5013 | req/s |
| e2e.bun-redis           | middleware (repeat key)  |  0.086324 |      11584 | req/s |
| e2e.bun-redis           | baseline (no middleware) |  0.002421 |     413052 | req/s |

The bun baseline handler is dramatically faster than the framework baselines on
node, so `overhead_pct` for bun modules reads far higher for the same absolute
cost — compare `overhead_delta_ms` across runtimes, not `overhead_pct`.

### m1-air, node 24.16.0, darwin arm64, Apple M1 (2026-09-06)

Recorded before the express, fastify, and bun modules existed; refresh on that
machine to extend it.

| module            | task                              | median_ms | throughput | unit  |
| ----------------- | --------------------------------- | --------: | ---------: | ----- |
| fixture           | noop                              |     0.000 |   23809524 | ops/s |
| micro.fingerprint | parse+hash (steady state)         |     0.009 |     107619 | ops/s |
| micro.fingerprint | exclusion filtering               |     0.015 |      66854 | ops/s |
| micro.fingerprint | raw hash (non-JSON body)          |     0.005 |     192012 | ops/s |
| micro.validation  | key validation accept             |     0.000 |   23809524 | ops/s |
| micro.validation  | key validation reject (too short) |     0.000 |   12048193 | ops/s |
| micro.validation  | key validation reject (too long)  |     0.000 |   12048193 | ops/s |
| micro.resilience  | lookup (bare)                     |     0.037 |      27335 | ops/s |
| micro.resilience  | lookup (resilient)                |     0.034 |      29021 | ops/s |
| micro.resilience  | startProcessing (bare)            |     0.012 |      83619 | ops/s |
| micro.resilience  | startProcessing (resilient)       |     0.015 |      67227 | ops/s |
| micro.resilience  | complete (bare)                   |     0.010 |      98765 | ops/s |
| micro.resilience  | complete (resilient)              |     0.012 |      85106 | ops/s |
| e2e.hono-sqlite   | middleware (fresh key)            |     0.060 |      16760 | req/s |
| e2e.hono-sqlite   | middleware (repeat key)           |     0.057 |      17493 | req/s |
| e2e.hono-sqlite   | baseline (no middleware)          |     0.011 |      93756 | req/s |

## Prerequisites

- `e2e.hono-sqlite` — no external services (sqlite runs in-memory).
- `e2e.hono-postgres` — a live postgres on `localhost:5432` with database
  `test` and user `idempot`/`idempot` (same prerequisites as the
  integration tests). The module fails fast with a connection error when
  the server is unreachable.
- `e2e.hono-mysql` — a live mysql on `localhost:3306` with database
  `test` and user `idempot`/`idempot` (same prerequisites as the
  integration tests). The module fails fast with a connection error when
  the server is unreachable.
- `e2e.hono-redis` — a live redis on `127.0.0.1:6379` with no auth (same
  prerequisites as the integration tests). The module fails fast with a
  connection error when the server is unreachable.
- `e2e.express-sqlite` — no external services (sqlite runs in-memory).
- `e2e.express-postgres`, `e2e.express-mysql`, `e2e.express-redis` — the
  same prerequisites as their hono counterparts. Express modules serve
  real HTTP on an ephemeral localhost port (undici keep-alive), so their
  numbers include a socket round trip that the hono modules (in-process
  `app.request`) do not; compare within a framework, not across them.
- `e2e.fastify-sqlite` — no external services (sqlite runs in-memory).
- `e2e.fastify-postgres`, `e2e.fastify-mysql`, `e2e.fastify-redis` — the
  same prerequisites as their hono counterparts. Fastify modules are
  driven in-process via `app.inject()` (light-my-request), the same
  measurement class as the hono modules.
- `e2e.bun-sqlite`, `e2e.bun-bunsql-sqlite` — no external services
  (sqlite runs in-memory). Bun-only modules: they require the Bun runtime
  and are skipped when the suite runs under Node; run the suite with
  `pnpm bench:bun` (or `pnpm bench:bun:quick`) to include them. Both are
  driven in-process by calling the wrapped `Request => Response` handler
  directly, the same measurement class as the hono and fastify modules.
- `e2e.bun-bunsql-postgres`, `e2e.bun-bunsql-mysql` — the same
  prerequisites as their hono counterparts, plus the Bun runtime.

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

- `bench/run.js` — CLI (`--preset full|quick`, module names as positional args, `--save-baseline <path>`, `--compare <path>`, `--label <name>`, `--no-results-file`)
- `bench/lib/runner.js` — presets, selection, METRIC emission, results file, baseline JSON
- `bench/lib/compare.js` — baseline comparison, ±15% flagging, preset/machine guards
- `bench/baselines/` — committed full-preset reference baselines (one file per machine and runtime)
- `bench/fixture.demo.js` — harness smoke fixture
- `bench/results.md` — output of the most recent node run (committed, prettier-ignored; the header records which modules ran); labeled runs write to gitignored `bench/results/<label>.md`

Bench code is dev tooling: it is excluded from the tap coverage gate (never added to
`.taprc` `files:` globs) and verified by smoke runs, not tap unit tests.
