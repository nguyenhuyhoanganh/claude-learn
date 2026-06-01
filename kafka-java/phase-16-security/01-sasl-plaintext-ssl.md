# Bài 1: Kafka Security — SASL/PLAIN + SASL/SSL

Tất cả demo Phase 1-15 dùng **PLAINTEXT** — không authentication, không encryption. Production tuyệt đối không như vậy.

Bài này: enable authentication (SASL/PLAIN) và encryption (SASL/SSL), demo cả 2 setup.

> **Lưu ý**: trong thực tế, **Kafka admin team** setup security ở broker. Dev chỉ cần cung cấp credentials trong app config. Bài này dạy cả 2 góc nhìn để hiểu full picture.

## Recap: Kafka security protocols

Phase 9 đã đề cập 4 protocol:

| Protocol | Authentication | Encryption |
|---|---|---|
| `PLAINTEXT` | Không | Không |
| `SSL` | Không (chỉ cert) | Có |
| `SASL_PLAINTEXT` | Có (username/password) | Không |
| `SASL_SSL` | Có | Có |

Bài này focus vào 2 cái có authentication:
- **SASL_PLAINTEXT** — authenticate nhưng không encrypt (OK cho internal trusted network).
- **SASL_SSL** — authenticate + encrypt (production grade cho external connection).

## SASL là gì?

**SASL** = **Simple Authentication and Security Layer**.

- Standard framework cho client + server làm authentication.
- Tồn tại đã hàng chục năm — không phải Kafka invent.
- **Tách rời** authentication method khỏi application protocol.
  - Application protocol (Kafka, SMTP, IMAP, Postgres) không cần biết cụ thể authentication hoạt động thế nào.
  - SASL support nhiều method: PLAIN (username/password), SCRAM, GSSAPI/Kerberos, OAUTHBEARER, etc.

→ Cùng 1 framework support nhiều scheme khác nhau. Dev đổi auth method = đổi config, không đổi code.

## JAAS là gì?

**JAAS** = **Java Authentication and Authorization Service**.

- Standard Java API để app cung cấp login credentials.
- Kafka viết bằng Java → dùng JAAS để nhận credentials cho SASL.

→ Mối quan hệ:
- **SASL** = framework authentication.
- **JAAS** = cách Java app supply credentials vào SASL.

JAAS config có thể cung cấp qua:
- File `.conf` riêng.
- Inline trong Spring application properties.

## SASL/PLAIN setup — broker side

### JAAS config file

Tạo file `kafka_server_jaas.conf`:

```text
KafkaServer {
    org.apache.kafka.common.security.plain.PlainLoginModule required
    username="admin"
    password="admin-secret"
    user_admin="admin-secret"
    user_app-user="secret123"
    user_order-service="order-secret"
    user_product-service="product-secret";
};
```

Cấu trúc:
- `KafkaServer { ... }` — JAAS context cho Kafka broker role.
- `PlainLoginModule` — implementation cho PLAIN mechanism.
- `username="admin" password="admin-secret"` — credential broker dùng khi giao tiếp inter-broker.
- `user_<username>="<password>"` — liệt kê tất cả user được phép connect. Format: prefix `user_` + username = password.

Ví dụ trên: 3 user (`admin`, `app-user`, `order-service`, `product-service`) đều có thể connect với password tương ứng.

### Docker Compose

```yaml
services:
  kafka:
    image: apache/kafka:latest
    container_name: kafka
    ports:
      - "9092:9092"
    volumes:
      - ./conf/kafka_server_jaas.conf:/etc/kafka/kafka_server_jaas.conf
    environment:
      # Tell Kafka where JAAS file is
      KAFKA_OPTS: "-Djava.security.auth.login.config=/etc/kafka/kafka_server_jaas.conf"
    env_file:
      - ./environment/server.env
```

Property `KAFKA_OPTS` truyền JVM argument `-Djava.security.auth.login.config=<path>` báo Kafka đọc JAAS file.

### server.env — Kafka properties

```env
# Cluster setup
KAFKA_PROCESS_ROLES=broker,controller
KAFKA_NODE_ID=1
KAFKA_CLUSTER_ID=4LqzdcN-S6CN-XJHzKL...    # generated UUID

# Listeners
KAFKA_LISTENERS=CONTROLLER://kafka:9093,EXTERNAL://0.0.0.0:9092
KAFKA_ADVERTISED_LISTENERS=EXTERNAL://localhost:9092
KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER
KAFKA_INTER_BROKER_LISTENER_NAME=EXTERNAL
KAFKA_CONTROLLER_QUORUM_VOTERS=1@kafka:9093

# Security
KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=CONTROLLER:PLAINTEXT,EXTERNAL:SASL_PLAINTEXT
KAFKA_SASL_ENABLED_MECHANISMS=PLAIN
KAFKA_SASL_MECHANISM_INTER_BROKER_PROTOCOL=PLAIN
```

Key security properties:
- `LISTENER_SECURITY_PROTOCOL_MAP` — listener `EXTERNAL` dùng `SASL_PLAINTEXT`.
- `SASL_ENABLED_MECHANISMS=PLAIN` — chỉ enable PLAIN mechanism (có thể list nhiều: `PLAIN,SCRAM-SHA-256`).
- `SASL_MECHANISM_INTER_BROKER_PROTOCOL=PLAIN` — broker-to-broker dùng PLAIN.

> **Quirk**: container Kafka official cần **set đầy đủ** các property cluster-level (`NODE_ID`, `CLUSTER_ID`, `LISTENERS`, `QUORUM_VOTERS`) ngay cả khi chỉ chạy 1 broker. Single broker vẫn chạy như cluster 1 node.

> **Lưu ý naming**: `PLAINTEXT` (encryption) vs `PLAIN` (SASL mechanism) — **khác nhau**!
> - `PLAINTEXT` = không encrypt communication.
> - `PLAIN` = SASL mechanism dùng username + password đơn giản.
> - Combo `SASL_PLAINTEXT` = SASL + không encrypt = authenticated nhưng plain wire.

### Start broker

```bash
cd /path/to/05-kafka-security/sasl-plaintext
docker compose down       # clean state nếu có container cũ
docker compose up -d

# Verify
docker logs kafka | grep "Kafka Server started"
```

## SASL/PLAIN setup — application side (Spring Cloud Stream)

YAML cho consumer/producer app:

```yaml
spring:
  cloud:
    stream:
      kafka:
        binder:
          brokers: localhost:9092
          configuration:
            security.protocol: SASL_PLAINTEXT
            sasl.mechanism: PLAIN
            sasl.jaas.config: >
              org.apache.kafka.common.security.plain.PlainLoginModule required
              username="app-user"
              password="secret123";
        bindings:
          consumer-in-0:
            consumer:
              configuration:
                auto.offset.reset: earliest
      bindings:
        consumer-in-0:
          destination: demo-topic
          group: demo-group
```

3 setting bắt buộc:

| Property | Giá trị | Ý nghĩa |
|---|---|---|
| `security.protocol` | `SASL_PLAINTEXT` | Match với broker config |
| `sasl.mechanism` | `PLAIN` | PLAIN mechanism (username/password) |
| `sasl.jaas.config` | inline JAAS string | Credentials |

### `sasl.jaas.config` inline format

```text
org.apache.kafka.common.security.plain.PlainLoginModule required
username="<USER>"
password="<PASS>";
```

Phải kết thúc bằng `;` cuối cùng. YAML multi-line dùng `>` để concat.

### Production: KHÔNG hardcode password

Code trên hardcode `username="app-user" password="secret123"` — chỉ cho demo. Production phải dùng:

#### Option 1: Environment variables

```yaml
sasl.jaas.config: >
  org.apache.kafka.common.security.plain.PlainLoginModule required
  username="${KAFKA_USERNAME}"
  password="${KAFKA_PASSWORD}";
```

Set qua env trước khi start app:
```bash
export KAFKA_USERNAME=app-user
export KAFKA_PASSWORD=secret123
```

#### Option 2: Spring Cloud Config + Vault

```yaml
sasl.jaas.config: >
  org.apache.kafka.common.security.plain.PlainLoginModule required
  username="${vault.kafka.username}"
  password="${vault.kafka.password}";
```

Spring Cloud Config Vault resolve runtime.

#### Option 3: AWS Secrets Manager / Azure Key Vault / GCP Secret Manager

Tích hợp với cloud-native secret store. Mỗi cloud provider có SDK + Spring Cloud integration.

→ Production rule: **KHÔNG bao giờ commit password vào Git**. Dùng external secret store.

## Demo SASL/PLAIN

Setup từ trên:
- Broker: SASL_PLAINTEXT enabled, JAAS file có user `app-user` / `secret123`.
- App: config `SASL_PLAINTEXT` + credentials đúng.

### Test 1: credentials đúng

```bash
mvn spring-boot:run -Dspring-boot.run.arguments="--section=section20 --config=01-sasl-plaintext-consumer.yaml"
```

Output:
```text
[Consumer] Successfully authenticated. Subscribed to demo-topic.
[Consumer] Adding newly assigned partitions: demo-topic-0
```

✅ Connect thành công.

### Test 2: sai password

Đổi YAML: `password="wrong-password"`. Restart app.

Output:
```text
[Consumer] Connection failed.
Caused by: org.apache.kafka.common.errors.SaslAuthenticationException: 
  Authentication failed: Invalid username or password
```

✅ Broker reject. App không connect được.

## SASL/SSL setup — thêm encryption

SASL/PLAIN có authentication nhưng **không encrypt** wire. Network sniffer có thể đọc cả password (khi handshake) và data.

SASL/SSL = SASL/PLAIN + TLS encryption.

### Broker side — thêm SSL config

Cần thêm 2 file:
- **Keystore**: chứa **private key** + **certificate** của broker.
- **Truststore**: chứa certificate của CA (Certificate Authority) hoặc client.

Tạo bằng `keytool`:

```bash
# Generate broker keystore + cert
keytool -keystore broker.keystore.jks -alias broker \
  -validity 365 -genkey -keyalg RSA \
  -dname "CN=kafka,OU=eng,O=acme,L=SF,ST=CA,C=US" \
  -storepass changeit -keypass changeit

# Generate CA + sign broker cert (production process)
# ... (complex, skip detail — admin team handle)

# Truststore chứa CA cert
keytool -keystore broker.truststore.jks -alias CARoot \
  -import -file ca-cert -storepass changeit
```

> **Trong thực tế**: process này phức tạp với CA, signed cert, expiry rotation. **Kafka admin team handle**. Dev chỉ nhận truststore + credentials.

### server.env — đổi sang SSL

```env
KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=CONTROLLER:PLAINTEXT,EXTERNAL:SASL_SSL
KAFKA_SASL_ENABLED_MECHANISMS=PLAIN
KAFKA_SASL_MECHANISM_INTER_BROKER_PROTOCOL=PLAIN

# SSL config
KAFKA_SSL_KEYSTORE_LOCATION=/etc/kafka/ssl/broker.keystore.jks
KAFKA_SSL_KEYSTORE_PASSWORD=changeit
KAFKA_SSL_KEY_PASSWORD=changeit
KAFKA_SSL_TRUSTSTORE_LOCATION=/etc/kafka/ssl/broker.truststore.jks
KAFKA_SSL_TRUSTSTORE_PASSWORD=changeit
```

Đổi `SASL_PLAINTEXT` → `SASL_SSL` + 5 property SSL.

Mount keystore + truststore vào container:

```yaml
volumes:
  - ./conf/kafka_server_jaas.conf:/etc/kafka/kafka_server_jaas.conf
  - ./ssl:/etc/kafka/ssl
```

### Application side — thêm truststore

App cần biết verify broker certificate. Cần **truststore** chứa CA cert (hoặc trust broker cert directly).

```yaml
spring:
  cloud:
    stream:
      kafka:
        binder:
          brokers: localhost:9092
          configuration:
            security.protocol: SASL_SSL              # ← đổi từ SASL_PLAINTEXT
            sasl.mechanism: PLAIN
            sasl.jaas.config: >
              org.apache.kafka.common.security.plain.PlainLoginModule required
              username="app-user"
              password="secret123";
            
            # SSL truststore
            ssl.truststore.location: /path/to/client.truststore.jks
            ssl.truststore.password: changeit
            ssl.endpoint.identification.algorithm:                # disable hostname verification cho dev
```

5 property mới:
- `security.protocol: SASL_SSL` — đổi từ SASL_PLAINTEXT.
- `ssl.truststore.location` — path file truststore client.
- `ssl.truststore.password` — password truststore.
- `ssl.endpoint.identification.algorithm` — set empty = skip hostname verification (chỉ cho dev với self-signed cert).

> **Production**: set `ssl.endpoint.identification.algorithm=https` để verify hostname trong cert match broker. Dùng signed cert từ CA thật (Let's Encrypt, AWS ACM).

## Mutual TLS — bonus

Setup trên: SSL **1-way** — client verify broker cert, broker không verify client.

Mutual TLS (mTLS): broker cũng verify client cert.

- Client cần keystore + private key + signed cert.
- Broker config `ssl.client.auth=required`.
- Authentication có thể **chỉ qua cert** (không cần password).

Phổ biến trong production high-security. Spring config tương tự nhưng thêm client keystore properties:

```yaml
ssl.keystore.location: /path/to/client.keystore.jks
ssl.keystore.password: changeit
ssl.key.password: changeit
```

## Tóm tắt bài 1

- 4 protocol Kafka: PLAINTEXT (dev only), SSL (encrypt-only), SASL_PLAINTEXT (auth-only), SASL_SSL (auth + encrypt).
- **SASL** = framework authentication, **JAAS** = Java API cung cấp credentials.
- SASL/PLAIN mechanism = simple username + password.
- Broker setup: JAAS config file + listener security protocol map + SASL mechanisms.
- App setup: `security.protocol`, `sasl.mechanism`, `sasl.jaas.config` inline.
- ⚠️ `PLAINTEXT` (encryption) ≠ `PLAIN` (SASL mechanism) — naming dễ confuse.
- SASL/SSL thêm TLS encryption: cần keystore (broker) + truststore (client).
- Production: KHÔNG hardcode password. Dùng env vars, Vault, AWS Secrets Manager.
- Production: set `ssl.endpoint.identification.algorithm=https`, signed cert thật.
- mTLS (bonus): broker verify client cert, auth qua cert thay vì password.

**Bài kế tiếp** → [Bài 2: Tóm tắt Phase 16 — security best practices](02-summary.md)
