# Bài 16: Chạy Kafka cluster local với Docker Compose

> Trước khi code producer/consumer, ta cần Kafka chạy. Bài này dựng một stack đầy đủ — Zookeeper + Kafka 3-broker + Schema Registry + Kafka UI — bằng Docker Compose. Mọi service Java sau này sẽ kết nối vào stack này. Đây là cấu hình **giả lập production** local.

## Cấu trúc thư mục

```text
food-ordering-system/
└── infrastructure/
    ├── docker-compose/
    │   ├── common.yml              ← network shared
    │   ├── zookeeper.yml           ← zookeeper service
    │   ├── kafka_cluster.yml       ← 3 broker + schema registry + UI
    │   ├── init_kafka.yml          ← tạo topic init
    │   └── postgres.yml            ← postgres (phase-5)
    └── ... (4 kafka module ở bài sau)
```

Tách nhiều file `.yml` để dễ start riêng từng dịch vụ. Khi học Kafka, không cần khởi Postgres.

## File network shared — `common.yml`

```yaml
version: '3.7'

services:
  # placeholder — bridge network các file cùng dùng

networks:
  ${GLOBAL_NETWORK:-services}:
    name: ${GLOBAL_NETWORK:-services}
    driver: bridge
```

Network `services` được mọi service dùng → các container nói chuyện được qua hostname.

## Zookeeper — `zookeeper.yml`

```yaml
version: '3.7'

services:
  zookeeper:
    image: confluentinc/cp-zookeeper:${KAFKA_VERSION:-7.5.0}
    hostname: zookeeper
    container_name: zookeeper
    ports:
      - "2181:2181"
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
    networks:
      - ${GLOBAL_NETWORK:-services}
    volumes:
      - "./volumes/zookeeper/data:/var/lib/zookeeper/data"
      - "./volumes/zookeeper/log:/var/lib/zookeeper/log"
```

- `ZOOKEEPER_TICK_TIME: 2000` — heartbeat interval 2s. Mặc định OK.
- Volume mount để **persistence** giữa restart container — không mất topic.

## Kafka cluster — `kafka_cluster.yml`

```yaml
version: '3.7'

services:
  kafka-broker-1:
    image: confluentinc/cp-kafka:${KAFKA_VERSION:-7.5.0}
    hostname: kafka-broker-1
    container_name: kafka-broker-1
    ports:
      - "19092:19092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-broker-1:9092,PLAINTEXT_HOST://localhost:19092
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 3
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 2
    networks:
      - ${GLOBAL_NETWORK:-services}
    volumes:
      - "./volumes/kafka/broker-1:/var/lib/kafka/data"
    depends_on:
      - zookeeper

  kafka-broker-2:
    image: confluentinc/cp-kafka:${KAFKA_VERSION:-7.5.0}
    hostname: kafka-broker-2
    container_name: kafka-broker-2
    ports:
      - "29092:29092"
    environment:
      KAFKA_BROKER_ID: 2
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-broker-2:9092,PLAINTEXT_HOST://localhost:29092
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 3
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 2
    networks:
      - ${GLOBAL_NETWORK:-services}
    volumes:
      - "./volumes/kafka/broker-2:/var/lib/kafka/data"
    depends_on:
      - zookeeper

  kafka-broker-3:
    image: confluentinc/cp-kafka:${KAFKA_VERSION:-7.5.0}
    hostname: kafka-broker-3
    container_name: kafka-broker-3
    ports:
      - "39092:39092"
    environment:
      KAFKA_BROKER_ID: 3
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-broker-3:9092,PLAINTEXT_HOST://localhost:39092
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 3
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 2
    networks:
      - ${GLOBAL_NETWORK:-services}
    volumes:
      - "./volumes/kafka/broker-3:/var/lib/kafka/data"
    depends_on:
      - zookeeper

  schema-registry:
    image: confluentinc/cp-schema-registry:${KAFKA_VERSION:-7.5.0}
    hostname: schema-registry
    container_name: schema-registry
    ports:
      - "8081:8081"
    environment:
      SCHEMA_REGISTRY_HOST_NAME: schema-registry
      SCHEMA_REGISTRY_LISTENERS: http://0.0.0.0:8081
      SCHEMA_REGISTRY_KAFKA_BOOTSTRAP_SERVERS: PLAINTEXT://kafka-broker-1:9092,PLAINTEXT://kafka-broker-2:9092,PLAINTEXT://kafka-broker-3:9092
    networks:
      - ${GLOBAL_NETWORK:-services}
    depends_on:
      - kafka-broker-1
      - kafka-broker-2
      - kafka-broker-3

  kafka-manager:
    image: provectuslabs/kafka-ui:latest
    hostname: kafka-manager
    container_name: kafka-manager
    ports:
      - "9000:8080"
    environment:
      KAFKA_CLUSTERS_0_NAME: food-ordering-system
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: PLAINTEXT://kafka-broker-1:9092,PLAINTEXT://kafka-broker-2:9092,PLAINTEXT://kafka-broker-3:9092
      KAFKA_CLUSTERS_0_SCHEMAREGISTRY: http://schema-registry:8081
    networks:
      - ${GLOBAL_NETWORK:-services}
```

### Giải thích từng config quan trọng

| Config | Ý nghĩa |
|---|---|
| `KAFKA_BROKER_ID` | ID duy nhất 1/2/3 cho mỗi broker |
| `KAFKA_ZOOKEEPER_CONNECT` | Hostname Zookeeper trong network |
| `KAFKA_LISTENER_SECURITY_PROTOCOL_MAP` | 2 listener: `PLAINTEXT` (giữa container) + `PLAINTEXT_HOST` (từ máy host) |
| `KAFKA_ADVERTISED_LISTENERS` | Hostname broker quảng cáo về client. App trong Docker dùng `kafka-broker-1:9092`, app trên host dùng `localhost:19092` |
| `KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT` | Broker-to-broker dùng listener `PLAINTEXT` (network internal) |
| `KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3` | Topic `__consumer_offsets` có 3 replica → tolerate 1 broker down vẫn giữ offset |
| `KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 2` | Min in-sync replicas cho transaction log = 2 |

**Vì sao 2 listener?**

```text
                          ┌──────────────────────────────┐
                          │       Docker network          │
   ┌──────────────────┐   │   ┌──────────────────────┐   │
   │ App trên host     │   │   │  kafka-broker-1      │   │
   │  Kafka client     │───┼──►│  PLAINTEXT_HOST:     │   │
   │  bootstrap=       │   │   │    localhost:19092    │   │
   │  localhost:19092  │   │   │  PLAINTEXT:           │   │
   └──────────────────┘   │   │    kafka-broker-1:9092│   │
                          │   └──────────────────────┘   │
                          │            ▲                  │
                          │            │                  │
                          │   ┌────────┴────────┐         │
                          │   │ App trong       │         │
                          │   │ container       │         │
                          │   │ bootstrap=      │         │
                          │   │ kafka-broker-1: │         │
                          │   │ 9092            │         │
                          │   └─────────────────┘         │
                          └──────────────────────────────┘
```

Khi học, app Spring Boot chạy trên host (IDE) → dùng `localhost:19092`. Khi deploy K8s phase-11, app trong cluster → dùng hostname container.

## Init topics — `init_kafka.yml`

Topic được tạo lúc cluster start lần đầu:

```yaml
version: '3.7'

services:
  init-kafka:
    image: confluentinc/cp-kafka:${KAFKA_VERSION:-7.5.0}
    hostname: init-kafka
    container_name: init-kafka
    entrypoint: [ '/bin/sh', '-c' ]
    command: |
      "
      kafka-topics --bootstrap-server kafka-broker-1:9092 --list

      kafka-topics --bootstrap-server kafka-broker-1:9092 --create --if-not-exists \
        --topic payment-request --replication-factor 3 --partitions 3

      kafka-topics --bootstrap-server kafka-broker-1:9092 --create --if-not-exists \
        --topic payment-response --replication-factor 3 --partitions 3

      kafka-topics --bootstrap-server kafka-broker-1:9092 --create --if-not-exists \
        --topic restaurant-approval-request --replication-factor 3 --partitions 3

      kafka-topics --bootstrap-server kafka-broker-1:9092 --create --if-not-exists \
        --topic restaurant-approval-response --replication-factor 3 --partitions 3

      kafka-topics --bootstrap-server kafka-broker-1:9092 --list
      "
    networks:
      - ${GLOBAL_NETWORK:-services}
```

4 topic:
- `payment-request` — Order → Payment
- `payment-response` — Payment → Order
- `restaurant-approval-request` — Order → Restaurant
- `restaurant-approval-response` — Restaurant → Order

Mỗi topic: 3 partition + 3 replica. Replication factor 3 vì có 3 broker → mỗi partition leader trên 1 broker khác.

## Script chạy stack

```bash
# infrastructure/docker-compose/start-kafka.sh
#!/bin/bash
docker compose -f common.yml -f zookeeper.yml up -d

echo "Waiting for zookeeper..."
sleep 5

docker compose -f common.yml -f kafka_cluster.yml up -d

echo "Waiting for kafka brokers..."
sleep 15

docker compose -f common.yml -f init_kafka.yml up -d
```

```bash
# stop-kafka.sh
docker compose -f common.yml -f init_kafka.yml down
docker compose -f common.yml -f kafka_cluster.yml down
docker compose -f common.yml -f zookeeper.yml down
```

Lý do sleep: Zookeeper cần khởi xong rồi broker mới connect; broker cần khởi xong rồi mới tạo topic được. Production thực dùng `depends_on` + healthcheck — sleep ở local dev OK.

## Verify cluster chạy

```text
$ docker ps
CONTAINER ID   IMAGE                                    NAMES              PORTS
abc123         confluentinc/cp-kafka:7.5.0              kafka-broker-1     0.0.0.0:19092->19092/tcp
def456         confluentinc/cp-kafka:7.5.0              kafka-broker-2     0.0.0.0:29092->29092/tcp
...
xyz789         confluentinc/cp-zookeeper:7.5.0          zookeeper          0.0.0.0:2181->2181/tcp
qrs012         confluentinc/cp-schema-registry:7.5.0    schema-registry    0.0.0.0:8081->8081/tcp
tuv345         provectuslabs/kafka-ui:latest            kafka-manager      0.0.0.0:9000->8080/tcp
```

Mở Kafka UI: `http://localhost:9000` → thấy:
- Brokers: 3 (kafka-broker-1, 2, 3)
- Topics: payment-request, payment-response, restaurant-approval-request, restaurant-approval-response, `__consumer_offsets`
- Schema Registry: kết nối.

## Test produce/consume với CLI

Produce một message thủ công:

```text
$ docker exec -it kafka-broker-1 kafka-console-producer \
    --bootstrap-server kafka-broker-1:9092 \
    --topic payment-request \
    --property "parse.key=true" --property "key.separator=:"

> order-1:hello
> order-2:world
^D
```

Consume:

```text
$ docker exec -it kafka-broker-1 kafka-console-consumer \
    --bootstrap-server kafka-broker-1:9092 \
    --topic payment-request \
    --from-beginning \
    --property print.key=true --property key.separator=:

order-1:hello
order-2:world
```

Dùng `kcat` từ host:

```text
$ kcat -b localhost:19092 -t payment-request -C
hello
world
```

## Kiểm tra partition cụ thể

```text
$ docker exec -it kafka-broker-1 kafka-topics \
    --bootstrap-server kafka-broker-1:9092 \
    --describe --topic payment-request

Topic: payment-request   PartitionCount: 3   ReplicationFactor: 3
    Topic: payment-request   Partition: 0   Leader: 1   Replicas: 1,2,3   Isr: 1,2,3
    Topic: payment-request   Partition: 1   Leader: 2   Replicas: 2,3,1   Isr: 2,3,1
    Topic: payment-request   Partition: 2   Leader: 3   Replicas: 3,1,2   Isr: 3,1,2
```

- Leader của partition-0 là broker 1; replica 2, 3 đồng bộ.
- ISR (In-Sync Replicas) = 1,2,3 → tất cả replica đều caught up.

## Stack tài nguyên

```text
$ docker stats --no-stream

CONTAINER          CPU %     MEM USAGE / LIMIT     MEM %
kafka-broker-1     2.5%      ~ 500 MB / 8 GB        6%
kafka-broker-2     2.5%      ~ 500 MB / 8 GB        6%
kafka-broker-3     2.5%      ~ 500 MB / 8 GB        6%
zookeeper          0.3%      ~ 80 MB                1%
schema-registry    0.5%      ~ 250 MB               3%
kafka-manager      0.5%      ~ 300 MB               4%
```

Tổng ~ 2GB RAM cho Kafka stack. Máy 8GB chạy ổn (cộng IDE + Postgres + service).

## Schema Registry CLI

Liệt kê subjects (schema đã đăng ký):

```text
$ curl http://localhost:8081/subjects
[]
```

Empty vì chưa publish message Avro. Sau bài 17 sẽ thấy:

```text
$ curl http://localhost:8081/subjects
["payment-request-value", "payment-response-value", ...]
```

Mỗi topic có schema cho key + value. Khoá học chỉ schema value (key = String, không cần Avro).

## Bẫy thường gặp khi chạy Kafka local

| Triệu chứng | Nguyên nhân |
|---|---|
| Broker liên tục restart | Volume mount sai (data dir không write được). Xoá `volumes/` rồi start lại. |
| Producer connect timeout | `KAFKA_ADVERTISED_LISTENERS` sai. Nếu app trên host → phải có `PLAINTEXT_HOST://localhost:19092`. |
| Init topic không tạo được | Broker chưa kịp start. Tăng sleep trước init. |
| Schema Registry crash | Kafka broker chưa lên. Đợi 10-15s. |
| Kafka UI hiển thị "no clusters" | Hostname trong UI config sai. Phải khớp `KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS`. |
| Topic mất sau khi `docker compose down` | Volume không persist. Đảm bảo mount `./volumes/kafka/broker-N`. |
| 19092 đã chiếm | Đổi port host (vd `19093:19092`). |

## Tóm tắt bài 16

- Stack đầy đủ: 3 broker + Zookeeper + Schema Registry + Kafka UI, dùng Docker Compose.
- 2 listener `PLAINTEXT` (internal) + `PLAINTEXT_HOST` (host) — quan trọng để app trên IDE connect.
- Replication factor 3 cho topic data + `__consumer_offsets` + transaction state log → tolerate 1 broker down.
- Init script tạo sẵn 4 topic SAGA (payment-request/response, restaurant-approval-request/response).
- Kafka UI ở `localhost:9000` để inspect topic, consumer group, message trực quan.

**Bài kế tiếp** → [Bài 17: Module kafka-config-data + kafka-model (Avro schema)](03-kafka-config-model.md)
