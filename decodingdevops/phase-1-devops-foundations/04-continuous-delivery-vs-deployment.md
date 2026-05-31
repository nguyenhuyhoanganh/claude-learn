# Bài 4: Continuous Delivery vs Continuous Deployment — đưa code đến tay user

CI tạo ra artifact đã được test. Nhưng **artifact nằm trong repo không phải là phần mềm chạy được cho user**. Phải có ai đó (hoặc cái gì đó) đưa nó **lên server production**. Đó là vai trò của **Continuous Delivery / Continuous Deployment**.

Hai khái niệm này thường bị nhầm. Bài này tách bạch và đi sâu.

## Một dòng định nghĩa

> **Continuous Delivery (CD)** = mọi commit qua CI thành công đều được **chuẩn bị sẵn sàng deploy** lên production. Việc bấm nút "Go" có thể tự động hoặc do người quyết định.

> **Continuous Deployment (CD)** = mọi commit qua CI thành công **tự động đi thẳng lên production**, không có nút "Go" cho người. Quy trình hoàn toàn tự động.

Khác biệt chỉ ở **1 nút bấm**. Nhưng implications rất lớn.

## So sánh trực quan

```text
Continuous Delivery:
  Commit ──► CI ──► Artifact ──► Auto deploy dev ──► Auto deploy staging
                                                              │
                                                              ▼
                                                   [Manual approval]
                                                              │
                                                              ▼
                                                    Auto deploy production


Continuous Deployment:
  Commit ──► CI ──► Artifact ──► Auto deploy dev ──► Auto deploy staging
                                                              │
                                                              ▼
                                                    Auto deploy production
                                                  (không có manual gate)
```

## Khi nào dùng Delivery vs Deployment?

| Yếu tố | Continuous Delivery | Continuous Deployment |
|---|---|---|
| Compliance/audit | Cần ghi nhận ai approve | Khó (nhưng vẫn được nếu tooling tốt) |
| Mức độ test tự động | Vừa phải, có thể bổ sung test manual cuối | **Rất cao** — test thay người gác cổng |
| Tần suất deploy | 1-2 lần/ngày | Vài chục đến hàng trăm lần/ngày |
| Niềm tin vào CI | Trung bình | Cực cao |
| Ngành thường dùng | Banking, fintech, healthcare | E-commerce, social, SaaS B2C |
| Ví dụ công ty | Hầu hết doanh nghiệp lớn | Amazon, Netflix, Facebook, GitHub |

**Thực tế đa số ngành** dùng Continuous Delivery cho production và Continuous Deployment cho môi trường thấp hơn (dev, staging).

## "Deployment" không chỉ là copy file

Mới học hay nghĩ deploy = "copy file lên server, restart service". Thực tế phức tạp hơn nhiều:

```text
Một deployment thực sự gồm:

1. Provision infra (nếu cần): tạo VM, network, DB, load balancer
2. Configure OS: timezone, user, package, security
3. Install runtime: JDK, Node, Python phiên bản đúng
4. Configure firewall, security group
5. Copy artifact lên server
6. Apply database migration (alter table, seed data)
7. Update load balancer (chuyển traffic dần dần)
8. Health check: app trả 200 OK?
9. Smoke test trên production environment
10. Cập nhật DNS / config nếu cần
11. Cập nhật monitoring/alerting rules
12. Rollback plan nếu lỗi
```

Mỗi bước có khả năng lỗi. **Tự động hoá từng bước** = giảm rủi ro con người.

## Pipeline CD chi tiết

```text
+-------------------+
|  Artifact repo    | (jar / docker image đã được CI tạo)
+-------------------+
         │
         ▼
+-------------------+
| Deploy to dev     | (auto)
| - Update infra    |
| - Apply config    |
| - Health check    |
+-------------------+
         │
         │ pass
         ▼
+-------------------+
| Integration test  | (auto)
| - End-to-end test |
| - Performance     |
+-------------------+
         │
         │ pass
         ▼
+-------------------+
| Deploy staging    | (auto)
| - Production-like |
| - Real data shape |
+-------------------+
         │
         │ pass
         ▼
+-------------------+
| Smoke + load test |
+-------------------+
         │
         │ pass
         ▼
+-------------------+
| Manual approval   | ◄── Continuous Delivery dừng ở đây
+-------------------+
         │
         │ approve
         ▼
+-------------------+
| Deploy production | (auto)
| - Canary 5%       |
| - Auto-rollback   |
+-------------------+
         │
         ▼
+-------------------+
| Production smoke  |
| + ramp 100%       |
+-------------------+
```

Continuous Deployment đơn giản là **xoá ô "Manual approval"** đi.

## Chiến lược deployment trên production

Không phải lúc nào cũng "kill old, start new". Có nhiều chiến lược:

### 1. Recreate (đơn giản nhất)

```text
Bước 1: Tắt toàn bộ phiên bản cũ
Bước 2: Deploy phiên bản mới
Bước 3: Bật lên
```

- Downtime: có (vài giây đến vài phút)
- Risk: cao — không có cách rollback nhanh
- Dùng khi: app không quan trọng, hoặc maintenance window cho phép

### 2. Rolling Update

```text
Cluster có 4 instance. Update theo đợt:
  Đợt 1: instance 1 (3 cũ + 1 mới)
  Đợt 2: instance 2 (2 cũ + 2 mới)
  Đợt 3: instance 3 (1 cũ + 3 mới)
  Đợt 4: instance 4 (toàn bộ mới)
```

- Downtime: gần như không
- Risk: trung bình — phiên bản mới và cũ cùng tồn tại tạm thời (cần backward-compatible)
- Dùng khi: Kubernetes, ECS, hầu hết SaaS

### 3. Blue-Green

```text
Có 2 môi trường giống hệt:
- Blue (đang phục vụ traffic)
- Green (đang chạy phiên bản mới)

Switch load balancer từ Blue sang Green.
Nếu lỗi → switch ngược về Blue (rollback < 1 phút).
```

- Downtime: 0
- Risk: thấp — rollback siêu nhanh
- Chi phí: cao — phải có 2x infra
- Dùng khi: cần rollback nhanh, có budget

### 4. Canary

```text
Phiên bản mới được route traffic dần:
  5% user → version mới, 95% → cũ
  Theo dõi metric trong N phút
  Nếu OK → 25% → 50% → 100%
  Nếu lỗi → rollback ngay
```

- Downtime: 0
- Risk: thấp nhất — ít user thấy lỗi
- Dùng khi: app traffic lớn, risk cao (Netflix, Facebook)

### 5. A/B Test (giống Canary nhưng vì product)

Tách traffic theo cohort user (vd theo geo, theo loại account) để **đo lường feature** chứ không chỉ kỹ thuật.

## Feature Flag — kỹ thuật decoupling deploy và release

Một kỹ thuật quan trọng cho CD trưởng thành: **tách "deploy" khỏi "release"**.

```python
# Code chứa cả tính năng mới và cũ
if feature_flag.is_enabled("new_checkout", user=current_user):
    return new_checkout_flow()
else:
    return old_checkout_flow()
```

- **Deploy** = đưa code lên production (an toàn vì feature flag tắt).
- **Release** = bật feature flag cho user (không deploy, chỉ flip flag).

Lợi ích:
- Deploy không user nào thấy → có thể deploy giữa ngày.
- Bật feature theo cohort (% user, country, plan...).
- Rollback bằng cách tắt flag — < 5 giây.
- A/B test, dark launch (deploy code mà user không biết).

Tool: LaunchDarkly, Unleash, GrowthBook, hoặc tự viết với Redis.

## Khi sự cố xảy ra — Rollback

Một CD pipeline tốt phải có **rollback tự động hoặc cực nhanh**:

| Loại rollback | Cách |
|---|---|
| **Tự động** | Pipeline phát hiện metric xấu (5xx tăng, latency tăng) → tự về phiên bản cũ |
| **Manual rapid** | Ấn 1 nút (vd `kubectl rollout undo`) → < 1 phút |
| **Manual slow** | Re-deploy phiên bản cũ qua pipeline → vài phút |
| **Roll-forward** | Không quay lại mà fix nhanh + deploy fix mới — chỉ làm khi tự tin |

Rule: **mỗi deploy phải có rollback plan tài liệu sẵn**. Không deploy mà không biết cách rollback.

## Vai trò của từng team

| Team | Vai trò trong CD |
|---|---|
| **Dev** | Viết code phải backward-compatible. Viết feature flag. Test rollback. |
| **QA** | Viết test tự động (e2e, smoke). Đôi khi vẫn manual cho UX. |
| **Platform / DevOps** | Xây pipeline, infra, monitoring. Đảm bảo pipeline reliable. |
| **SRE** | Định nghĩa SLI/SLO, error budget. Quyết định khi nào dừng deploy. |
| **Product** | Quyết định bật/tắt feature flag. Quyết định khi nào "release" sau khi đã "deploy". |

## Bẫy thường gặp trong CD

| Bẫy | Hệ quả | Tránh bằng |
|---|---|---|
| Deploy thẳng prod, không qua staging | Lỗi prod xảy ra thường xuyên | Bắt buộc qua staging |
| Database migration không backward-compatible | Rollback không được vì DB đã đổi | Migration luôn 2 bước: thêm cột mới → deploy app dùng cột mới → bỏ cột cũ |
| Không có health check | Deploy fail vẫn được coi là thành công | Health check + readiness check chặt |
| Smoke test sau deploy yếu | Lỗi không phát hiện ngay | Smoke test ít nhất các endpoint quan trọng |
| Deploy giờ cao điểm | Lỡ sự cố lan rộng | Deploy giờ thấp điểm, hoặc dùng canary |
| Một pipeline cho mọi service | Khó debug, chậm | Mỗi service một pipeline riêng |
| Không có dashboard deploy | Không biết ai deploy gì khi nào | Centralized deploy log (Spinnaker, Argo CD UI) |

## Code-along: Continuous Delivery với GitHub Actions

```yaml
# .github/workflows/cd.yml
name: CD Pipeline

on:
  push:
    branches: [main]

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - name: Pull artifact from registry
        run: docker pull ghcr.io/acme/api:${{ github.sha }}
      - name: Deploy to staging cluster
        run: |
          kubectl set image deployment/api \
            api=ghcr.io/acme/api:${{ github.sha }} \
            --namespace staging
          kubectl rollout status deployment/api -n staging --timeout=5m
      - name: Smoke test
        run: ./scripts/smoke-test.sh https://api.staging.acme.com

  deploy-prod:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://api.acme.com
    # Continuous DELIVERY: cần manual approval ở GitHub UI
    # Xoá `environment` block trên = thành Continuous DEPLOYMENT
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to prod (canary 10%)
        run: |
          kubectl set image deployment/api-canary \
            api=ghcr.io/acme/api:${{ github.sha }} \
            --namespace production
      - name: Monitor metric
        run: ./scripts/check-canary.sh 10  # check trong 10 phút
      - name: Ramp to 100%
        run: |
          kubectl set image deployment/api-main \
            api=ghcr.io/acme/api:${{ github.sha }} \
            --namespace production
          kubectl rollout status deployment/api-main -n production
```

`environment: production` ở GitHub Actions yêu cầu reviewer approve trước khi job chạy → đây là **Continuous Delivery**. Xoá block đó → tự động deploy → **Continuous Deployment**.

## Trade-off — Khi nào KHÔNG nên Continuous Deployment?

| Tình huống | Nên dùng |
|---|---|
| App có user thật nhưng test coverage < 70% | Continuous Delivery (cần người gác cổng) |
| Mỗi deploy ảnh hưởng > 100k user | Continuous Delivery với canary |
| Tuân thủ pháp lý cần audit deploy | Continuous Delivery (audit trail rõ) |
| App nội bộ, < 100 user, test mạnh | Continuous Deployment được |
| Startup early-stage, fail fast OK | Continuous Deployment được |

**Continuous Deployment là đích đến**, không phải xuất phát. Hầu hết team bắt đầu với Continuous Delivery, sau đó tăng test coverage và niềm tin → tiến đến Continuous Deployment.

## Tóm tắt bài 4

- **CI** kết thúc với một artifact đã được test. **CD** đưa nó tới production.
- **Continuous Delivery** vs **Continuous Deployment** khác nhau ở **manual approval** giữa staging và production.
- 5 chiến lược deploy: Recreate, Rolling, Blue-Green, Canary, A/B — chọn theo risk/cost.
- **Feature flag** tách deploy khỏi release — kỹ thuật quan trọng cho CD trưởng thành.
- Pipeline CD **bắt buộc có rollback plan** + automated health check.

**Bài kế tiếp** → [Bài 5: DevOps Lifecycle & Toolchain — bức tranh tổng thể các công cụ ta sẽ học](05-devops-lifecycle-toolchain.md)
