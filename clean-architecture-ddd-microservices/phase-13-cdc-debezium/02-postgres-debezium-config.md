# Bài 54: Configure Postgres + cài Debezium Connector

> Debezium đọc Postgres WAL log. Bài này config Postgres bật `wal_level=logical`, tạo replication slot, cài Debezium Postgres Connector vào Kafka Connect cluster qua Docker Compose.

## Postgres config cho CDC

Mặc định Postgres `wal_level=replica` (chỉ đủ cho physical replication). Cho logical decoding cần `logical`.

Edit `postgresql.conf` hoặc set qua Docker env:

```yaml
# postgres.yml docker-compose
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: admin
      POSTGRES_DB: postgres
    command:
      - "postgres"
      - "-c"
      - "wal_level=logical"
      - "-c"
      - "max_wal_senders=10"
      - "-c"
      - "max_replication_slots=10"
    ports:
      - "5432:5432"
    volumes:
      - "./volumes/postgres:/var/lib/postgresql/data"
```

3 setting:
- `wal_level=logical` — bật logical decoding.
- `max_wal_senders=10` — số replication client tối đa.
- `max_replication_slots=10` — số slot tối đa.

Restart Postgres:
```text
$ docker compose -f postgres.yml restart
```

Verify:
```text
$ psql -h localhost -U postgres -d postgres -c 'SHOW wal_level;'
   wal_level
   ----------
   logical
```

## Tạo PUBLICATION cho table cần CDC

Postgres logical replication dùng **publication** + **subscription**. Debezium tự tạo subscription nội bộ, ta tạo publication:

```sql
-- Publication cho outbox table của Order
CREATE PUBLICATION dbz_publication FOR TABLE 
    "order".payment_outbox,
    "order".restaurant_approval_outbox,
    "payment".order_outbox,
    "restaurant".order_outbox,
    "customer".customer_outbox;
```

Publication tên `dbz_publication` chứa các table Debezium được phép đọc.

Check:
```text
$ psql -c '\dRp'
   Name             | Owner    | All tables | Inserts | Updates | Deletes
   ------------------+----------+------------+---------+---------+--------
   dbz_publication  | postgres | f          | t       | t       | t
```

## Tạo replication slot

Replication slot = "đánh dấu vị trí" trong WAL cho consumer. Debezium tự tạo, nhưng ta có thể tạo trước:

```sql
SELECT pg_create_logical_replication_slot('debezium_slot', 'pgoutput');
```

`pgoutput` = plugin decode mặc định Postgres 10+.

Check:
```text
$ psql -c "SELECT slot_name, plugin, slot_type, active FROM pg_replication_slots;"
   slot_name      | plugin    | slot_type | active
   ---------------+-----------+-----------+-------
   debezium_slot  | pgoutput  | logical   | f
```

`active=f` vì chưa có consumer connect. Khi Debezium up → `active=t`.

> **Quan trọng**: nếu slot tồn tại mà không có consumer, Postgres giữ WAL log không xoá → disk đầy. Nhớ clean slot không dùng.

## Cài Kafka Connect + Debezium

Confluent cp-helm-charts có `cp-kafka-connect` chart. Hoặc dùng Docker Compose riêng:

```yaml
# infrastructure/docker-compose/kafka-connect.yml
services:
  kafka-connect:
    image: confluentinc/cp-kafka-connect:7.5.0
    container_name: kafka-connect
    hostname: kafka-connect
    depends_on:
      - kafka-broker-1
      - schema-registry
    ports:
      - "8083:8083"
    environment:
      CONNECT_BOOTSTRAP_SERVERS: kafka-broker-1:9092,kafka-broker-2:9092,kafka-broker-3:9092
      CONNECT_REST_PORT: 8083
      CONNECT_GROUP_ID: kafka-connect-group
      CONNECT_CONFIG_STORAGE_TOPIC: kafka-connect-configs
      CONNECT_OFFSET_STORAGE_TOPIC: kafka-connect-offsets
      CONNECT_STATUS_STORAGE_TOPIC: kafka-connect-status
      CONNECT_KEY_CONVERTER: io.confluent.connect.avro.AvroConverter
      CONNECT_VALUE_CONVERTER: io.confluent.connect.avro.AvroConverter
      CONNECT_KEY_CONVERTER_SCHEMA_REGISTRY_URL: http://schema-registry:8081
      CONNECT_VALUE_CONVERTER_SCHEMA_REGISTRY_URL: http://schema-registry:8081
      CONNECT_INTERNAL_KEY_CONVERTER: org.apache.kafka.connect.json.JsonConverter
      CONNECT_INTERNAL_VALUE_CONVERTER: org.apache.kafka.connect.json.JsonConverter
      CONNECT_REST_ADVERTISED_HOST_NAME: kafka-connect
      CONNECT_PLUGIN_PATH: /usr/share/java,/usr/share/confluent-hub-components
      CONNECT_CONFIG_STORAGE_REPLICATION_FACTOR: 3
      CONNECT_OFFSET_STORAGE_REPLICATION_FACTOR: 3
      CONNECT_STATUS_STORAGE_REPLICATION_FACTOR: 3
    command:
      - "bash"
      - "-c"
      - |
        confluent-hub install --no-prompt debezium/debezium-connector-postgresql:2.4.2
        /etc/confluent/docker/run
    networks:
      - ${GLOBAL_NETWORK:-services}
```

`confluent-hub install` tải Debezium Postgres connector plugin trước khi start Connect.

Khởi:
```text
$ docker compose -f common.yml -f kafka-connect.yml up -d
$ docker logs kafka-connect | tail -20
```

Verify Kafka Connect REST API:
```text
$ curl http://localhost:8083/connectors
[]

$ curl http://localhost:8083/connector-plugins | jq '.[] | .class'
"io.debezium.connector.postgresql.PostgresConnector"
"org.apache.kafka.connect.storage.StringConverter"
...
```

Debezium plugin available.

## Kafka Connect on Kubernetes (production)

```text
$ helm install kafka-connect confluentinc/cp-helm-charts \
    --set cp-kafka-connect.enabled=true \
    --set cp-zookeeper.enabled=false \
    --set cp-kafka.enabled=false \
    --set cp-schema-registry.enabled=false
```

Hoặc dùng **Strimzi** operator — better K8s integration:
```text
$ kubectl apply -f https://strimzi.io/install/latest?namespace=kafka-connect
```

Khoá học dùng Docker Compose cho local đơn giản.

## Test Kafka Connect REST API

```text
$ curl http://localhost:8083/

{
  "version": "7.5.0-ccs",
  "commit": "...",
  "kafka_cluster_id": "..."
}
```

List connector plugins:
```text
$ curl http://localhost:8083/connector-plugins | jq '.[].class' | grep -i postgres
"io.debezium.connector.postgresql.PostgresConnector"
```

## Network setup

Kafka Connect cần connect đến:
- Postgres (port 5432).
- Kafka brokers (9092).
- Schema Registry (8081).

Trong Docker Compose:
- Tất cả share network `services`.
- Hostname resolve qua DNS Docker.

Trong K8s:
- Postgres service `postgres-service.food-ordering-system.svc.cluster.local`.
- Kafka service `kafka-cluster-cp-kafka-headless`.

## Bẫy thường gặp

| Triệu chứng | Sửa |
|---|---|
| Postgres không restart sau đổi wal_level | Cần graceful restart, không `kill -9`. |
| Replication slot tồn tại nhưng disk Postgres đầy | Drop slot không dùng: `SELECT pg_drop_replication_slot('xxx');` |
| Debezium plugin không install | Confluent Hub network access. Hoặc pre-bake image. |
| Kafka Connect crash với "topic xxx doesn't exist" | Connect cần config/offset/status topic. Auto tạo nếu broker config cho phép, hoặc tạo manual. |
| `pgoutput` plugin error | Postgres version < 10. Upgrade hoặc dùng plugin `decoderbufs` (cần install). |
| Multiple connectors fight cùng slot | Mỗi connector phải có slot riêng. |
| Postgres permission denied | User Debezium connect cần `REPLICATION` role: `ALTER USER postgres WITH REPLICATION;` |

## Tóm tắt bài 54

- Postgres config `wal_level=logical` + `max_replication_slots=10` cho CDC.
- Tạo PUBLICATION trên các table cần CDC, replication slot Debezium dùng.
- Kafka Connect cluster chạy Docker Compose hoặc K8s/Helm.
- Confluent Hub install Debezium connector plugin trước khi start Connect.
- REST API port 8083 cho config/manage connector.
- Production dùng Strimzi operator cho K8s native experience.

**Bài kế tiếp** → [Bài 55: Source connector configuration cho outbox tables](03-source-connector-config.md)
