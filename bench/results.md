# Benchmark results

- Run date: 2026-09-07T09:22:04.430Z
- Preset: full
- Modules: all modules
- Runtime: Node v24.20.0 on linux 7.0.0-31-generic (x64, Intel(R) Core(TM) i7-10710U CPU @ 1.10GHz)

Numbers from a laptop are comparative, not absolute. Quick-preset numbers are noisier
by design (single pass, few iterations); treat quick-preset swings as noise, not
regressions, and validate with the full preset before acting.

| module               | task                              | throughput | unit   | median_ms | rme_pct | spread_pct |
| -------------------- | --------------------------------- | ---------- | ------ | --------- | ------- | ---------- |
| fixture              | noop                              | 37037.037  | ops/ms | 0.000     | 0.005   | 12.903     |
| micro.fingerprint    | parse+hash (steady state)         | 110717.449 | ops/s  | 0.009     | 0.064   | 2.679      |
| micro.fingerprint    | exclusion filtering               | 59952.038  | ops/s  | 0.017     | 0.096   | 3.161      |
| micro.fingerprint    | raw hash (non-JSON body)          | 142734.799 | ops/s  | 0.007     | 0.060   | 21.113     |
| micro.validation     | key validation accept             | 25000.000  | ops/ms | 0.000     | 0.006   | 15.873     |
| micro.validation     | key validation reject (too short) | 19230.769  | ops/ms | 0.000     | 0.011   | 12.525     |
| micro.validation     | key validation reject (too long)  | 19230.769  | ops/ms | 0.000     | 0.012   | 12.525     |
| micro.resilience     | lookup (bare)                     | 24834.848  | ops/s  | 0.040     | 0.191   | 10.350     |
| micro.resilience     | lookup (resilient)                | 20512.821  | ops/s  | 0.049     | 0.225   | 5.953      |
| micro.resilience     | startProcessing (bare)            | 64399.794  | ops/s  | 0.016     | 0.188   | 7.379      |
| micro.resilience     | startProcessing (resilient)       | 49239.254  | ops/s  | 0.020     | 0.195   | 7.060      |
| micro.resilience     | complete (bare)                   | 70646.415  | ops/s  | 0.014     | 0.102   | 4.550      |
| micro.resilience     | complete (resilient)              | 52474.156  | ops/s  | 0.019     | 0.132   | 7.168      |
| e2e.hono-sqlite      | middleware (fresh key)            | 5236.041   | req/s  | 0.191     | 0.264   | 6.465      |
| e2e.hono-sqlite      | middleware (repeat key)           | 9954.409   | req/s  | 0.100     | 0.259   | 6.500      |
| e2e.hono-sqlite      | baseline (no middleware)          | 64678.869  | req/s  | 0.015     | 0.103   | 10.025     |
| e2e.hono-postgres    | middleware (fresh key)            | 140.618    | req/s  | 7.112     | 7.578   | 52.037     |
| e2e.hono-postgres    | middleware (repeat key)           | 3003.201   | req/s  | 0.333     | 0.969   | 77.198     |
| e2e.hono-postgres    | baseline (no middleware)          | 64741.681  | req/s  | 0.015     | 0.113   | 6.033      |
| e2e.hono-mysql       | middleware (fresh key)            | 73.369     | req/s  | 13.630    | 3.439   | 6.325      |
| e2e.hono-mysql       | middleware (repeat key)           | 2329.520   | req/s  | 0.429     | 0.805   | 4.837      |
| e2e.hono-mysql       | baseline (no middleware)          | 65032.191  | req/s  | 0.015     | 0.111   | 4.499      |
| e2e.hono-redis       | middleware (fresh key)            | 3175.067   | req/s  | 0.315     | 0.544   | 8.295      |
| e2e.hono-redis       | middleware (repeat key)           | 7130.964   | req/s  | 0.140     | 0.475   | 3.784      |
| e2e.hono-redis       | baseline (no middleware)          | 65201.800  | req/s  | 0.015     | 0.122   | 4.385      |
| e2e.express-sqlite   | middleware (fresh key)            | 421.835    | req/s  | 2.371     | 6.892   | 17.152     |
| e2e.express-sqlite   | middleware (repeat key)           | 423.961    | req/s  | 2.359     | 6.664   | 19.525     |
| e2e.express-sqlite   | baseline (no middleware)          | 503.650    | req/s  | 1.986     | 5.994   | 16.075     |
| e2e.express-postgres | middleware (fresh key)            | 221.486    | req/s  | 4.515     | 6.753   | 81.443     |
| e2e.express-postgres | middleware (repeat key)           | 310.012    | req/s  | 3.226     | 5.442   | 87.880     |
| e2e.express-postgres | baseline (no middleware)          | 462.184    | req/s  | 2.164     | 5.671   | 53.043     |
| e2e.express-mysql    | middleware (fresh key)            | 81.013     | req/s  | 12.344    | 4.985   | 12.477     |
| e2e.express-mysql    | middleware (repeat key)           | 315.915    | req/s  | 3.165     | 9.155   | 88.996     |
| e2e.express-mysql    | baseline (no middleware)          | 504.145    | req/s  | 1.984     | 6.526   | 23.538     |
| e2e.express-redis    | middleware (fresh key)            | 559.389    | req/s  | 1.788     | 7.893   | 9.831      |
| e2e.express-redis    | middleware (repeat key)           | 373.543    | req/s  | 2.677     | 7.534   | 19.526     |
| e2e.express-redis    | baseline (no middleware)          | 504.984    | req/s  | 1.980     | 6.567   | 18.850     |

## METRIC lines

```
METRIC fixture.noop.ops_ms=37037.03703703704
METRIC fixture.noop.median_ms=0.000027
METRIC fixture.noop.rme_pct=0.005498813689267652
METRIC fixture.noop.spread_pct=12.903225806451616
METRIC micro.fingerprint.parse+hash_(steady_state).ops_s=110717.44906997343
METRIC micro.fingerprint.parse+hash_(steady_state).median_ms=0.009032
METRIC micro.fingerprint.parse+hash_(steady_state).rme_pct=0.06443597518703717
METRIC micro.fingerprint.parse+hash_(steady_state).spread_pct=2.6790052245347655
METRIC micro.fingerprint.exclusion_filtering.ops_s=59952.03836930455
METRIC micro.fingerprint.exclusion_filtering.median_ms=0.01668
METRIC micro.fingerprint.exclusion_filtering.rme_pct=0.09589790102204002
METRIC micro.fingerprint.exclusion_filtering.spread_pct=3.1613288836031734
METRIC micro.fingerprint.raw_hash_(non-json_body).ops_s=142734.79874393376
METRIC micro.fingerprint.raw_hash_(non-json_body).median_ms=0.007006
METRIC micro.fingerprint.raw_hash_(non-json_body).rme_pct=0.059906162005866785
METRIC micro.fingerprint.raw_hash_(non-json_body).spread_pct=21.112554152279692
METRIC micro.validation.key_validation_accept.ops_ms=24999.999999999996
METRIC micro.validation.key_validation_accept.median_ms=0.00004
METRIC micro.validation.key_validation_accept.rme_pct=0.006168841823338113
METRIC micro.validation.key_validation_accept.spread_pct=15.87301587301587
METRIC micro.validation.key_validation_reject_(too_short).ops_ms=19230.76923076923
METRIC micro.validation.key_validation_reject_(too_short).median_ms=0.000052
METRIC micro.validation.key_validation_reject_(too_short).rme_pct=0.010860182252205417
METRIC micro.validation.key_validation_reject_(too_short).spread_pct=12.525090325170614
METRIC micro.validation.key_validation_reject_(too_long).ops_ms=19230.76923076923
METRIC micro.validation.key_validation_reject_(too_long).median_ms=0.000052
METRIC micro.validation.key_validation_reject_(too_long).rme_pct=0.011755943710530006
METRIC micro.validation.key_validation_reject_(too_long).spread_pct=12.525090325170614
METRIC micro.resilience.lookup_(bare).ops_s=24834.848259077135
METRIC micro.resilience.lookup_(bare).median_ms=0.040266
METRIC micro.resilience.lookup_(bare).rme_pct=0.1913507580403809
METRIC micro.resilience.lookup_(bare).spread_pct=10.349589245523863
METRIC micro.resilience.lookup_(resilient).ops_s=20512.82051282051
METRIC micro.resilience.lookup_(resilient).median_ms=0.04875
METRIC micro.resilience.lookup_(resilient).rme_pct=0.2247885614322389
METRIC micro.resilience.lookup_(resilient).spread_pct=5.95327179423969
METRIC micro.resilience.startprocessing_(bare).ops_s=64399.79392065945
METRIC micro.resilience.startprocessing_(bare).median_ms=0.015528
METRIC micro.resilience.startprocessing_(bare).rme_pct=0.18817473304055604
METRIC micro.resilience.startprocessing_(bare).spread_pct=7.378822269355992
METRIC micro.resilience.startprocessing_(resilient).ops_s=49239.25353291644
METRIC micro.resilience.startprocessing_(resilient).median_ms=0.020309
METRIC micro.resilience.startprocessing_(resilient).rme_pct=0.1951998634843298
METRIC micro.resilience.startprocessing_(resilient).spread_pct=7.060414940800921
METRIC micro.resilience.complete_(bare).ops_s=70646.41469445426
METRIC micro.resilience.complete_(bare).median_ms=0.014155
METRIC micro.resilience.complete_(bare).rme_pct=0.10225352466613474
METRIC micro.resilience.complete_(bare).spread_pct=4.550300437085855
METRIC micro.resilience.complete_(resilient).ops_s=52474.156477934615
METRIC micro.resilience.complete_(resilient).median_ms=0.019057
METRIC micro.resilience.complete_(resilient).rme_pct=0.1324915194689663
METRIC micro.resilience.complete_(resilient).spread_pct=7.168096127110113
METRIC e2e.hono-sqlite.middleware_(fresh_key).req_s=5236.040756939112
METRIC e2e.hono-sqlite.middleware_(fresh_key).median_ms=0.190984
METRIC e2e.hono-sqlite.middleware_(fresh_key).rme_pct=0.2642354535749392
METRIC e2e.hono-sqlite.middleware_(fresh_key).spread_pct=6.4647539439474
METRIC e2e.hono-sqlite.middleware_(repeat_key).req_s=9954.408807660913
METRIC e2e.hono-sqlite.middleware_(repeat_key).median_ms=0.100458
METRIC e2e.hono-sqlite.middleware_(repeat_key).rme_pct=0.2587661907199969
METRIC e2e.hono-sqlite.middleware_(repeat_key).spread_pct=6.50036741331771
METRIC e2e.hono-sqlite.baseline_(no_middleware).req_s=64678.86941336265
METRIC e2e.hono-sqlite.baseline_(no_middleware).median_ms=0.015461
METRIC e2e.hono-sqlite.baseline_(no_middleware).rme_pct=0.10315898610682853
METRIC e2e.hono-sqlite.baseline_(no_middleware).spread_pct=10.024841044972105
METRIC e2e.hono-postgres.middleware_(fresh_key).req_s=140.6184278457103
METRIC e2e.hono-postgres.middleware_(fresh_key).median_ms=7.112037
METRIC e2e.hono-postgres.middleware_(fresh_key).rme_pct=7.577818362201004
METRIC e2e.hono-postgres.middleware_(fresh_key).spread_pct=52.0366466452602
METRIC e2e.hono-postgres.middleware_(repeat_key).req_s=3003.2014224841823
METRIC e2e.hono-postgres.middleware_(repeat_key).median_ms=0.332978
METRIC e2e.hono-postgres.middleware_(repeat_key).rme_pct=0.9689005071153793
METRIC e2e.hono-postgres.middleware_(repeat_key).spread_pct=77.1977693787956
METRIC e2e.hono-postgres.baseline_(no_middleware).req_s=64741.680694030816
METRIC e2e.hono-postgres.baseline_(no_middleware).median_ms=0.015446
METRIC e2e.hono-postgres.baseline_(no_middleware).rme_pct=0.11267765033570495
METRIC e2e.hono-postgres.baseline_(no_middleware).spread_pct=6.033441593108867
METRIC e2e.hono-mysql.middleware_(fresh_key).req_s=73.36918751939656
METRIC e2e.hono-mysql.middleware_(fresh_key).median_ms=13.6297185
METRIC e2e.hono-mysql.middleware_(fresh_key).rme_pct=3.439449281609214
METRIC e2e.hono-mysql.middleware_(fresh_key).spread_pct=6.325417749203301
METRIC e2e.hono-mysql.middleware_(repeat_key).req_s=2329.5199092419043
METRIC e2e.hono-mysql.middleware_(repeat_key).median_ms=0.429273
METRIC e2e.hono-mysql.middleware_(repeat_key).rme_pct=0.8054693746403718
METRIC e2e.hono-mysql.middleware_(repeat_key).spread_pct=4.8368364698930275
METRIC e2e.hono-mysql.baseline_(no_middleware).req_s=65032.19093451258
METRIC e2e.hono-mysql.baseline_(no_middleware).median_ms=0.015377
METRIC e2e.hono-mysql.baseline_(no_middleware).rme_pct=0.1112977668845948
METRIC e2e.hono-mysql.baseline_(no_middleware).spread_pct=4.499125305294881
METRIC e2e.hono-redis.middleware_(fresh_key).req_s=3175.0668377495285
METRIC e2e.hono-redis.middleware_(fresh_key).median_ms=0.31495399999999996
METRIC e2e.hono-redis.middleware_(fresh_key).rme_pct=0.5435263811198984
METRIC e2e.hono-redis.middleware_(fresh_key).spread_pct=8.295041193273809
METRIC e2e.hono-redis.middleware_(repeat_key).req_s=7130.963801209177
METRIC e2e.hono-redis.middleware_(repeat_key).median_ms=0.1402335
METRIC e2e.hono-redis.middleware_(repeat_key).rme_pct=0.47460795100009234
METRIC e2e.hono-redis.middleware_(repeat_key).spread_pct=3.783923981938428
METRIC e2e.hono-redis.baseline_(no_middleware).req_s=65201.799569668125
METRIC e2e.hono-redis.baseline_(no_middleware).median_ms=0.015337
METRIC e2e.hono-redis.baseline_(no_middleware).rme_pct=0.12165550405220944
METRIC e2e.hono-redis.baseline_(no_middleware).spread_pct=4.3853716768494175
METRIC e2e.express-sqlite.middleware_(fresh_key).req_s=421.8354370704444
METRIC e2e.express-sqlite.middleware_(fresh_key).median_ms=2.370653
METRIC e2e.express-sqlite.middleware_(fresh_key).rme_pct=6.892091607284809
METRIC e2e.express-sqlite.middleware_(fresh_key).spread_pct=17.152065552036422
METRIC e2e.express-sqlite.middleware_(repeat_key).req_s=423.96068630993284
METRIC e2e.express-sqlite.middleware_(repeat_key).median_ms=2.358713
METRIC e2e.express-sqlite.middleware_(repeat_key).rme_pct=6.664118965741439
METRIC e2e.express-sqlite.middleware_(repeat_key).spread_pct=19.52503387275401
METRIC e2e.express-sqlite.baseline_(no_middleware).req_s=503.6500845822403
METRIC e2e.express-sqlite.baseline_(no_middleware).median_ms=1.9855055
METRIC e2e.express-sqlite.baseline_(no_middleware).rme_pct=5.993835465998982
METRIC e2e.express-sqlite.baseline_(no_middleware).spread_pct=16.074608068122355
METRIC e2e.express-postgres.middleware_(fresh_key).req_s=221.4860293472888
METRIC e2e.express-postgres.middleware_(fresh_key).median_ms=4.5149574999999995
METRIC e2e.express-postgres.middleware_(fresh_key).rme_pct=6.7527061319057795
METRIC e2e.express-postgres.middleware_(fresh_key).spread_pct=81.44321909178116
METRIC e2e.express-postgres.middleware_(repeat_key).req_s=310.011709011228
METRIC e2e.express-postgres.middleware_(repeat_key).median_ms=3.2260685000000002
METRIC e2e.express-postgres.middleware_(repeat_key).rme_pct=5.442316159054224
METRIC e2e.express-postgres.middleware_(repeat_key).spread_pct=87.8803315373548
METRIC e2e.express-postgres.baseline_(no_middleware).req_s=462.1843587473595
METRIC e2e.express-postgres.baseline_(no_middleware).median_ms=2.163639
METRIC e2e.express-postgres.baseline_(no_middleware).rme_pct=5.671434079975228
METRIC e2e.express-postgres.baseline_(no_middleware).spread_pct=53.04316540287361
METRIC e2e.express-mysql.middleware_(fresh_key).req_s=81.01340178647239
METRIC e2e.express-mysql.middleware_(fresh_key).median_ms=12.3439795
METRIC e2e.express-mysql.middleware_(fresh_key).rme_pct=4.985141699767005
METRIC e2e.express-mysql.middleware_(fresh_key).spread_pct=12.477387532511905
METRIC e2e.express-mysql.middleware_(repeat_key).req_s=315.9147421930359
METRIC e2e.express-mysql.middleware_(repeat_key).median_ms=3.165411
METRIC e2e.express-mysql.middleware_(repeat_key).rme_pct=9.154966300670996
METRIC e2e.express-mysql.middleware_(repeat_key).spread_pct=88.99620651584704
METRIC e2e.express-mysql.baseline_(no_middleware).req_s=504.1445725307755
METRIC e2e.express-mysql.baseline_(no_middleware).median_ms=1.983558
METRIC e2e.express-mysql.baseline_(no_middleware).rme_pct=6.5255136081718295
METRIC e2e.express-mysql.baseline_(no_middleware).spread_pct=23.53750463506814
METRIC e2e.express-redis.middleware_(fresh_key).req_s=559.3886067012799
METRIC e2e.express-redis.middleware_(fresh_key).median_ms=1.7876664999999998
METRIC e2e.express-redis.middleware_(fresh_key).rme_pct=7.892675609416804
METRIC e2e.express-redis.middleware_(fresh_key).spread_pct=9.830967106300426
METRIC e2e.express-redis.middleware_(repeat_key).req_s=373.543414149451
METRIC e2e.express-redis.middleware_(repeat_key).median_ms=2.677065
METRIC e2e.express-redis.middleware_(repeat_key).rme_pct=7.534486225666205
METRIC e2e.express-redis.middleware_(repeat_key).spread_pct=19.525982512021304
METRIC e2e.express-redis.baseline_(no_middleware).req_s=504.984193994728
METRIC e2e.express-redis.baseline_(no_middleware).median_ms=1.98026
METRIC e2e.express-redis.baseline_(no_middleware).rme_pct=6.567237408917241
METRIC e2e.express-redis.baseline_(no_middleware).spread_pct=18.85034219805982
METRIC e2e.hono-sqlite.overhead_delta_ms=0.17552299999999998
METRIC e2e.hono-sqlite.overhead_pct=1135.262919604165
METRIC e2e.hono-postgres.overhead_delta_ms=7.096591
METRIC e2e.hono-postgres.overhead_pct=45944.52285381329
METRIC e2e.hono-mysql.overhead_delta_ms=13.614341499999998
METRIC e2e.hono-mysql.overhead_pct=88537.04558756584
METRIC e2e.hono-redis.overhead_delta_ms=0.29961699999999997
METRIC e2e.hono-redis.overhead_pct=1953.5567581665252
METRIC e2e.express-sqlite.overhead_delta_ms=0.3851475
METRIC e2e.express-sqlite.overhead_pct=19.397956842728465
METRIC e2e.express-postgres.overhead_delta_ms=2.3513184999999996
METRIC e2e.express-postgres.overhead_pct=108.67425203557524
METRIC e2e.express-mysql.overhead_delta_ms=10.3604215
METRIC e2e.express-mysql.overhead_pct=522.3150268356155
METRIC e2e.express-redis.overhead_delta_ms=-0.19259350000000008
METRIC e2e.express-redis.overhead_pct=-9.72566733661237
```
