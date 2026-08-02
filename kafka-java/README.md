# Kafka Java

> Kafka với Spring — từ topic đầu tiên tới hệ thống streaming production.

57 bài về Kafka trong hệ sinh thái Java/Spring: nền tảng Kafka (topic, partition, key, offset, rebalancing), Spring Cloud Stream cho producer và consumer, consumer group và scaling, event routing, cụm Kafka và replication, xử lý theo lô, xử lý song song, độ tin cậy và ack, xử lý lỗi và retry, transaction và exactly-once, testing, bảo mật.

**57 bài** trong 18 phần.

## Mục lục

### Phase 1 — intro

| Bài | Nội dung |
|---|---|
| [01](phase-1-intro/01-tai-sao-event-driven.md) | Bài 1: Vì sao chúng ta cần Event-Driven Architecture |

### Phase 2 — environment

| Bài | Nội dung |
|---|---|
| [01](phase-2-environment/01-kafka-docker-setup.md) | Bài 1: Setup Kafka local bằng Docker Compose |

### Phase 3 — kafka fundamentals

| Bài | Nội dung |
|---|---|
| [01](phase-3-kafka-fundamentals/01-core-concepts-cluster.md) | Bài 1: Kafka core concepts — event, topic, broker, cluster |
| [02](phase-3-kafka-fundamentals/02-topics-cli-demo.md) | Bài 2: Tạo topic + produce + consume bằng CLI |
| [03](phase-3-kafka-fundamentals/03-producer-consumer-tuning.md) | Bài 3: Tuning producer + consumer — linger.ms, batch.size, max.poll.records |
| [04](phase-3-kafka-fundamentals/04-serialization-retention-offset.md) | Bài 4: Serialization, retention policies, và offset |
| [05](phase-3-kafka-fundamentals/05-consumer-groups.md) | Bài 5: Multiple consumers + Consumer Groups |
| [06](phase-3-kafka-fundamentals/06-partitions-keys.md) | Bài 6: Partitions + Message Keys — scale + ordering |
| [07](phase-3-kafka-fundamentals/07-rebalancing-scaling-partitions.md) | Bài 7: Partition Rebalancing + Scaling scenarios + Modifying partitions |
| [08](phase-3-kafka-fundamentals/08-offset-tracking-reset.md) | Bài 8: Offset Tracking + Resetting Offsets — ledger nội bộ Kafka |
| [09](phase-3-kafka-fundamentals/09-section-summary.md) | Bài 9: Tóm tắt Phase 3 — mental model Kafka đã đủ |

### Phase 4 — spring cloud stream consumer

| Bài | Nội dung |
|---|---|
| [01](phase-4-spring-cloud-stream-consumer/01-scs-intro-binders-bindings.md) | Bài 1: Spring Cloud Stream — abstraction qua Binder + Binding |
| [02](phase-4-spring-cloud-stream-consumer/02-playground-setup.md) | Bài 2: Playground Project — setup môi trường thử nghiệm |
| [03](phase-4-spring-cloud-stream-consumer/03-first-consumer-config.md) | Bài 3: Consumer đầu tiên + auto-offset-reset + group name |
| [04](phase-4-spring-cloud-stream-consumer/04-multi-topic-consumption.md) | Bài 4: Consume từ multiple topics — feature vs best practice |
| [05](phase-4-spring-cloud-stream-consumer/05-reactive-multi-input.md) | Bài 5: Reactive consumer + Multi-input function (optional advanced) |

### Phase 5 — spring cloud stream producer

| Bài | Nội dung |
|---|---|
| [01](phase-5-spring-cloud-stream-producer/01-supplier-poller.md) | Bài 1: Producer với Supplier + Poller configuration |
| [02](phase-5-spring-cloud-stream-producer/02-message-builder-keys-serialization.md) | Bài 2: Message Builder + key serialization |
| [03](phase-5-spring-cloud-stream-producer/03-streambridge-dynamic.md) | Bài 3: StreamBridge — produce events on-demand |
| [04](phase-5-spring-cloud-stream-producer/04-reactive-producer-summary.md) | Bài 4: Reactive Producer + Phase 5 summary |

### Phase 6 — consumer groups

| Bài | Nội dung |
|---|---|
| [01](phase-6-consumer-groups/01-scaling-rebalancing-demo.md) | Bài 1: Scaling Consumer Groups — demo rebalancing thực tế |

### Phase 7 — spring cloud stream processor

| Bài | Nội dung |
|---|---|
| [01](phase-7-spring-cloud-stream-processor/01-processor-1to1-filter-split.md) | Bài 1: Processor pattern — 1-to-1 mapping, filter, splitting |
| [02](phase-7-spring-cloud-stream-processor/02-reactive-processor-summary.md) | Bài 2: Reactive Processor + Phase 7 summary |

### Phase 8 — event routing

| Bài | Nội dung |
|---|---|
| [01](phase-8-event-routing/01-content-based-routing.md) | Bài 1: Content-Based Routing — chia event đến đúng topic theo nội dung |
| [02](phase-8-event-routing/02-dynamic-routing-summary.md) | Bài 2: Dynamic Routing + Phase 8 summary |

### Phase 9 — kafka cluster

| Bài | Nội dung |
|---|---|
| [01](phase-9-kafka-cluster/01-replication-listeners.md) | Bài 1: Replication Factor + Kafka Listeners deep-dive |
| [02](phase-9-kafka-cluster/02-docker-compose-cluster.md) | Bài 2: Multi-Node Cluster Docker Compose setup |

### Phase 10 — batch processing

| Bài | Nội dung |
|---|---|
| [01](phase-10-batch-processing/01-batch-producer-consumer.md) | Bài 1: High-Throughput Batch Processing — producer + consumer |

### Phase 11 — concurrent processing

| Bài | Nội dung |
|---|---|
| [01](phase-11-concurrent-processing/01-framework-concurrency.md) | Bài 1: Framework Concurrency — multi-thread consumer trong 1 JVM |
| [02](phase-11-concurrent-processing/02-unordered-concurrency.md) | Bài 2: App-Level Unordered Concurrency — virtual threads cho heavy I/O |
| [03](phase-11-concurrent-processing/03-ordered-concurrency.md) | Bài 3: Ordered Concurrency — vừa song song vừa giữ thứ tự theo key |
| [04](phase-11-concurrent-processing/04-summary.md) | Bài 4: Tóm tắt Phase 11 — 3 layer concurrency |

### Phase 12 — reliability

| Bài | Nội dung |
|---|---|
| [01](phase-12-reliability/01-acknowledgement-intro.md) | Bài 1: Message Acknowledgement — vì sao consumer phải xác nhận đã xử lý |
| [02](phase-12-reliability/02-manual-ack-nack.md) | Bài 2: Manual Acknowledgement + Negative Acknowledgement (NACK) |
| [03](phase-12-reliability/03-batch-ack-summary.md) | Bài 3: Manual ack trong batch mode + Tóm tắt Phase 12 |

### Phase 13 — error handling

| Bài | Nội dung |
|---|---|
| [01](phase-13-error-handling/01-resilience-retry-strategies.md) | Bài 1: Resilience expectations + Retry strategies (fixed delay, exponential backoff) |
| [02](phase-13-error-handling/02-retryable-nonretryable-dlq.md) | Bài 2: Phân loại retryable vs non-retryable + Dead Letter Queue |
| [03](phase-13-error-handling/03-deserialization-pause-resume.md) | Bài 3: Deserialization failures + Dynamic Pause/Resume consumer |
| [04](phase-13-error-handling/04-summary.md) | Bài 4: Tóm tắt Phase 13 — Error Handling toàn diện |

### Phase 14 — transactions

| Bài | Nội dung |
|---|---|
| [01](phase-14-transactions/01-transactions-intro.md) | Bài 1: Business case + cách Kafka transaction hoạt động |
| [02](phase-14-transactions/02-demo-commit-abort.md) | Bài 2: Setup + Demo transaction commit, abort, retry |
| [03](phase-14-transactions/03-eos-myth-summary.md) | Bài 3: Exactly-Once — myth vs reality + Tóm tắt Phase 14 |

### Phase 15 — testing

| Bài | Nội dung |
|---|---|
| [01](phase-15-testing/01-test-binder.md) | Bài 1: Test Binder — testing nhanh trong JVM |
| [02](phase-15-testing/02-testcontainers.md) | Bài 2: Testcontainers — test với Kafka thật trong Docker |
| [03](phase-15-testing/03-summary.md) | Bài 3: Tóm tắt Phase 15 — Testing strategies |

### Phase 16 — security

| Bài | Nội dung |
|---|---|
| [01](phase-16-security/01-sasl-plaintext-ssl.md) | Bài 1: Kafka Security — SASL/PLAIN + SASL/SSL |
| [02](phase-16-security/02-summary.md) | Bài 2: Tóm tắt Phase 16 — Kafka Security best practices |

### Phase 17 — netflux

| Bài | Nội dung |
|---|---|
| [01](phase-17-netflux/01-project-overview.md) | Bài 1: Netflux Overview — Real-time recommendation engine |
| [02](phase-17-netflux/02-customer-service.md) | Bài 2: Customer Service — implementation + tests đầy đủ |
| [03](phase-17-netflux/03-movie-service.md) | Bài 3: Movie Service — implementation + tests + data initialization |
| [04](phase-17-netflux/04-recommendation-consumer.md) | Bài 4: Recommendation Service — Consumer + Domain Events |
| [05](phase-17-netflux/05-recommendation-stream.md) | Bài 5: Real-time recommendations với Reactive Sinks + Server-Sent Events |
| [06](phase-17-netflux/06-recommendation-tests.md) | Bài 6: Recommendation Service tests — REST API + SSE + Consumer (Test Binder + Testcontainers) |
| [07](phase-17-netflux/07-demo-summary.md) | Bài 7: Netflux Final Demo + Tóm tắt Phase 17 |

### Phase 18 — best practices

| Bài | Nội dung |
|---|---|
| [01](phase-18-best-practices/01-producer-best-practices.md) | Bài 1: Producer best practices — acks, min.insync.replicas, idempotent producer, compression |
| [02](phase-18-best-practices/02-topic-partition-replication.md) | Bài 2: Topic, Partition, Replication Factor — quyết định bao nhiêu |
| [03](phase-18-best-practices/03-summary-whats-next.md) | Bài 3: Tóm tắt Phase 18-19 + Roadmap kỹ năng tiếp theo |

## Nên bắt đầu từ đâu

| Bạn đang ở tình huống | Đọc từ |
|---|---|
| Mới dùng Kafka | phase-3 (nền tảng) là bắt buộc, đừng bỏ qua |
| Đã có consumer, hay bị lag | phase-6 (consumer group) và phase-11 (concurrency) |
| Cần đảm bảo không mất message | phase-12 (reliability) và phase-13 (error handling) |
| Nghe nói exactly-once | phase-14 — có phần bóc trần hiểu lầm phổ biến |

---

*Mục lục này sinh từ cấu trúc thư mục và tiêu đề thật của từng bài. Thêm bài mới thì cập nhật lại bảng tương ứng.*
