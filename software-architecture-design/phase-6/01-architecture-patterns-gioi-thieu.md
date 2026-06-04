# Bài 1: Software Architecture Patterns — Giới thiệu (Các mẫu kiến trúc phần mềm)

## Architecture Patterns là gì?

> **Software Architectural Patterns** (mẫu kiến trúc phần mềm) = Các giải pháp **chung, có thể tái sử dụng** cho các vấn đề thiết kế hệ thống thường gặp — liên quan đến cách tổ chức **nhiều component** chạy như các **đơn vị runtime riêng biệt** (separate runtime units).

Các pattern này đã được cộng đồng phát triển phần mềm tinh chỉnh qua hàng chục năm — bạn không cần tự sáng tạo lại, chỉ cần biết khi nào dùng cái nào.

### Khác biệt với Design Patterns (Singleton, Factory, Strategy...)

Đây là điểm dễ nhầm lẫn:

| Loại | Phạm vi | Ví dụ |
|------|------|------|
| **Design Patterns** | Tổ chức code **trong** một application duy nhất | Singleton, Factory, Observer, Strategy |
| **Architectural Patterns** | Tổ chức **nhiều service / component** chạy độc lập trong hệ thống | Microservices, Event-Driven, Multi-tier |

Design Pattern giải quyết "viết code thế nào" — Architectural Pattern giải quyết "cấu trúc hệ thống thế nào".

## Tại sao phải dùng Architectural Patterns?

### 1. Tiết kiệm thời gian và tài nguyên

Các vấn đề mà bạn đang gặp — hàng nghìn công ty khác đã gặp và giải quyết trước đó. Học từ giải pháp của họ thay vì reinvent the wheel (sáng tạo lại bánh xe).

### 2. Tránh anti-pattern "Big Ball of Mud" (Cục bùn lớn)

> **Big Ball of Mud** (đề xuất bởi Brian Foote và Joseph Yoder năm 1997): Hệ thống **không có cấu trúc rõ ràng** — mọi service gọi mọi service khác, mọi thứ tightly coupled (gắn chặt với nhau), không có ranh giới trách nhiệm rõ ràng.

```text
Big Ball of Mud (kiến trúc tệ):
Service A ←─────────────→ Service B
    ↕                          ↕
Service C ←─────────────→ Service D ←─────→ Service E
    ↕                          ↕
Service F ←─────────────→ Service G

→ Ai cũng phụ thuộc vào ai
→ Sửa 1 service làm 5 service khác lỗi
→ Không thể change, scale, test một cách độc lập
→ Onboarding engineer mới: hàng tháng mới hiểu hệ thống
```

Đây là kết quả khi codebase phát triển không có kế hoạch — mỗi tính năng thêm vào theo cách "thuận tiện nhất tại thời điểm đó" mà không nghĩ đến tổng thể. Đa số legacy codebase trên đời đều có dạng này.

### 3. Onboarding engineer mới dễ hơn

Khi hệ thống tuân theo pattern phổ biến, engineer mới có thể đọc tài liệu về pattern đó (vd: "Microservices") và hiểu ngay cấu trúc hệ thống cần làm gì. Không phải mò mẫm trong cả tháng.

### 4. Giao tiếp với team dễ hơn

Nói "đây là Event-Driven Architecture" → mọi engineer hiểu ngay các thành phần cốt lõi (event bus, producer, consumer, event store). Không cần giải thích chi tiết.

## Patterns thay đổi theo thời gian — Hệ thống tiến hoá

Khi business và đội ngũ phát triển, **pattern phù hợp ban đầu** có thể không còn phù hợp:

```text
Startup giai đoạn đầu (5 engineer, sản phẩm đơn giản):
    → Three-Tier Monolithic Architecture
      (đơn giản, build nhanh, deploy 1 lần)

Growth phase (50 engineer, tính năng phức tạp):
    → Microservices Architecture
      (team độc lập, scale từng service riêng)

Enterprise (500+ engineer, quy mô toàn cầu):
    → Microservices + Event-Driven + Domain-Driven Design
      (loose coupling tối đa, multi-region, async)
```

Bài học quan trọng: **đừng dùng kiến trúc quá phức tạp khi chưa cần**. Bắt đầu monolith cho startup là hoàn toàn hợp lý — chỉ refactor sang microservices khi thực sự bị giới hạn.

## Anti-pattern thường gặp: Over-engineering từ ngày đầu

Nhiều startup nghe nói "Netflix dùng microservices" → ngay từ ngày đầu cũng dùng microservices với 50 service cho team 5 người.

**Hậu quả:**
- Quá nhiều overhead (deploy, monitoring, service mesh, ...).
- Mất 80% thời gian cho infrastructure thay vì cho product.
- Distributed system bug (network, eventual consistency) làm việc debug tốn hàng tuần.
- Slow time-to-market → đối thủ ra trước.

**Bài học**: Chọn pattern phù hợp với **giai đoạn hiện tại**, không phải giai đoạn tương lai. Refactor khi đến lúc.

## Các Pattern sẽ học trong Phase 6

| Pattern | Khi nào phù hợp | Độ phức tạp |
|---------|----------------|------|
| **Multi-Tier (Monolithic)** | Team nhỏ, sản phẩm đơn giản, startup | Thấp |
| **Microservices** | Team lớn, domain phức tạp, cần scale từng phần | Cao |
| **Event-Driven** | Workflow async, loose coupling, real-time | Trung bình – Cao |
| **Event-Stream Processing** | Process dữ liệu streaming khổng lồ | Cao |
| **Big Data / Lambda** | Batch + real-time analytics ở scale lớn | Rất cao |

Mỗi bài sẽ đi vào từng pattern: cách hoạt động, ưu/nhược điểm, khi nào dùng và **ví dụ thực tế** từ các công ty lớn.

## Phase 6 mục tiêu

Sau Phase 6, bạn sẽ:
- Hiểu **5 architectural pattern** lớn của ngành.
- Biết **khi nào** dùng cái nào.
- Biết **các trade-off** của từng pattern.
- Có khả năng nhìn 1 system requirements và **chọn pattern phù hợp**.
- Kết hợp được cả các Quality Attributes (Phase 2), Building Blocks (Phase 4), Data Storage (Phase 5) thành 1 kiến trúc hoàn chỉnh.

Bài cuối Phase 6 sẽ là **System Design Practice** — luyện tập thiết kế một hệ thống cụ thể như "thiết kế Twitter", "thiết kế Uber" — phỏng vấn system design phổ biến.

## Tóm tắt bài 1

```text
Architectural Patterns:
├── Giải pháp tái sử dụng cho cách tổ chức nhiều service/component
├── Khác Design Pattern (organize code trong 1 app)
├── Giúp tiết kiệm thời gian, tránh Big Ball of Mud, dễ onboarding
└── Thay đổi theo giai đoạn phát triển của hệ thống

Bài học chính: Bắt đầu đơn giản, refactor khi cần
              — đừng over-engineer từ ngày đầu
```

---
**Bài kế tiếp**: [Bài 2 - Multi-Tier Architecture (Kiến trúc đa tầng)](02-multi-tier-architecture.md) →
