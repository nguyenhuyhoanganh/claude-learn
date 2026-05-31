# Bài 3: Strangler Fig pattern — migrate incremental, không big-bang

Bạn đã vẽ xong service map (bài 2). Còn lại: **làm sao thực sự migrate** từ monolith 5 năm tuổi sang 12 service mà không downtime, không freeze feature, không bị management cancel project sau 6 tháng?

Bài này dạy **Strangler Fig pattern** (Martin Fowler, 2004) — chiến lược migrate **không cần big-bang** mà mọi công ty thành công đều dùng.

## Big-bang approach — vì sao FAIL?

Nhiều team đề xuất: "Freeze feature 4 tháng, dồn lực rewrite microservices, xong cùng cutover".

```text
Month 0:  Freeze features
Month 1:  Plan + design  ──► PM bored
Month 2:  Implement      ──► CEO nervous
Month 3:  Test           ──► Sales lose customer
Month 4:  Promised done  ──► Still 30% remain
Month 5:  Re-estimate    ──► Project cancelled
```

Vì sao FAIL:

1. **Estimation lệch**: dự án phức tạp luôn vượt ước lượng 2-5x.
2. **Productivity sụp**: 80 dev cùng refactor 1 codebase = merge conflict ác mộng.
3. **Business stall**: PM, sales, marketing không có gì release → leave hoặc demoralize.
4. **User perception**: "Sao họ ngừng ra feature? Có vấn đề?"
5. **No measurable progress**: 5 tháng không có gì deploy → CEO mất kiên nhẫn.

**Empirical evidence**: ~60% big-bang microservices migration thất bại. Chỉ 20% deliver đúng hạn.

## Strangler Fig pattern — incremental

Tên gọi từ thực vật **Strangler Fig** ở rừng nhiệt đới: cây leo nhỏ mọc trên cây cổ thụ. Theo thời gian, dây leo lớn dần, bao trùm cây cổ, cuối cùng thay thế hoàn toàn.

```text
Phase 1: Cây cổ (monolith) — mọi traffic
Phase 2: Dây leo nhỏ (1-2 microservice) — ít traffic chuyển
Phase 3: Dây leo lan rộng — nhiều traffic chuyển
Phase 4: Cây cổ chết, dây leo thay thế hoàn toàn
```

Map sang software:

```text
Phase 1: Monolith handle 100% traffic
            ▼
Phase 2: Add Strangler Facade (API Gateway)
         Route /products → Monolith
         Route /reviews → Monolith
            ▼
Phase 3: Build ReviewService riêng
         Test thoroughly
         Switch /reviews → ReviewService
         Remove review code in Monolith
            ▼
Phase 4: Repeat for next capability
            ▼
Phase N: Monolith empty hoặc legacy support only
```

## Strangler Facade — API Gateway

Bước đầu tiên: đặt **Strangler Facade** trước monolith.

```text
Before:
  Client ──► Monolith

After:
  Client ──► API Gateway ──► Monolith (mọi route đầu tiên)
                          (sau migrate)
                          ──► Microservice (cho route đã migrate)
```

API Gateway = single entry point, route theo path. Tools: Kong, AWS API Gateway, Nginx, Envoy.

Lúc này gateway chỉ proxy → 0 logic change cho user.

## Quy trình migrate 1 capability

### Bước 1: Chọn candidate tốt nhất

Không phải capability nào cũng nên migrate trước. Ưu tiên:

| Tiêu chí | Lý do |
|---|---|
| **Change frequently** | Source of merge conflict — migrate giảm conflict ngay |
| **Scalability bottleneck** | Vd Search ăn CPU cao — tách ra scale riêng |
| **Low tech debt** | Code sạch dễ migrate |
| **Clear boundary** | Có sẵn package isolation trong monolith |
| **High business value** | Migrate xong = win visible |

KHÔNG migrate trước:
- Code rất ổn định, ít đổi (không gain gì).
- Tightly coupled với mọi thứ (rủi ro cao).
- Tech debt nặng (clean up trước rồi mới migrate).

### Bước 2: Chuẩn bị (CRITICAL — không skip)

```text
2.1. Tăng test coverage cho capability đó
     - Unit test cover 80%+
     - Integration test cover happy path + edge case
     - End-to-end test cho user flow

2.2. Define API rõ ràng
     - OpenAPI spec
     - Versioned (v1)
     - Idempotent

2.3. Isolate code trong monolith
     - Move tất cả related code vào 1 package
     - Remove dependencies từ package này ra ngoài
     - Module boundary rõ
```

Test coverage là **bảo hiểm**. Không test = mỗi deploy là cú lottery.

### Bước 3: Build microservice

```text
3.1. Clone code từ monolith package → new service repo
3.2. Setup CI/CD pipeline
3.3. Setup database (mới hoặc clone từ monolith schema)
3.4. Implement API matching spec
3.5. Migrate data nếu cần (xem bài 4)
3.6. Test mọi thứ — unit, integration, load
```

**Tip vàng**: KHÔNG đổi tech stack ở giai đoạn này. Vẫn dùng Java/Spring nếu monolith Java. Đổi tech = thêm rủi ro không cần.

Sau migration ổn → mới refactor tech.

### Bước 4: Cutover — chuyển traffic

```text
4.1. Deploy microservice (zero traffic)
4.2. Smoke test endpoint trực tiếp
4.3. Shadow mode: route 1% traffic, so sánh output với monolith
4.4. Canary 10% → monitor metric → 50% → 100%
4.5. Nếu issue → rollback (gateway switch back)
```

Cutover phải **reversible**. Gateway flip flag = 5 giây undo.

### Bước 5: Cleanup

```text
5.1. Sau 1 tuần monitor không issue → remove code khỏi monolith
5.2. Drop tables không cần trong monolith DB
5.3. Update documentation
5.4. Celebrate small win — boost team morale
```

Không cleanup = code zombie chiếm chỗ, gây confusion future.

## Case study — migrate Review service

Giả sử migrate Review capability ra khỏi e-commerce monolith.

### Tháng 1: Prep

```bash
# Tăng test coverage Review package
git checkout -b prep-review-migration

# Add 200+ test cases
# Coverage from 30% → 85%
```

### Tháng 2: Build ReviewService

```text
review-service/
├── src/main/java/com/acme/review/
│   ├── ReviewController.java
│   ├── ReviewService.java
│   ├── ReviewRepository.java
│   └── domain/
│       ├── Review.java
│       └── Rating.java
├── pom.xml
├── Dockerfile
└── k8s/deployment.yaml
```

API mirror monolith:

```yaml
GET    /api/v1/reviews/{productId}
POST   /api/v1/reviews
PUT    /api/v1/reviews/{reviewId}
DELETE /api/v1/reviews/{reviewId}
```

DB mới: `review_db` (Postgres riêng).

Migration:

```sql
-- Copy data từ monolith
pg_dump --table reviews monolith_db > reviews.sql
psql review_db < reviews.sql

-- Setup CDC (Change Data Capture) cho sync khi monolith vẫn ghi
-- (Debezium đọc binlog → publish Kafka → ReviewService consume)
```

### Tháng 3: Shadow + canary

```nginx
# API Gateway config
location /api/v1/reviews {
    # Shadow: copy request đến cả 2, return monolith
    mirror /review-service-shadow;

    proxy_pass http://monolith;
}

# Compare logs để verify ReviewService output identical với monolith.
```

Sau 1 tuần shadow OK:

```nginx
location /api/v1/reviews {
    # Canary 10%
    split_clients "${remote_addr}AAA" $backend {
        10% review-service;
        *   monolith;
    }
    proxy_pass http://$backend;
}
```

Monitor:
- Error rate.
- P95 latency.
- Data consistency.

10% OK → 50% → 100%.

### Tháng 4: Cleanup

- Remove Review code in monolith.
- Drop tables monolith.reviews.
- Stop CDC (ReviewService giờ là source of truth).

Migration 1 capability = **3-4 tháng**, không big bang.

## Strangler trong môi trường EDA

Với event-driven, pattern thêm 1 step: **dual-write phase**.

```text
Phase 1: Monolith ghi DB + publish event (legacy + new event channel)
Phase 2: New microservice consume event → update own DB
Phase 3: Verify new microservice DB consistent với monolith
Phase 4: New microservice take over writes → monolith stop ghi
```

Đây là pattern Netflix dùng để migrate cinema database từ Oracle sang Cassandra.

## Anti-pattern: "Migrate everything at once"

Triệu chứng:
- Spreadsheet với 47 service phải migrate.
- Mỗi week stand-up đều "blocked on service X migration".
- Sau 8 tháng vẫn 60% remain.

Fix: chọn TOP 3-5 candidate quan trọng nhất. Migrate 1 cái → cleanup → review lesson learned → next.

**Quantity ≠ progress**. 1 migration thành công + cleanup > 10 migration dang dở.

## Tip vàng: Don't refactor while migrating

Sai lầm chí mạng: vừa migrate vừa "while we're at it, let's refactor".

Lý do FAIL:
- Mỗi change = source bug.
- Khó distinguish bug do migrate vs do refactor.
- Migration tự nó đã rủi ro — đừng add risk.

Rule: **Migrate first, refactor later**. Phase 1 lift-and-shift logic 1:1. Sau ổn, phase 2 refactor + đổi tech.

## Migration metrics — track progress

| Metric | Target |
|---|---|
| % traffic migrated | 100% |
| % monolith code removed | 80%+ |
| Build time | 1 service < 5 phút (vs monolith 25 phút) |
| Deploy frequency | 5x tăng |
| MTTR (Mean Time To Recovery) | Giảm 50%+ |
| On-call alerts | Giảm 30%+ |

Đo từ tháng 0 → tháng N để chứng minh ROI cho management.

## Khi nào KHÔNG dùng Strangler?

- **Hệ thống quá nhỏ**: monolith 5k LoC migrate trong 1 tuần — big-bang OK.
- **Greenfield**: chưa có monolith → design microservices ngay.
- **Legacy không thể đụng**: COBOL banking core không có test → migrate quá rủi ro, dùng pattern khác (anti-corruption layer).

## Tóm tắt bài 3

- **Big-bang migrate FAIL ~60%** — đừng làm.
- **Strangler Fig pattern**: incremental, mỗi lần 1 capability.
- **5 bước**: choose candidate → prep (test + API + isolate) → build service → cutover (shadow + canary) → cleanup.
- **Strangler Facade** = API Gateway route theo path.
- **Don't refactor while migrating** — lift-and-shift trước, refactor sau.
- **EDA migration** thêm dual-write phase.
- Migration 1 capability = 3-4 tháng — không lo dài, lo progress visible.

**Bài kế tiếp** → [Bài 4: Data migration — chia database khi migrate](04-data-migration.md)
