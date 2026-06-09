# Bài 3: Thiết lập môi trường — Java, Maven, IntelliJ, Docker, Postgres, Kafka

> Trước khi viết dòng code đầu tiên, ta cần một bộ tool đủ tin cậy để chạy 4 microservice + Kafka cluster + Postgres + Kubernetes ở local. Bài này liệt kê **chính xác** thứ phải cài, vì sao chọn version đó, và cách verify mỗi lần cài xong. Khoá học bám version từ 2022 nhưng tôi đã cập nhật khuyến nghị cho 2025-2026 — bạn dùng version mới hơn vẫn chạy được.

## Bản đồ tool — cái gì cho cái gì

```text
              ┌──────────────────────────────────────────────┐
              │                Dev local                      │
              │                                                │
              │  IntelliJ + JDK 17  ────► viết & build Java   │
              │  Maven 3.9          ────► dependency + build  │
              │  Git                ────► version control     │
              │                                                │
              │  Docker Desktop     ────► chạy Postgres,      │
              │                          Kafka, Zookeeper     │
              │  docker-compose     ────► orchestrate stack    │
              │                                                │
              │  Postman            ────► gọi REST API         │
              │  kcat (Kafka Cat)   ────► inspect topic CLI    │
              │  Kafka Tool / Conduktor ──► GUI cho Kafka     │
              │  pgAdmin            ────► GUI cho Postgres     │
              │                                                │
              │  kubectl + minikube ────► K8s local (phase-11) │
              │  gcloud CLI         ────► GKE (phase-12)       │
              └──────────────────────────────────────────────┘
```

Khoá học **không** bắt buộc Mac, Windows hay Linux — mọi tool đều cross-platform. Tôi sẽ chú thích chỗ nào khác biệt OS đáng kể.

## 1. JDK 17 (Long-Term Support)

**Vì sao chọn Java 17?**
- LTS (Long-Term Support) — Oracle hỗ trợ đến tháng 9/2029.
- Spring Boot 3.x **bắt buộc** Java 17 trở lên — phase-14 nâng cấp lên Spring Boot 3.x.
- Đủ tính năng modern (records, switch expression, sealed class, text block) để code DDD ngắn gọn.

**Cài**:
- **Oracle JDK 17**: <https://www.oracle.com/java/technologies/downloads/#java17>
- **OpenJDK 17** (free, không license): <https://adoptium.net/> (Temurin distribution, khuyên dùng)
- **macOS qua brew**: `brew install --cask temurin@17`
- **Ubuntu**: `sudo apt install openjdk-17-jdk`
- **Windows**: download `.msi`, hoặc `winget install Microsoft.OpenJDK.17`

**Verify**:

```text
$ java -version
openjdk version "17.0.10" 2024-01-16
OpenJDK Runtime Environment Temurin-17.0.10+7 (build 17.0.10+7)
OpenJDK 64-Bit Server VM Temurin-17.0.10+7 (build 17.0.10+7, mixed mode, sharing)

$ javac -version
javac 17.0.10
```

**JAVA_HOME**: thiết lập biến môi trường để IntelliJ và Maven nhận đúng JDK:
- macOS / Linux: thêm vào `~/.zshrc` hoặc `~/.bashrc`:
  ```bash
  export JAVA_HOME=$(/usr/libexec/java_home -v 17)   # macOS
  export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64  # Ubuntu
  export PATH=$JAVA_HOME/bin:$PATH
  ```
- Windows: System Properties → Environment Variables → New → `JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.x.x`.

```text
$ echo $JAVA_HOME
/Users/me/.sdkman/candidates/java/17.0.10-tem
```

> Nếu bạn quen với **SDKMAN!** (`https://sdkman.io/`), dùng để cài và switch giữa nhiều JDK rất tiện. Phase-14 sẽ thử Java 21 cũng dễ.

## 2. Maven 3.9+

**Vì sao Maven, không Gradle?**
- Spring Boot starter parent có cấu trúc Maven mature, được dùng rộng rãi trong khoá.
- Multi-module Maven nhỏ và dễ đọc hơn Gradle ở quy mô khoá học.
- Nếu bạn quen Gradle, hoàn toàn có thể convert sau.

**Cài**:
- Download: <https://maven.apache.org/download.cgi> — `apache-maven-3.9.x-bin.tar.gz`
- macOS: `brew install maven`
- Ubuntu: `sudo apt install maven` (chú ý phiên bản APT có thể cũ — nên tải tay nếu < 3.9)
- Windows: `winget install Apache.Maven`

**Verify**:

```text
$ mvn -version
Apache Maven 3.9.6
Maven home: /usr/local/Cellar/maven/3.9.6/libexec
Java version: 17.0.10, vendor: Eclipse Adoptium
Default locale: en_VN, platform encoding: UTF-8
OS name: "mac os x", version: "14.4.1", arch: "arm64"
```

Quan trọng: dòng `Java version` phải là **17.x** — nếu hiện 11 hay 8, sửa `JAVA_HOME` rồi mở terminal mới.

## 3. IntelliJ IDEA Community

**Vì sao IntelliJ?**
- Build-in support đa module Maven cực tốt.
- Refactor / navigate cho Spring + DDD code base lớn.
- Free Community Edition đủ cho khoá học (không cần Ultimate).

**Cài**:
- <https://www.jetbrains.com/idea/download/> — chọn **Community** (free)
- macOS: `brew install --cask intellij-idea-ce`
- Windows: `winget install JetBrains.IntelliJIDEA.Community`

**Cấu hình lần đầu**:
1. Mở IntelliJ → `File → Project Structure → Project SDK` → chọn JDK 17.
2. `Preferences → Build, Execution, Deployment → Build Tools → Maven` → chỉ về thư mục Maven đã cài (mặc định IntelliJ có Bundle riêng, có thể dùng luôn cho khoá học).
3. `Preferences → Editor → Code Style` → Java → import scheme nếu nhóm bạn có style guide.

> Plugin khuyên dùng: `Lombok` (sẽ dùng nhiều `@Builder` trong DDD), `Maven Helper` (analyze dependency tree), `Diagrams` (xem module dependency dạng đồ thị).

## 4. Git

Bắt buộc. Khoá học có source code GitHub theo từng nhánh tương ứng từng phase.

**Cài**:
- macOS: `xcode-select --install` hoặc `brew install git`
- Ubuntu: `sudo apt install git`
- Windows: <https://git-scm.com/download/win>

**Verify + cấu hình**:

```text
$ git --version
git version 2.46.0

$ git config --global user.name "Your Name"
$ git config --global user.email "you@example.com"
$ git config --global init.defaultBranch main
```

> Project khoá học: <https://github.com/oguzhansoykan/food-ordering-system> (cập nhật theo tác giả khoá). Mỗi section có một branch tương ứng — bạn có thể `git checkout section-08-saga` để xem snapshot.

## 5. Docker Desktop + docker-compose

**Vì sao Docker?**
- Phase-1 đến phase-10: dùng `docker-compose` để khởi Kafka cluster (Zookeeper + Kafka broker), Postgres, và sau đó chạy microservice.
- Phase-11 trở đi: build microservice thành Docker image rồi push lên K8s.

**Cài**:
- **Docker Desktop** cho macOS / Windows: <https://www.docker.com/products/docker-desktop/>
- **Linux**: `Docker Engine + Docker Compose plugin` (theo doc Docker — Desktop linux cũng có nhưng tùy chọn).

> **Lưu ý license Docker Desktop**: Docker Desktop 4.x **trả phí** với công ty > 250 nhân viên / doanh thu > 10 triệu USD. Cá nhân học khoá này dùng miễn phí được. Nếu là công ty và không muốn license, dùng **Colima** (macOS) hoặc **Podman Desktop** (cross-platform) — đều chạy được docker-compose.

**Verify**:

```text
$ docker --version
Docker version 25.0.3, build 4debf41

$ docker compose version
Docker Compose version v2.24.5

$ docker run --rm hello-world
Hello from Docker!
...
```

Docker Compose v2 dùng cú pháp `docker compose` (có space) — v1 cũ là `docker-compose` (gạch). Khoá học chấp nhận cả hai. Nếu lệnh `docker compose` không tồn tại, cài plugin `docker-compose-plugin`.

## 6. PostgreSQL + pgAdmin

**Vì sao Postgres?**
- ACID đầy đủ, hỗ trợ JSON, materialized view (phase-1), WAL log cho CDC (phase-13).
- Mainstream, free, doc Việt đầy đủ.

**Cài** (chọn 1 trong 2 cách):

### Cách A — Postgres native (cài trực tiếp lên máy)
- macOS: `brew install postgresql@15` hoặc dùng app <https://postgresapp.com/>
- Ubuntu: `sudo apt install postgresql-15`
- Windows: <https://www.postgresql.org/download/windows/>

### Cách B — Postgres trong Docker (đơn giản hơn)
- Không cài gì, dùng `docker-compose.yml` trong project khoá để khởi.

```yaml
# docker-compose.yml (preview của phase-5)
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: admin
      POSTGRES_DB: order
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  postgres-data:
```

`docker compose up -d postgres` là chạy được. Khoá học sẽ giới thiệu file đầy đủ ở phase-5.

**pgAdmin** (tuỳ chọn — GUI để xem DB):
- <https://www.pgadmin.org/download/>
- Hoặc dùng plugin **Database** của IntelliJ (Ultimate) / **DBeaver** (free) thay thế.

**Verify** (sau khi chạy Postgres):

```text
$ psql -h localhost -U admin -d order
order=> \dt
            List of relations
 Schema | Name | Type  | Owner
--------+------+-------+-------
(0 rows)
```

## 7. Apache Kafka — local cluster

**Vì sao Kafka, không RabbitMQ / NATS?**
- Persistent log + replay → critical cho Outbox (phase-9 và 13).
- Partition + consumer group → scale chuẩn cho khoá học microservices.
- Mainstream trong industry — kỹ năng dùng được rộng.

**Cài** (2 cách):

### Cách A — Kafka trong Docker (khuyên dùng cho local dev)
Confluent có `docker-compose` cho Kafka + Zookeeper + Schema Registry sẵn:

```yaml
# docker-compose-kafka.yml (preview phase-4)
services:
  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    depends_on: [zookeeper]
    ports:
      - "9092:9092"
    environment:
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1

  schema-registry:
    image: confluentinc/cp-schema-registry:7.5.0
    depends_on: [kafka]
    ports:
      - "8081:8081"
    environment:
      SCHEMA_REGISTRY_KAFKA_BOOTSTRAP_SERVERS: kafka:9092
```

### Cách B — Kafka native (download tarball)
- <https://kafka.apache.org/downloads> → bản 3.6 trở lên.
- Giải nén, chạy `bin/zookeeper-server-start.sh config/zookeeper.properties` rồi `bin/kafka-server-start.sh config/server.properties`.
- Phức tạp hơn Docker — khuyên dùng Docker.

> **Kafka KRaft (no Zookeeper)** — từ Kafka 3.3+ có chế độ không cần Zookeeper. Phase-14 sẽ migrate. Phase-1 đến 13 vẫn dùng Zookeeper để bạn thấy luồng phát triển truyền thống.

**Kafka client CLI** (kcat — kafka cat — cho việc inspect topic):

- macOS: `brew install kcat`
- Ubuntu: `sudo apt install kafkacat`
- Windows: <https://github.com/edenhill/kcat>

```text
$ kcat -b localhost:9092 -L
Metadata for all topics (from broker -1: localhost:9092/bootstrap):
 1 brokers:
  broker 1 at localhost:9092 (controller)
 1 topics:
  topic "__consumer_offsets" with 50 partitions:
    ...
```

**GUI cho Kafka** (tuỳ chọn):
- **Kafka Tool / Offset Explorer**: <https://www.kafkatool.com/> (free cho cá nhân)
- **Conduktor**: <https://www.conduktor.io/> (modern UI, free tier có giới hạn)
- **AKHQ**: <https://akhq.io/> (self-host, web UI)

## 8. Postman (hoặc cURL / httpie)

Dùng để gọi REST API của Order service.

- <https://www.postman.com/downloads/>
- macOS: `brew install --cask postman`

Nếu bạn không thích app GUI, `curl` hoặc `httpie` (CLI) hoàn toàn được:

```text
$ curl -X POST http://localhost:8181/orders \
  -H 'Content-Type: application/json' \
  -d @order.json
```

## 9. Kubernetes — minikube / kind / Docker Desktop K8s

Phase-11 mới cần. Có thể bỏ qua đến lúc đó.

**3 lựa chọn cho K8s local**:

| Tool | Ưu | Nhược |
|---|---|---|
| **minikube** | Phổ biến, doc nhiều | Cần VM/HyperKit/QEMU, hơi nặng |
| **kind** (Kubernetes in Docker) | Nhẹ, nhanh khởi động | Cluster nhỏ, ít plugin |
| **Docker Desktop Kubernetes** | Bật trong setting là xong | Chỉ macOS/Win, không có trên Linux |

Khuyên dùng `minikube` để gần production nhất.

```text
$ minikube version
minikube version: v1.32.0

$ kubectl version --client
Client Version: v1.29.0
```

## 10. gcloud CLI (chỉ cho phase-12)

Để deploy lên Google Kubernetes Engine.

- <https://cloud.google.com/sdk/docs/install>
- macOS: `brew install --cask google-cloud-sdk`

```text
$ gcloud --version
Google Cloud SDK 462.0.1
...

$ gcloud auth login
$ gcloud config set project my-project-id
```

Phase-12 sẽ hướng dẫn tạo tài khoản Google Cloud (có $300 free credit cho 90 ngày — đủ để chạy GKE cluster vài giờ học bài).

## Source code — lấy ở đâu?

Tác giả khoá public source code trên GitHub theo từng nhánh tương ứng từng section/lecture. Bạn có thể:
1. **Code along** — học cao nhất, gõ tay theo từng phase.
2. **Skip** — checkout branch của section sau, đối chiếu code.
3. **Reference** — kẹt thì so sánh từng file với branch tương ứng.

**Cấu trúc Maven multi-module** sẽ là:

```text
food-ordering-system/                    ← parent (packaging=pom)
├── pom.xml
├── order-service/                       ← module Order
│   ├── pom.xml                          ← packaging=pom
│   ├── order-domain/
│   │   ├── order-domain-core/           ← Entity, Aggregate, VO
│   │   └── order-application-service/   ← Application service
│   ├── order-application/               ← REST controllers
│   ├── order-dataaccess/                ← JPA + Postgres adapter
│   ├── order-messaging/                 ← Kafka adapter
│   └── order-container/                 ← Spring Boot runnable
├── payment-service/                     ← (tương tự)
├── restaurant-service/                  ← (tương tự)
└── common/                              ← shared (Kafka model, util)
    ├── common-domain/
    ├── kafka/                            ← Avro model, producer, consumer
    │   ├── kafka-config-data/
    │   ├── kafka-model/
    │   ├── kafka-producer/
    │   └── kafka-consumer/
```

Phase-2 sẽ tạo skeleton này từng module. Đừng cố hiểu hết ngay — sẽ rõ dần.

## Verify nhanh — checklist trước khi vào phase-2

Mở terminal, copy paste khối sau, **mọi lệnh phải in version 17 / mới**:

```text
java -version
javac -version
mvn -version
git --version
docker --version
docker compose version
```

Nếu lệnh nào báo "command not found" → quay lại bước cài tool đó. Đừng vào phase-2 thiếu tool.

## Bẫy thường gặp khi setup

| Triệu chứng | Nguyên nhân + cách sửa |
|---|---|
| `mvn -version` hiện Java 11 hoặc 8 | `JAVA_HOME` chưa set hoặc set sai. `export JAVA_HOME=...` và mở terminal mới. |
| IntelliJ build hiện `error: invalid target release: 17` | Project SDK trong `Project Structure` đang trỏ về Java 11. Đổi sang 17. |
| `docker compose up` báo `port 5432 in use` | Bạn đang chạy Postgres native song song với Postgres trong Docker. Stop một trong hai. |
| Kafka container restart liên tục | Thiếu `KAFKA_ADVERTISED_LISTENERS` hoặc Zookeeper chưa kịp khởi. Dùng `depends_on` + delay. |
| `mvn clean install` rất chậm lần đầu | Maven đang download dependency. Lần sau cached, nhanh hơn nhiều. |
| Lỗi `Connection refused` khi Spring Boot connect Postgres trong Docker | `localhost` trong container ≠ host. Dùng tên service `postgres` hoặc `host.docker.internal`. |
| Windows + WSL2: Docker Desktop chậm | Set memory >= 4GB trong Docker Desktop settings, mount code trên WSL filesystem chứ không phải `/mnt/c/`. |

## Tóm tắt bài 3

- Cài JDK 17 + Maven 3.9 + IntelliJ Community + Git là minimum để build code.
- Docker Desktop + Postgres + Kafka qua docker-compose là cách dễ nhất chạy infrastructure local.
- Postman + kcat + pgAdmin để inspect tay khi debug — không bắt buộc nhưng giúp nhiều.
- minikube + gcloud chỉ cần khi vào phase-11 và phase-12.
- Verify mỗi tool ngay sau khi cài — đừng lùi nửa khoá học mới phát hiện thiếu tool.

**Bài kế tiếp** → [Bài 4 (phase-2): Clean Architecture và Hexagonal Architecture — vì sao và như thế nào](../phase-2-clean-hexagonal/01-clean-hexagonal-architecture-la-gi.md)
