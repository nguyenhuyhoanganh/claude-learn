# Bài 2: Multi-Tier Architecture (Kiến trúc đa tầng)

## Định nghĩa

> **Multi-Tier Architecture** = Tổ chức hệ thống thành nhiều **tier** (tầng, cả về mặt vật lý — physical, và logic — logical) — mỗi tier được **deploy, upgrade, và scale riêng biệt** bởi các team khác nhau.

Đây là pattern lâu đời nhất nhưng vẫn cực kỳ phổ biến — hầu hết web application đều dùng Multi-Tier (thường là Three-Tier).

### Phân biệt quan trọng: Multi-Layer ≠ Multi-Tier

Đây là điểm dễ nhầm lẫn nhất:

| | Multi-Layer | Multi-Tier |
|---|---|---|
| Khái niệm | Tách code thành **layer** (Presentation / Business / Data) trong cùng một codebase | Mỗi tier chạy trên **infrastructure riêng biệt** |
| Runtime | Tất cả chạy trong **1 process / 1 deployment unit** | Mỗi tier là **process / deployment riêng** |
| Scale | Chỉ scale cả ứng dụng (chung) | Scale từng tier độc lập |

→ Multi-Layer là cách tổ chức code (architecture trong code). Multi-Tier là cách tổ chức runtime (architecture vật lý).

### Hai ràng buộc (restriction) của Multi-Tier

1. **Các tier kề nhau** giao tiếp qua mô hình **Client-Server** (thường là REST API qua HTTP).
2. **Không được skip tier** — vd: Tier 1 không được gọi thẳng Tier 3 khi có Tier 2 ở giữa.

Mục đích: giữ ranh giới rõ ràng giữa các tier, dễ thay thế từng tier mà không ảnh hưởng tier khác.

## Three-Tier Architecture — phổ biến nhất

Đây là kiến trúc bạn sẽ gặp ở 80% các web application:

```text
┌─────────────────────────────────────┐
│     Tier 1: Presentation Tier        │  ← Browser, Mobile App, Desktop GUI
│  (Giao diện người dùng — HTML/JS/Native) │
└──────────────────┬──────────────────┘
                   │ HTTP / REST API
┌──────────────────▼──────────────────┐
│     Tier 2: Application Tier         │  ← Backend server xử lý logic
│   (Business Logic — API Server)      │
└──────────────────┬──────────────────┘
                   │ SQL / Database Protocol
┌──────────────────▼──────────────────┐
│         Tier 3: Data Tier            │  ← Database, File System
│   (Lưu trữ — Database, Files)       │
└─────────────────────────────────────┘
```

### Tier 1: Presentation Tier (Tầng giao diện)

- Hiển thị UI, nhận user input (click, gõ phím, swipe).
- **KHÔNG được chứa business logic quan trọng** — vì code chạy trên thiết bị user → ai cũng xem được (dù minified).
- **Scale tự nhiên**: chạy trên thiết bị user, không cần server.
- Ví dụ: Single-Page Application (React, Vue, Angular), Mobile app (iOS, Android), Desktop app (Electron).

### Tier 2: Application Tier (Tầng business logic)

- Xử lý mọi business logic: tính toán, xác thực, áp dụng quy tắc nghiệp vụ.
- **Stateless** (không lưu state trong RAM của instance) → **horizontal scaling dễ dàng** với Load Balancer.
- Validate input từ Presentation (không tin tưởng client).
- Là nơi enforce security rules thực sự.

### Tier 3: Data Tier (Tầng dữ liệu)

- Lưu trữ và persist dữ liệu.
- Database (SQL hoặc NoSQL), File System, Object Store.
- Scale bằng các kỹ thuật đã học ở Phase 5: replication + partitioning.

## Horizontal Scaling trong Three-Tier

Tier 2 là tier được scale nhiều nhất, thường qua Load Balancer:

```text
Browser ────────────────────────────────────────────────
                                │
                     ┌──────────▼──────────┐
                     │    Load Balancer    │
                     └──┬───┬───┬──────┬──┘
                        │   │   │      │
               ┌────────▼─┐ ▼   ▼ ┌────▼────┐
               │ App Inst1│...  │App InstN│
               └────────┬─┘     └────┬────┘
                        │            │
                        └────┬───────┘
                     ┌───────▼───────────┐
                     │  Database Cluster │
                     │ (Primary + Replicas)│
                     └───────────────────┘
```

Cấu trúc này là kiến trúc tham chiếu cho hàng triệu web application.

## Ưu điểm của Three-Tier

- **Phù hợp với hầu hết web use case**: online store, news site, streaming, SaaS.
- **Dễ scale theo chiều ngang**: thêm instance ở Application Tier khi traffic tăng.
- **Phát triển đơn giản**: business logic tập trung 1 chỗ → dễ debug, dễ test.
- **Phù hợp team nhỏ**: ít overhead phối hợp giữa các team.
- **Phù hợp với CI/CD đơn giản**: 1 codebase, 1 pipeline.
- **Performance tốt**: gọi nội bộ tier 2 không cần qua network giữa các microservice.

## Nhược điểm: Monolithic Application Tier (Tầng ứng dụng nguyên khối)

Khi sản phẩm và team lớn lên, Application Tier trở thành **monolith** — một codebase khổng lồ chứa mọi thứ. Đây là lúc nhược điểm xuất hiện:

### Nhược điểm 1: Resource-intensive (Ngốn tài nguyên)

Khi codebase lớn, mỗi instance phải:

- Tốn nhiều **CPU** (vì load toàn bộ code và dependency).
- Tốn nhiều **RAM** (cần đủ memory cho mọi tính năng, dù instance đó chỉ phục vụ 1 endpoint).
- **Garbage collection** kéo dài (Java, C#, Node) → pause time tăng.
- Phải **vertical scale** (mua server lớn hơn) vì horizontal cũng không giúp giảm size của mỗi instance.

### Nhược điểm 2: Low Development Velocity (Tốc độ phát triển chậm)

```text
1 codebase chứa tất cả tính năng
→ Merge conflict liên tục giữa các team
→ Build / test toàn bộ ứng dụng mỗi khi thay đổi 1 dòng
→ Test suite chạy 30 phút mới xong
→ Không thể release riêng từng tính năng — phải deploy cả app
→ 1 bug nhỏ trong feature A có thể ảnh hưởng feature B
→ Organizational scalability kém (team không độc lập)
```

Đến lúc này, bạn cần chuyển sang **Microservices** (Bài 3).

## Các biến thể của Multi-Tier

### One-Tier (1 tầng)

```text
Ứng dụng standalone (offline, không cần network):
- Microsoft Excel cài trên máy
- Photoshop chạy local
- Trò chơi single-player
```

### Two-Tier (2 tầng — Client + Database)

```text
Client App (UI + Business Logic) ←──────→ Database
```

- Ứng dụng desktop / mobile có rich UI và logic ngay trên client.
- Ví dụ: Microsoft Word kết nối OneDrive, Adobe Lightroom + Creative Cloud Storage.
- **Không có middle server** → latency thấp hơn three-tier.
- **Nhược điểm**: business logic chạy trên client → khó update, khó secure.

### Four-Tier (4 tầng — thêm API Gateway)

```text
Browser / Mobile / 3rd party clients
  ↓
API Gateway Tier (auth, caching, routing, rate limit)
  ↓
Application Tier
  ↓
Data Tier
```

- Thêm **API Gateway** giữa Presentation và Application (Phase 4 - Bài 3 đã học).
- Hữu ích khi có nhiều loại client (mobile, desktop, partner API).
- Tách concerns: gateway lo cross-cutting (auth, rate limit), application lo business.

### Hơn 4 Tier — hiếm gặp

Thêm tier = thêm latency (1 hop network nữa). Vượt 4 tier thường không có lợi.

## Khi nào dùng Three-Tier?

✅ **Phù hợp:**

- Startup giai đoạn đầu (MVP — Minimum Viable Product, cần go-to-market nhanh).
- Codebase chưa quá lớn / phức tạp.
- Team nhỏ (< 20–30 engineer).
- Use case đơn giản (web app thông thường — CRUD chính + một số tính năng).
- Khi không có sẵn DevOps team chuyên nghiệp (microservices cần effort vận hành lớn).

❌ **Không còn phù hợp khi:**

- Team lớn → vấn đề organizational scalability.
- Nhiều tính năng độc lập cần scale riêng (vd: video processing tốn CPU, recommendation tốn GPU).
- Các component cần **tech stack khác nhau** (ML team muốn Python, web team muốn Node).
- Cần deploy độc lập từng tính năng (mỗi team release theo nhịp riêng).

→ Khi gặp các trường hợp này, **chuyển sang Microservices** (bài kế tiếp).

## Ví dụ thực tế của Three-Tier Monolith

- **Stack Overflow** — vẫn là monolith cho đến hôm nay, phục vụ 100 triệu user/tháng.
- **Shopify** — bắt đầu là Ruby on Rails monolith, sau đó tách dần thành majestic monolith + một số service.
- **Basecamp** — kiến trúc đơn giản, monolith Rails.
- **GitHub** — bắt đầu monolith Rails, đến nay vẫn là majestic monolith với vài service tách ra.

**Bài học**: Monolith **không phải xấu**. Nhiều công ty thành công vẫn dùng monolith — quan trọng là **viết monolith có cấu trúc** (well-structured monolith, hay "majestic monolith") — không phải Big Ball of Mud.

## Tóm tắt bài 2

```text
Three-Tier (Monolithic) — kiến trúc phổ biến nhất:
├── Tier 1: Presentation     (Browser / Mobile UI)
├── Tier 2: Application      (Business Logic) ← Horizontally scalable với Load Balancer
└── Tier 3: Data             (Database)

Phù hợp: team nhỏ, sản phẩm đơn giản, startup giai đoạn MVP
Hạn chế: khi team / codebase quá lớn → cần chuyển Microservices

Biến thể:
├── 1-Tier: Standalone offline app
├── 2-Tier: Client thick + DB (Word + OneDrive)
└── 4-Tier: Thêm API Gateway (nhiều client types)

Bài học: Monolith không phải xấu — Big Ball of Mud mới xấu
```

---
**Bài kế tiếp**: [Bài 3 - Microservices Architecture (Kiến trúc microservices)](03-microservices-architecture.md) →
