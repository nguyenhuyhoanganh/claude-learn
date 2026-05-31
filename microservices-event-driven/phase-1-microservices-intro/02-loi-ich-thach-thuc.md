# Bài 2: Benefits và Challenges chi tiết — vì sao "distributed monolith" là cơn ác mộng

Bạn quyết định migrate sang microservices. 6 tháng sau, mỗi feature thay vì 1 PR giờ là 5 PR ở 5 repo, mỗi deploy phải sync 3 team, test integration mất 2 ngày, có bug không ai biết service nào lỗi. Lương tăng nhưng đêm mất ngủ nhiều hơn.

Đây là **distributed monolith** — anti-pattern phổ biến nhất khi microservices triển khai sai. Bài này dạy bạn nhận diện và tránh.

## Benefits — chia thành 2 nhóm

### Organizational scalability — scale theo người

| Benefit | Cơ chế |
|---|---|
| **Codebase nhỏ** | Mỗi repo 5-50k LoC thay vì 1-10M LoC |
| **Build nhanh** | Maven/npm build 30s thay vì 30 phút |
| **IDE responsive** | Load project < 5s thay vì 5 phút |
| **Test isolated** | Test 1 service không cần spin up cả hệ thống |
| **Onboard nhanh** | New hire học 1 service trong 1 tuần thay vì 6 tháng |
| **Team autonomy** | Team quyết định stack, lịch deploy, design |
| **Parallel velocity** | 10 team song song → 10x features (lý thuyết) |

### System (technical) scalability — scale theo lưu lượng

| Benefit | Cơ chế |
|---|---|
| **Independent scaling** | Search × 100 instance, Auth × 2 — không waste |
| **Cheap commodity HW** | Mỗi instance 256MB-1GB thay vì 8-16GB |
| **Tech diversity** | Đúng tool cho đúng job (Go cho hot path, Python cho ML) |
| **Smaller blast radius** | Bug ở Notifications không kill Orders |
| **Independent deploy** | Team A deploy 10x/ngày, team B deploy 1x/tuần — không xung đột |
| **Easier rewrite** | Service 10k LoC rewrite 1 quý; monolith 1M LoC rewrite 5 năm |

## Challenges — phần ít ai nói trước khi bạn migrate

### 1. Distributed systems = thế giới mới

Method call trong process:

```text
result = userService.getUser(id)
↓
Latency: 1-100 microseconds (predictable)
Failure: gần như không có
```

Network call giữa service:

```text
result = httpClient.get("http://user-service/users/" + id)
↓
Latency: 5ms - 5000ms (10000× variance)
Failure: network drop, service crash, slow response, timeout, partial failure
```

**8 Fallacies of Distributed Computing** (L. Peter Deutsch, 1994) — phải nhớ:

1. The network is reliable. (KHÔNG)
2. Latency is zero. (KHÔNG)
3. Bandwidth is infinite. (KHÔNG)
4. The network is secure. (KHÔNG)
5. Topology doesn't change. (Có thể đổi liên tục)
6. There is one administrator. (Nhiều admin)
7. Transport cost is zero. (Có cost CPU + tiền)
8. The network is homogeneous. (Heterogeneous)

Mỗi fallacy bạn tin = 1 lần bug production.

### 2. Testing trở thành cơn đau

Trước (monolith):
- Unit test = đủ confidence.
- Integration test = chạy 1 process, mock DB → < 5 phút.

Sau (microservices):
- Unit test mỗi service: dễ, nhanh.
- **Integration giữa services**: ai chạy? Ai own? Spin up 20 service mới test được 1 flow?
- **Contract testing**: team A đổi field response → team B vỡ runtime → ai chịu trách nhiệm?

Solution: Pact (consumer-driven contracts), end-to-end test trong staging, production canary. Phase 6 sẽ deep-dive.

### 3. Observability — không có nó, bạn mù

Monolith debug = stack trace 1 process. Microservices debug:

```text
User click → Gateway → Auth → Orders → Inventory → Payment → DB
                                  ↓
                              SLOW (5s)

Câu hỏi: Bottleneck ở đâu? Phải có distributed trace mới biết.
```

3 trụ cột observability:
- **Metrics** (Prometheus): rate, error, duration (RED method).
- **Logs** (Loki/ELK): structured, correlation ID xuyên service.
- **Traces** (Jaeger/Tempo): trace 1 request qua N service.

Phase 7 deep-dive.

### 4. Distributed transaction — ACID không còn miễn phí

Monolith:

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
```

ACID guarantees miễn phí từ DB.

Microservices:

```text
PaymentService.deduct(user1, 100)    ✓
↓ network call
WalletService.add(user2, 100)        ✗ network timeout
↓
Rollback PaymentService???           Không có 2PC easy
```

→ Cần **Saga pattern** (phase 5).

### 5. Service boundaries — sai = chết

Boundary đúng:
- Service ít gọi service khác (low coupling).
- Mỗi service own 1 business capability rõ rệt.
- Đổi feature trong 1 domain → đụng 1 service.

Boundary sai:
- Mọi request đi qua 5 service trước khi trả.
- Đổi 1 feature → coordinate 4 team.
- Service có chung DB → coupling ngầm.

→ **Domain-Driven Design (DDD)** + **Bounded Context** = bí kíp vẽ boundary. Phase 2 deep-dive.

### 6. Operational complexity tăng theo cấp số nhân

| Việc | Monolith | Microservices |
|---|---|---|
| Deploy | 1 binary | 20 service × 3 environment |
| Monitor | 1 dashboard | 20 dashboard + aggregation |
| Log | 1 stream | 20 stream + correlation |
| Database backup | 1 DB | 20 DB |
| Cert renew | 1 cert | 20 cert |
| Secret rotate | 1 vault entry | 20 vault entries |
| On-call | 1 person | 20 service × rotation |

Không có **platform team mạnh** = chết chìm trong ops.

## Anti-pattern #1: Distributed Monolith

Triệu chứng:
- Deploy service A bắt buộc deploy service B cùng lúc.
- Service share database.
- Mọi feature change cần coordinate 3+ team.
- Service A gọi B, B gọi C, C gọi A (vòng tròn).
- Test E2E là cách duy nhất chạy được.

```text
Distributed Monolith:
+──+      +──+      +──+
│ A│ ◄──► │ B│ ◄──► │ C│
+──+      +──+      +──+
   \      /  \      /
    \    /    \    /
     +──+      +──+
     │ D│      │ E│
     +──+      +──+
   ↓ tất cả share 1 DB
+────────────────────────+
│  Shared Database        │
+────────────────────────+
```

= "monolith với network overhead + thêm complexity". Tệ hơn monolith gốc.

Fix: phá DB share, fix circular dependency, define clear ownership.

## Anti-pattern #2: Nano-services

Mỗi function = 1 service. 200 microservices cho domain mà 1 monolith xử lý xong.

```text
Bad:                     Good:
+────────+              +────────────+
│ Login  │              │ Auth       │
+────────+              │ - login    │
+────────+              │ - logout   │
│ Logout │              │ - refresh  │
+────────+              │ - mfa      │
+────────+              +────────────+
│ Refresh│
+────────+
+────────+
│ MFA    │
+────────+
```

Nano = network call ở mỗi step → latency, debug nightmare.

Quy tắc: service phải own **business capability** (1 hoặc vài action liên quan), không phải technical operation đơn lẻ.

## Anti-pattern #3: Shared Database

```text
Auth Service ──┐
Orders Service ─┼──► One Postgres
Payment Service ┘
```

Coupling ngầm:
- Schema change của team Orders break team Auth.
- Migration phải coordinate 3 team.
- Không thể chọn DB tốt nhất cho từng service.

Đúng: **1 service = 1 database** (DB technology có thể khác).

## Khi nào microservices đáng đầu tư?

Checklist YES → microservices có cơ hội thành công:

- [ ] Dev team > 50 người.
- [ ] Domain đã hiểu rõ (product mature > 2 năm).
- [ ] CI/CD pipeline mature, deploy < 1 giờ.
- [ ] Có observability stack (metrics + logs + traces).
- [ ] Có platform team (10+ người) lo Kubernetes / service mesh / CI / monitoring.
- [ ] Có culture team autonomy + ownership.
- [ ] Có budget cho operational overhead.
- [ ] Hiểu rõ Domain-Driven Design.

Thiếu 3+ items = chưa sẵn sàng. Bắt đầu với **modular monolith** trước.

## Modular monolith — middle ground

Monolith nhưng code chia rõ module:

```text
src/
├── auth/         ← package isolated, own data class
├── orders/       ← không import từ auth.internal
├── payment/
└── notifications/
```

Lợi:
- Vẫn deploy 1 binary (đơn giản).
- Boundary rõ → dễ tách thành microservices sau khi cần.
- Test E2E vẫn 1 process.

Shopify (~10k engineers) vẫn dùng modular monolith. Microservices **không bắt buộc** với scale lớn.

## Tóm tắt bài 2

- **Benefits**: organizational scale + technical scale (theo người + theo lưu lượng).
- **Challenges**: distributed systems hard, testing khó, observability bắt buộc, distributed transaction phải dùng Saga, boundary sai → chết.
- **8 Fallacies of Distributed Computing** — đọc + nhớ.
- 3 anti-patterns: **distributed monolith**, **nano-services**, **shared database**.
- Checklist 8 điều kiện trước khi quyết định migrate.
- **Modular monolith** = middle ground tốt cho team < 200 dev.

**Bài kế tiếp** → [Bài 3: 3-tier architecture và roadmap khoá học](03-roadmap-khoa-hoc.md)
