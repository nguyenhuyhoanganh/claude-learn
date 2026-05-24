# Bài 8: Parallel stages, Blue Ocean và cấu trúc pipeline

Pipeline hiện tại chạy **tuần tự**: Build → Test → E2E. Tổng thời gian = tổng từng stage. Bài này:

1. Chạy **Test + E2E parallel** để giảm thời gian.
2. Cài **Blue Ocean** — UI hiện đại của Jenkins, visualize parallel rõ hơn.
3. Triết lý **cấu trúc pipeline đúng**: dependencies, fail-fast, linting first.

## Phần 1: Parallel stages

### Tại sao parallel?

Pipeline hiện tại:

```text
Build (1 phút)  →  Test (10s)  →  E2E (1 phút)
─────────────────────────────────────────────────►
                                  Total: 2 phút 10s
```

Test và E2E **không phụ thuộc nhau** (đều cần `build/`, nhưng không cần kết quả của nhau). → Chạy parallel:

```text
Build (1 phút)  →  ┬─ Test (10s)         ─┐
                   └─ E2E (1 phút)        ─┘
─────────────────────────────────────────────►
                   Total: 1 phút + 1 phút = 2 phút
```

→ Tiết kiệm ~10 giây. Nghe ít, nhưng pipeline thật có thể tiết kiệm **vài phút mỗi build** — tích luỹ 100 build/ngày = hàng giờ.

### Cú pháp parallel

Cần wrap các stage parallel **trong một stage parent** chứa block `parallel`:

```groovy
stage('Run Tests') {                       // ← Parent stage
    parallel {                              // ← Block parallel
        stage('Unit Tests') {
            agent { ... }
            steps { ... }
        }
        stage('E2E Tests') {
            agent { ... }
            steps { ... }
        }
    }
}
```

→ Mọi stage bên trong `parallel { }` chạy đồng thời.

### Áp dụng cho pipeline

```groovy
pipeline {
    agent any
    stages {
        stage('Build') {
            agent { docker { image 'node:18-alpine'; reuseNode true } }
            steps {
                sh '''
                    set -euo pipefail
                    npm ci
                    npm run build
                '''
            }
        }
        stage('Run Tests') {
            parallel {
                stage('Unit Tests') {
                    agent { docker { image 'node:18-alpine'; reuseNode true } }
                    steps {
                        sh '''
                            set -euo pipefail
                            test -f build/index.html
                            CI=true npm test
                        '''
                    }
                    post {
                        always {
                            junit 'jest-results/junit.xml'
                        }
                    }
                }
                stage('E2E Tests') {
                    agent { docker { image 'mcr.microsoft.com/playwright:v1.40.0-jammy'; reuseNode true } }
                    steps {
                        sh '''
                            set -euo pipefail
                            npm install serve
                            node_modules/.bin/serve -s build &
                            sleep 10
                            npx playwright test
                        '''
                    }
                    post {
                        always {
                            publishHTML([
                                reportDir: 'playwright-report',
                                reportFiles: 'index.html',
                                reportName: 'Playwright HTML Report',
                                keepAll: true,
                                allowMissing: false,
                                alwaysLinkToLastBuild: false
                            ])
                        }
                    }
                }
            }
        }
    }
}
```

→ Push + Build Now. Log bây giờ sẽ **interleave** giữa 2 stage parallel:

```text
[Pipeline] { (Run Tests)
[Pipeline] parallel
[Pipeline] { (Branch: Unit Tests)
[Pipeline] { (Branch: E2E Tests)
[Unit Tests] $ docker run ... node:18-alpine cat
[E2E Tests]  $ docker run ... mcr.microsoft.com/playwright:... cat
[Unit Tests] + test -f build/index.html
[E2E Tests]  + npm install serve
[Unit Tests] + npm test
[E2E Tests]  + node_modules/.bin/serve -s build &
...
```

→ Tag `[Unit Tests]` / `[E2E Tests]` phía trước mỗi dòng giúp phân biệt log của branch nào.

### Pitfall: Stage View không đẹp với parallel

Mở Stage View cổ điển → bạn thấy gì đó **không rõ ràng**:

```text
┌────────┬────────────┐
│ Build  │ Run Tests  │
├────────┼────────────┤
│  1m    │   1m       │   ← Không thấy 2 sub-stage parallel
└────────┴────────────┘
```

→ Đây là lúc cần **Blue Ocean**.

---

## Phần 2: Blue Ocean

### Blue Ocean là gì?

**Blue Ocean** = UI thế hệ mới của Jenkins, được thiết kế lại từ đầu cho pipeline. Hiển thị:

- Pipeline dạng **diagram đẹp**, parallel branches rõ ràng.
- Click stage → log live.
- Test result tích hợp.
- Mobile-friendly.

Trên cùng Jenkins core, không thay thế — bạn vẫn dùng được UI cũ.

### Cài Blue Ocean

Manage Jenkins → Plugins → Available → search `Blue Ocean` → cài plugin **Blue Ocean Aggregator** (gói nhiều plugin con).

> **Lưu ý**: Blue Ocean cài nhiều plugin con (~20). Trước khi cài nên screenshot lại danh sách (nếu sau muốn gỡ).

Tick "Restart after install" → đợi Jenkins restart.

### Mở Blue Ocean

Sau restart, dashboard cũ → menu trái có item mới **"Open Blue Ocean"** → click → trang Blue Ocean mở.

Trên dashboard Blue Ocean, click job `learn-jenkins-app` → chọn một build cụ thể → bạn thấy:

```text
   ●──────●──────●──────●──────●──────●
   │      │      │      ├─●─●  │      │
Checkout Build  Run    Unit   E2E    End
                Tests        Tests
                       ├──────┘
                       │
                       ─ Parallel branches
```

→ Diagram rõ ràng. Click vào node → xem log step bên trong.

### Có nên dùng Blue Ocean hoàn toàn?

- **Có**: nếu pipeline có nhiều stage, parallel, conditional. Diagram giúp hiểu cấu trúc nhanh.
- **Không**: Blue Ocean development đã **chậm lại** từ 2020. Một số tính năng admin vẫn phải dùng UI cũ.

→ Nhiều team dùng **Classic UI cho admin** + **Blue Ocean cho xem pipeline status**.

### Exit Blue Ocean

Trong Blue Ocean → góc phải có nút **"Exit to classic view"**. Click → quay về UI cũ.

---

## Phần 3: Triết lý cấu trúc pipeline

Pipeline càng phức tạp → quyết định **cấu trúc đúng** càng quan trọng. Có 2 nguyên tắc chính:

### Nguyên tắc 1: Tôn trọng dependencies

**Cái gì cần kết quả của bước trước → phải tuần tự.**

Trong pipeline khoá:

- **E2E cần `build/`** → Build phải trước E2E.
- **Test cần `node_modules/`** (cho `npm test`) → Build (có `npm ci`) phải trước.

```text
   ┌─────────┐
   │  Build  │   (chạy npm ci → tạo node_modules + npm run build → tạo build/)
   └────┬────┘
        │
   ┌────┼────┐
   ▼         ▼
┌──────┐  ┌──────┐
│ Unit │  │ E2E  │   (cả 2 đều cần node_modules + build, nhưng không cần lẫn nhau)
│ Test │  │ Test │
└──────┘  └──────┘
```

**Counter-example sai**: gộp Build + Test cùng parallel:

```groovy
parallel {
    stage('Build') { ... }     // Tạo node_modules
    stage('Test')  { ... }     // Cần node_modules — chưa có!
}
```

→ Race condition → Test fail vì `npm` không tìm thấy module.

### Nguyên tắc 2: Fail-fast

**Stage nhanh + dễ fail → đặt sớm.** Mục đích: dừng pipeline càng sớm càng tốt nếu có lỗi rõ ràng → tiết kiệm thời gian.

#### Ví dụ thường gặp: linting

**Linter** (eslint, pylint, rubocop...) check code style + bug đơn giản. Chạy **vài giây**. Nếu code thiếu dấu phẩy, linter phát hiện ngay.

```text
SAI:                          ĐÚNG:

Build (1 phút)               Lint (5s)
   ↓                            ↓ FAIL → dừng, 5s mất
Test (1 phút)                Build (1 phút)
   ↓                            ↓
Lint (5s)                    Test + E2E (parallel)
   ↓ FAIL → 2 phút 5s đã mất!
```

→ Lint **phải đầu pipeline**. Tương tự: kiểu **format check, security scan nhanh, type check** — đặt sớm.

#### Ví dụ pipeline có lint:

```groovy
stages {
    stage('Lint') {
        agent { docker { image 'node:18-alpine'; reuseNode true } }
        steps {
            sh '''
                set -euo pipefail
                npm ci
                npm run lint
            '''
        }
    }
    stage('Build') { ... }
    stage('Run Tests') {
        parallel { ... }
    }
}
```

### Nguyên tắc 3: Parallel có giới hạn

**Just because you can parallelize, doesn't mean you should.**

Ví dụ: bạn có 4 test suite (Unit 10s, Integration 30s, E2E 5 phút, Performance 10 phút). Nếu parallel hết:

- Unit fail sau 10s → 3 stage khác **vẫn chạy** → tốn ~10 phút worker.
- Nếu lỗi rõ rồi, kéo dài pipeline 10 phút là phí.

Cách tốt hơn: chia 2 lớp:

```text
Lint (5s) → Build (1m) → Unit + Integration (parallel, ~30s)
                              │ FAIL → dừng
                              ▼ PASS
                         E2E + Performance (parallel, ~10m)
```

→ Fail nhanh ở lớp dưới → tiết kiệm lớp trên (đắt hơn).

### Nguyên tắc 4: Stage độc lập = stage tốt

Mỗi stage **phải có context đầy đủ** để chạy:

- Có agent (Docker image) riêng.
- Có inputs rõ ràng (file workspace + env vars).
- Có outputs rõ ràng (artifact + report).
- Có post action riêng cho cleanup/report của stage đó.

→ Khi debug stage A fail, chỉ cần xem log stage A, không phải reverse cả pipeline.

---

## Pipeline cuối Phase 2

```groovy
pipeline {
    agent any
    stages {
        // (Nếu có) stage Lint ở đây — fail fast

        stage('Build') {
            agent { docker { image 'node:18-alpine'; reuseNode true } }
            steps {
                sh '''
                    set -euo pipefail
                    npm ci
                    npm run build
                '''
            }
        }

        stage('Run Tests') {
            parallel {
                stage('Unit Tests') {
                    agent { docker { image 'node:18-alpine'; reuseNode true } }
                    steps {
                        sh '''
                            set -euo pipefail
                            test -f build/index.html
                            CI=true npm test
                        '''
                    }
                    post {
                        always {
                            junit 'jest-results/junit.xml'
                        }
                    }
                }

                stage('E2E Tests') {
                    agent { docker { image 'mcr.microsoft.com/playwright:v1.40.0-jammy'; reuseNode true } }
                    steps {
                        sh '''
                            set -euo pipefail
                            npm install serve
                            node_modules/.bin/serve -s build &
                            sleep 10
                            npx playwright test
                        '''
                    }
                    post {
                        always {
                            publishHTML([
                                reportDir: 'playwright-report',
                                reportFiles: 'index.html',
                                reportName: 'Playwright HTML Report',
                                keepAll: true,
                                allowMissing: false,
                                alwaysLinkToLastBuild: false
                            ])
                        }
                    }
                }
            }
        }
    }
}
```

→ **Pipeline CI hoàn chỉnh**, chạy ~1.5-2 phút mỗi build. Đầy đủ: checkout từ Git, build production, unit test, E2E test, publish report.

---

## Tóm tắt

- **`parallel { stage(...) stage(...) }`** trong stage parent → các sub-stage chạy đồng thời.
- Parallel tiết kiệm thời gian, đặc biệt khi có stage dài (E2E, performance test).
- Log parallel **interleave** — tag `[Stage Name]` ở đầu dòng giúp phân biệt.
- **Blue Ocean**: UI mới, visualize parallel rõ. Cài plugin → "Open Blue Ocean" từ dashboard.
- **Cấu trúc pipeline**:
  - Tôn trọng dependencies (cái gì cần input của cái trước → tuần tự).
  - **Fail-fast**: lint / format check trước, slow test sau.
  - Parallel có chừng mực (đừng tốn worker cho stage muộn nếu sớm đã fail).
  - Stage độc lập: agent + steps + post riêng → dễ debug.

---

→ [Bài tiếp theo: Update Jenkins + plugin và tổng kết Phase 2](09-update-jenkins-va-tong-ket.md)
