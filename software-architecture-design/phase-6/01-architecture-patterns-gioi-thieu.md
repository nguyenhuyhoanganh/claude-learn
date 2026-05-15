# Bài 1: Software Architecture Patterns - Giới thiệu

## Architecture Patterns là gì?

> **Software Architectural Patterns** = Giải pháp chung, có thể tái sử dụng cho các vấn đề thiết kế hệ thống thường gặp — liên quan đến **nhiều components** chạy như **separate runtime units**.

**Khác với Design Patterns (Singleton, Factory, Strategy...):**
- Design Patterns: organize code **trong** một application
- Architectural Patterns: organize **multiple services/components** chạy độc lập

## Tại sao dùng Architectural Patterns?

### 1. Tiết kiệm thời gian & tài nguyên

Người khác đã giải quyết vấn đề tương tự → học từ họ thay vì reinvent the wheel.

### 2. Tránh "Big Ball of Mud" anti-pattern

> **Big Ball of Mud**: Hệ thống không có cấu trúc rõ ràng — mọi service gọi mọi service khác, tất cả tightly coupled, không có clear responsibility boundaries.

```
Big Ball of Mud:
Service A ←→ Service B
    ↕           ↕
Service C ←→ Service D ←→ Service E
    ↕
Service F

→ Ai cũng phụ thuộc vào ai → impossible to change, scale, test
```

### 3. Onboarding mới dễ hơn

Engineers mới có thể đọc về pattern và hiểu ngay cần làm gì.

## Patterns thay đổi theo thời gian

Khi system evolve, pattern phù hợp ban đầu có thể không còn phù hợp nữa:

```
Startup (5 engineers, simple product)
    → Three-Tier Monolithic Architecture (simple, fast to build)

Growth (50 engineers, complex features)
    → Microservices Architecture (independent teams, scale independently)

Enterprise (500+ engineers, global scale)
    → Microservices + Event-Driven + Domain-Driven Design
```

## Các patterns sẽ học

| Pattern | Khi nào phù hợp |
|---------|----------------|
| **Multi-Tier (Monolithic)** | Small team, simple product, startup |
| **Microservices** | Large team, complex domain, need scale |
| **Event-Driven** | Async workflows, loose coupling, real-time |

---
**Tiếp theo:** Bài 2 - Multi-Tier Architecture →
