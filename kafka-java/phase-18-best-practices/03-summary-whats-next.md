# Bài 3: Tóm tắt Phase 18-19 + Roadmap kỹ năng tiếp theo

Bài này: tóm tắt Phase 18 best practices, hoàn tất khoá học với Phase 19 "What's Next" — roadmap các topics nên học tiếp.

## Phase 18 — Best Practices summary

### Producer side

| Topic | Key takeaway |
|---|---|
| **Acks** | Default `all`. Đảm bảo data ghi vào leader + in-sync followers. Combo với `min.insync.replicas` để strict guarantee. |
| **Idempotent producer** | Default `true` modern Kafka. Tránh duplicate ở library retry. KHÔNG fix duplicate ở app code. |
| **Compression** | Snappy/LZ4 phổ biến. Test với workload thật. Consumer auto decompress. |

### Consumer side

| Topic | Key takeaway |
|---|---|
| **Idempotent consumer** | App-level pattern, không có property. 5-step process: unique messageId → check DB → process atomic. |
| **Acknowledgement** | Default auto-ack. Manual mode khi cần kiểm soát (Phase 12). |
| **Error handling** | Retry + DLQ + classification (Phase 13). |

### Architecture decisions

| Topic | Key takeaway |
|---|---|
| **How many topics** | Same entity ordered → 1 topic. Different entities → separate. |
| **How many partitions** | Calc: throughput / consumer rate + buffer. Don't over-allocate. |
| **Replication factor** | N expected failures + min.insync.replicas. Production: 3+2. |

## Production-ready Kafka setup checklist

Khi ship 1 Kafka-based system lên production:

### Cluster level
- [ ] Replication factor ≥ 3 cho production topics.
- [ ] min.insync.replicas = 2 (or higher).
- [ ] Topic naming convention defined (vd `{domain}.{entity}.{event}`).
- [ ] Retention policy per topic (time + size).
- [ ] Internal topics (`__consumer_offsets`, `__transaction_state`) replication ≥ 3.

### Producer
- [ ] `acks=all`.
- [ ] `enable.idempotence=true`.
- [ ] Appropriate `compression.type` (test).
- [ ] Key chọn entity ID (cho ordering).
- [ ] Message with messageId header (cho consumer idempotency).
- [ ] Outbox pattern cho atomic DB + event publish (Phase 13).

### Consumer
- [ ] Explicit `group.id` per service.
- [ ] `auto.offset.reset=earliest` cho new consumer build-state, `latest` cho real-time.
- [ ] Manual or BATCH ack mode (Phase 12).
- [ ] Idempotency check before processing (Phase 18).
- [ ] Retry config: max-attempts + backoff (Phase 13).
- [ ] DLQ enabled cho critical topics.
- [ ] Exception classification (retryable vs non-retryable).
- [ ] Consumer concurrency tune theo partition count.

### Security (Phase 16)
- [ ] SASL_SSL ở production.
- [ ] No hardcoded passwords (Vault, AWS SM, etc.).
- [ ] Per-service credentials.
- [ ] ACL configured (least privilege).
- [ ] Cert auto-rotation policy.

### Observability
- [ ] Consumer lag monitoring (alert on > threshold).
- [ ] Producer error rate monitoring.
- [ ] Broker metrics (Prometheus/Grafana).
- [ ] Distributed tracing (OpenTelemetry).
- [ ] Structured logging với traceId.
- [ ] Cert expiry alerting.

### Testing
- [ ] Unit tests cho business logic.
- [ ] Test Binder integration tests.
- [ ] Testcontainers e2e tests cho critical paths.
- [ ] Load test với expected production throughput.
- [ ] Chaos test (broker fail, network partition).

## Phase 19 — What's Next

Bạn đã hoàn thành khoá Kafka + Spring Cloud Stream. Roadmap tiếp theo phụ thuộc interest + role.

### 1. Performance: Java Virtual Threads & Reactive

App truyền thống: 1 thread per request. Scale tới ~5000 concurrent connections trước khi memory limit.

#### Java Virtual Threads (Java 21+)
- Write **synchronous blocking** code, JVM tự handle non-blocking I/O.
- Hàng triệu virtual threads cùng host được.
- Phase 11 bài 2-3 đã giới thiệu trong context Kafka.
- Apply broadly: REST APIs, DB calls, HTTP clients.

#### Spring WebFlux (Reactive)
- Different programming paradigm: `Mono`, `Flux`, reactive operators.
- Stream-based communication native.
- Hard learning curve nhưng powerful cho streaming.
- Phase 17 bài 5 dùng Sinks + Flux cho SSE.

→ Cả 2 đều solve "process more requests with less resources". Pick based on team comfort.

### 2. Backend communication: low-latency alternatives

REST + JSON OK cho most use cases. Critical low-latency:

#### gRPC
- Google's RPC framework.
- Protocol Buffers (binary) thay JSON.
- HTTP/2 transport.
- Support request-response + streaming (bidirectional).
- Latency 2-5× better than REST cho service-to-service.

#### RSocket
- Reactive alternative to gRPC.
- Network level 5 (custom protocol, not HTTP).
- Better backpressure support.
- Netflix-origin.

#### Kafka (which you just learned)
- For async event-driven.
- Higher latency than gRPC/RSocket (broker hop).
- But better decoupling + scalability.

→ Mỗi cái có sweet spot. Production app thường mix all 3.

### 3. Frontend communication

#### GraphQL
- Alternative to REST.
- Client picks fields → reduce over-fetching.
- Single endpoint, multiple queries.
- Best cho mobile (bandwidth-conscious).

#### gRPC-Web / RSocket
- Cho mobile, IoT, low-latency UI.

### 4. Caching: Redis

- In-memory key-value store.
- Sub-millisecond reads.
- Pub/Sub messaging (alternative to Kafka cho simple use case).
- Distributed locks.
- Use case: cache hot DB queries, session storage, rate limiting.

### 5. Resilience patterns

Network luôn unreliable. Slow service → cascade failure. Patterns to know:
- **Circuit breaker** (Resilience4j, Spring Cloud Circuit Breaker).
- **Bulkhead** isolation.
- **Timeout** + retry with backoff.
- **Fallback** (graceful degradation).
- **Saga pattern** (distributed transactions).

### 6. Container + orchestration

#### Docker (must-have)
- Package app + dependencies.
- Local dev productivity.
- Consistent deploy.

#### Kubernetes
- Orchestration: deploy, scale, rollback.
- Service discovery.
- Load balancing.
- Config management (ConfigMap, Secret).
- Auto-scaling (HPA, VPA).
- Multi-cloud portable (avoid vendor lock-in).

### 7. Testing automation

- **Selenium** + **Playwright** cho UI E2E.
- **JUnit 5** advanced.
- **Mutation testing** (PIT).
- **Contract testing** (Pact).
- **Chaos engineering** (Chaos Monkey).

### 8. Schema evolution

Kafka course chưa cover deep:
- **Avro** + **Schema Registry**.
- Backward / forward / full compatibility.
- Version migration strategy.

### 9. Observability

- **Distributed tracing**: OpenTelemetry, Zipkin, Jaeger.
- **Metrics**: Prometheus + Grafana.
- **Logging**: ELK stack, Loki.
- **APM**: Datadog, New Relic.

### 10. Cloud-native Kafka

- **Confluent Cloud** — managed Kafka.
- **AWS MSK** — AWS managed.
- **Azure Event Hubs** — Kafka-compatible.
- **Google Pub/Sub** — alternative messaging.

Pros: no ops burden. Cons: vendor lock-in, $$$.

## Decision tree cho next learning

```text
You are interested in...
│
├── App throughput / scalability
│   ├── Virtual Threads (easier)
│   └── Reactive (steeper but powerful)
│
├── Service-to-service communication
│   ├── REST/JSON (you have this)
│   ├── gRPC (low latency)
│   ├── RSocket (reactive + low latency)
│   └── Kafka (you have this — async)
│
├── Frontend optimization
│   ├── GraphQL
│   └── gRPC-Web
│
├── Production reliability
│   ├── Resilience patterns
│   ├── Distributed tracing
│   └── Chaos engineering
│
├── Deploy + Operations
│   ├── Docker (must)
│   ├── Kubernetes
│   └── Cloud-native Kafka
│
└── Data + Caching
    ├── Redis
    ├── Schema Registry + Avro
    └── Stream processing (Kafka Streams, Flink)
```

## Tóm tắt khoá học

Sau khi hoàn thành 188 lessons trong khoá này, bạn đã:

### Core skills acquired

✓ **Kafka fundamentals**: brokers, topics, partitions, consumer groups, offsets, leader/follower.

✓ **Spring Cloud Stream**: Consumer, Producer, Processor patterns. Binder + bindings configuration.

✓ **Advanced**:
- Routing (content-based, dynamic).
- Concurrency (framework + app-level virtual threads).
- Reliability (acknowledgement, error handling, DLQ, transactions).
- Testing (Test Binder, Testcontainers).
- Security (SASL, SSL).

✓ **Cluster architecture**: multi-broker, ISR, replication, network design.

✓ **Production patterns**: Outbox, idempotent consumer, retry strategies, monitoring.

✓ **Project experience**: Netflux real-time recommendation engine.

### Mindset shifts

→ Từ synchronous request-response → asynchronous event-driven thinking.

→ Từ "instant consistency" → "eventual consistency với guarantees".

→ Từ "1 monolith" → "loosely-coupled microservices via events".

→ Từ "kiểm soát mọi thứ" → "embrace failure, design for it".

### Lời cuối

Event-Driven Architecture không phải bullet vào mọi problem. Chọn tool đúng cho job:

- **Sync REST** đơn giản nhất, OK cho 80% case.
- **gRPC** cho low-latency service-to-service.
- **Kafka** cho high-throughput async event streams.
- **Hybrid** mix tất cả là production reality.

Hiểu rõ trade-off → ra quyết định đúng.

Chúc bạn thành công với production EDA system!

🎓 **Course end.**

## Tóm tắt Phase 18 + 19

- Phase 18 cover production best practices: acks, min.insync.replicas, idempotent producer/consumer, compression, topic/partition/replication sizing.
- Phase 19 roadmap 10 topics tiếp theo:
  1. Virtual Threads / Reactive
  2. gRPC / RSocket
  3. GraphQL
  4. Redis caching
  5. Resilience patterns
  6. Docker + Kubernetes
  7. Testing automation
  8. Schema evolution
  9. Observability
  10. Cloud-native Kafka
- Pick based on role + project needs.
- Mindset shift: async, eventual consistency, embrace failure.
- Production rule: choose right tool per job. Hybrid REST + gRPC + Kafka là norm.

🎉 **Khoá học kafka-java hoàn thành — 188 lessons, 19 phases.**
