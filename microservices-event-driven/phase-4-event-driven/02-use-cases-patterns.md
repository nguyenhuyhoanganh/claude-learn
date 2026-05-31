# Bài 2: Use cases và 2 patterns delivery của EDA

EDA không phải silver bullet. Bài này phân loại 6 use case **phù hợp**, 2 trường hợp **không phù hợp**, và phân biệt 2 delivery pattern căn bản: **Event Streaming** vs **Pub-Sub**.

## 6 use cases EDA hợp

### Use case 1: Fire-and-forget — actions async by nature

> Sender không expect data back ngay, hoặc không expect response gì cả.

Examples:

**Generate report PDF cho user**:
```text
User clicks "Generate Q4 Sales Report".
→ ReportService: enqueue event "GenerateReport(user_id, params)".
→ Return immediately: "Report sẽ gửi qua email khi xong".
→ Worker pick up event → generate (5 phút) → upload S3 → email user link.
```

User không hold UI 5 phút. UX tốt.

**User leaves a product review**:
```text
User submit review.
→ ReviewService: save DB.
→ Return "Review accepted".
→ Publish event "ReviewCreated" → fan-out:
   - SearchService: re-index.
   - RecommendationService: update model.
   - AnalyticsService: count.
```

User không quan tâm các downstream side-effect. Async OK.

### Use case 2: Reliable delivery — không được mất message

> Financial transactions, orders, money transfers.

**Online store order**:
```text
User submit order: "Buy iPhone 15".
→ OrderService publish "OrderPlaced" to broker.
→ Broker persist event (Kafka log on disk).
→ Even if InventoryService down → broker holds.
→ When InventoryService back → consume + decrement stock.

Nếu InventoryService die mid-process → consumer offset không advance → 
event re-delivered khi consumer restart.

→ Order KHÔNG bị mất, dù bao nhiêu component crash.
```

**Money transfer**:
```text
User transfer $100 from A to B.
→ TransferService publish "TransferInitiated".
→ Even if everything crashes → on restart, replay events.
→ Eventually consistent. Never lose money.
```

Sync request → server crash → request lost → revenue loss. EDA + durable broker → guarantee.

Detail về **at-least-once / exactly-once** delivery semantics ở bài tiếp.

### Use case 3: Infinite streams of data

> Continuous data flow cần process real-time.

**IoT sensors / autonomous cars**:
```text
1M vacuum cleaners worldwide báo location + battery every 10s.
→ 100k events/sec into Kafka topic "device-telemetry".
→ Multiple consumers:
   - HealthMonitor: detect device offline.
   - Analytics: aggregate per region.
   - MLPipeline: train models.
   - Storage: archive to S3 / data lake.
```

Single broker handle stream, multiple consumers from same data.

**Mobile location data**:
```text
Uber driver app push location every 4s.
→ Kafka topic.
→ Consumers: ETA service, surge pricing, map display, fraud detection.
```

Request-response không scale for stream — overhead per request quá lớn.

### Use case 4: Anomaly detection / pattern recognition

> Mỗi event riêng nhạt. Sequence của events → insight.

**Auto-scaling**:
```text
Each EC2 instance push "req-per-sec" metric every 10s to event broker.
→ AnomalyDetector consume sliding window:
   - If req/sec trend up 50% over 5 min → scale out.
   - If req/sec drops to 0 → page oncall (instance died).
```

Single data point: "server X processed 100 req in last 10s" — meh.
Sequence: "trend climbing 30% / minute for 5 mins" → action needed.

**Fraud detection**:
```text
Each transaction = event.
Pattern: 5 transactions in 1 minute từ 5 country khác nhau → suspicious.
→ Stream processor (Kafka Streams, Flink) analyze sequence.
```

### Use case 5: Broadcasting state change

> 1 service muốn báo "tôi vừa thay đổi state X" → N service quan tâm.

**User clicks ad**:
```text
AdService receive click → emit "AdClicked" event.
→ Fan-out to:
   - BillingService: charge advertiser.
   - AnalyticsService: count CTR.
   - PersonalizationService: update interest profile.
   - FraudDetectionService: check click patterns.
   - PartnerNotifyService: tell advertiser real-time.
```

AdService doesn't know consumers exist. Adding 6th consumer = no code change in AdService.

### Use case 6: Buffering against traffic spikes

> Tolerate sudden load spikes by buffering events in broker.

**Social media viral event**:
```text
Normal: 1k posts/sec.
Earthquake hits → 100k posts/sec for 2 minutes.

Without broker:
  PostService → DB direct.
  → DB overload, crash. Site down.

With broker:
  PostService → publish to Kafka (handles 100k/sec easily).
  PersistenceWorker → consume at sustainable rate (5k/sec).
  → DB happy. Backlog drains in 20 min.
  → User sees post saved (eventually); no outage.
```

Broker = **shock absorber** between burst source và sustainable processor.

## 2 cases EDA KHÔNG hợp

### Case 1: Immediate response with data

User browse product category → server must return list **now**.

```text
User: GET /category/electronics
Server: query DB → return 200 products JSON < 200ms.
```

Async approach:
```text
User: publish "QueryCategoryEvent".
→ Wait for "QueryCategoryResultEvent" with results.
→ ??? (where does user receive? polling? WebSocket?)
→ Latency 5x worse, complexity 10x.
```

Sync REST/gRPC win hands down here.

### Case 2: Trivial interaction not worth broker complexity

Small app, 2 services, simple workflow → broker = infrastructure + ops + cost overkill.

```text
Cost of running Kafka cluster (production):
- 3+ brokers (HA).
- ZooKeeper / KRaft.
- Schema registry.
- Monitoring.
- ~$500-2000/month minimum.
- 1 dedicated infra person to operate.
```

Justify chỉ khi system get real benefit.

## Combine sync + async in same architecture

Reality: **hybrid**.

```text
User checkout:
  POST /order  (sync REST)
  → OrderService:
      1. Validate (sync) — return error if invalid input.
      2. Save DB (sync).
      3. Publish "OrderPlaced" event (async).
      4. Return 200 with orderId (sync).

Downstream (all async):
  Payment, Inventory, Shipping, Notification — consume event.
```

Sync where user waits. Async for side effects.

Rule of thumb:
- Start sync (simpler).
- Upgrade specific flows to EDA when pain shows: latency, coupling, fan-out needs.

## 2 delivery patterns

### Pattern A: Event Streaming

> Broker = **persistent log**. Events stored indefinitely (or long retention). Consumers can replay from any offset.

```text
Topic "orders":
+──+──+──+──+──+──+──+──+──+──+──+──+──+──+──+──+
│E1│E2│E3│E4│E5│E6│E7│E8│E9│E10│E11│E12│E13│E14│
+──+──+──+──+──+──+──+──+──+──+──+──+──+──+──+──+
 ▲                                ▲      ▲
 │ Consumer A                     │      │ Consumer B
 │ at offset 5                    │      │ at offset 12

Consumer C joins later → reads from offset 0 → catches up.
Consumer A bug — restart from offset 0 → reprocess.
```

Tools: **Kafka**, **Pulsar**, **Kinesis**, **Pub/Sub Lite**.

Đặc trưng:
- **Durable**: disk-backed, replicated.
- **Replay-able**: re-read events anytime.
- **Multiple independent consumers**: each tracks own offset.
- **Long retention**: days / weeks / forever.

Best for:
- Reliable delivery (financial, orders).
- Pattern detection (need historical window).
- Multiple consumer groups (broadcast).
- Event sourcing (events = source of truth).

### Pattern B: Pub-Sub (publish-subscribe)

> Broker = **transient delivery mechanism**. Event delivered to current subscribers, then deleted.

```text
Topic "notifications":
Publish E1 → broker → push to subscribers (now) → delete.

Subscriber joins later → only sees NEW events from now.
Old events: gone.
```

Tools: **RabbitMQ** (classic mode), **AWS SNS**, **Google Pub/Sub** (without ack retention), **Redis Pub/Sub**.

Đặc trưng:
- **Fan-out broadcast** to current subscribers.
- **No replay** (event consumed = gone).
- **Temporary**: broker không persist long-term.
- **Subscriber-driven**: new subscriber → only future events.

Best for:
- Fire-and-forget notification.
- Real-time broadcast (chat, presence).
- Buffering (queue-style — 1 consumer drain).
- Cases không cần history.

### Bảng so sánh

| Aspect | Event Streaming | Pub-Sub |
|---|---|---|
| Storage | Long-term log | Transient delivery |
| Replay | Yes, from any offset | No |
| Multiple consumers | Independent offsets | All get fan-out |
| Late subscriber | Reads from start | Only future events |
| Disk usage | High (retain everything) | Low |
| Throughput | Very high (append log) | High |
| Best use | Reliable delivery, audit, replay | Notification, broadcast |
| Examples | Kafka, Pulsar | RabbitMQ, SNS, Redis pub-sub |

### Hybrid example

Kafka thực ra hỗ trợ cả 2:

```text
Kafka topic configured with retention.ms = 7 days
→ Event streaming pattern (replayable trong 7 days).

Kafka topic configured with retention.ms = 1 minute
→ Pub-sub-like (events expire fast).
```

RabbitMQ Streams (newer feature) cũng hỗ trợ replay → blur line.

Modern: **Kafka dominates** because it covers both pattern. Choose specialized tool (SNS, NATS) when scale + use case fit narrowly.

## Decision tree

```text
Need history / replay? ──► Yes ──► Event Streaming (Kafka)
                          │
                          └─► No ──► Need durable buffer (orders)? 
                                     ├─► Yes ──► Event Streaming OR Queue (SQS)
                                     │
                                     └─► No ──► Fire-and-forget notification?
                                                ├─► Yes ──► Pub-Sub (SNS, Redis)
                                                │
                                                └─► No ──► Maybe sync REST?
```

## Anti-pattern: Misusing Pub-Sub for reliable delivery

Redis Pub-Sub không persist:

```text
Publisher → Redis Pub-Sub
Subscriber A offline (network blip).
Event delivered to others, lost for A.
A back online → never sees event.
```

→ Don't use Redis Pub-Sub cho orders, payments. Use Kafka or SQS.

## Anti-pattern: Misusing Event Streaming cho realtime broadcast

Kafka excellent for log; not optimal for sub-millisecond fan-out to many subscribers (e.g., game state push to 1M players).

→ NATS, Redis Pub-Sub, WebSocket dedicated server cho realtime UX.

## Tóm tắt bài 2

- 6 use case EDA hợp: **fire-and-forget**, **reliable delivery**, **infinite stream**, **anomaly detection**, **broadcasting state change**, **buffering traffic spike**.
- 2 case EDA KHÔNG hợp: **immediate-response with data**, **trivial interaction** không worth broker.
- **Hybrid architecture**: sync request-response + async EDA — start sync, upgrade where needed.
- **Event Streaming** (Kafka) = persistent log, replayable, multiple consumers, durable.
- **Pub-Sub** (SNS, Redis) = transient broadcast, no replay, current subscribers only.
- Reliable delivery + audit + pattern detection → **streaming**. Notification + broadcast → **pub-sub**.
- Kafka modern = covers both patterns with configurable retention.

**Bài kế tiếp** → [Bài 3: Delivery semantics — at-most-once, at-least-once, exactly-once](03-delivery-semantics.md)
