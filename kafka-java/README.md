# Kafka Java

> Kafka với Spring — từ topic đầu tiên tới hệ thống streaming production.

69 bài về Kafka trong hệ sinh thái Java/Spring: nền tảng Kafka (topic, partition, key, offset, rebalancing), Spring Cloud Stream cho producer và consumer, consumer group và scaling, event routing, cụm Kafka và replication, xử lý theo lô, xử lý song song, độ tin cậy và ack, xử lý lỗi và retry, transaction và exactly-once, testing, bảo mật, phần mổ xẻ nội bộ Kafka (ZooKeeper, KRaft/Raft, ISR, high watermark, failover có số đo), các chủ đề bổ sung (ưu tiên message, offset commit toàn tập, partitioner tuỳ chỉnh, TLS từ gốc), và Kafka Streams từ đầu tới vận hành production.

**85 bài** trong 21 phần.

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

### Phase 20 — kafka internals (mổ xẻ nội bộ)

> Lớp đào sâu bên dưới Phase 3, 9, 12, 18 — **không thay thế** phase nào. Viết từ một loạt transcript "Kafka Internal" tiếng Việt, đã đối chiếu với transcript chính thức của khoá và tài liệu Apache Kafka; 12 chỗ transcript nói sai được ghi rõ ở [bài 12](phase-20-kafka-internals/12-dinh-chinh-transcript-va-tong-ket.md).

| Bài | Nội dung |
|---|---|
| [01](phase-20-kafka-internals/01-vi-sao-kafka-ra-doi-tai-linkedin.md) | Bài 1: Vì sao Kafka ra đời — câu chuyện có thật ở LinkedIn |
| [02](phase-20-kafka-internals/02-cluster-ha-va-scalability.md) | Bài 2: Cluster là gì — High Availability và Scalability giải nghĩa tận gốc |
| [03](phase-20-kafka-internals/03-doi-chieu-mysql-de-hieu-kafka.md) | Bài 3: Đối chiếu MySQL để hiểu Kafka — replica, binlog, sharding |
| [04](phase-20-kafka-internals/04-giai-phau-broker-topic-partition-replica.md) | Bài 4: Giải phẫu broker, topic, partition, replica — cái gì nằm ở đâu trên đĩa |
| [05](phase-20-kafka-internals/05-leader-follower-isr-va-luong-ghi.md) | Bài 5: Leader, Follower, ISR và đường đi thật của một lệnh ghi |
| [06](phase-20-kafka-internals/06-zookeeper-tu-a-den-z.md) | Bài 6: ZooKeeper từ A đến Z — nó làm gì cho Kafka và vì sao bị loại bỏ |
| [07](phase-20-kafka-internals/07-kraft-va-thuat-toan-raft.md) | Bài 7: KRaft và thuật toán Raft — bầu cử, nhiệm kỳ, nhật ký metadata |
| [08](phase-20-kafka-internals/08-cluster-membership-va-vong-doi-broker.md) | Bài 8: Vòng đời một broker — tham gia cụm, nhịp tim, rời cụm |
| [09](phase-20-kafka-internals/09-failover-thuc-hanh-va-so-lieu.md) | Bài 9: Thực hành failover — 6 kịch bản, lệnh, và số liệu đo được |
| [10](phase-20-kafka-internals/10-hanh-trinh-mot-message.md) | Bài 10: Hành trình một message — từ `send()` tới tay consumer |
| [11](phase-20-kafka-internals/11-tu-dien-moi-thanh-phan-kafka.md) | Bài 11: Từ điển mọi thành phần Kafka — làm gì, giải quyết gì, hỏng ra sao |
| [12](phase-20-kafka-internals/12-dinh-chinh-transcript-va-tong-ket.md) | Bài 12: Bảng đính chính transcript và tổng kết Phase 20 |

### Phase 21 — chủ đề bổ sung

> Bảy chủ đề rút từ tài liệu Kafka 162 trang, **không trùng** với phase nào đang có. Các chỗ tài liệu nguồn nói sai đã được đính chính ngay trong bài (đáng chú ý: công thức băm key bị ghi nhầm thành `% (numPartitions - 1)`).

| Bài | Nội dung |
|---|---|
| [01](phase-21-chu-de-tu-tai-lieu/01-message-broker-va-queue-vs-topic.md) | Bài 1: Message broker, Queue và Topic — Kafka đứng ở đâu trong bức tranh chung |
| [02](phase-21-chu-de-tu-tai-lieu/02-uu-tien-message-trong-kafka.md) | Bài 2: Ưu tiên message trong Kafka — ba mẫu thiết kế và cái giá của từng mẫu |
| [03](phase-21-chu-de-tu-tai-lieu/03-offset-commit-toan-tap.md) | Bài 3: Offset commit toàn tập — commitSync, commitAsync và 7 AckMode của Spring |
| [04](phase-21-chu-de-tu-tai-lieu/04-gui-va-doc-partition-chi-dinh.md) | Bài 4: Gửi và đọc partition chỉ định — custom partitioner, assign và seek |
| [05](phase-21-chu-de-tu-tai-lieu/05-gioi-han-vat-ly-cua-partition.md) | Bài 5: Bao nhiêu partition là đủ — giới hạn vật lý và công thức tính |
| [06](phase-21-chu-de-tu-tai-lieu/06-ssl-tls-cho-kafka-tu-goc.md) | Bài 6: SSL/TLS cho Kafka từ gốc — CA, keystore, truststore |
| [07](phase-21-chu-de-tu-tai-lieu/07-ba-tang-test-cho-kafka.md) | Bài 7: Ba tầng test cho Kafka — Test Binder, EmbeddedKafka, Testcontainers |
| [08](phase-21-chu-de-tu-tai-lieu/08-header-interceptor-va-quota.md) | Bài 8: Header, Interceptor và Quota — ba thứ ít dùng nhưng cứu bạn khi cần |

### Phase 22 — kafka streams

> Xử lý luồng **có trạng thái** — phần mà consumer thường làm được nhưng làm rất tệ. Từ KStream/KTable tới cửa sổ thời gian, join, state store, và vận hành trên Kubernetes.

| Bài | Nội dung |
|---|---|
| [01](phase-22-kafka-streams/01-kafka-streams-la-gi.md) | Bài 1: Kafka Streams là gì — và vì sao nó không cần cụm xử lý riêng |
| [02](phase-22-kafka-streams/02-kstream-ktable-globalktable.md) | Bài 2: KStream, KTable, GlobalKTable — ba trừu tượng cốt lõi |
| [03](phase-22-kafka-streams/03-phep-bien-doi-khong-trang-thai.md) | Bài 3: Phép biến đổi không trạng thái — và bẫy repartition ẩn |
| [04](phase-22-kafka-streams/04-trang-thai-state-store-va-changelog.md) | Bài 4: Trạng thái — state store, RocksDB và changelog topic |
| [05](phase-22-kafka-streams/05-cua-so-thoi-gian-windowing.md) | Bài 5: Cửa sổ thời gian — tumbling, hopping, sliding, session |
| [06](phase-22-kafka-streams/06-join-trong-kafka-streams.md) | Bài 6: Join trong Kafka Streams — bốn kiểu và yêu cầu đồng phân vùng |
| [07](phase-22-kafka-streams/07-topology-task-thread-va-van-hanh.md) | Bài 7: Topology, task, thread và vận hành ứng dụng Streams |
| [08](phase-22-kafka-streams/08-ksqldb-va-khi-nao-khong-dung.md) | Bài 8: ksqlDB và khi nào không nên dùng Kafka Streams |

## Nên bắt đầu từ đâu

| Bạn đang ở tình huống | Đọc từ |
|---|---|
| Mới dùng Kafka | phase-3 (nền tảng) là bắt buộc, đừng bỏ qua |
| Đã có consumer, hay bị lag | phase-6 (consumer group) và phase-11 (concurrency) |
| Cần đảm bảo không mất message | phase-12 (reliability) và phase-13 (error handling) |
| Nghe nói exactly-once | phase-14 — có phần bóc trần hiểu lầm phổ biến |
| Muốn hiểu Kafka hoạt động bên trong ra sao | phase-20 — ISR, high watermark, ZooKeeper vs KRaft, failover có số đo |
| Chuẩn bị phỏng vấn về hệ phân tán | phase-20 bài 2, 5, 7 — quorum, replication, Raft |
| Sắp đưa Kafka lên production | phase-20 bài 9 — bảng mặc định phải đổi và bộ chỉ số cảnh báo |
| Cần ưu tiên message (VIP xử lý trước) | phase-21 bài 2 — ba mẫu và giới hạn thật của Kafka |
| Hay bị trùng hoặc mất message | phase-21 bài 3 — offset commit toàn tập |
| Phải tự tạo chứng chỉ TLS | phase-21 bài 6 — CA, keystore, truststore từ gốc |
| Cần đếm/gộp/join theo cửa sổ thời gian | phase-22 — Kafka Streams từ đầu |
| Đang cân nhắc Kafka Streams vs Flink vs ksqlDB | phase-22 bài 1 và bài 8 |

---

*Mục lục này sinh từ cấu trúc thư mục và tiêu đề thật của từng bài. Thêm bài mới thì cập nhật lại bảng tương ứng.*
