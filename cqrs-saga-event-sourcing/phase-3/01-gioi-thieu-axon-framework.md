# Bài 1: Giới thiệu Axon Framework và AxonIQ

## Tại sao cần Axon Framework?

Để implement CQRS + Event Sourcing + Saga từ scratch là cực kỳ phức tạp:
- Cần tự xây dựng Event Store
- Cần tự xây dựng cơ chế routing Command → Handler
- Cần tự xây dựng Event Bus nội bộ
- Cần tự xây dựng Projection mechanism
- Cần tự xây dựng Saga orchestration
- ...

**Axon Framework** giải quyết tất cả những việc trên. Nó là một Java framework chuyên dụng cho CQRS, Event Sourcing, và Saga patterns, giúp implement với nỗ lực tối thiểu.

---

## AxonIQ Ecosystem

```
┌─────────────────────────────────────────────────────────────┐
│                    AxonIQ Ecosystem                         │
├────────────────────────┬────────────────────────────────────┤
│   Axon Framework       │   Axon Server                     │
│   (Library/SDK)        │   (Infrastructure Component)      │
│                        │                                    │
│   - Annotations        │   - Event Store                   │
│   - Command handling   │   - Event routing                 │
│   - Event sourcing     │   - Command routing               │
│   - Saga management    │   - Query routing                 │
│   - Projections        │   - Clustering support            │
│   - Spring integration │   - Dashboard UI                  │
└────────────────────────┴────────────────────────────────────┘
```

### Axon Framework (thư viện)
- Thêm vào microservice qua Maven/Gradle dependency
- Cung cấp annotations (`@CommandHandler`, `@EventSourcingHandler`, `@EventHandler`, v.v.)
- Tích hợp chặt chẽ với Spring Boot
- Open source

### Axon Server (infrastructure)
- Server độc lập chạy song song với microservices
- Đóng vai trò Event Store + Message Routing
- Thay thế cho Kafka/RabbitMQ trong một số use cases
- Có Dashboard UI để theo dõi events, commands, queries
- Community Edition: miễn phí
- Enterprise Edition: trả phí

---

## Axon Server vs Kafka/RabbitMQ

| Aspect | Axon Server | Kafka/RabbitMQ |
|---|---|---|
| Event Store | ✅ Built-in | ❌ Cần thêm DB riêng |
| Event Sourcing | ✅ First-class support | ⚠️ Cần tự implement |
| CQRS routing | ✅ Built-in | ⚠️ Cần tự configure |
| Throughput | Vừa phải | Rất cao |
| Ecosystem | Axon only | Đa dạng |
| Learning curve | Vừa | Cao |

**Khi nào dùng Axon Server?**
- Khi đã chọn Axon Framework cho CQRS/ES
- Khi muốn Event Store + Message routing trong 1 component

**Khi nào dùng Kafka?**
- Khi cần throughput cực cao
- Khi cần tích hợp với hệ thống khác không dùng Axon

---

## Cài đặt Axon Server với Docker

```bash
# Chạy Axon Server community edition
docker run -d --name axon-server \
  -p 8024:8024 \
  -p 8124:8124 \
  axoniq/axonserver:latest
```

| Port | Mục đích |
|---|---|
| 8024 | HTTP (Dashboard UI) |
| 8124 | gRPC (Axon Framework kết nối) |

Truy cập Dashboard: `http://localhost:8024`

### Docker Compose

```yaml
services:
  axon-server:
    image: axoniq/axonserver:latest
    ports:
      - "8024:8024"
      - "8124:8124"
    volumes:
      - axon-data:/data
      - axon-events:/eventdata

volumes:
  axon-data:
  axon-events:
```

---

## Thêm Axon Framework vào Spring Boot

### Maven dependencies

```xml
<!-- Axon Framework Spring Boot Starter -->
<dependency>
    <groupId>org.axonframework</groupId>
    <artifactId>axon-spring-boot-starter</artifactId>
    <version>4.9.x</version>
</dependency>

<!-- Axon Messaging (thường đi kèm) -->
<dependency>
    <groupId>org.axonframework</groupId>
    <artifactId>axon-messaging</artifactId>
    <version>4.9.x</version>
</dependency>
```

### application.yml configuration

```yaml
axon:
  axonserver:
    servers: localhost:8124  # kết nối đến Axon Server
  serializer:
    general: jackson         # dùng Jackson để serialize events
    messages: jackson
    events: jackson
```

Chỉ cần config thế này, Axon Framework tự động:
- Kết nối đến Axon Server
- Scan và register tất cả `@CommandHandler`, `@EventHandler`, `@QueryHandler`
- Setup Event Store
- Setup Command Bus, Event Bus, Query Bus

---

## Luồng hoạt động tổng quan trong Axon

```
Client Request
     │
     ▼
Controller
     │ send Command
     ▼
CommandGateway ──────► Axon Server (route) ──► Aggregate
                                                    │
                                                    │ apply Event
                                                    ▼
                                               Event Store (Axon Server)
                                                    │
                                                    │ publish Event
                                                    ▼
                                              EventHandler (Projection)
                                                    │
                                                    │ update
                                                    ▼
                                               Read Database
```

```
Client Query
     │
     ▼
Controller
     │ send Query
     ▼
QueryGateway ──────► Axon Server (route) ──► QueryHandler
                                                    │
                                                    │ read
                                                    ▼
                                               Read Database
```

---

## Axon Framework IntelliJ Plugin

Plugin hữu ích giúp navigate giữa Command → Handler → Event → EventHandler trong IDE:

1. Mở IntelliJ → Settings → Plugins
2. Search "Axon Framework" → Install
3. Sau khi install, bạn sẽ thấy icons cạnh các annotation Axon
4. Click icon → navigate đến handler tương ứng

Rất hữu ích khi debug và trace flow trong dự án lớn.

---

## Tóm tắt

| Component | Vai trò |
|---|---|
| Axon Framework | Library tích hợp vào microservice |
| Axon Server | Infrastructure: Event Store + Message Routing |
| CommandGateway | Gửi commands |
| QueryGateway | Gửi queries |
| Aggregate | Xử lý commands, apply events |
| EventHandler / Projection | Xử lý events, update Read DB |

**Tiếp theo:** Các building blocks của CQRS với Axon — Commands, Events, Queries →
