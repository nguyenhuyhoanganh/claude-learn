# Bài 55: Source connector configuration — đọc 5 outbox table

> Kafka Connect đã chạy. Bài này config Debezium connector: chọn table, schema, transformation, route topic. POST JSON config lên REST API → connector start ngay.

## Connector config — Order service outbox

`infrastructure/debezium/order-postgres-connector.json`:

```json
{
  "name": "order-postgres-connector",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "tasks.max": "1",

    "database.hostname": "postgres",
    "database.port": "5432",
    "database.user": "postgres",
    "database.password": "admin",
    "database.dbname": "postgres",
    "database.server.name": "order-postgres",

    "plugin.name": "pgoutput",
    "slot.name": "order_outbox_slot",
    "publication.name": "dbz_publication",
    "publication.autocreate.mode": "filtered",

    "table.include.list": "order.payment_outbox,order.restaurant_approval_outbox",
    "tombstones.on.delete": "false",

    "topic.prefix": "order-cdc",
    "schema.history.internal.kafka.bootstrap.servers": "kafka-broker-1:9092",
    "schema.history.internal.kafka.topic": "schema-changes.order",

    "key.converter": "org.apache.kafka.connect.json.JsonConverter",
    "key.converter.schemas.enable": "false",
    "value.converter": "org.apache.kafka.connect.json.JsonConverter",
    "value.converter.schemas.enable": "false",

    "transforms": "outbox",
    "transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter",
    "transforms.outbox.table.field.event.id": "id",
    "transforms.outbox.table.field.event.key": "saga_id",
    "transforms.outbox.table.field.event.payload": "payload",
    "transforms.outbox.table.field.event.timestamp": "created_at",
    "transforms.outbox.route.by.field": "type",
    "transforms.outbox.route.topic.replacement": "${routedByValue}_request",

    "snapshot.mode": "never"
  }
}
```

### Giải thích từng config

| Config | Vai trò |
|---|---|
| `connector.class` | Debezium Postgres connector class |
| `tasks.max=1` | 1 task — Postgres logical decoding single-threaded |
| `database.*` | Postgres connection |
| `database.server.name=order-postgres` | Prefix metadata cho topic |
| `plugin.name=pgoutput` | Decode plugin built-in Postgres 10+ |
| `slot.name=order_outbox_slot` | Replication slot riêng cho connector này |
| `publication.name=dbz_publication` | Publication đã tạo bài 54 |
| `table.include.list` | Chỉ track 2 outbox table |
| `topic.prefix=order-cdc` | Prefix cho schema history topic |
| `transforms.outbox.*` | Outbox Event Router SMT — convert row → event |
| `route.topic.replacement=${routedByValue}_request` | Topic từ value của column `type` + suffix |
| `snapshot.mode=never` | Không snapshot history, chỉ stream change mới |

### Outbox Event Router behavior

Khi 1 row INSERT vào `order.payment_outbox`:
```text
INSERT INTO "order".payment_outbox (id, saga_id, type, payload, ...)
VALUES ('abc-123', 'xyz-456', 'OrderProcessingSaga', '{"orderId": "ord-1", ...}', ...);
```

Debezium đọc WAL → SMT extract:
- **Key Kafka**: `xyz-456` (saga_id).
- **Value Kafka**: `{"orderId": "ord-1", ...}` (payload JSON).
- **Topic**: `OrderProcessingSaga_request` (routedByValue + suffix).

Consumer thấy message thuần — không biết source là CDC.

## Submit connector

```text
$ curl -X POST -H "Content-Type: application/json" \
    --data @infrastructure/debezium/order-postgres-connector.json \
    http://localhost:8083/connectors

{
  "name": "order-postgres-connector",
  "config": {...},
  "tasks": [{"connector": "order-postgres-connector", "task": 0}]
}
```

Verify:
```text
$ curl http://localhost:8083/connectors/order-postgres-connector/status

{
  "name": "order-postgres-connector",
  "connector": {
    "state": "RUNNING",
    "worker_id": "kafka-connect:8083"
  },
  "tasks": [
    {
      "id": 0,
      "state": "RUNNING",
      "worker_id": "kafka-connect:8083"
    }
  ]
}
```

State RUNNING — Debezium đang stream WAL.

Postgres replication slot active:
```text
$ psql -c "SELECT slot_name, active FROM pg_replication_slots;"
   slot_name           | active
   --------------------+--------
   order_outbox_slot   | t
```

## Test — INSERT outbox

POST order qua REST. Order service INSERT payment_outbox.

```text
$ psql -c 'SELECT id, type, payload FROM "order".payment_outbox ORDER BY created_at DESC LIMIT 1;'
   id      | type                | payload
   --------+---------------------+--------
   abc-123 | OrderProcessingSaga | {"orderId":"ord-1",...}
```

Kafka topic auto tạo:
```text
$ docker exec -it kafka-broker-1 kafka-topics \
    --bootstrap-server localhost:9092 --list | grep Saga

OrderProcessingSaga_request
```

Inspect message:
```text
$ kcat -b localhost:19092 -t OrderProcessingSaga_request -C -e

{"orderId":"ord-1","customerId":"d215...","price":50.00,"createdAt":"...","paymentOrderStatus":"PENDING"}
```

Message giống payload — perfect.

Latency từ INSERT đến Kafka: ~50-100ms.

## Connector cho Payment, Restaurant, Customer

Tạo 4 connector tương tự:

```text
$ for svc in order payment restaurant customer; do
    curl -X POST -H "Content-Type: application/json" \
      --data @infrastructure/debezium/${svc}-postgres-connector.json \
      http://localhost:8083/connectors
done

$ curl http://localhost:8083/connectors
["order-postgres-connector","payment-postgres-connector","restaurant-postgres-connector","customer-postgres-connector"]
```

Mỗi connector có replication slot riêng, không xung đột.

## Connector lifecycle

### Pause
```text
$ curl -X PUT http://localhost:8083/connectors/order-postgres-connector/pause
```

### Resume
```text
$ curl -X PUT http://localhost:8083/connectors/order-postgres-connector/resume
```

### Update config
```text
$ curl -X PUT -H "Content-Type: application/json" \
    --data @order-postgres-connector-updated.json \
    http://localhost:8083/connectors/order-postgres-connector/config
```

### Delete
```text
$ curl -X DELETE http://localhost:8083/connectors/order-postgres-connector
```

Delete connector **không** xoá replication slot automatically. Cần manual:
```sql
SELECT pg_drop_replication_slot('order_outbox_slot');
```

## Monitor connector

```text
$ curl http://localhost:8083/connectors/order-postgres-connector/status
$ curl http://localhost:8083/connectors/order-postgres-connector/tasks/0/status
```

Task state có thể: RUNNING, PAUSED, FAILED, UNASSIGNED.

Khi FAILED, có `trace` field với stack trace:
```json
{
  "state": "FAILED",
  "trace": "io.debezium.DebeziumException: ...\n\tat ..."
}
```

Restart task:
```text
$ curl -X POST http://localhost:8083/connectors/order-postgres-connector/tasks/0/restart
```

## JMX metrics

Debezium expose JMX metric:
- `debezium.postgres.MetricsServerName=order-postgres.streaming.NumberOfEventsFiltered`
- `debezium.postgres.MetricsServerName=order-postgres.streaming.MilliSecondsBehindSource`

Connect với Prometheus JMX exporter để dashboard.

## Schema evolution

Khi DB schema đổi (thêm column outbox):
1. ALTER TABLE add column.
2. Debezium tự detect schema change.
3. Schema history topic ghi version mới.
4. Consumer **cũ** vẫn parse được (JSON missing field default null).
5. Consumer **mới** đọc field mới.

Forward + backward compatible nếu chỉ add column nullable. Drop column = break.

## Bẫy thường gặp config

| Triệu chứng | Sửa |
|---|---|
| Connector FAILED "publication does not exist" | Chưa tạo publication, hoặc table chưa thêm vào publication. |
| `slot already exists` khi recreate | Drop slot trước: `SELECT pg_drop_replication_slot('xxx');` |
| Topic không auto tạo | `auto.create.topics.enable=true` ở Kafka broker, hoặc tạo manual. |
| Message format sai | `value.converter` mismatch. JSON vs Avro phải nhất quán giữa producer và consumer. |
| `snapshot.mode=initial` reload full table | Chỉ chạy 1 lần. Khoá dùng `never` để skip snapshot. |
| Disk full Postgres | Replication slot active nhưng connector chết → WAL accumulate. Restart connector hoặc drop slot. |
| Performance degrade | Tăng `max.batch.size`, `poll.interval.ms` tuning. |
| Multiple connectors trùng slot | Mỗi connector slot riêng `slot.name`. |

## Tóm tắt bài 55

- Connector config JSON: connection + table list + Outbox Event Router SMT + topic routing.
- POST config lên `localhost:8083/connectors` → connector start, replication slot active.
- Test: INSERT outbox row → Kafka topic `OrderProcessingSaga_request` có message ~50ms sau.
- 4 connector cho 5 outbox table (Order có 2 outbox dùng 1 connector với 2 table).
- Lifecycle: pause/resume/update/delete qua REST.
- Connector FAILED: check status có trace, restart task hoặc fix config.

**Bài kế tiếp** → [Bài 56: Migrate Order service từ polling sang CDC](04-migrate-to-cdc.md)
