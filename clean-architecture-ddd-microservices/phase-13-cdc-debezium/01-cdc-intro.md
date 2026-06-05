# Bài 53: Change Data Capture với Debezium — nâng cấp Outbox polling sang push

> Phase-9 dùng scheduler polling 5s — đơn giản nhưng tải DB + latency. Phase-13 thay bằng **CDC (Change Data Capture)** với Debezium — đọc transaction log Postgres trực tiếp, push lên Kafka instant. Latency từ 5s xuống <100ms.

## Vấn đề của polling

Outbox scheduler hiện tại:
```text
mỗi 5s:
  SELECT * FROM outbox WHERE status='STARTED'
  for each: publish + UPDATE COMPLETED
```

Vấn đề:
1. **Latency**: tối thiểu 5s từ INSERT đến publish.
2. **DB load**: query mỗi 5s × N service × N outbox table → nhiều query rỗng khi idle.
3. **Race condition**: multi-instance scale → cần `@Version` lock.
4. **Throughput limit**: 1 service scheduler chỉ pull được X row/lần. Quá nhiều = backlog.

## CDC concept

**Change Data Capture** = bắt mọi thay đổi trong DB (INSERT/UPDATE/DELETE) và emit event ra ngoài.

Hai cách CDC:

### Trigger-based
DB trigger AFTER INSERT/UPDATE → ghi vào table audit. Application đọc audit. Đơn giản nhưng:
- Trigger chạy trong transaction → impact perf.
- Logic phân tán trong DB stored procedure.

### Log-based (Debezium dùng)
Đọc **transaction log** của DB (Postgres WAL, MySQL binlog, MongoDB oplog). Không touch table, không chạy trong transaction → zero perf impact.

```text
Application                    Postgres
   INSERT INTO outbox  ───►   transaction log (WAL)
                                       │
                                       │ Debezium tail log
                                       ▼
                              Debezium connector  ───►  Kafka topic
                              (Kafka Connect)
```

Debezium parser WAL, detect mọi change, convert thành event, push lên Kafka — **gần như real-time** (< 100ms).

## Postgres WAL — cơ chế bên trong

PostgreSQL ghi mọi thay đổi vào **Write-Ahead Log** trước khi commit. WAL dùng cho:
- Crash recovery — replay WAL khi restart.
- Replication — replica đọc WAL từ master.
- Backup — base + WAL = point-in-time recovery.
- CDC — Debezium đọc.

WAL format: binary, sequential write rất nhanh. Postgres support **logical replication** từ 9.4+ — decode WAL thành logical change (table.column = value).

Debezium cần Postgres config:
```text
wal_level = logical
max_wal_senders = 4
max_replication_slots = 4
```

## Debezium architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│                       Kafka Connect cluster                          │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Debezium Postgres Connector                                  │   │
│  │  ┌────────────────┐                                          │   │
│  │  │ WAL reader      │  ◄─── replication slot                  │   │
│  │  ├────────────────┤                                          │   │
│  │  │ Decoder         │                                          │   │
│  │  ├────────────────┤                                          │   │
│  │  │ Schema serdes   │                                          │   │
│  │  ├────────────────┤                                          │   │
│  │  │ Kafka publisher │  ───► Kafka topic                       │   │
│  │  └────────────────┘                                          │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
              │                                          │
              ▼                                          ▼
       ┌──────────────┐                          ┌──────────────┐
       │  Postgres    │                          │  Kafka       │
       │  WAL log     │                          │  topic       │
       └──────────────┘                          └──────────────┘
```

**Kafka Connect** = framework chạy connector (source / sink). Source connector = pull data IN (Debezium); sink connector = push data OUT (Elasticsearch, JDBC).

Debezium connector chạy như task trong Kafka Connect cluster. Auto resume từ last offset khi crash.

## Topic Debezium naming

Default: `<connector-name>.<schema>.<table>`.

Ví dụ với connector tên `order-postgres-connector`, table `order.payment_outbox`:
```text
Topic: order-postgres-connector.order.payment_outbox
```

Mỗi INSERT/UPDATE/DELETE = 1 message với schema:
```json
{
  "before": null,
  "after": {
    "id": "abc-123",
    "saga_id": "xyz-456",
    "type": "OrderProcessingSaga",
    "payload": "{...}",
    "outbox_status": "STARTED",
    ...
  },
  "source": { "db": "postgres", "schema": "order", "table": "payment_outbox", ... },
  "op": "c",                    // c=create, u=update, d=delete, r=read (snapshot)
  "ts_ms": 1717545600000
}
```

Consumer chỉ quan tâm `after` + `op="c"` (INSERT mới).

## Outbox với CDC — flow mới

```text
1. Application INSERT outbox row trong transaction
   ↓
2. Postgres ghi WAL log entry
   ↓
3. Debezium đọc WAL, decode thành event
   ↓
4. Debezium publish lên Kafka topic
   ↓
5. Consumer (Payment service) consume từ topic
```

**Không có scheduler**. Không có polling. Không có outbox status update.

Latency: vài chục ms — gần như instantaneous.

## Trade-off CDC vs polling

| Aspect | Polling (phase-9) | CDC (phase-13) |
|---|---|---|
| Latency | 5s | <100ms |
| DB load | Query mỗi N giây | Replication slot stream (low) |
| Complexity | Đơn giản | Phức tạp (Kafka Connect + Debezium) |
| Infrastructure | Spring + Kafka đủ | Thêm Kafka Connect cluster |
| Idempotency | Cần logic | Đảm bảo bởi Debezium (at-least-once với recovery) |
| Multi-instance race | Cần `@Version` | Không (Debezium là single reader) |
| Schema evolution | Application control | Debezium control schema |
| Operational | 1 service | 2 service (app + Connect) |

## Khi nào KHÔNG dùng CDC

- Hệ thống nhỏ — polling đủ.
- DB không support CDC (MySQL row-format binlog OK, statement-format không).
- Team chưa quen Kafka Connect.
- Latency < 100ms không thực sự cần.

## Outbox pattern with CDC — variant phổ biến

Tinh tế: với CDC, bạn có thể bỏ outbox table luôn — Debezium đọc trực tiếp business table:

```text
Cách 1: Outbox + CDC
   INSERT orders + INSERT payment_outbox (1 transaction)
   → Debezium đọc payment_outbox → Kafka

Cách 2: Direct CDC (no outbox)
   INSERT orders (1 transaction)
   → Debezium đọc orders → Kafka
```

Cách 2 đơn giản hơn nhưng:
- Event format = table row → service consumer phải hiểu structure DB.
- Khó tách "event đã publish" vs "event sắp publish" — không có outbox status.
- Schema evolution risk: đổi schema = phá consumer.

Khoá học **giữ outbox table** và dùng CDC đọc nó. Best of both: atomic + push-based.

## Debezium Outbox Event Router (SMT)

Debezium có **Single Message Transformation** đặc biệt cho outbox pattern:

```json
{
  "transforms": "outbox",
  "transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter",
  "transforms.outbox.table.field.event.id": "id",
  "transforms.outbox.table.field.event.key": "saga_id",
  "transforms.outbox.table.field.event.payload": "payload",
  "transforms.outbox.route.by.field": "type",
  "transforms.outbox.route.topic.replacement": "${routedByValue}"
}
```

SMT này:
- Lấy `payload` JSON từ row → thành Kafka message value.
- Dùng `saga_id` làm Kafka key.
- Dynamic route theo `type` column → mỗi event đi đúng topic.

Service consumer thấy như Kafka message bình thường — không biết source là CDC.

## Roadmap 5 bài phase 13

```text
Bài 53 (đang đọc):   CDC + Debezium intro
Bài 54:               Cấu hình Postgres + cài Debezium Connector
Bài 55:               Source connector configuration cho outbox table
Bài 56:               Migrate Order service từ polling sang CDC
Bài 57:               Benchmark + comparison polling vs CDC
```

## Tóm tắt bài 53

- CDC = Change Data Capture — bắt mọi DB change qua transaction log, push real-time.
- Debezium = open-source CDC platform, chạy trên Kafka Connect.
- Postgres logical replication + WAL = nền tảng cho Debezium.
- Latency CDC <100ms vs polling 5s.
- Outbox + CDC = best practice: atomic write + push-based delivery.
- Debezium Outbox Event Router (SMT) tự convert row → event format chuẩn.
- Trade-off: thêm Kafka Connect cluster, complexity cao hơn.

**Bài kế tiếp** → [Bài 54: Configure Postgres + cài Debezium Connector](02-postgres-debezium-config.md)
