# Software Architecture Design

> Từ nguyên tắc kiến trúc tới thiết kế hệ thống quy mô lớn.

47 bài: nền tảng kiến trúc phần mềm, SLA/SLO/SLI, thiết kế API, load balancing, caching, messaging, và các bài **system design** hoàn chỉnh — typeahead, ride-sharing, mỗi bài đi từ yêu cầu tới tối ưu và scaling.

**47 bài** trong 13 phần.

## Mục lục

| Tài liệu | Nội dung |
|---|---|
| [00-gioi-thieu.md](00-gioi-thieu.md) | Software Architecture Design of Modern Large-Scale Systems |

### Phase 1

| Bài | Nội dung |
|---|---|
| [01](phase-1/01-system-requirements-va-architectural-drivers.md) | Bài 1: System Requirements và Architectural Drivers (các yếu tố dẫn dắt kiến trúc) |
| [02](phase-1/02-feature-requirements.md) | Bài 2: Feature Requirements — quy trình thu thập từng bước |
| [03](phase-1/03-quality-attributes.md) | Bài 3: System Quality Attributes (Thuộc tính chất lượng hệ thống) |

### Phase 2

| Bài | Nội dung |
|---|---|
| [01](phase-2/01-performance.md) | Bài 1: Performance (Hiệu năng) |
| [02](phase-2/02-scalability.md) | Bài 2: Scalability (Khả năng mở rộng) |
| [03](phase-2/03-availability.md) | Bài 3: Availability (Tính sẵn sàng) |
| [04](phase-2/04-fault-tolerance.md) | Bài 4: Fault Tolerance & High Availability (Khả năng chịu lỗi và Sẵn sàng cao) |
| [05](phase-2/05-sla-slo-sli.md) | Bài 5: SLA, SLO, SLI (Hệ thống cam kết và đo lường chất lượng) |

### Phase 3

| Bài | Nội dung |
|---|---|
| [01](phase-3/01-api-design-introduction.md) | Bài 1: API Design — Giới thiệu |
| [02](phase-3/02-rpc.md) | Bài 2: RPC — Remote Procedure Call (Gọi thủ tục từ xa) |
| [03](phase-3/03-rest-api.md) | Bài 3: REST API |

### Phase 4

| Bài | Nội dung |
|---|---|
| [01](phase-4/01-dns-load-balancing-gslb.md) | Bài 1: DNS, Load Balancing và GSLB |
| [02](phase-4/02-message-brokers.md) | Bài 2: Message Brokers (Hệ thống nhắn tin trung gian) |
| [03](phase-4/03-api-gateway.md) | Bài 3: API Gateway (Cổng API) |
| [04](phase-4/04-cdn.md) | Bài 4: CDN — Content Delivery Network (Mạng phân phối nội dung) |

### Phase 5

| Bài | Nội dung |
|---|---|
| [01](phase-5/01-relational-databases-acid.md) | Bài 1: Relational Databases & ACID Transactions (Cơ sở dữ liệu quan hệ và giao dịch ACID) |
| [02](phase-5/02-non-relational-databases.md) | Bài 2: Non-Relational Databases — NoSQL (Cơ sở dữ liệu phi quan hệ) |
| [03](phase-5/03-database-techniques.md) | Bài 3: Database Techniques — Indexing, Replication, Sharding (Kỹ thuật tối ưu database) |
| [04](phase-5/04-cap-theorem.md) | Bài 4: CAP Theorem (Định lý CAP — định lý vàng của distributed database) |
| [05](phase-5/05-unstructured-data-storage.md) | Bài 5: Unstructured Data Storage (Lưu trữ dữ liệu phi cấu trúc) |

### Phase 6

| Bài | Nội dung |
|---|---|
| [01](phase-6/01-architecture-patterns-gioi-thieu.md) | Bài 1: Software Architecture Patterns — Giới thiệu (Các mẫu kiến trúc phần mềm) |
| [02](phase-6/02-multi-tier-architecture.md) | Bài 2: Multi-Tier Architecture (Kiến trúc đa tầng) |
| [03](phase-6/03-microservices-architecture.md) | Bài 3: Microservices Architecture (Kiến trúc microservices) |
| [04](phase-6/04-event-driven-architecture.md) | Bài 4: Event-Driven Architecture (Kiến trúc hướng sự kiện) |
| [05](phase-6/05-event-stream-processing.md) | Bài 5: Event Stream Processing & Windowing Strategies (Xử lý luồng sự kiện và chiến lược windowing) |
| [06](phase-6/06-big-data-lambda-architecture.md) | Bài 6: Big Data & Lambda Architecture (Dữ liệu lớn và kiến trúc Lambda) |
| [07](phase-6/07-system-design-practice.md) | Bài 7: System Design Practice — Quy trình và Ví dụ thực hành |

### Phase 7 — case study intro

| Bài | Nội dung |
|---|---|
| [01](phase-7-case-study-intro/01-case-study-methodology.md) | Bài 1: Methodology — Cách tiếp cận mọi system design problem |

### Phase 8 — image sharing

| Bài | Nội dung |
|---|---|
| [01](phase-8-image-sharing/01-requirements.md) | Bài 1: Image Sharing Platform — Step 1+2 (Requirements) |
| [02](phase-8-image-sharing/02-api-architecture.md) | Bài 2: Image Sharing — Step 3+4 (API + High-Level Architecture) |
| [03](phase-8-image-sharing/03-optimization.md) | Bài 3: Image Sharing — Step 5 (Optimize for NFRs) |

### Phase 9 — vod streaming

| Bài | Nội dung |
|---|---|
| [01](phase-9-vod-streaming/01-requirements.md) | Bài 1: VOD Streaming — Step 1+2 (Requirements) |
| [02](phase-9-vod-streaming/02-pipes-filters-architecture.md) | Bài 2: VOD Streaming — Step 3+4 (API + Pipes-and-Filters) |
| [03](phase-9-vod-streaming/03-optimization.md) | Bài 3: VOD Streaming — Step 5 (Optimize for NFRs) |

### Phase 10 — messaging

| Bài | Nội dung |
|---|---|
| [01](phase-10-messaging/01-requirements.md) | Bài 1: Real-Time Messaging — Step 1+2 (Requirements) |
| [02](phase-10-messaging/02-architecture.md) | Bài 2: Real-Time Messaging — Step 3+4 (API + Architecture) |
| [03](phase-10-messaging/03-optimization.md) | Bài 3: Messaging — Step 5 (Scaling stateful + optimizations) |

### Phase 11 — typeahead

| Bài | Nội dung |
|---|---|
| [01](phase-11-typeahead/01-requirements-trie-attempt.md) | Bài 1: Typeahead — Requirements + Trie First Attempt |
| [02](phase-11-typeahead/02-cqrs-mapreduce.md) | Bài 2: Typeahead — CQRS + MapReduce Pipeline |
| [03](phase-11-typeahead/03-optimization.md) | Bài 3: Typeahead — Step 5 (Shard Manager + Sampling + Multi-Region) |

### Phase 12 — ride sharing

| Bài | Nội dung |
|---|---|
| [01](phase-12-ride-sharing/01-requirements-state.md) | Bài 1: Ride Sharing — Requirements + State Diagram |
| [02](phase-12-ride-sharing/02-services-architecture.md) | Bài 2: Ride Sharing — Step 4 (Services Architecture) |
| [03](phase-12-ride-sharing/03-post-trip-choreography.md) | Bài 3: Ride Sharing — Post-Trip Choreography |
| [04](phase-12-ride-sharing/04-scaling-bloom-filter.md) | Bài 4: Ride Sharing — Scaling Stateful + Bloom Filter |
| [05](phase-12-ride-sharing/05-geohash.md) | Bài 5: Ride Sharing — Geohash + Geospatial Indexing |

### Phase 13 — final tips

| Bài | Nội dung |
|---|---|
| [01](phase-13-final-tips/01-interview-tips.md) | Bài 1: System Design Interview — Final Tips + Time Management |

## Nên bắt đầu từ đâu

| Bạn đang ở tình huống | Đọc từ |
|---|---|
| Chuẩn bị phỏng vấn system design | phase-1 → phase-2 rồi nhảy vào các bài design |
| Cần thiết kế API | phase-3 |
| Muốn xem một bài design đầy đủ | phase-11 (typeahead) hoặc phase-12 (ride-sharing) |

---

*Mục lục này sinh từ cấu trúc thư mục và tiêu đề thật của từng bài. Thêm bài mới thì cập nhật lại bảng tương ứng.*
