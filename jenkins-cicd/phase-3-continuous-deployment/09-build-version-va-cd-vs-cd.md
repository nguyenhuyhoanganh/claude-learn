# Bài 9: Build version, Continuous Delivery vs Deployment và tổng kết Phase 3

Pipeline đã hoàn chỉnh với approval (= Continuous Delivery). Bài này nâng cấp thành **Continuous Deployment** (bỏ approval) — nhưng có điều kiện: **bằng chứng deploy đúng version**. Cuối bài tổng kết Phase 3.

## Phần 1: Continuous Delivery vs Continuous Deployment recap

| Aspect                  | Continuous **Delivery**          | Continuous **Deployment**       |
|-------------------------|----------------------------------|---------------------------------|
| Manual approval cuối?   | ✅ Có                            | ❌ Không                        |
| Mức độ tự động          | Build/test/staging auto, prod thủ công click | Tất cả tự động  |
| Risk                    | Thấp (có human gate)             | Cao hơn (cần test mạnh + rollback) |
| Tốc độ release          | Vài lần/ngày                     | Vài lần/giờ                     |
| Phù hợp                 | Mọi tổ chức bắt đầu              | Tổ chức trưởng thành           |

Đa số tổ chức bắt đầu với **Delivery**. Khi tự tin (test coverage cao, rollback mechanism tốt), chuyển sang **Deployment**.

## Vì sao approval đôi khi cần?

1. **QA / Visual review** — manager mở staging xem layout, color, content trước go-live.
2. **Risk management** — change lớn (DB migration, breaking API) cần double-check.
3. **Compliance** — finance/health industry yêu cầu human approve record.
4. **Stakeholder sign-off** — feature ảnh hưởng business → cần PM/director duyệt.

→ Trong các case này, **giữ approval**. Không phải mọi pipeline đều nên là Continuous Deployment.

## Vì sao approval đôi khi nên bỏ?

Trong tổ chức tốc độ cao (startup, web SaaS):

1. Mỗi commit chỉ là **change nhỏ**, low-risk.
2. Test coverage mạnh — pass test = production-safe.
3. **Feature flag** — bật/tắt feature runtime, không cần redeploy.
4. **Canary deploy** — release cho 1% user trước, monitor.
5. **Auto-rollback** — system tự rollback khi metric tệ.

→ Approval là **bottleneck**: phải đợi người ngồi click. Bỏ approval + có safeguard = deploy nhanh, an toàn.

## Bước 1: Bỏ approval stage

Xoá block:

```groovy
stage('Approval') {
    steps {
        timeout(...) { input(...) }
    }
}
```

→ Pipeline tự động hết. Trở thành **Continuous Deployment**.

Nhưng — **chưa an toàn**. Vì sao? Vì pipeline không có **bằng chứng** version trên production đúng là version vừa build. Có thể prod **vẫn dùng bản cũ** (do deploy fail âm thầm) mà E2E test vẫn pass (test happy path).

→ Cần **version tracking**.

## Bước 2: Application version

### Inject version từ Jenkins vào build

React (qua react-scripts) tự đọc env var bắt đầu với `REACT_APP_*` và inject vào code khi build:

```javascript
// src/App.js
function App() {
    return (
        <div>
            <h1>Learn Jenkins App</h1>
            <p>Version: {process.env.REACT_APP_VERSION}</p>
        </div>
    );
}
```

→ Khi `npm run build`, `process.env.REACT_APP_VERSION` được **thay thế tại build time** bằng giá trị env var.

### Set REACT_APP_VERSION trong Jenkinsfile

```groovy
pipeline {
    environment {
        REACT_APP_VERSION = "1.0.${BUILD_ID}"     // ← BUILD_ID là biến built-in
    }
    ...
}
```

→ Mỗi build có `BUILD_ID` khác nhau (1, 2, 3, ...). Sản phẩm version sẽ là `1.0.1`, `1.0.2`, ...

**Chú ý quote**:

```groovy
REACT_APP_VERSION = '1.0.${BUILD_ID}'      // ← SAI: single quote, không interpolate
REACT_APP_VERSION = "1.0.${BUILD_ID}"      // ← ĐÚNG: double quote → interpolate
```

### Verify version đã inject

Sau build + deploy, mở browser → thấy:

```text
Learn Jenkins App
Version: 1.0.42
```

→ ✓ Version inject thành công. Số sẽ tăng mỗi build.

## Bước 3: Test verify version

Trong Playwright test, thêm assertion check version đúng:

```javascript
// tests/example.spec.js
const { test, expect } = require('@playwright/test');

test('app version matches expected', async ({ page }) => {
    await page.goto('/');

    const expectedVersion = process.env.REACT_APP_VERSION || 'localhost';
    await expect(page.locator('body')).toContainText(`Version: ${expectedVersion}`);
});
```

→ Playwright test đọc env var `REACT_APP_VERSION` (Jenkins truyền vào) → check page có version đó không.

**Logic**:
- Build `1.0.42` → REACT_APP_VERSION=`1.0.42` → React build chứa text "Version: 1.0.42".
- Deploy lên prod.
- Test chạy với env REACT_APP_VERSION=`1.0.42` → load prod URL → tìm text "Version: 1.0.42" → nếu thấy → pass; không thấy → fail.

→ **Nếu deploy fail âm thầm** (prod vẫn version cũ `1.0.41`), test sẽ catch! Vì page có "Version: 1.0.41" không match expected "1.0.42".

### Test "the test"

Lập lại trick bài 8:

1. Build pipeline → version `1.0.43` deploy lên prod.
2. Vào Netlify → upload bản dummy với version `1.0.99`.
3. Trong Jenkins → restart `Deploy & Test Prod` stage.
4. Stage chạy:
   - Build env: REACT_APP_VERSION=`1.0.44` (build mới).
   - Deploy mới fail/skip → prod vẫn `1.0.99`.
   - Test expect `1.0.44` nhưng prod có `1.0.99` → **FAIL**.

→ ✓ Test thật sự catch được version mismatch.

## Pipeline cuối Phase 3 (Continuous Deployment)

```groovy
pipeline {
    agent any
    environment {
        NETLIFY_SITE_ID    = '12345-abcd-...'
        NETLIFY_AUTH_TOKEN = credentials('netlify-token')
        REACT_APP_VERSION  = "1.0.${BUILD_ID}"
    }
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
                    post { always { junit 'jest-results/junit.xml' } }
                }
                stage('Local E2E') {
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
                                reportDir: 'playwright-report', reportFiles: 'index.html',
                                reportName: 'Local E2E', keepAll: true,
                                allowMissing: false, alwaysLinkToLastBuild: false
                            ])
                        }
                    }
                }
            }
        }

        stage('Deploy & Test Staging') {
            agent { docker { image 'mcr.microsoft.com/playwright:v1.40.0-jammy'; reuseNode true } }
            steps {
                sh '''
                    set -euo pipefail
                    npm install netlify-cli node-jq
                    node_modules/.bin/netlify deploy --dir=build --json > deploy-output.json
                    export CI_ENVIRONMENT_URL=$(node_modules/.bin/node-jq -r '.deploy_url' deploy-output.json)
                    npx playwright test
                '''
            }
            post {
                always {
                    publishHTML([
                        reportDir: 'playwright-report', reportFiles: 'index.html',
                        reportName: 'Staging E2E', keepAll: true,
                        allowMissing: false, alwaysLinkToLastBuild: false
                    ])
                }
            }
        }

        // KHÔNG còn Approval stage → Continuous Deployment

        stage('Deploy & Test Prod') {
            agent { docker { image 'mcr.microsoft.com/playwright:v1.40.0-jammy'; reuseNode true } }
            environment {
                CI_ENVIRONMENT_URL = 'https://golden-pavlova-xyz.netlify.app'
            }
            steps {
                sh '''
                    set -euo pipefail
                    npm install netlify-cli
                    node_modules/.bin/netlify deploy --dir=build --prod
                    sleep 10
                    npx playwright test
                '''
            }
            post {
                always {
                    publishHTML([
                        reportDir: 'playwright-report', reportFiles: 'index.html',
                        reportName: 'Production E2E', keepAll: true,
                        allowMissing: false, alwaysLinkToLastBuild: false
                    ])
                }
            }
        }
    }
}
```

→ Mỗi commit → pipeline tự build → test → deploy staging → verify staging → deploy prod → verify prod. **Không có** click manual.

Nếu test fail bất kỳ stage → pipeline fail → prod **không bị update** (giả sử fail trước Deploy Prod) hoặc bị **flag fail** (giả sử fail Production E2E sau Deploy Prod).

> **Lưu ý**: Continuous Deployment thực thụ cần thêm **auto-rollback** nếu Production E2E fail. Khoá học không cover; thường implement bằng tool như **Spinnaker**, **Argo Rollouts**, hoặc Netlify's "Publish previous deploy" + script.

---

## ✨ Tổng kết Phase 3

Bạn đi từ pipeline CI (Phase 2) đến **pipeline CD đầy đủ production-grade**. Một chặng đường dài hơn Phase 2.

### Khái niệm đã nắm

- **Deploy** = mang code lên server thật, có thể đụng đến user.
- **Continuous Delivery** = tự động đến production-ready, **có manual approval** trước prod.
- **Continuous Deployment** = không approval, tự động đến prod.
- **Staging environment** = bản sao gần giống prod, internal, test trước.
- **CLI tools** > UI cho automation. Netlify CLI là ví dụ.
- **Secrets** quản lý qua Jenkins Credentials Store, **không** commit vào Git.
- **Build triggers**: periodic, polling SCM, webhook.
- **Dynamic data** giữa stage qua `script { env.X = sh(...).trim() }`.
- **Build version** + verify trên UI = bằng chứng deploy đúng version.

### Kỹ năng đã hành

- Đăng ký Netlify, tạo Personal Access Token có expiry.
- Lưu token vào Jenkins Credentials với type Secret text.
- Reference credential trong Jenkinsfile: `credentials('id')`.
- Cài CLI tool local trong Docker container (không `-g`).
- Deploy lên Netlify staging (preview) và prod (`--prod`).
- Thêm `input` + `timeout` để có manual approval.
- Parse JSON output bằng `jq` / `node-jq`.
- Truyền dynamic env var giữa stage.
- Inject version vào React qua `REACT_APP_*`.
- Verify version qua Playwright assertion.

### Pipeline kết quả

Pipeline 4-5 stage chính, mỗi commit tự build + test + deploy + verify 2 môi trường. Tốc độ ~3-4 phút/build. Hoàn toàn tự động, version-verified.

### Phase 3 → Phase 4 chuyển tiếp

Tới giờ ta dùng **Docker image có sẵn** (`node:18-alpine`, `playwright:...`). Phase 4 dạy:

- Tự **viết Dockerfile** cho project.
- Build và push image lên registry.
- Dùng image tự build trong pipeline.

→ Đây là chuẩn bị cho Phase 6 (deploy container lên AWS ECS).

## Bạn đã sẵn sàng cho Phase 4 nếu...

- [ ] Tự thêm được stage Deploy vào pipeline (chỉ định image, env, sh).
- [ ] Biết khi nào dùng `credentials()` vs `withCredentials { }`.
- [ ] Hiểu `--prod` vs không `--prod` của `netlify deploy`.
- [ ] Tự setup được polling SCM.
- [ ] Tự thêm `input` + `timeout` cho approval.
- [ ] Hiểu pattern `script { env.X = sh(returnStdout: true).trim() }`.
- [ ] Biết phân biệt Continuous Delivery vs Deployment.

---

## Đọc thêm

- The DevOps Handbook (Gene Kim et al.) — chương về Continuous Delivery.
- Continuous Delivery (Jez Humble & David Farley) — sách kinh điển 2010.
- Netlify CLI docs: <https://cli.netlify.com>
- GitHub Webhook setup: <https://docs.github.com/en/webhooks>

---

→ **Sẵn sàng?** [Phase 4: Docker cho DevOps](../phase-4-docker-cho-devops/01-docker-tong-quan.md)
