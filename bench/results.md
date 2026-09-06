# Benchmark results

- Run date: 2026-09-06T11:21:12.228Z
- Preset: quick
- Runtime: Node v24.16.0 on darwin 25.6.0 (arm64, Apple M1)

Numbers from a laptop are comparative, not absolute. Quick-preset numbers are noisier
by design (single pass, few iterations); treat quick-preset swings as noise, not
regressions, and validate with the full preset before acting.

| module            | task                              | median_hz    | median_ms | rme_pct |
| ----------------- | --------------------------------- | ------------ | --------- | ------- |
| fixture           | noop                              | 23809523.870 | 0.000     | 1.252   |
| micro.fingerprint | parse+hash (steady state)         | 116495.806   | 0.009     | 13.095  |
| micro.fingerprint | exclusion filtering               | 63661.828    | 0.016     | 37.705  |
| micro.fingerprint | raw hash (non-JSON body)          | 210526.316   | 0.005     | 11.920  |
| micro.validation  | key validation accept             | 23809523.870 | 0.000     | 2.676   |
| micro.validation  | key validation reject (too short) | 23809523.741 | 0.000     | 6.895   |
| micro.validation  | key validation reject (too long)  | 23809523.741 | 0.000     | 6.880   |
| micro.resilience  | lookup (bare)                     | 34782.609    | 0.029     | 38.534  |
| micro.resilience  | lookup (resilient)                | 31250.000    | 0.032     | 30.911  |
| micro.resilience  | startProcessing (bare)            | 93755.860    | 0.011     | 36.423  |
| micro.resilience  | startProcessing (resilient)       | 68568.294    | 0.015     | 30.532  |
| micro.resilience  | complete (bare)                   | 112145.340   | 0.009     | 25.679  |
| micro.resilience  | complete (resilient)              | 75233.223    | 0.013     | 19.614  |
| e2e.hono-sqlite   | middleware (fresh key)            | 13765.384    | 0.073     | 65.708  |
| e2e.hono-sqlite   | middleware (repeat key)           | 15209.125    | 0.066     | 38.541  |
| e2e.hono-sqlite   | baseline (no middleware)          | 65573.770    | 0.015     | 39.355  |

## METRIC lines

```
METRIC fixture.noop.median_hz=23809523.86963708
METRIC fixture.noop.median_ms=0.000041999999893960194
METRIC fixture.noop.rme_pct=1.2519036529311147
METRIC micro.fingerprint.parse+hash_(steady_state).median_hz=116495.80614887018
METRIC micro.fingerprint.parse+hash_(steady_state).median_ms=0.008584000000155356
METRIC micro.fingerprint.parse+hash_(steady_state).rme_pct=13.095095753482777
METRIC micro.fingerprint.exclusion_filtering.median_hz=63661.82836809926
METRIC micro.fingerprint.exclusion_filtering.median_ms=0.015707999999904132
METRIC micro.fingerprint.exclusion_filtering.rme_pct=37.70459456043129
METRIC micro.fingerprint.raw_hash_(non-json_body).median_hz=210526.31578689383
METRIC micro.fingerprint.raw_hash_(non-json_body).median_ms=0.004750000000058208
METRIC micro.fingerprint.raw_hash_(non-json_body).rme_pct=11.919866771159253
METRIC micro.validation.key_validation_accept.median_hz=23809523.86963708
METRIC micro.validation.key_validation_accept.median_ms=0.000041999999893960194
METRIC micro.validation.key_validation_accept.rme_pct=2.675956334119246
METRIC micro.validation.key_validation_reject_(too_short).median_hz=23809523.740740437
METRIC micro.validation.key_validation_reject_(too_short).median_ms=0.00004200000012133387
METRIC micro.validation.key_validation_reject_(too_short).rme_pct=6.894679964616871
METRIC micro.validation.key_validation_reject_(too_long).median_hz=23809523.740740437
METRIC micro.validation.key_validation_reject_(too_long).median_ms=0.00004200000012133387
METRIC micro.validation.key_validation_reject_(too_long).rme_pct=6.879716259978205
METRIC micro.resilience.lookup_(bare).median_hz=34782.608695168026
METRIC micro.resilience.lookup_(bare).median_ms=0.028750000000400178
METRIC micro.resilience.lookup_(bare).rme_pct=38.534458897394806
METRIC micro.resilience.lookup_(resilient).median_hz=31249.999999850785
METRIC micro.resilience.lookup_(resilient).median_ms=0.032000000000152795
METRIC micro.resilience.lookup_(resilient).rme_pct=30.91107567818196
METRIC micro.resilience.startprocessing_(bare).median_hz=93755.85974010512
METRIC micro.resilience.startprocessing_(bare).median_ms=0.010666000000128406
METRIC micro.resilience.startprocessing_(bare).rme_pct=36.42259072124247
METRIC micro.resilience.startprocessing_(resilient).median_hz=68568.29402078141
METRIC micro.resilience.startprocessing_(resilient).median_ms=0.014584000000013475
METRIC micro.resilience.startprocessing_(resilient).rme_pct=30.531977898103147
METRIC micro.resilience.complete_(bare).median_hz=112145.3403597193
METRIC micro.resilience.complete_(bare).median_ms=0.00891700000011042
METRIC micro.resilience.complete_(bare).rme_pct=25.679481329919213
METRIC micro.resilience.complete_(resilient).median_hz=75233.22299075092
METRIC micro.resilience.complete_(resilient).median_ms=0.01329200000009223
METRIC micro.resilience.complete_(resilient).rme_pct=19.614243245927817
METRIC e2e.hono-sqlite.middleware_(fresh_key).median_hz=13765.383965561312
METRIC e2e.hono-sqlite.middleware_(fresh_key).median_ms=0.07264600000007704
METRIC e2e.hono-sqlite.middleware_(fresh_key).rme_pct=65.70796095316808
METRIC e2e.hono-sqlite.middleware_(repeat_key).median_hz=15209.125475342395
METRIC e2e.hono-sqlite.middleware_(repeat_key).median_ms=0.06574999999975262
METRIC e2e.hono-sqlite.middleware_(repeat_key).rme_pct=38.540920518565535
METRIC e2e.hono-sqlite.baseline_(no_middleware).median_hz=65573.77049213178
METRIC e2e.hono-sqlite.baseline_(no_middleware).median_ms=0.015249999999923602
METRIC e2e.hono-sqlite.baseline_(no_middleware).rme_pct=39.35471287810126
METRIC e2e.hono-sqlite.overhead_delta_ms=0.057396000000153435
METRIC e2e.hono-sqlite.overhead_pct=376.3672131176457
```
