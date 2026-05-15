# Bài 2: Multi-Tier Architecture

## Định nghĩa

> **Multi-Tier Architecture** = Tổ chức hệ thống thành nhiều **tiers** (physical và logical) — mỗi tier được deploy, upgrade, scale riêng bởi các teams khác nhau.

**Lưu ý quan trọng:**
- **Multi-Layer** ≠ **Multi-Tier**
- Multi-Layer: tách code thành layers (Presentation/Business/Data) nhưng vẫn chạy như 1 unit
- Multi-Tier: mỗi tier chạy trên **infrastructure riêng biệt**

**Hai restrictions:**
1. Các tiers kề nhau communicate qua Client-Server Model (REST API)
2. **Không được skip tiers** (A → C trực tiếp khi có B ở giữa)

## Three-Tier Architecture (Phổ biến nhất)

```
┌─────────────────────────────────────┐
│     Tier 1: Presentation Tier       │  ← Browser, Mobile App, Desktop GUI
│  (User Interface — HTML/JS/Mobile)  │
└──────────────────┬──────────────────┘
                   │ HTTP/REST
┌──────────────────▼──────────────────┐
│      Tier 2: Application Tier       │  ← Business Logic Server
│    (Business Logic — API Server)    │
└──────────────────┬──────────────────┘
                   │ SQL/DB Protocol
┌──────────────────▼──────────────────┐
│         Tier 3: Data Tier           │  ← Database, File System
│   (Storage — Database, Files)       │
└─────────────────────────────────────┘
```

### Tier 1: Presentation Tier

- Hiển thị UI, nhận user input
- **KHÔNG có business logic** (code visible trong browser)
- Scale tự nhiên (chạy trên user's device)

### Tier 2: Application Tier (Logic Tier)

- Xử lý business logic
- Stateless → horizontal scaling dễ dàng với Load Balancer

### Tier 3: Data Tier

- Storage và persistence
- Database (SQL/NoSQL)
- Scale với replication + partitioning

## Horizontal Scaling trong 3-Tier

```
Browser ────────────────────────────────────────────────────────────────────────
                                │
                     ┌──────────▼──────────┐
                     │    Load Balancer    │
                     └──┬───┬───┬───────┬─┘
                        │   │   │       │
               ┌────────▼─┐ ▼   ▼ ┌────▼────┐
               │ App Inst1│... │App Inst N│
               └────────┬─┘         └─────┬───┘
                        │                 │
                        └───────┬─────────┘
                     ┌──────────▼──────────┐
                     │  Database Cluster   │
                     │ (Primary + Replicas)│
                     └─────────────────────┘
```

## Ưu điểm Three-Tier

- **Fit hầu hết web use cases**: online store, news, streaming
- **Dễ scale horizontally**: App tier → thêm instances
- **Simple development**: logic tập trung một chỗ
- **Tốt cho small teams**: ít coordination overhead

## Nhược điểm: Monolithic Application Tier

**Drawback 1: Resource intensive**

Khi codebase lớn → mỗi instance:
- CPU intensive
- Memory cao
- Garbage collection dài hơn (Java/C#)
- Buộc phải vertical scale (đắt tiền, có limit)

**Drawback 2: Low Development Velocity**

```
1 codebase → tất cả features
→ Merge conflicts liên tục
→ Build/test toàn bộ app mỗi lần thay đổi nhỏ
→ Không thể release riêng lẻ từng feature
→ Organizational scalability kém
```

## Các biến thể

### One-Tier
```
Standalone app (offline, no network)
```

### Two-Tier
```
Client App (UI + Business Logic) ←→ Database
```
- Desktop/mobile app với rich UI
- Ví dụ: Word + OneDrive, Lightroom + Creative Cloud Storage
- Không có middle server → lower latency

### Four-Tier (+ API Gateway Layer)
```
Browser
  ↓
API Gateway Tier (auth, caching, routing)
  ↓
Application Tier
  ↓
Data Tier
```
- Thêm API Gateway giữa Presentation và Application
- Useful khi nhiều client types (mobile, desktop, 3rd party)
- Hơn 4 tiers → hiếm gặp, thêm latency không cần thiết

## Khi nào dùng Three-Tier?

✅ **Phù hợp:**
- Startup giai đoạn đầu (MVP, fast to market)
- Codebase chưa quá lớn/phức tạp
- Team nhỏ (< 20-30 engineers)
- Use case đơn giản (web app thông thường)

❌ **Không còn phù hợp khi:**
- Team lớn → organizational scalability issues
- Multiple independent features cần scale riêng
- Different components cần different tech stacks
- → Chuyển sang Microservices

## Tóm tắt

```
Three-Tier (Monolithic):
├── Tier 1: Presentation (Browser/Mobile)
├── Tier 2: Application (Business Logic) — Horizontally scalable
└── Tier 3: Data (Database)

Best for: Small teams, simple products, startups
Migration path: → Microservices khi scale vượt ngưỡng
```

---
**Tiếp theo:** Bài 3 - Microservices Architecture →
