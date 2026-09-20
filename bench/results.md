# Benchmark results

- Run date: 2026-09-20T20:38:32.151Z
- Preset: full
- Modules: fixture, micro.fingerprint, micro.validation, micro.resilience, e2e.hono-sqlite, e2e.hono-postgres, e2e.hono-mysql, e2e.hono-redis, e2e.express-sqlite, e2e.express-postgres, e2e.express-mysql, e2e.express-redis, e2e.fastify-sqlite, e2e.fastify-postgres, e2e.fastify-mysql, e2e.fastify-redis
- Runtime: node 24.20.0 on linux 7.0.0-31-generic (x64, Intel(R) Core(TM) i7-10710U CPU @ 1.10GHz)

Numbers from a laptop are comparative, not absolute. Quick-preset numbers are noisier
by design (single pass, few iterations); treat quick-preset swings as noise, not
regressions, and validate with the full preset before acting.

| module               | task                              | throughput | unit   | median_ms | rme_pct | spread_pct |
| -------------------- | --------------------------------- | ---------- | ------ | --------- | ------- | ---------- |
| fixture              | noop                              | 37037.037  | ops/ms | 0.000     | 0.006   | 6.897      |
| micro.fingerprint    | parse+hash (steady state)         | 107921.433 | ops/s  | 0.009     | 0.056   | 1.650      |
| micro.fingerprint    | exclusion filtering               | 58034.937  | ops/s  | 0.017     | 0.080   | 2.043      |
| micro.fingerprint    | raw hash (non-JSON body)          | 138811.771 | ops/s  | 0.007     | 0.055   | 2.040      |
| micro.validation     | key validation accept             | 22222.222  | ops/ms | 0.000     | 0.006   | 8.523      |
| micro.validation     | key validation reject (too short) | 19230.769  | ops/ms | 0.000     | 0.011   | 3.848      |
| micro.validation     | key validation reject (too long)  | 19230.769  | ops/ms | 0.000     | 0.011   | 1.887      |
| micro.resilience     | lookup (bare)                     | 26268.437  | ops/s  | 0.038     | 0.195   | 3.918      |
| micro.resilience     | lookup (resilient)                | 22083.343  | ops/s  | 0.045     | 0.258   | 8.263      |
| micro.resilience     | startProcessing (bare)            | 65184.799  | ops/s  | 0.015     | 0.196   | 10.181     |
| micro.resilience     | startProcessing (resilient)       | 48918.892  | ops/s  | 0.020     | 0.193   | 6.421      |
| micro.resilience     | complete (bare)                   | 72537.357  | ops/s  | 0.014     | 0.109   | 3.606      |
| micro.resilience     | complete (resilient)              | 52290.316  | ops/s  | 0.019     | 0.139   | 6.360      |
| e2e.hono-sqlite      | middleware (fresh key)            | 5296.624   | req/s  | 0.189     | 0.257   | 3.680      |
| e2e.hono-sqlite      | middleware (repeat key)           | 10063.855  | req/s  | 0.099     | 0.274   | 4.494      |
| e2e.hono-sqlite      | baseline (no middleware)          | 65291.199  | req/s  | 0.015     | 0.109   | 5.051      |
| e2e.hono-postgres    | middleware (fresh key)            | 306.259    | req/s  | 3.265     | 4.768   | 28.488     |
| e2e.hono-postgres    | middleware (repeat key)           | 3076.369   | req/s  | 0.325     | 1.013   | 12.657     |
| e2e.hono-postgres    | baseline (no middleware)          | 64800.415  | req/s  | 0.015     | 0.109   | 5.125      |
| e2e.hono-mysql       | middleware (fresh key)            | 74.537     | req/s  | 13.416    | 3.340   | 3.069      |
| e2e.hono-mysql       | middleware (repeat key)           | 3755.699   | req/s  | 0.266     | 0.775   | 4.753      |
| e2e.hono-mysql       | baseline (no middleware)          | 64813.014  | req/s  | 0.015     | 0.120   | 3.118      |
| e2e.hono-redis       | middleware (fresh key)            | 3124.375   | req/s  | 0.320     | 0.591   | 5.479      |
| e2e.hono-redis       | middleware (repeat key)           | 7122.431   | req/s  | 0.140     | 0.401   | 4.337      |
| e2e.hono-redis       | baseline (no middleware)          | 65863.136  | req/s  | 0.015     | 0.105   | 3.639      |
| e2e.express-sqlite   | middleware (fresh key)            | 451.765    | req/s  | 2.214     | 5.635   | 11.665     |
| e2e.express-sqlite   | middleware (repeat key)           | 459.085    | req/s  | 2.178     | 5.416   | 10.481     |
| e2e.express-sqlite   | baseline (no middleware)          | 513.770    | req/s  | 1.946     | 6.726   | 5.359      |
| e2e.express-postgres | middleware (fresh key)            | 271.564    | req/s  | 3.683     | 5.045   | 34.023     |
| e2e.express-postgres | middleware (repeat key)           | 364.275    | req/s  | 2.745     | 5.488   | 13.014     |
| e2e.express-postgres | baseline (no middleware)          | 521.644    | req/s  | 1.917     | 6.715   | 10.740     |
| e2e.express-mysql    | middleware (fresh key)            | 84.627     | req/s  | 11.817    | 5.338   | 19.966     |
| e2e.express-mysql    | middleware (repeat key)           | 429.426    | req/s  | 2.329     | 6.548   | 33.201     |
| e2e.express-mysql    | baseline (no middleware)          | 536.275    | req/s  | 1.865     | 6.478   | 18.269     |
| e2e.express-redis    | middleware (fresh key)            | 561.220    | req/s  | 1.782     | 7.756   | 20.350     |
| e2e.express-redis    | middleware (repeat key)           | 456.179    | req/s  | 2.192     | 5.568   | 13.854     |
| e2e.express-redis    | baseline (no middleware)          | 521.590    | req/s  | 1.917     | 6.935   | 8.109      |
| e2e.fastify-sqlite   | middleware (fresh key)            | 4146.659   | req/s  | 0.241     | 0.450   | 5.698      |
| e2e.fastify-sqlite   | middleware (repeat key)           | 6192.123   | req/s  | 0.161     | 0.623   | 5.694      |
| e2e.fastify-sqlite   | baseline (no middleware)          | 18235.863  | req/s  | 0.055     | 0.303   | 5.070      |
| e2e.fastify-postgres | middleware (fresh key)            | 422.895    | req/s  | 2.365     | 2.792   | 6.702      |
| e2e.fastify-postgres | middleware (repeat key)           | 2578.523   | req/s  | 0.388     | 1.669   | 20.122     |
| e2e.fastify-postgres | baseline (no middleware)          | 18697.880  | req/s  | 0.053     | 0.288   | 4.852      |
| e2e.fastify-mysql    | middleware (fresh key)            | 101.503    | req/s  | 9.852     | 3.425   | 8.075      |
| e2e.fastify-mysql    | middleware (repeat key)           | 3086.439   | req/s  | 0.324     | 1.196   | 2.359      |
| e2e.fastify-mysql    | baseline (no middleware)          | 18524.693  | req/s  | 0.054     | 0.260   | 4.711      |
| e2e.fastify-redis    | middleware (fresh key)            | 3612.351   | req/s  | 0.277     | 0.643   | 11.681     |
| e2e.fastify-redis    | middleware (repeat key)           | 5065.484   | req/s  | 0.197     | 0.699   | 7.364      |
| e2e.fastify-redis    | baseline (no middleware)          | 18666.293  | req/s  | 0.054     | 0.258   | 4.201      |

## METRIC lines

```
METRIC fixture.noop.median_ms=0.000027
METRIC fixture.noop.rme_pct=0.005719494640718522
METRIC fixture.noop.ops_ms=37037.03703703704
METRIC fixture.noop.spread_pct=6.896551724137938
METRIC micro.fingerprint.parse+hash_(steady_state).median_ms=0.009266
METRIC micro.fingerprint.parse+hash_(steady_state).rme_pct=0.05586576901182781
METRIC micro.fingerprint.parse+hash_(steady_state).ops_s=107921.43319663285
METRIC micro.fingerprint.parse+hash_(steady_state).spread_pct=1.6501192776920561
METRIC micro.fingerprint.exclusion_filtering.median_ms=0.017231
METRIC micro.fingerprint.exclusion_filtering.rme_pct=0.07988391645977722
METRIC micro.fingerprint.exclusion_filtering.ops_s=58034.93703209332
METRIC micro.fingerprint.exclusion_filtering.spread_pct=2.0430337077051406
METRIC micro.fingerprint.raw_hash_(non-json_body).median_ms=0.007204
METRIC micro.fingerprint.raw_hash_(non-json_body).rme_pct=0.05475758094777385
METRIC micro.fingerprint.raw_hash_(non-json_body).ops_s=138811.771238201
METRIC micro.fingerprint.raw_hash_(non-json_body).spread_pct=2.039895805795715
METRIC micro.validation.key_validation_accept.median_ms=0.000045
METRIC micro.validation.key_validation_accept.rme_pct=0.006454190823862738
METRIC micro.validation.key_validation_accept.ops_ms=22222.22222222222
METRIC micro.validation.key_validation_accept.spread_pct=8.522727272727277
METRIC micro.validation.key_validation_reject_(too_short).median_ms=0.000052
METRIC micro.validation.key_validation_reject_(too_short).rme_pct=0.011277500163922007
METRIC micro.validation.key_validation_reject_(too_short).ops_ms=19230.76923076923
METRIC micro.validation.key_validation_reject_(too_short).spread_pct=3.847576766555673
METRIC micro.validation.key_validation_reject_(too_long).median_ms=0.000052
METRIC micro.validation.key_validation_reject_(too_long).rme_pct=0.011303724679441992
METRIC micro.validation.key_validation_reject_(too_long).ops_ms=19230.76923076923
METRIC micro.validation.key_validation_reject_(too_long).spread_pct=1.8867924528301925
METRIC micro.resilience.lookup_(bare).median_ms=0.0380685
METRIC micro.resilience.lookup_(bare).rme_pct=0.19546360207608346
METRIC micro.resilience.lookup_(bare).ops_s=26268.437163862713
METRIC micro.resilience.lookup_(bare).spread_pct=3.9184948360603338
METRIC micro.resilience.lookup_(resilient).median_ms=0.045283
METRIC micro.resilience.lookup_(resilient).rme_pct=0.25814196266200695
METRIC micro.resilience.lookup_(resilient).ops_s=22083.342534726056
METRIC micro.resilience.lookup_(resilient).spread_pct=8.262690465743798
METRIC micro.resilience.startprocessing_(bare).median_ms=0.015341
METRIC micro.resilience.startprocessing_(bare).rme_pct=0.1957508174090138
METRIC micro.resilience.startprocessing_(bare).ops_s=65184.798904895375
METRIC micro.resilience.startprocessing_(bare).spread_pct=10.181464647151385
METRIC micro.resilience.startprocessing_(resilient).median_ms=0.020442
METRIC micro.resilience.startprocessing_(resilient).rme_pct=0.19269756717039818
METRIC micro.resilience.startprocessing_(resilient).ops_s=48918.89247627434
METRIC micro.resilience.startprocessing_(resilient).spread_pct=6.421326675218431
METRIC micro.resilience.complete_(bare).median_ms=0.013786
METRIC micro.resilience.complete_(bare).rme_pct=0.10861736781902344
METRIC micro.resilience.complete_(bare).ops_s=72537.35673872044
METRIC micro.resilience.complete_(bare).spread_pct=3.6056427700327562
METRIC micro.resilience.complete_(resilient).median_ms=0.019124
METRIC micro.resilience.complete_(resilient).rme_pct=0.13908976565757736
METRIC micro.resilience.complete_(resilient).ops_s=52290.31583350764
METRIC micro.resilience.complete_(resilient).spread_pct=6.359940129572599
METRIC e2e.hono-sqlite.middleware_(fresh_key).median_ms=0.1887995
METRIC e2e.hono-sqlite.middleware_(fresh_key).rme_pct=0.256918214165379
METRIC e2e.hono-sqlite.middleware_(fresh_key).req_s=5296.624196605466
METRIC e2e.hono-sqlite.middleware_(fresh_key).spread_pct=3.6800100978325756
METRIC e2e.hono-sqlite.middleware_(repeat_key).median_ms=0.0993655
METRIC e2e.hono-sqlite.middleware_(repeat_key).rme_pct=0.2740504939846145
METRIC e2e.hono-sqlite.middleware_(repeat_key).req_s=10063.855161251344
METRIC e2e.hono-sqlite.middleware_(repeat_key).spread_pct=4.494221649791784
METRIC e2e.hono-sqlite.baseline_(no_middleware).median_ms=0.015316
METRIC e2e.hono-sqlite.baseline_(no_middleware).rme_pct=0.10910461008449471
METRIC e2e.hono-sqlite.baseline_(no_middleware).req_s=65291.19874640898
METRIC e2e.hono-sqlite.baseline_(no_middleware).spread_pct=5.051074803032798
METRIC e2e.hono-postgres.middleware_(fresh_key).median_ms=3.265206
METRIC e2e.hono-postgres.middleware_(fresh_key).rme_pct=4.768187114886789
METRIC e2e.hono-postgres.middleware_(fresh_key).req_s=306.25939067856666
METRIC e2e.hono-postgres.middleware_(fresh_key).spread_pct=28.48821483792388
METRIC e2e.hono-postgres.middleware_(repeat_key).median_ms=0.32505850000000003
METRIC e2e.hono-postgres.middleware_(repeat_key).rme_pct=1.0130877857879474
METRIC e2e.hono-postgres.middleware_(repeat_key).req_s=3076.3693692319334
METRIC e2e.hono-postgres.middleware_(repeat_key).spread_pct=12.65739884639156
METRIC e2e.hono-postgres.baseline_(no_middleware).median_ms=0.015432
METRIC e2e.hono-postgres.baseline_(no_middleware).rme_pct=0.10863801033111489
METRIC e2e.hono-postgres.baseline_(no_middleware).req_s=64800.414722654226
METRIC e2e.hono-postgres.baseline_(no_middleware).spread_pct=5.125158370285124
METRIC e2e.hono-mysql.middleware_(fresh_key).median_ms=13.416184999999999
METRIC e2e.hono-mysql.middleware_(fresh_key).rme_pct=3.3398250067410102
METRIC e2e.hono-mysql.middleware_(fresh_key).req_s=74.53693727148547
METRIC e2e.hono-mysql.middleware_(fresh_key).spread_pct=3.068746600248628
METRIC e2e.hono-mysql.middleware_(repeat_key).median_ms=0.266262
METRIC e2e.hono-mysql.middleware_(repeat_key).rme_pct=0.7747582330445816
METRIC e2e.hono-mysql.middleware_(repeat_key).req_s=3755.6992736477605
METRIC e2e.hono-mysql.middleware_(repeat_key).spread_pct=4.753220688855563
METRIC e2e.hono-mysql.baseline_(no_middleware).median_ms=0.015429
METRIC e2e.hono-mysql.baseline_(no_middleware).rme_pct=0.12000639068755742
METRIC e2e.hono-mysql.baseline_(no_middleware).req_s=64813.014453302225
METRIC e2e.hono-mysql.baseline_(no_middleware).spread_pct=3.1181815983254335
METRIC e2e.hono-redis.middleware_(fresh_key).median_ms=0.320064
METRIC e2e.hono-redis.middleware_(fresh_key).rme_pct=0.5906244566409046
METRIC e2e.hono-redis.middleware_(fresh_key).req_s=3124.375124975005
METRIC e2e.hono-redis.middleware_(fresh_key).spread_pct=5.478988462316852
METRIC e2e.hono-redis.middleware_(repeat_key).median_ms=0.1404015
METRIC e2e.hono-redis.middleware_(repeat_key).rme_pct=0.4011420948000749
METRIC e2e.hono-redis.middleware_(repeat_key).req_s=7122.431030416743
METRIC e2e.hono-redis.middleware_(repeat_key).spread_pct=4.3367532485018225
METRIC e2e.hono-redis.baseline_(no_middleware).median_ms=0.015183
METRIC e2e.hono-redis.baseline_(no_middleware).rme_pct=0.1054017606976932
METRIC e2e.hono-redis.baseline_(no_middleware).req_s=65863.1364025555
METRIC e2e.hono-redis.baseline_(no_middleware).spread_pct=3.639201771018599
METRIC e2e.express-sqlite.middleware_(fresh_key).median_ms=2.213541
METRIC e2e.express-sqlite.middleware_(fresh_key).rme_pct=5.63488101152785
METRIC e2e.express-sqlite.middleware_(fresh_key).req_s=451.7648419432935
METRIC e2e.express-sqlite.middleware_(fresh_key).spread_pct=11.665465603328432
METRIC e2e.express-sqlite.middleware_(repeat_key).median_ms=2.178246
METRIC e2e.express-sqlite.middleware_(repeat_key).rme_pct=5.415952123000232
METRIC e2e.express-sqlite.middleware_(repeat_key).req_s=459.08497020079454
METRIC e2e.express-sqlite.middleware_(repeat_key).spread_pct=10.480731168947178
METRIC e2e.express-sqlite.baseline_(no_middleware).median_ms=1.946396
METRIC e2e.express-sqlite.baseline_(no_middleware).rme_pct=6.725737801648359
METRIC e2e.express-sqlite.baseline_(no_middleware).req_s=513.7700652898999
METRIC e2e.express-sqlite.baseline_(no_middleware).spread_pct=5.35932107496345
METRIC e2e.express-postgres.middleware_(fresh_key).median_ms=3.6825155
METRIC e2e.express-postgres.middleware_(fresh_key).rme_pct=5.045303830248393
METRIC e2e.express-postgres.middleware_(fresh_key).req_s=271.5642195695224
METRIC e2e.express-postgres.middleware_(fresh_key).spread_pct=34.02267469186109
METRIC e2e.express-postgres.middleware_(repeat_key).median_ms=2.745176
METRIC e2e.express-postgres.middleware_(repeat_key).rme_pct=5.488394296919276
METRIC e2e.express-postgres.middleware_(repeat_key).req_s=364.27536886523853
METRIC e2e.express-postgres.middleware_(repeat_key).spread_pct=13.01406415281787
METRIC e2e.express-postgres.baseline_(no_middleware).median_ms=1.917017
METRIC e2e.express-postgres.baseline_(no_middleware).rme_pct=6.714826049276986
METRIC e2e.express-postgres.baseline_(no_middleware).req_s=521.6437830233117
METRIC e2e.express-postgres.baseline_(no_middleware).spread_pct=10.740374375772255
METRIC e2e.express-mysql.middleware_(fresh_key).median_ms=11.8168375
METRIC e2e.express-mysql.middleware_(fresh_key).rme_pct=5.337572329149496
METRIC e2e.express-mysql.middleware_(fresh_key).req_s=84.62689241503111
METRIC e2e.express-mysql.middleware_(fresh_key).spread_pct=19.966186485843203
METRIC e2e.express-mysql.middleware_(repeat_key).median_ms=2.3294259999999998
METRIC e2e.express-mysql.middleware_(repeat_key).rme_pct=6.547852260898421
METRIC e2e.express-mysql.middleware_(repeat_key).req_s=429.4264717867229
METRIC e2e.express-mysql.middleware_(repeat_key).spread_pct=33.20115475214763
METRIC e2e.express-mysql.baseline_(no_middleware).median_ms=1.864717
METRIC e2e.express-mysql.baseline_(no_middleware).rme_pct=6.477824717803314
METRIC e2e.express-mysql.baseline_(no_middleware).req_s=536.2749672259852
METRIC e2e.express-mysql.baseline_(no_middleware).spread_pct=18.268846119770295
METRIC e2e.express-redis.middleware_(fresh_key).median_ms=1.781831
METRIC e2e.express-redis.middleware_(fresh_key).rme_pct=7.75634828360518
METRIC e2e.express-redis.middleware_(fresh_key).req_s=561.2204524447044
METRIC e2e.express-redis.middleware_(fresh_key).spread_pct=20.34957868726672
METRIC e2e.express-redis.middleware_(repeat_key).median_ms=2.192122
METRIC e2e.express-redis.middleware_(repeat_key).rme_pct=5.568116412651618
METRIC e2e.express-redis.middleware_(repeat_key).req_s=456.1789900379632
METRIC e2e.express-redis.middleware_(repeat_key).spread_pct=13.853574643467207
METRIC e2e.express-redis.baseline_(no_middleware).median_ms=1.917215
METRIC e2e.express-redis.baseline_(no_middleware).rme_pct=6.935493601460571
METRIC e2e.express-redis.baseline_(no_middleware).req_s=521.5899103647739
METRIC e2e.express-redis.baseline_(no_middleware).spread_pct=8.108531027524602
METRIC e2e.fastify-sqlite.middleware_(fresh_key).median_ms=0.241158
METRIC e2e.fastify-sqlite.middleware_(fresh_key).rme_pct=0.45034835804485485
METRIC e2e.fastify-sqlite.middleware_(fresh_key).req_s=4146.659036814039
METRIC e2e.fastify-sqlite.middleware_(fresh_key).spread_pct=5.697806806956837
METRIC e2e.fastify-sqlite.middleware_(repeat_key).median_ms=0.16149550000000001
METRIC e2e.fastify-sqlite.middleware_(repeat_key).rme_pct=0.6225799088803413
METRIC e2e.fastify-sqlite.middleware_(repeat_key).req_s=6192.123005139049
METRIC e2e.fastify-sqlite.middleware_(repeat_key).spread_pct=5.693609768888042
METRIC e2e.fastify-sqlite.baseline_(no_middleware).median_ms=0.054837
METRIC e2e.fastify-sqlite.baseline_(no_middleware).rme_pct=0.30290732731223013
METRIC e2e.fastify-sqlite.baseline_(no_middleware).req_s=18235.86264748254
METRIC e2e.fastify-sqlite.baseline_(no_middleware).spread_pct=5.07042262343277
METRIC e2e.fastify-postgres.middleware_(fresh_key).median_ms=2.364653
METRIC e2e.fastify-postgres.middleware_(fresh_key).rme_pct=2.7920107254565774
METRIC e2e.fastify-postgres.middleware_(fresh_key).req_s=422.8954119588618
METRIC e2e.fastify-postgres.middleware_(fresh_key).spread_pct=6.702388380526034
METRIC e2e.fastify-postgres.middleware_(repeat_key).median_ms=0.387819
METRIC e2e.fastify-postgres.middleware_(repeat_key).rme_pct=1.669246866881232
METRIC e2e.fastify-postgres.middleware_(repeat_key).req_s=2578.522581860004
METRIC e2e.fastify-postgres.middleware_(repeat_key).spread_pct=20.122395091412653
METRIC e2e.fastify-postgres.baseline_(no_middleware).median_ms=0.053482
METRIC e2e.fastify-postgres.baseline_(no_middleware).rme_pct=0.2879221235910116
METRIC e2e.fastify-postgres.baseline_(no_middleware).req_s=18697.879660446506
METRIC e2e.fastify-postgres.baseline_(no_middleware).spread_pct=4.851567486182378
METRIC e2e.fastify-mysql.middleware_(fresh_key).median_ms=9.851964500000001
METRIC e2e.fastify-mysql.middleware_(fresh_key).rme_pct=3.4246864264388535
METRIC e2e.fastify-mysql.middleware_(fresh_key).req_s=101.50266216779814
METRIC e2e.fastify-mysql.middleware_(fresh_key).spread_pct=8.075038985793105
METRIC e2e.fastify-mysql.middleware_(repeat_key).median_ms=0.323998
METRIC e2e.fastify-mysql.middleware_(repeat_key).rme_pct=1.1964931544521862
METRIC e2e.fastify-mysql.middleware_(repeat_key).req_s=3086.4388059128532
METRIC e2e.fastify-mysql.middleware_(repeat_key).spread_pct=2.359274404171622
METRIC e2e.fastify-mysql.baseline_(no_middleware).median_ms=0.053982
METRIC e2e.fastify-mysql.baseline_(no_middleware).rme_pct=0.2603167034630509
METRIC e2e.fastify-mysql.baseline_(no_middleware).req_s=18524.69341632396
METRIC e2e.fastify-mysql.baseline_(no_middleware).spread_pct=4.710810637183363
METRIC e2e.fastify-redis.middleware_(fresh_key).median_ms=0.27682799999999996
METRIC e2e.fastify-redis.middleware_(fresh_key).rme_pct=0.6429282272241292
METRIC e2e.fastify-redis.middleware_(fresh_key).req_s=3612.351358529729
METRIC e2e.fastify-redis.middleware_(fresh_key).spread_pct=11.680654395695097
METRIC e2e.fastify-redis.middleware_(repeat_key).median_ms=0.1974145
METRIC e2e.fastify-redis.middleware_(repeat_key).rme_pct=0.6989143338422018
METRIC e2e.fastify-redis.middleware_(repeat_key).req_s=5065.484065300365
METRIC e2e.fastify-redis.middleware_(repeat_key).spread_pct=7.364010182043823
METRIC e2e.fastify-redis.baseline_(no_middleware).median_ms=0.0535725
METRIC e2e.fastify-redis.baseline_(no_middleware).rme_pct=0.2581782228367602
METRIC e2e.fastify-redis.baseline_(no_middleware).req_s=18666.293342425826
METRIC e2e.fastify-redis.baseline_(no_middleware).spread_pct=4.201238571669038
METRIC e2e.hono-sqlite.overhead_delta_ms=0.1734835
METRIC e2e.hono-sqlite.overhead_pct=1132.6945677722645
METRIC e2e.hono-postgres.overhead_delta_ms=3.249774
METRIC e2e.hono-postgres.overhead_pct=21058.670295489894
METRIC e2e.hono-mysql.overhead_delta_ms=13.400756
METRIC e2e.hono-mysql.overhead_pct=86854.33923131764
METRIC e2e.hono-redis.overhead_delta_ms=0.304881
METRIC e2e.hono-redis.overhead_pct=2008.041888954752
METRIC e2e.express-sqlite.overhead_delta_ms=0.2671450000000002
METRIC e2e.express-sqlite.overhead_pct=13.72511040918704
METRIC e2e.express-postgres.overhead_delta_ms=1.7654985
METRIC e2e.express-postgres.overhead_pct=92.09613164619824
METRIC e2e.express-mysql.overhead_delta_ms=9.9521205
METRIC e2e.express-mysql.overhead_pct=533.7067501395654
METRIC e2e.express-redis.overhead_delta_ms=-0.13538399999999995
METRIC e2e.express-redis.overhead_pct=-7.061492842482453
METRIC e2e.fastify-sqlite.overhead_delta_ms=0.18632100000000001
METRIC e2e.fastify-sqlite.overhead_pct=339.7724164341595
METRIC e2e.fastify-postgres.overhead_delta_ms=2.3111710000000003
METRIC e2e.fastify-postgres.overhead_pct=4321.399723271382
METRIC e2e.fastify-mysql.overhead_delta_ms=9.797982500000002
METRIC e2e.fastify-mysql.overhead_pct=18150.46219110074
METRIC e2e.fastify-redis.overhead_delta_ms=0.22325549999999997
METRIC e2e.fastify-redis.overhead_pct=416.73526529469405
```
