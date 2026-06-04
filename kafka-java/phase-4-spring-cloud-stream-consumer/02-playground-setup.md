# Bài 2: Playground Project — setup môi trường thử nghiệm

Trước khi code consumer đầu tiên, cần **playground project** — Spring Boot project để thử mọi concept Phase 4-17.

Bài này giải thích: cấu trúc playground (section packages), tại sao tách thế, cách khởi tạo qua Spring Initializr, và **trick load đúng yaml** cho mỗi section.

## Playground vs production

Playground KHÔNG = production-grade code. Khác biệt:

| Aspect | Playground | Production |
|---|---|---|
| Goal | Học, thử nghiệm 1 concept | Solve real business problem |
| Structure | Nhiều mini-app trong 1 project | 1 app, organized cleanly |
| Tests | Optional, demo only | Comprehensive |
| Resilience | Skip error handling | Full retry, DLQ, circuit breaker |
| Documentation | README per section | Architecture docs |

Mục đích: tách concepts để **revisit anytime** ("oh, batch processing là section 03").

Sau khi hoàn thành tất cả section concepts, **Section 17 (Netflux)** sẽ build proper production app.

## Cấu trúc

```text
event-driven-playground/
├── pom.xml
├── src/main/java/com/calmvinsguru/playground/
│   ├── section01_consumer/
│   │   ├── Section01Runner.java       ← @SpringBootApplication scoped here
│   │   ├── consumer/
│   │   │   └── PaymentEventConsumer.java
│   │   ├── event/
│   │   │   └── PaymentEvent.java
│   │   └── README.md                  ← per-section notes
│   │
│   ├── section02_producer/
│   │   ├── Section02Runner.java
│   │   └── ...
│   │
│   ├── section03_processor/
│   └── ...
│
└── src/main/resources/
    ├── application.yaml                ← bootstrap loader
    ├── section01/
    │   ├── 01-simple-consumer.yaml
    │   ├── 02-auto-offset-reset.yaml
    │   └── 03-consumer-group.yaml
    ├── section02/
    │   └── ...
    └── section03/
        └── ...
```

### Key design decisions

#### 1. Mỗi section = independent mini-app

Trong 1 Spring app default, `@SpringBootApplication` scan **all packages** dưới root.

Nếu có 2 packages cùng define bean tên `orderEventProducer` (vd Section 01 demo vs Section 02 demo) → **bean conflict** → app fail start.

**Solution**: place `@SpringBootApplication` runner inside each section package → scan **chỉ package đó**.

```java
// src/main/java/com/calmvinsguru/playground/section01_consumer/Section01Runner.java
package com.calmvinsguru.playground.section01_consumer;

@SpringBootApplication
public class Section01Runner {
    public static void main(String[] args) {
        SpringApplication.run(Section01Runner.class, args);
    }
}
```

`@SpringBootApplication` default scan **base package = package class này**. Chỉ scan `section01_consumer.*`. Beans ở `section02_*` không loaded.

Khi muốn chạy Section 02 → run `Section02Runner`. Mỗi section app độc lập.

#### 2. Per-section YAML directories

`src/main/resources/section01/` chứa các yaml file cho concepts khác nhau trong section đó.

Vd Section 01 có 3 sub-demo:
- `01-simple-consumer.yaml` — basic consumer.
- `02-auto-offset-reset.yaml` — config offset reset.
- `03-consumer-group.yaml` — group name customization.

Mỗi yaml = một spring.cloud.stream.bindings config riêng để demo.

#### 3. Dynamic YAML loading

Vấn đề: làm sao tell Spring Boot "dùng yaml `section01/03-consumer-group.yaml`"?

Solution: `application.yaml` parameterize:

```yaml
# application.yaml (bootstrap loader)
spring:
  config:
    import: classpath:${section}/${config}
```

Pass parameters via command line:

```bash
java -jar app.jar --section=section01 --config=03-consumer-group.yaml
```

Hoặc IDE run config:

```text
Program arguments: --section=section01 --config=03-consumer-group.yaml
```

→ Spring resolve `${section}` → `section01`, `${config}` → `03-consumer-group.yaml` → import `classpath:section01/03-consumer-group.yaml`.

Mỗi demo run: thay parameter, không sửa code/yaml.

## Setup từ scratch (Spring Initializr)

### Step 1: Generate via Spring Initializr

Visit https://start.spring.io.

Settings:
- **Project**: Maven.
- **Language**: Java.
- **Spring Boot version**: latest stable.
- **Group**: `com.calmvinsguru` (hoặc your domain).
- **Artifact**: `event-driven-playground`.
- **Packaging**: JAR.
- **Java version**: latest LTS (21+ recommended).

Dependencies:
- ✅ **Cloud Stream** (Framework for event-driven microservices).
- ✅ **Spring for Apache Kafka** (Kafka binder).
- ✅ **Testcontainers** (cho integration test Phase 15).

Generate → download zip → unzip → open IDE.

### Step 2: Maven sync

IDE phát hiện `pom.xml` → click "Sync" / "Reload Maven Projects" → tải dependencies.

`pom.xml` đại khái:

```xml
<dependencies>
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-stream</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-stream-binder-kafka</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter</artifactId>
    </dependency>
    
    <!-- Test -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-test</artifactId>
        <scope>test</scope>
    </dependency>
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-stream-test-binder</artifactId>
        <scope>test</scope>
    </dependency>
    <dependency>
        <groupId>org.testcontainers</groupId>
        <artifactId>kafka</artifactId>
        <scope>test</scope>
    </dependency>
</dependencies>
```

### Step 3: Move runner into section package

Default Initializr generate `EventDrivenPlaygroundApplication.java` ở root package.

**Delete it**. Tạo `Section01Runner.java` ở `com.calmvinsguru.playground.section01_consumer.Section01Runner`:

```java
package com.calmvinsguru.playground.section01_consumer;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Section01Runner {
    public static void main(String[] args) {
        SpringApplication.run(Section01Runner.class, args);
    }
}
```

### Step 4: Bootstrap application.yaml

```yaml
# src/main/resources/application.yaml
spring:
  config:
    import: classpath:${section}/${config}
```

Section-specific config goes elsewhere. This file is **just a loader**.

### Step 5: Create section folders

```bash
mkdir -p src/main/resources/section01
mkdir -p src/main/resources/section02
# ...
```

Bên trong `section01/`, tạo file YAML đầu tiên (sẽ ở bài tiếp).

### Step 6: Run via IDE configuration

IntelliJ / VS Code: Edit Run Configuration cho `Section01Runner`:

```text
Program arguments:
  --section=section01 --config=01-simple-consumer.yaml
```

Run → Spring load `application.yaml` → resolve `${section}=section01`, `${config}=01-simple-consumer.yaml` → import `section01/01-simple-consumer.yaml`.

App start với config chính xác.

## Lợi ích của setup này

| Lợi ích | Why |
|---|---|
| Mỗi demo isolated | Không bean conflict cross-section |
| Quick switch demo | Đổi parameter, không restart project |
| Revisit history | 3 tháng sau "section 06 batch processing như nào?" → mở thư mục, đọc readme |
| Multiple Spring apps in 1 project | Không cần tách N project |
| Easy git history | Branches/commits per section concept |

## Anti-patterns playground tránh được

| Anti-pattern | Bị tránh bởi |
|---|---|
| Hard-code config across all sections | Per-section YAML |
| Bean conflict across demos | Per-section runner + scoped scan |
| Forgotten state from previous demo | Stop runner → start fresh |
| 1 giant `application.yaml` 500 lines | Per-section files 20-50 lines |

## Bonus: Docker Compose Kafka cùng project

Tạo `docker-compose.yml` ở project root (bài Phase 2):

```yaml
services:
  kafka:
    image: apache/kafka:latest
    container_name: kafka
    ports:
      - "9092:9092"
```

```bash
docker compose up -d   # start Kafka
# Run Section 01 → app connects to localhost:9092
```

## Sample structure cuối Phase 4

```text
playground/
├── docker-compose.yml
├── pom.xml
├── src/main/java/com/calmvinsguru/playground/
│   └── section01_consumer/
│       ├── Section01Runner.java
│       ├── consumer/
│       │   ├── SimpleConsumer.java        ← bài 3
│       │   ├── MultiConsumer.java         ← bài 5
│       │   └── ReactiveConsumer.java      ← bài 6
│       ├── event/
│       │   ├── OrderEvent.java
│       │   └── PaymentEvent.java
│       └── README.md
└── src/main/resources/
    ├── application.yaml
    └── section01/
        ├── 01-simple-consumer.yaml
        ├── 02-auto-offset-reset.yaml
        ├── 03-consumer-group.yaml
        ├── 04-multi-topic.yaml
        ├── 05-reactive.yaml
        └── 06-multi-input.yaml
```

## Tóm tắt bài 2

- Playground project ≠ production. Goal: học, demo, revisit.
- Cấu trúc: **per-section package** + **per-section yaml directory**.
- **Runner inside section package** → Spring scan scoped → tránh bean conflict.
- **Dynamic YAML loading**: `application.yaml` parameterize qua `--section=X --config=Y.yaml`.
- Setup: Spring Initializr → dependencies (Cloud Stream + Kafka binder + Testcontainers) → move runner → create section folders.
- Docker Compose Kafka cùng project root.

**Bài kế tiếp** → [Bài 3: First Functional Consumer](03-first-consumer.md)
