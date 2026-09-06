# Benchmark results

- Run date: 2026-09-06T10:08:41.760Z
- Preset: quick
- Runtime: Node v24.16.0 on darwin 25.6.0 (arm64, Apple M1)

Numbers from a laptop are comparative, not absolute. Quick-preset numbers are noisier
by design (single pass, few iterations); treat quick-preset swings as noise, not
regressions, and validate with the full preset before acting.

| module  | task | median_hz    | median_ms | rme_pct |
| ------- | ---- | ------------ | --------- | ------- |
| fixture | noop | 23809523.837 | 0.000     | 2.024   |

## METRIC lines

```
METRIC fixture.noop.median_hz=23809523.83741292
METRIC fixture.noop.median_ms=0.00004199999995080361
METRIC fixture.noop.rme_pct=2.0237365275969177
```
