# Bài 57: Benchmark polling vs CDC + lessons learned

> Code 2 phương án đều xong. Bài này test load bằng JMeter, đo latency, throughput, DB cost. Bằng số liệu so polling vs CDC. Cuối bài có lessons learned đầy đủ cho production.

## JMeter test plan

`order-load-test.jmx` config:

```text
Thread Group:
  Number of Threads: 100
  Ramp-up: 30s
  Loop Count: 20

HTTP Request:
  POST http://localhost:8181/orders
  Body: <order.json>
```

Tổng 2000 request, 100 concurrent.

## Test 1: Polling (phase-9 setup)

Khởi service phase-9 (scheduler bật, no Debezium).

```text
$ jmeter -n -t order-load-test.jmx -l results-polling.csv
```

Theo dõi `kubectl top pods`:

```text
NAME                     CPU(cores)   MEMORY(bytes)
order-service            350m         620Mi
payment-service          280m         580Mi
restaurant-service       240m         540Mi
postgres                 220m         180Mi
kafka-broker-1           45m          540Mi
```

Kết quả:
- Throughput: 35 order/s.
- SAGA hoàn thành P50: 18s, P99: 35s.
- DB query/s (outbox SELECT): 200/s.

## Test 2: CDC (phase-13 setup)

Tắt scheduler, bật Debezium connector. Restart.

```text
$ jmeter -n -t order-load-test.jmx -l results-cdc.csv
```

```text
NAME                     CPU(cores)   MEMORY(bytes)
order-service            310m         580Mi
payment-service          260m         540Mi
restaurant-service       220m         500Mi
postgres                 180m         170Mi
kafka-broker-1           55m          550Mi
kafka-connect            350m         480Mi               ← thêm Connect
```

Kết quả:
- Throughput: 75 order/s.
- SAGA hoàn thành P50: 2.5s, P99: 6s.
- DB query/s (no outbox SELECT): ~20/s baseline.

## Side-by-side comparison

| Metric | Polling | CDC |
|---|---|---|
| Throughput (order/s) | 35 | **75** (+114%) |
| SAGA latency P50 | 18s | **2.5s** (-86%) |
| SAGA latency P99 | 35s | **6s** (-83%) |
| DB query/s (outbox) | 200 | 20 |
| DB CPU avg | 220m | **180m** (-18%) |
| Total CPU | 1150m | 1430m (+24%) |
| Total RAM | 2.7 GB | 3.0 GB |
| Component count | 4 service | 4 service + Kafka Connect |
| Setup complexity | Low | Medium |
| Failure modes | Scheduler bug, multi-instance race | Connector crash, slot fill |

CDC thắng về latency + throughput + DB cost. CPU + RAM tăng do thêm Connect.

## Postgres optimistic locking impact

Test thêm: multi-instance Order service (3 replica) với polling.

| | 1 instance | 3 instance polling | 3 instance CDC |
|---|---|---|---|
| Throughput | 35 | 38 | **180** |
| OptimisticLockingException rate | 0% | 12% | 0% |

Polling scale ngang **không hiệu quả** vì race condition. CDC scale tốt vì Debezium single reader, application chỉ xử lý consumer.

## Memory pattern

Polling app:
```text
[heap usage saw-tooth]
    1GB ┤    ╱╲      ╱╲      ╱╲       ← scheduler poll mỗi 5s tạo objects
    .8G ┤   ╱  ╲    ╱  ╲    ╱  ╲      
    .6G ┤  ╱    ╲  ╱    ╲  ╱    ╲     
    .4G ┤ ╱      ╲╱      ╲╱      ╲    
       └─────────────────────────────
        0s    10s    20s    30s
```

CDC app:
```text
[heap usage smooth]
    1GB ┤
    .8G ┤        ╱─────────────────────
    .6G ┤     ╱─╯
    .4G ┤  ╱─╯                          ← gradual ramp khi consume
       └─────────────────────────────
        0s    10s    20s    30s
```

Smooth memory cho CDC — GC pressure thấp hơn.

## Failure scenario

### Polling: scheduler crash
- Outbox row STARTED forever.
- Restart pod → scheduler resume, pick up.
- Latency loss: pod restart time + initialDelay (~ 1 phút).

### CDC: connector crash
- Replication slot vẫn track offset.
- Restart connector → resume từ điểm crash.
- Latency loss: ~10s (connector cold start).
- **Caveat**: nếu connector down quá lâu → WAL fill disk → Postgres crash. Set `wal_keep_size` limit.

### Polling: DB down briefly
- Scheduler exception → next tick retry.
- Recovery automatic.

### CDC: DB down briefly
- Connector connection lost.
- Auto reconnect (60s default).
- Recovery automatic.

### Polling: Kafka down
- Publisher exception, outbox stuck STARTED.
- Manual fix or retry mechanism.

### CDC: Kafka down
- Connector buffer fill.
- Backpressure → Postgres replication slot accumulate.
- Worse than polling for prolonged Kafka outage.

## Lessons learned

### Khi nào dùng polling

- Hệ thống nhỏ-trung, single instance.
- Team không quen Kafka Connect.
- Acceptable latency (5-15s).
- Đơn giản setup hơn ưu tiên.
- Operational team chưa có experience CDC.

### Khi nào dùng CDC

- Latency < 1s critical.
- Throughput cao cần.
- Multi-instance scale.
- DB stable, ít restart.
- Team có Kafka Connect experience.
- Budget cho Kafka Connect cluster.

### Hybrid approach

Khoá học gốc gợi ý: **giữ scheduler như fallback**. Bật cả 2:
- Debezium publish chính (fast path).
- Scheduler publish sau X phút nếu CDC fail (failsafe).

Cần dedupe ở consumer (UNIQUE constraint outbox-id), nhưng đảm bảo no message loss kể cả Connect crash dài.

## Production checklist nếu chọn CDC

- [ ] Kafka Connect HA: 2+ workers.
- [ ] Replication slot monitor: alert nếu lag > X MB.
- [ ] `wal_keep_size` limit chống Postgres fill.
- [ ] Connector restart automation (Kubernetes operator).
- [ ] Schema evolution test với consumer cũ.
- [ ] Topic retention policy chứa schema history.
- [ ] DR plan khi Postgres down dài.
- [ ] Backup connector config (Git).
- [ ] Metric: lag, error rate, throughput dashboard.

## Production checklist nếu chọn polling

- [ ] Distributed lock (Redis) chống multi-instance race.
- [ ] Backoff retry khi Kafka tạm down.
- [ ] FAILED status alert.
- [ ] Cleaner scheduler running.
- [ ] Outbox table size monitor.
- [ ] Performance tune: batch size, polling interval.

## Cost comparison (cloud GKE)

Per month estimate cho 100 order/s sustained:

| | Polling | CDC |
|---|---|---|
| K8s nodes (3 × e2-standard-2) | $200 | $200 |
| Cloud SQL Postgres | $150 | $130 (less query) |
| Kafka cluster (3 broker) | $300 | $300 |
| Kafka Connect (1 instance) | $0 | $40 |
| Total | **$650** | **$670** |

CDC chi phí gần như tương đương. Performance gain free.

## My conclusion

CDC thắng đa số case về performance. Polling thắng về simplicity.

Recommendation:
- **MVP / small system**: polling (phase-9).
- **Scale > 50 order/s, latency mission-critical**: CDC (phase-13).
- **Migration path**: polling → CDC khi business case rõ.

Khoá học dạy cả 2 → bạn có lựa chọn theo context.

## Topics khoá học không sâu (đọc thêm)

1. **Debezium Operator** cho K8s — auto-manage connector lifecycle.
2. **Kafka Connect distributed mode** — multi-worker for HA.
3. **Snapshot mode** — initial load existing data.
4. **Custom SMT** — viết transformation Java riêng.
5. **Apache Flink CDC** — alternative cho streaming.

## Tóm tắt bài 57

- CDC vs Polling benchmark: CDC nhanh 4-5 lần, throughput cao 2 lần, DB cost thấp hơn.
- Polling scale ngang kém vì race. CDC scale tốt vì Debezium single reader.
- Failure mode khác nhau: polling stuck do bug app, CDC stuck do Connect crash.
- Production cần monitor + alert riêng cho mỗi pattern.
- Cost cloud gần tương đương — perf gain miễn phí với CDC.
- Phase-14 (sau bài này) sẽ migrate Spring Boot lên version mới + Kafka KRaft.

**Bài kế tiếp** → [Bài 58 (phase-14): Spring Boot 2.x → 3.x + Kafka KRaft migration](../phase-14-version-updates/01-spring-boot-3-migration.md)
