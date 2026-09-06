# Benchmark results

- Run date: 2026-09-06T10:37:39.771Z
- Preset: quick
- Runtime: Node v24.16.0 on darwin 25.6.0 (arm64, Apple M1)

Numbers from a laptop are comparative, not absolute. Quick-preset numbers are noisier
by design (single pass, few iterations); treat quick-preset swings as noise, not
regressions, and validate with the full preset before acting.

| module            | task                              | median_hz    | median_ms | rme_pct |
| ----------------- | --------------------------------- | ------------ | --------- | ------- |
| fixture           | noop                              | 23809523.870 | 0.000     | 1.145   |
| micro.fingerprint | parse+hash (steady state)         | 118231.260   | 0.008     | 18.691  |
| micro.fingerprint | exclusion filtering               | 64172.496    | 0.016     | 39.187  |
| micro.fingerprint | raw hash (non-JSON body)          | 212359.312   | 0.005     | 11.958  |
| micro.validation  | key validation accept             | 23809523.870 | 0.000     | 2.915   |
| micro.validation  | key validation reject (too short) | 23809523.741 | 0.000     | 6.953   |
| micro.validation  | key validation reject (too long)  | 23809523.741 | 0.000     | 7.056   |
| micro.resilience  | lookup (bare)                     | 34934.498    | 0.029     | 41.579  |
| micro.resilience  | lookup (resilient)                | 30809.046    | 0.032     | 31.996  |
| micro.resilience  | startProcessing (bare)            | 92661.231    | 0.011     | 37.589  |
| micro.resilience  | startProcessing (resilient)       | 66295.412    | 0.015     | 33.787  |
| micro.resilience  | complete (bare)                   | 111619.600   | 0.009     | 25.523  |
| micro.resilience  | complete (resilient)              | 74766.355    | 0.013     | 15.405  |
| e2e.hono-sqlite   | middleware (fresh key)            | 13617.022    | 0.073     | 66.261  |
| e2e.hono-sqlite   | middleware (repeat key)           | 15252.623    | 0.066     | 39.661  |
| e2e.hono-sqlite   | baseline (no middleware)          | 65040.650    | 0.015     | 31.701  |

## METRIC lines

```
METRIC fixture.noop.median_hz=23809523.86963708
METRIC fixture.noop.median_ms=0.000041999999893960194
METRIC fixture.noop.rme_pct=1.1454877732607671
METRIC micro.fingerprint.parse+hash_(steady_state).median_hz=118231.26034497349
METRIC micro.fingerprint.parse+hash_(steady_state).median_ms=0.008458000000018728
METRIC micro.fingerprint.parse+hash_(steady_state).rme_pct=18.691196306523654
METRIC micro.fingerprint.exclusion_filtering.median_hz=64172.49566885621
METRIC micro.fingerprint.exclusion_filtering.median_ms=0.015582999999878666
METRIC micro.fingerprint.exclusion_filtering.rme_pct=39.18693258648858
METRIC micro.fingerprint.raw_hash_(non-json_body).median_hz=212359.311953663
METRIC micro.fingerprint.raw_hash_(non-json_body).median_ms=0.004709000000048036
METRIC micro.fingerprint.raw_hash_(non-json_body).rme_pct=11.957665417569107
METRIC micro.validation.key_validation_accept.median_hz=23809523.86963708
METRIC micro.validation.key_validation_accept.median_ms=0.000041999999893960194
METRIC micro.validation.key_validation_accept.rme_pct=2.915043779706998
METRIC micro.validation.key_validation_reject_(too_short).median_hz=23809523.740740437
METRIC micro.validation.key_validation_reject_(too_short).median_ms=0.00004200000012133387
METRIC micro.validation.key_validation_reject_(too_short).rme_pct=6.953247729464404
METRIC micro.validation.key_validation_reject_(too_long).median_hz=23809523.740740437
METRIC micro.validation.key_validation_reject_(too_long).median_ms=0.00004200000012133387
METRIC micro.validation.key_validation_reject_(too_long).rme_pct=7.055964809692929
METRIC micro.resilience.lookup_(bare).median_hz=34934.49781669156
METRIC micro.resilience.lookup_(bare).median_ms=0.028624999999919964
METRIC micro.resilience.lookup_(bare).rme_pct=41.57891295696281
METRIC micro.resilience.lookup_(resilient).median_hz=30809.045535642752
METRIC micro.resilience.lookup_(resilient).median_ms=0.032458000000133325
METRIC micro.resilience.lookup_(resilient).rme_pct=31.99552520869521
METRIC micro.resilience.startprocessing_(bare).median_hz=92661.23054081823
METRIC micro.resilience.startprocessing_(bare).median_ms=0.01079200000003766
METRIC micro.resilience.startprocessing_(bare).rme_pct=37.5893930767307
METRIC micro.resilience.startprocessing_(resilient).median_hz=66295.41235695794
METRIC micro.resilience.startprocessing_(resilient).median_ms=0.015084000000115338
METRIC micro.resilience.startprocessing_(resilient).rme_pct=33.78674916230196
METRIC micro.resilience.complete_(bare).median_hz=111619.60039894316
METRIC micro.resilience.complete_(bare).median_ms=0.008959000000231754
METRIC micro.resilience.complete_(bare).rme_pct=25.523328261987942
METRIC micro.resilience.complete_(resilient).median_hz=74766.35514020725
METRIC micro.resilience.complete_(resilient).median_ms=0.013374999999996362
METRIC micro.resilience.complete_(resilient).rme_pct=15.404660345825134
METRIC e2e.hono-sqlite.middleware_(fresh_key).median_hz=13617.02233774095
METRIC e2e.hono-sqlite.middleware_(fresh_key).median_ms=0.07343749999972715
METRIC e2e.hono-sqlite.middleware_(fresh_key).rme_pct=66.26140406001925
METRIC e2e.hono-sqlite.middleware_(repeat_key).median_hz=15252.623035559805
METRIC e2e.hono-sqlite.middleware_(repeat_key).median_ms=0.06556249999994179
METRIC e2e.hono-sqlite.middleware_(repeat_key).rme_pct=39.66124399782153
METRIC e2e.hono-sqlite.baseline_(no_middleware).median_hz=65040.65040671952
METRIC e2e.hono-sqlite.baseline_(no_middleware).median_ms=0.015374999999949068
METRIC e2e.hono-sqlite.baseline_(no_middleware).rme_pct=31.7012666268076
METRIC e2e.hono-sqlite.overhead_delta_ms=0.05806249999977808
METRIC e2e.hono-sqlite.overhead_pct=377.64227642257185
```
