# Benchmark results

- Run date: 2026-09-06T10:43:32.405Z
- Preset: full
- Runtime: Node v24.16.0 on darwin 25.6.0 (arm64, Apple M1)

Numbers from a laptop are comparative, not absolute. Quick-preset numbers are noisier
by design (single pass, few iterations); treat quick-preset swings as noise, not
regressions, and validate with the full preset before acting.

| module            | task                              | median_hz    | median_ms | rme_pct | spread_pct |
| ----------------- | --------------------------------- | ------------ | --------- | ------- | ---------- |
| fixture           | noop                              | 23809523.999 | 0.000     | 0.800   | 0.000      |
| micro.fingerprint | parse+hash (steady state)         | 120598.167   | 0.008     | 7.525   | 23.586     |
| micro.fingerprint | exclusion filtering               | 74996.250    | 0.013     | 12.534  | 53.426     |
| micro.fingerprint | raw hash (non-JSON body)          | 220167.327   | 0.005     | 6.352   | 53.123     |
| micro.validation  | key validation accept             | 23809523.999 | 0.000     | 1.203   | 49.398     |
| micro.validation  | key validation reject (too short) | 12048193.973 | 0.000     | 3.238   | 97.619     |
| micro.validation  | key validation reject (too long)  | 12048193.973 | 0.000     | 3.197   | 97.619     |
| micro.resilience  | lookup (bare)                     | 35502.538    | 0.028     | 22.571  | 13.306     |
| micro.resilience  | lookup (resilient)                | 33472.803    | 0.030     | 15.520  | 8.411      |
| micro.resilience  | startProcessing (bare)            | 95238.095    | 0.010     | 14.278  | 12.997     |
| micro.resilience  | startProcessing (resilient)       | 76190.476    | 0.013     | 13.910  | 12.401     |
| micro.resilience  | complete (bare)                   | 112145.340   | 0.009     | 9.798   | 11.405     |
| micro.resilience  | complete (resilient)              | 86325.967    | 0.012     | 11.270  | 14.608     |
| e2e.hono-sqlite   | middleware (fresh key)            | 16506.281    | 0.061     | 30.715  | 38.958     |
| e2e.hono-sqlite   | middleware (repeat key)           | 17106.299    | 0.058     | 28.876  | 22.793     |
| e2e.hono-sqlite   | baseline (no middleware)          | 99581.757    | 0.010     | 12.162  | 15.619     |

## METRIC lines

```
METRIC fixture.noop.median_hz=23809523.998533722
METRIC fixture.noop.median_ms=0.00004199999966658652
METRIC fixture.noop.rme_pct=0.8003955620189722
METRIC fixture.noop.spread_pct=0
METRIC micro.fingerprint.parse+hash_(steady_state).median_hz=120598.16713959222
METRIC micro.fingerprint.parse+hash_(steady_state).median_ms=0.008291999984066933
METRIC micro.fingerprint.parse+hash_(steady_state).rme_pct=7.525082650796292
METRIC micro.fingerprint.parse+hash_(steady_state).spread_pct=23.585961776481813
METRIC micro.fingerprint.exclusion_filtering.median_hz=74996.25008909692
METRIC micro.fingerprint.exclusion_filtering.median_ms=0.013334000017493963
METRIC micro.fingerprint.exclusion_filtering.rme_pct=12.534360967426366
METRIC micro.fingerprint.exclusion_filtering.spread_pct=53.42584079323841
METRIC micro.fingerprint.raw_hash_(non-json_body).median_hz=220167.32669950541
METRIC micro.fingerprint.raw_hash_(non-json_body).median_ms=0.004542000009678304
METRIC micro.fingerprint.raw_hash_(non-json_body).rme_pct=6.352403562468374
METRIC micro.fingerprint.raw_hash_(non-json_body).spread_pct=53.122806906767174
METRIC micro.validation.key_validation_accept.median_hz=23809523.998533722
METRIC micro.validation.key_validation_accept.median_ms=0.00004199999966658652
METRIC micro.validation.key_validation_accept.rme_pct=1.203126800059655
METRIC micro.validation.key_validation_accept.spread_pct=49.39759015021171
METRIC micro.validation.key_validation_reject_(too_short).median_hz=12048193.973192213
METRIC micro.validation.key_validation_reject_(too_short).median_ms=0.00008299999171867967
METRIC micro.validation.key_validation_reject_(too_short).rme_pct=3.2384355437152053
METRIC micro.validation.key_validation_reject_(too_short).spread_pct=97.61903844409115
METRIC micro.validation.key_validation_reject_(too_long).median_hz=12048193.973192213
METRIC micro.validation.key_validation_reject_(too_long).median_ms=0.00008299999171867967
METRIC micro.validation.key_validation_reject_(too_long).rme_pct=3.1973491963432634
METRIC micro.validation.key_validation_reject_(too_long).spread_pct=97.61904700282705
METRIC micro.resilience.lookup_(bare).median_hz=35502.53845392811
METRIC micro.resilience.lookup_(bare).median_ms=0.028166999982204288
METRIC micro.resilience.lookup_(bare).rme_pct=22.570521313852193
METRIC micro.resilience.lookup_(bare).spread_pct=13.305619467029805
METRIC micro.resilience.lookup_(resilient).median_hz=33472.80333893249
METRIC micro.resilience.lookup_(resilient).median_ms=0.02987500000745058
METRIC micro.resilience.lookup_(resilient).rme_pct=15.519760710616703
METRIC micro.resilience.lookup_(resilient).spread_pct=8.411261920499124
METRIC micro.resilience.startprocessing_(bare).median_hz=95238.09546617424
METRIC micro.resilience.startprocessing_(bare).median_ms=0.01049999997485429
METRIC micro.resilience.startprocessing_(bare).rme_pct=14.27759221613687
METRIC micro.resilience.startprocessing_(bare).spread_pct=12.996791073638766
METRIC micro.resilience.startprocessing_(resilient).median_hz=76190.47611951828
METRIC micro.resilience.startprocessing_(resilient).median_ms=0.013125000012223609
METRIC micro.resilience.startprocessing_(resilient).rme_pct=13.909627013504322
METRIC micro.resilience.startprocessing_(resilient).spread_pct=12.401111311740914
METRIC micro.resilience.complete_(bare).median_hz=112145.34037115762
METRIC micro.resilience.complete_(bare).median_ms=0.008916999999200925
METRIC micro.resilience.complete_(bare).rme_pct=9.797578982041246
METRIC micro.resilience.complete_(bare).spread_pct=11.404885710953566
METRIC micro.resilience.complete_(resilient).median_hz=86325.96690611576
METRIC micro.resilience.complete_(resilient).median_ms=0.011583999992581084
METRIC micro.resilience.complete_(resilient).rme_pct=11.270451523837211
METRIC micro.resilience.complete_(resilient).spread_pct=14.608382111841891
METRIC e2e.hono-sqlite.middleware_(fresh_key).median_hz=16506.28064016837
METRIC e2e.hono-sqlite.middleware_(fresh_key).median_ms=0.060582999998587184
METRIC e2e.hono-sqlite.middleware_(fresh_key).rme_pct=30.714807016834143
METRIC e2e.hono-sqlite.middleware_(fresh_key).spread_pct=38.95831315960034
METRIC e2e.hono-sqlite.middleware_(repeat_key).median_hz=17106.298539263003
METRIC e2e.hono-sqlite.middleware_(repeat_key).median_ms=0.058457999999518506
METRIC e2e.hono-sqlite.middleware_(repeat_key).rme_pct=28.875998189974144
METRIC e2e.hono-sqlite.middleware_(repeat_key).spread_pct=22.792882042386783
METRIC e2e.hono-sqlite.baseline_(no_middleware).median_hz=99581.75667744273
METRIC e2e.hono-sqlite.baseline_(no_middleware).median_ms=0.010041999994427897
METRIC e2e.hono-sqlite.baseline_(no_middleware).rme_pct=12.162262549968576
METRIC e2e.hono-sqlite.baseline_(no_middleware).spread_pct=15.619312819212883
METRIC e2e.hono-sqlite.overhead_delta_ms=0.05054100000415929
METRIC e2e.hono-sqlite.overhead_pct=503.29615646488213
```
