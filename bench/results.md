# Benchmark results

- Run date: 2026-09-19T11:39:00.763Z
- Preset: quick
- Modules: fixture, micro.fingerprint, micro.validation, micro.resilience, e2e.hono-sqlite, e2e.hono-postgres, e2e.hono-mysql, e2e.hono-redis, e2e.express-sqlite, e2e.express-postgres, e2e.express-mysql, e2e.express-redis, e2e.fastify-sqlite, e2e.fastify-postgres, e2e.fastify-mysql, e2e.fastify-redis
- Runtime: node 24.20.0 on linux 7.0.0-31-generic (x64, Intel(R) Core(TM) i7-10710U CPU @ 1.10GHz)

Numbers from a laptop are comparative, not absolute. Quick-preset numbers are noisier
by design (single pass, few iterations); treat quick-preset swings as noise, not
regressions, and validate with the full preset before acting.

| module               | task                              | throughput | unit   | median_ms | rme_pct |
| -------------------- | --------------------------------- | ---------- | ------ | --------- | ------- |
| fixture              | noop                              | 38461.538  | ops/ms | 0.000     | 0.013   |
| micro.fingerprint    | parse+hash (steady state)         | 104188.373 | ops/s  | 0.010     | 0.360   |
| micro.fingerprint    | exclusion filtering               | 50751.117  | ops/s  | 0.020     | 0.693   |
| micro.fingerprint    | raw hash (non-JSON body)          | 154511.743 | ops/s  | 0.006     | 0.218   |
| micro.validation     | key validation accept             | 26315.789  | ops/ms | 0.000     | 0.018   |
| micro.validation     | key validation reject (too short) | 20833.333  | ops/ms | 0.000     | 0.022   |
| micro.validation     | key validation reject (too long)  | 20833.333  | ops/ms | 0.000     | 0.021   |
| micro.resilience     | lookup (bare)                     | 22313.708  | ops/s  | 0.045     | 0.401   |
| micro.resilience     | lookup (resilient)                | 20336.570  | ops/s  | 0.049     | 0.404   |
| micro.resilience     | startProcessing (bare)            | 63488.033  | ops/s  | 0.016     | 0.375   |
| micro.resilience     | startProcessing (resilient)       | 43943.489  | ops/s  | 0.023     | 0.336   |
| micro.resilience     | complete (bare)                   | 67636.118  | ops/s  | 0.015     | 0.259   |
| micro.resilience     | complete (resilient)              | 46755.190  | ops/s  | 0.021     | 0.299   |
| e2e.hono-sqlite      | middleware (fresh key)            | 4393.702   | req/s  | 0.228     | 0.682   |
| e2e.hono-sqlite      | middleware (repeat key)           | 8764.127   | req/s  | 0.114     | 0.459   |
| e2e.hono-sqlite      | baseline (no middleware)          | 47668.987  | req/s  | 0.021     | 0.356   |
| e2e.hono-postgres    | middleware (fresh key)            | 301.584    | req/s  | 3.316     | 1.678   |
| e2e.hono-postgres    | middleware (repeat key)           | 2817.076   | req/s  | 0.355     | 0.719   |
| e2e.hono-postgres    | baseline (no middleware)          | 56094.688  | req/s  | 0.018     | 0.364   |
| e2e.hono-mysql       | middleware (fresh key)            | 72.166     | req/s  | 13.857    | 1.018   |
| e2e.hono-mysql       | middleware (repeat key)           | 2231.480   | req/s  | 0.448     | 0.739   |
| e2e.hono-mysql       | baseline (no middleware)          | 64312.818  | req/s  | 0.016     | 0.345   |
| e2e.hono-redis       | middleware (fresh key)            | 2766.749   | req/s  | 0.361     | 0.843   |
| e2e.hono-redis       | middleware (repeat key)           | 6868.556   | req/s  | 0.146     | 0.746   |
| e2e.hono-redis       | baseline (no middleware)          | 65023.734  | req/s  | 0.015     | 0.276   |
| e2e.express-sqlite   | middleware (fresh key)            | 433.783    | req/s  | 2.305     | 2.038   |
| e2e.express-sqlite   | middleware (repeat key)           | 503.937    | req/s  | 1.984     | 2.478   |
| e2e.express-sqlite   | baseline (no middleware)          | 501.778    | req/s  | 1.993     | 2.756   |
| e2e.express-postgres | middleware (fresh key)            | 275.739    | req/s  | 3.627     | 1.223   |
| e2e.express-postgres | middleware (repeat key)           | 383.739    | req/s  | 2.606     | 1.658   |
| e2e.express-postgres | baseline (no middleware)          | 507.553    | req/s  | 1.970     | 2.885   |
| e2e.express-mysql    | middleware (fresh key)            | 84.214     | req/s  | 11.874    | 1.095   |
| e2e.express-mysql    | middleware (repeat key)           | 435.395    | req/s  | 2.297     | 1.832   |
| e2e.express-mysql    | baseline (no middleware)          | 527.214    | req/s  | 1.897     | 2.941   |
| e2e.express-redis    | middleware (fresh key)            | 535.572    | req/s  | 1.867     | 2.783   |
| e2e.express-redis    | middleware (repeat key)           | 483.584    | req/s  | 2.068     | 2.254   |
| e2e.express-redis    | baseline (no middleware)          | 500.941    | req/s  | 1.996     | 2.207   |
| e2e.fastify-sqlite   | middleware (fresh key)            | 3291.363   | req/s  | 0.304     | 0.990   |
| e2e.fastify-sqlite   | middleware (repeat key)           | 5464.884   | req/s  | 0.183     | 1.102   |
| e2e.fastify-sqlite   | baseline (no middleware)          | 15140.733  | req/s  | 0.066     | 0.559   |
| e2e.fastify-postgres | middleware (fresh key)            | 424.246    | req/s  | 2.357     | 1.046   |
| e2e.fastify-postgres | middleware (repeat key)           | 2398.030   | req/s  | 0.417     | 1.302   |
| e2e.fastify-postgres | baseline (no middleware)          | 15825.414  | req/s  | 0.063     | 0.749   |
| e2e.fastify-mysql    | middleware (fresh key)            | 100.660    | req/s  | 9.934     | 0.912   |
| e2e.fastify-mysql    | middleware (repeat key)           | 1943.257   | req/s  | 0.515     | 1.034   |
| e2e.fastify-mysql    | baseline (no middleware)          | 15456.189  | req/s  | 0.065     | 0.515   |
| e2e.fastify-redis    | middleware (fresh key)            | 3192.894   | req/s  | 0.313     | 0.461   |
| e2e.fastify-redis    | middleware (repeat key)           | 4781.097   | req/s  | 0.209     | 0.931   |
| e2e.fastify-redis    | baseline (no middleware)          | 17909.592  | req/s  | 0.056     | 1.254   |

## METRIC lines

```
METRIC fixture.noop.ops_ms=38461.53846153846
METRIC fixture.noop.median_ms=0.000026
METRIC fixture.noop.rme_pct=0.01321676288024712
METRIC micro.fingerprint.parse+hash_(steady_state).ops_s=104188.37257762034
METRIC micro.fingerprint.parse+hash_(steady_state).median_ms=0.009598
METRIC micro.fingerprint.parse+hash_(steady_state).rme_pct=0.3600768267314267
METRIC micro.fingerprint.exclusion_filtering.ops_s=50751.11665528196
METRIC micro.fingerprint.exclusion_filtering.median_ms=0.019704
METRIC micro.fingerprint.exclusion_filtering.rme_pct=0.6931910949183215
METRIC micro.fingerprint.raw_hash_(non-json_body).ops_s=154511.74289245982
METRIC micro.fingerprint.raw_hash_(non-json_body).median_ms=0.006472
METRIC micro.fingerprint.raw_hash_(non-json_body).rme_pct=0.2179127713124068
METRIC micro.validation.key_validation_accept.ops_ms=26315.78947368421
METRIC micro.validation.key_validation_accept.median_ms=0.000038
METRIC micro.validation.key_validation_accept.rme_pct=0.01762649881556912
METRIC micro.validation.key_validation_reject_(too_short).ops_ms=20833.333333333332
METRIC micro.validation.key_validation_reject_(too_short).median_ms=0.000048
METRIC micro.validation.key_validation_reject_(too_short).rme_pct=0.021920536214341993
METRIC micro.validation.key_validation_reject_(too_long).ops_ms=20833.333333333332
METRIC micro.validation.key_validation_reject_(too_long).median_ms=0.000048
METRIC micro.validation.key_validation_reject_(too_long).rme_pct=0.02133339544326381
METRIC micro.resilience.lookup_(bare).ops_s=22313.708429549493
METRIC micro.resilience.lookup_(bare).median_ms=0.0448155
METRIC micro.resilience.lookup_(bare).rme_pct=0.40083101606731714
METRIC micro.resilience.lookup_(resilient).ops_s=20336.570491853716
METRIC micro.resilience.lookup_(resilient).median_ms=0.0491725
METRIC micro.resilience.lookup_(resilient).rme_pct=0.4038661399725454
METRIC micro.resilience.startprocessing_(bare).ops_s=63488.03250587264
METRIC micro.resilience.startprocessing_(bare).median_ms=0.015751
METRIC micro.resilience.startprocessing_(bare).rme_pct=0.3745891160643835
METRIC micro.resilience.startprocessing_(resilient).ops_s=43943.488694779844
METRIC micro.resilience.startprocessing_(resilient).median_ms=0.0227565
METRIC micro.resilience.startprocessing_(resilient).rme_pct=0.3361890655622806
METRIC micro.resilience.complete_(bare).ops_s=67636.11768684478
METRIC micro.resilience.complete_(bare).median_ms=0.014785
METRIC micro.resilience.complete_(bare).rme_pct=0.258784565438091
METRIC micro.resilience.complete_(resilient).ops_s=46755.189826070695
METRIC micro.resilience.complete_(resilient).median_ms=0.021388
METRIC micro.resilience.complete_(resilient).rme_pct=0.2986248771584895
METRIC e2e.hono-sqlite.middleware_(fresh_key).req_s=4393.702071040099
METRIC e2e.hono-sqlite.middleware_(fresh_key).median_ms=0.22759849999999998
METRIC e2e.hono-sqlite.middleware_(fresh_key).rme_pct=0.6823441700889836
METRIC e2e.hono-sqlite.middleware_(repeat_key).req_s=8764.127149421933
METRIC e2e.hono-sqlite.middleware_(repeat_key).median_ms=0.1141015
METRIC e2e.hono-sqlite.middleware_(repeat_key).rme_pct=0.4589627398205261
METRIC e2e.hono-sqlite.baseline_(no_middleware).req_s=47668.986557345794
METRIC e2e.hono-sqlite.baseline_(no_middleware).median_ms=0.020978
METRIC e2e.hono-sqlite.baseline_(no_middleware).rme_pct=0.3558730535494595
METRIC e2e.hono-postgres.middleware_(fresh_key).req_s=301.58398262243014
METRIC e2e.hono-postgres.middleware_(fresh_key).median_ms=3.315826
METRIC e2e.hono-postgres.middleware_(fresh_key).rme_pct=1.678469215381009
METRIC e2e.hono-postgres.middleware_(repeat_key).req_s=2817.075990043303
METRIC e2e.hono-postgres.middleware_(repeat_key).median_ms=0.354978
METRIC e2e.hono-postgres.middleware_(repeat_key).rme_pct=0.719239180306596
METRIC e2e.hono-postgres.baseline_(no_middleware).req_s=56094.68783306221
METRIC e2e.hono-postgres.baseline_(no_middleware).median_ms=0.017827
METRIC e2e.hono-postgres.baseline_(no_middleware).rme_pct=0.3640597736632571
METRIC e2e.hono-mysql.middleware_(fresh_key).req_s=72.1659090595898
METRIC e2e.hono-mysql.middleware_(fresh_key).median_ms=13.856958500000001
METRIC e2e.hono-mysql.middleware_(fresh_key).rme_pct=1.0184329044655391
METRIC e2e.hono-mysql.middleware_(repeat_key).req_s=2231.4803871142904
METRIC e2e.hono-mysql.middleware_(repeat_key).median_ms=0.448133
METRIC e2e.hono-mysql.middleware_(repeat_key).rme_pct=0.7391652877415256
METRIC e2e.hono-mysql.baseline_(no_middleware).req_s=64312.81754453662
METRIC e2e.hono-mysql.baseline_(no_middleware).median_ms=0.015549
METRIC e2e.hono-mysql.baseline_(no_middleware).rme_pct=0.34459677216095475
METRIC e2e.hono-redis.middleware_(fresh_key).req_s=2766.7492080392185
METRIC e2e.hono-redis.middleware_(fresh_key).median_ms=0.36143499999999995
METRIC e2e.hono-redis.middleware_(fresh_key).rme_pct=0.8427854527604672
METRIC e2e.hono-redis.middleware_(repeat_key).req_s=6868.556467897788
METRIC e2e.hono-redis.middleware_(repeat_key).median_ms=0.145591
METRIC e2e.hono-redis.middleware_(repeat_key).rme_pct=0.7462468306304769
METRIC e2e.hono-redis.baseline_(no_middleware).req_s=65023.733662786915
METRIC e2e.hono-redis.baseline_(no_middleware).median_ms=0.015379
METRIC e2e.hono-redis.baseline_(no_middleware).rme_pct=0.27639136304007966
METRIC e2e.express-sqlite.middleware_(fresh_key).req_s=433.78255160273295
METRIC e2e.express-sqlite.middleware_(fresh_key).median_ms=2.3053025
METRIC e2e.express-sqlite.middleware_(fresh_key).rme_pct=2.037692336097343
METRIC e2e.express-sqlite.middleware_(repeat_key).req_s=503.9373128236218
METRIC e2e.express-sqlite.middleware_(repeat_key).median_ms=1.9843804999999999
METRIC e2e.express-sqlite.middleware_(repeat_key).rme_pct=2.4783170446672735
METRIC e2e.express-sqlite.baseline_(no_middleware).req_s=501.7775645373732
METRIC e2e.express-sqlite.baseline_(no_middleware).median_ms=1.992915
METRIC e2e.express-sqlite.baseline_(no_middleware).rme_pct=2.7564843546520406
METRIC e2e.express-postgres.middleware_(fresh_key).req_s=275.73865214874166
METRIC e2e.express-postgres.middleware_(fresh_key).median_ms=3.6266225
METRIC e2e.express-postgres.middleware_(fresh_key).rme_pct=1.2231174573888046
METRIC e2e.express-postgres.middleware_(repeat_key).req_s=383.73908611984336
METRIC e2e.express-postgres.middleware_(repeat_key).median_ms=2.6059384999999997
METRIC e2e.express-postgres.middleware_(repeat_key).rme_pct=1.6580239887745023
METRIC e2e.express-postgres.baseline_(no_middleware).req_s=507.5531610058842
METRIC e2e.express-postgres.baseline_(no_middleware).median_ms=1.970237
METRIC e2e.express-postgres.baseline_(no_middleware).rme_pct=2.8845188079357214
METRIC e2e.express-mysql.middleware_(fresh_key).req_s=84.21419631522244
METRIC e2e.express-mysql.middleware_(fresh_key).median_ms=11.8744825
METRIC e2e.express-mysql.middleware_(fresh_key).rme_pct=1.094668756350813
METRIC e2e.express-mysql.middleware_(repeat_key).req_s=435.3948292783378
METRIC e2e.express-mysql.middleware_(repeat_key).median_ms=2.296766
METRIC e2e.express-mysql.middleware_(repeat_key).rme_pct=1.8317271954325225
METRIC e2e.express-mysql.baseline_(no_middleware).req_s=527.2135978523829
METRIC e2e.express-mysql.baseline_(no_middleware).median_ms=1.8967645000000002
METRIC e2e.express-mysql.baseline_(no_middleware).rme_pct=2.9406970868182585
METRIC e2e.express-redis.middleware_(fresh_key).req_s=535.5718811242782
METRIC e2e.express-redis.middleware_(fresh_key).median_ms=1.8671630000000001
METRIC e2e.express-redis.middleware_(fresh_key).rme_pct=2.782872489991393
METRIC e2e.express-redis.middleware_(repeat_key).req_s=483.5837405306647
METRIC e2e.express-redis.middleware_(repeat_key).median_ms=2.0678955
METRIC e2e.express-redis.middleware_(repeat_key).rme_pct=2.254158331389335
METRIC e2e.express-redis.baseline_(no_middleware).req_s=500.9407696262184
METRIC e2e.express-redis.baseline_(no_middleware).median_ms=1.996244
METRIC e2e.express-redis.baseline_(no_middleware).rme_pct=2.206709843762704
METRIC e2e.fastify-sqlite.middleware_(fresh_key).req_s=3291.363020003276
METRIC e2e.fastify-sqlite.middleware_(fresh_key).median_ms=0.30382549999999997
METRIC e2e.fastify-sqlite.middleware_(fresh_key).rme_pct=0.9895999929293942
METRIC e2e.fastify-sqlite.middleware_(repeat_key).req_s=5464.884026435911
METRIC e2e.fastify-sqlite.middleware_(repeat_key).median_ms=0.1829865
METRIC e2e.fastify-sqlite.middleware_(repeat_key).rme_pct=1.1021328661897285
METRIC e2e.fastify-sqlite.baseline_(no_middleware).req_s=15140.733117768283
METRIC e2e.fastify-sqlite.baseline_(no_middleware).median_ms=0.066047
METRIC e2e.fastify-sqlite.baseline_(no_middleware).rme_pct=0.5593920139431133
METRIC e2e.fastify-postgres.middleware_(fresh_key).req_s=424.2456489051252
METRIC e2e.fastify-postgres.middleware_(fresh_key).median_ms=2.357125
METRIC e2e.fastify-postgres.middleware_(fresh_key).rme_pct=1.0463000983801325
METRIC e2e.fastify-postgres.middleware_(repeat_key).req_s=2398.029821979178
METRIC e2e.fastify-postgres.middleware_(repeat_key).median_ms=0.417009
METRIC e2e.fastify-postgres.middleware_(repeat_key).rme_pct=1.302051508860045
METRIC e2e.fastify-postgres.baseline_(no_middleware).req_s=15825.414057165723
METRIC e2e.fastify-postgres.baseline_(no_middleware).median_ms=0.0631895
METRIC e2e.fastify-postgres.baseline_(no_middleware).rme_pct=0.7490000974634229
METRIC e2e.fastify-mysql.middleware_(fresh_key).req_s=100.66027623762604
METRIC e2e.fastify-mysql.middleware_(fresh_key).median_ms=9.9344055
METRIC e2e.fastify-mysql.middleware_(fresh_key).rme_pct=0.9123670712592253
METRIC e2e.fastify-mysql.middleware_(repeat_key).req_s=1943.256898569328
METRIC e2e.fastify-mysql.middleware_(repeat_key).median_ms=0.5146
METRIC e2e.fastify-mysql.middleware_(repeat_key).rme_pct=1.0337453399765066
METRIC e2e.fastify-mysql.baseline_(no_middleware).req_s=15456.189434750055
METRIC e2e.fastify-mysql.baseline_(no_middleware).median_ms=0.064699
METRIC e2e.fastify-mysql.baseline_(no_middleware).rme_pct=0.5150303569727881
METRIC e2e.fastify-redis.middleware_(fresh_key).req_s=3192.8939077237246
METRIC e2e.fastify-redis.middleware_(fresh_key).median_ms=0.3131955
METRIC e2e.fastify-redis.middleware_(fresh_key).rme_pct=0.4607948081769897
METRIC e2e.fastify-redis.middleware_(repeat_key).req_s=4781.097484694368
METRIC e2e.fastify-redis.middleware_(repeat_key).median_ms=0.20915699999999998
METRIC e2e.fastify-redis.middleware_(repeat_key).rme_pct=0.9311040882006923
METRIC e2e.fastify-redis.baseline_(no_middleware).req_s=17909.592377677483
METRIC e2e.fastify-redis.baseline_(no_middleware).median_ms=0.055836
METRIC e2e.fastify-redis.baseline_(no_middleware).rme_pct=1.2543515297562138
METRIC e2e.hono-sqlite.overhead_delta_ms=0.20662049999999998
METRIC e2e.hono-sqlite.overhead_pct=984.9389836972066
METRIC e2e.hono-postgres.overhead_delta_ms=3.297999
METRIC e2e.hono-postgres.overhead_pct=18500.022437875134
METRIC e2e.hono-mysql.overhead_delta_ms=13.841409500000001
METRIC e2e.hono-mysql.overhead_pct=89018.0043732716
METRIC e2e.hono-redis.overhead_delta_ms=0.346056
METRIC e2e.hono-redis.overhead_pct=2250.1853176409386
METRIC e2e.express-sqlite.overhead_delta_ms=0.3123874999999998
METRIC e2e.express-sqlite.overhead_pct=15.674903345100008
METRIC e2e.express-postgres.overhead_delta_ms=1.6563854999999998
METRIC e2e.express-postgres.overhead_pct=84.07036818413215
METRIC e2e.express-mysql.overhead_delta_ms=9.977718
METRIC e2e.express-mysql.overhead_pct=526.0388414059836
METRIC e2e.express-redis.overhead_delta_ms=-0.12908099999999978
METRIC e2e.express-redis.overhead_pct=-6.466193511414425
METRIC e2e.fastify-sqlite.overhead_delta_ms=0.23777849999999998
METRIC e2e.fastify-sqlite.overhead_pct=360.0140808817963
METRIC e2e.fastify-postgres.overhead_delta_ms=2.2939355
METRIC e2e.fastify-postgres.overhead_pct=3630.247905110818
METRIC e2e.fastify-mysql.overhead_delta_ms=9.869706500000001
METRIC e2e.fastify-mysql.overhead_pct=15254.805329294119
METRIC e2e.fastify-redis.overhead_delta_ms=0.2573595
METRIC e2e.fastify-redis.overhead_pct=460.9203739522889
```
