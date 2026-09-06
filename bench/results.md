# Benchmark results

- Run date: 2026-09-06T12:29:26.113Z
- Preset: full
- Modules: all modules
- Runtime: Node v24.16.0 on darwin 25.6.0 (arm64, Apple M1)

Numbers from a laptop are comparative, not absolute. Quick-preset numbers are noisier
by design (single pass, few iterations); treat quick-preset swings as noise, not
regressions, and validate with the full preset before acting.

| module            | task                              | median_hz    | median_ms | rme_pct | spread_pct |
| ----------------- | --------------------------------- | ------------ | --------- | ------- | ---------- |
| fixture           | noop                              | 23809523.810 | 0.000     | 0.006   | 2.439      |
| micro.fingerprint | parse+hash (steady state)         | 107619.458   | 0.009     | 0.110   | 52.825     |
| micro.fingerprint | exclusion filtering               | 66853.857    | 0.015     | 0.084   | 59.112     |
| micro.fingerprint | raw hash (non-JSON body)          | 192012.289   | 0.005     | 0.078   | 58.360     |
| micro.validation  | key validation accept             | 23809523.810 | 0.000     | 0.012   | 0.000      |
| micro.validation  | key validation reject (too short) | 12048192.771 | 0.000     | 0.032   | 97.619     |
| micro.validation  | key validation reject (too long)  | 12048192.771 | 0.000     | 0.034   | 98.810     |
| micro.resilience  | lookup (bare)                     | 27335.101    | 0.037     | 0.428   | 62.248     |
| micro.resilience  | lookup (resilient)                | 29020.837    | 0.034     | 0.272   | 55.438     |
| micro.resilience  | startProcessing (bare)            | 83619.032    | 0.012     | 0.179   | 37.061     |
| micro.resilience  | startProcessing (resilient)       | 67226.891    | 0.015     | 0.173   | 51.671     |
| micro.resilience  | complete (bare)                   | 98765.432    | 0.010     | 0.126   | 55.584     |
| micro.resilience  | complete (resilient)              | 85106.383    | 0.012     | 0.114   | 51.172     |
| e2e.hono-sqlite   | middleware (fresh key)            | 16759.964    | 0.060     | 0.231   | 50.643     |
| e2e.hono-sqlite   | middleware (repeat key)           | 17492.609    | 0.057     | 0.233   | 35.533     |
| e2e.hono-sqlite   | baseline (no middleware)          | 93755.860    | 0.011     | 0.092   | 36.465     |

## METRIC lines

```
METRIC fixture.noop.median_hz=23809523.80952381
METRIC fixture.noop.median_ms=0.000042
METRIC fixture.noop.rme_pct=0.0061167994661714235
METRIC fixture.noop.spread_pct=2.439024390243901
METRIC micro.fingerprint.parse+hash_(steady_state).median_hz=107619.45759793371
METRIC micro.fingerprint.parse+hash_(steady_state).median_ms=0.009292
METRIC micro.fingerprint.parse+hash_(steady_state).rme_pct=0.10960937155293542
METRIC micro.fingerprint.parse+hash_(steady_state).spread_pct=52.824615447672095
METRIC micro.fingerprint.exclusion_filtering.median_hz=66853.85746757587
METRIC micro.fingerprint.exclusion_filtering.median_ms=0.014958
METRIC micro.fingerprint.exclusion_filtering.rme_pct=0.08360210053359216
METRIC micro.fingerprint.exclusion_filtering.spread_pct=59.112426378917526
METRIC micro.fingerprint.raw_hash_(non-json_body).median_hz=192012.28878648233
METRIC micro.fingerprint.raw_hash_(non-json_body).median_ms=0.005208
METRIC micro.fingerprint.raw_hash_(non-json_body).rme_pct=0.07755483539872335
METRIC micro.fingerprint.raw_hash_(non-json_body).spread_pct=58.360441286729255
METRIC micro.validation.key_validation_accept.median_hz=23809523.80952381
METRIC micro.validation.key_validation_accept.median_ms=0.000042
METRIC micro.validation.key_validation_accept.rme_pct=0.011769960939506312
METRIC micro.validation.key_validation_accept.spread_pct=0
METRIC micro.validation.key_validation_reject_(too_short).median_hz=12048192.771084338
METRIC micro.validation.key_validation_reject_(too_short).median_ms=0.000083
METRIC micro.validation.key_validation_reject_(too_short).rme_pct=0.032208234435013805
METRIC micro.validation.key_validation_reject_(too_short).spread_pct=97.6190476190476
METRIC micro.validation.key_validation_reject_(too_long).median_hz=12048192.771084338
METRIC micro.validation.key_validation_reject_(too_long).median_ms=0.000083
METRIC micro.validation.key_validation_reject_(too_long).rme_pct=0.034057224347745156
METRIC micro.validation.key_validation_reject_(too_long).spread_pct=98.8095238095238
METRIC micro.resilience.lookup_(bare).median_hz=27335.101003198208
METRIC micro.resilience.lookup_(bare).median_ms=0.036583
METRIC micro.resilience.lookup_(bare).rme_pct=0.4281192645376457
METRIC micro.resilience.lookup_(bare).spread_pct=62.24834462996323
METRIC micro.resilience.lookup_(resilient).median_hz=29020.83696093795
METRIC micro.resilience.lookup_(resilient).median_ms=0.034458
METRIC micro.resilience.lookup_(resilient).rme_pct=0.2718497315060733
METRIC micro.resilience.lookup_(resilient).spread_pct=55.437733692905425
METRIC micro.resilience.startprocessing_(bare).median_hz=83619.03169161301
METRIC micro.resilience.startprocessing_(bare).median_ms=0.011959
METRIC micro.resilience.startprocessing_(bare).rme_pct=0.1793960328480912
METRIC micro.resilience.startprocessing_(bare).spread_pct=37.061148904006046
METRIC micro.resilience.startprocessing_(resilient).median_hz=67226.89075630253
METRIC micro.resilience.startprocessing_(resilient).median_ms=0.014875
METRIC micro.resilience.startprocessing_(resilient).rme_pct=0.17268966111056344
METRIC micro.resilience.startprocessing_(resilient).spread_pct=51.67085161120364
METRIC micro.resilience.complete_(bare).median_hz=98765.43209876544
METRIC micro.resilience.complete_(bare).median_ms=0.010125
METRIC micro.resilience.complete_(bare).rme_pct=0.1263830295530623
METRIC micro.resilience.complete_(bare).spread_pct=55.58437507515627
METRIC micro.resilience.complete_(resilient).median_hz=85106.3829787234
METRIC micro.resilience.complete_(resilient).median_ms=0.01175
METRIC micro.resilience.complete_(resilient).rme_pct=0.1139428507410076
METRIC micro.resilience.complete_(resilient).spread_pct=51.1717809295664
METRIC e2e.hono-sqlite.middleware_(fresh_key).median_hz=16759.963798478195
METRIC e2e.hono-sqlite.middleware_(fresh_key).median_ms=0.059666
METRIC e2e.hono-sqlite.middleware_(fresh_key).rme_pct=0.23110741210357189
METRIC e2e.hono-sqlite.middleware_(fresh_key).spread_pct=50.6427237266562
METRIC e2e.hono-sqlite.middleware_(repeat_key).median_hz=17492.6093725401
METRIC e2e.hono-sqlite.middleware_(repeat_key).median_ms=0.057167
METRIC e2e.hono-sqlite.middleware_(repeat_key).rme_pct=0.23274087205550617
METRIC e2e.hono-sqlite.middleware_(repeat_key).spread_pct=35.533129609266325
METRIC e2e.hono-sqlite.baseline_(no_middleware).median_hz=93755.85974123383
METRIC e2e.hono-sqlite.baseline_(no_middleware).median_ms=0.010666
METRIC e2e.hono-sqlite.baseline_(no_middleware).rme_pct=0.09208039105655343
METRIC e2e.hono-sqlite.baseline_(no_middleware).spread_pct=36.46495726495726
METRIC e2e.hono-sqlite.overhead_delta_ms=0.048999999999999995
METRIC e2e.hono-sqlite.overhead_pct=459.40371273204573
```
