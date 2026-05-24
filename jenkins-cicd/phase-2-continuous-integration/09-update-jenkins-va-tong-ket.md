# Bài 9: Update Jenkins + plugin và tổng kết Phase 2

Bài cuối Phase 2 nói về **maintenance** — kỹ năng dễ bị bỏ quên nhưng cực kỳ quan trọng trong môi trường thật. Sau đó **tổng kết toàn bộ Phase 2**.

## Vì sao phải update Jenkins?

Sau vài tuần dùng, mở Jenkins → thường có cảnh báo:

```text
┌─────────────────────────────────────────────────────────┐
│  ⚠️  Manage Jenkins                                      │
│                                                          │
│  • New version of Jenkins (2.426.1) is available         │
│  • Security warnings in plugins:                         │
│      - GitHub Plugin    (2 advisories)                   │
│      - JUnit Plugin     (1 advisory)                     │
└─────────────────────────────────────────────────────────┘
```

→ Đa số là **security update**. Jenkins là server tự động hoá có quyền cao (deploy, push code, gọi cloud API) — bị compromise = tai hoạ. **Phải update**.

### Phân loại update

| Loại                  | Tần suất     | Rủi ro nếu bỏ qua                              |
|-----------------------|--------------|------------------------------------------------|
| Jenkins core LTS      | Mỗi 12 tuần  | Security CVE quan trọng, mất bug fix           |
| Plugin security       | Khi có       | **Critical** — phải update sớm                 |
| Plugin major          | Khi cần feature | OK trễ vài tuần, test trước                  |
| Plugin minor / patch  | Tự động OK   | Thấp                                            |

> **LTS** (Long-Term Support) là kênh update mỗi 12 tuần, ổn định hơn weekly (mỗi tuần). Production luôn dùng LTS.

## Best practice update production

Đừng "thấy có button update là click". Quy trình chuẩn:

1. **Thông báo team** — chọn thời điểm ít user impact (cuối tuần, sau giờ làm).
2. **Document trước** — version cũ → version mới, lý do.
3. **Backup** — `JENKINS_HOME` (data) phải có snapshot.
4. **Update từng plugin một** — không batch nhiều cùng lúc. Khi có lỗi, dễ truy thủ phạm.
5. **Smoke test sau update** — chạy 1-2 pipeline mẫu xem có pass không.
6. **Document sau** — ghi version mới, ai làm, có lỗi gì không.

### Mẫu spreadsheet tracking

| Date       | Component       | From version | To version | Type           | Performed by | Status     | Notes                          |
|------------|-----------------|--------------|------------|----------------|--------------|------------|--------------------------------|
| 2026-05-01 | Jenkins Core    | 2.414.2      | 2.426.1    | Security       | Valentin     | Success    | Smoke test passed              |
| 2026-05-01 | GitHub Plugin   | 1.37.3       | 1.38.0     | Security       | Valentin     | Success    | -                              |
| 2026-05-08 | Docker Pipeline | 562.v...     | 575.v...   | Bugfix         | Valentin     | Rolled back| Causes "no agent" error, P1 fix|

→ Spreadsheet, Confluence page, hoặc README.md trong infra repo — đâu cũng được. **Chính là** "infrastructure as documentation".

## Cách update Jenkins core (chạy bằng Docker)

Khoá học dùng Jenkins qua Docker → quy trình update khác bản cài trực tiếp.

### Bước 1: Lưu version hiện tại

Vào Jenkins UI → **cuộn xuống chân trang** → góc phải có dòng:

```text
Jenkins 2.414.2
```

→ Ghi vào tracking sheet.

### Bước 2: Stop containers

```bash
cd install-jenkins-docker
docker compose down
```

→ Jenkins UI sẽ không truy cập được. **Báo team trước.**

### Bước 3: Rebuild image (pull base image mới)

```bash
docker build -t my-jenkins .
```

→ Lần build này sẽ **pull base image** `jenkins/jenkins:lts` mới (vì base có update). Mất 2-3 phút.

### Bước 4: Start lại

```bash
docker compose up -d
```

→ Đợi container ready, reload Jenkins UI. Cuộn xuống chân trang → version đã đổi.

### Bước 5: Login + verify

Login với user cũ → vào Manage Jenkins → cảnh báo "version outdated" đã biến mất → smoke test 1 pipeline.

## Cách update plugin

Trong Jenkins UI:

1. **Manage Jenkins** → **Plugins** → tab **Updates** (không phải Available).
2. Bạn thấy danh sách plugin có update + lý do (security / bugfix / feature).
3. **Tick từng plugin** (đừng batch).
4. Tick checkbox **Restart Jenkins when installation is complete...**
5. Click **Download now and install after restart**.
6. Đợi download → đợi Jenkins restart (~30s).

> Nếu chỉ muốn restart Jenkins (không phải kiểu cũ "stop UI"), gõ URL: `<jenkins-url>/restart` → confirm. Đây là cách restart "graceful".

### Pitfall update plugin

- **Plugin dependency lock**: plugin A version mới yêu cầu plugin B version ≥ X → nếu B chưa update → A install fail. Đọc message kỹ.
- **Plugin gây pipeline fail**: sau update, pipeline đang chạy ngon bỗng fail. Nguyên nhân thường là **API change**. → Rollback plugin (cài lại version cũ qua plugin file `.hpi`).
- **Plugin Blue Ocean**: chục plugin con. Update một số nhưng không update hết → có warning UI. Update đồng loạt theo nhóm.

---

## Phần khác: cảnh giác script console

Trong Jenkins có **Script Console** (Manage Jenkins → Script Console) cho phép chạy code Groovy với quyền admin **toàn bộ Jenkins**. Cực mạnh, cực nguy hiểm.

**Đừng**:

- Paste script lấy từ internet mà không hiểu.
- Cho non-admin user quyền truy cập.

**Nên**:

- Limit access qua Role-Based Access Control plugin.
- Audit log mọi script chạy qua hook.

> Bài 6 từng dùng Script Console để tắt CSP cho HTML report. Đó là use case hợp lệ cho local sandbox. Trên production, **không bao giờ tắt CSP toàn cục** — chỉ cấu hình per-report theo cách an toàn.

---

## ✨ Tổng kết Phase 2

Bạn đi từ pipeline `echo 'Hello World'` đến **pipeline CI hoàn chỉnh production-grade**. Một chặng đường dài.

### Khái niệm đã nắm

- **CI** = merge code thường xuyên + tự động build + tự động test → bắt lỗi sớm.
- **Pipeline-as-Code**: Jenkinsfile trong Git repo, không textarea UI.
- **Docker làm build environment** — mỗi stage có image tool riêng, isolated.
- **Docker-out-of-Docker** — Jenkins container share Docker socket với host.
- **Workspace sync** — `reuseNode true` để mọi stage thấy file chung.
- **Test report** — JUnit XML là format universal, Jenkins parse tự động.
- **E2E test** — chạy browser thật, cần server up trước. Pattern serve + sleep + test.
- **Parallel stages** — chạy đồng thời, tiết kiệm thời gian, có nguyên tắc.
- **Blue Ocean** — UI mới visualize pipeline đẹp hơn.
- **Maintenance** — update Jenkins core + plugin định kỳ, có quy trình.

### Kỹ năng đã hành

- Tạo GitHub account, fork project, commit Jenkinsfile.
- Cấu hình Jenkins job đọc Jenkinsfile từ Git.
- Viết stage dùng Docker image (`agent { docker { image '...' reuseNode true } }`).
- Cấu hình test runner xuất JUnit XML (jest-junit, playwright junit reporter).
- Publish JUnit + HTML report trong post action.
- Chạy stage parallel.
- Sửa CSP để xem HTML report (cẩn thận).
- Update Jenkins core qua `docker build` + `docker compose up`.
- Update plugin qua UI.

### Pipeline mẫu cuối Phase 2

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
                    post { always { junit 'jest-results/junit.xml' } }
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

→ Đây là **CI pipeline chuẩn cho React/Node.js project**. Đem qua công ty thật, chỉ cần tweak thêm:

- Trigger tự động khi push (Phase 3).
- Notification Slack/email khi fail.
- Lưu artifact lên S3.
- Trigger deploy nếu pass (Phase 3).

### Phase 2 → Phase 3 chuyển tiếp

Pipeline CI đã xong = **code được verify**. Phase 3 sẽ trả lời: **rồi sao nữa?**

- Làm sao **deploy** code lên server tự động?
- Làm sao tổ chức môi trường **staging** trước khi production?
- Làm sao quản lý **secret** (API key, password) an toàn?
- Khi nào cần **manual approval** trước khi deploy production?

---

## Đọc thêm

- Jenkins LTS release notes: <https://www.jenkins.io/changelog-stable/>
- Plugin index: <https://plugins.jenkins.io/>
- DORA State of DevOps report (số liệu CI/CD): <https://cloud.google.com/devops/state-of-devops/>

---

## Bạn đã sẵn sàng cho Phase 3 nếu...

- [ ] Tự viết được Jenkinsfile multi-stage (Build, Test, E2E).
- [ ] Hiểu `reuseNode true` để làm gì.
- [ ] Biết phân biệt `npm install` vs `npm ci`.
- [ ] Hiểu vì sao server E2E cần `&` và `sleep`.
- [ ] Biết khi nào parallel, khi nào không.
- [ ] Đọc được log parallel với tag `[Branch Name]`.
- [ ] Biết update Jenkins / plugin an toàn (không batch, document).

---

→ **Sẵn sàng?** [Phase 3: Continuous Deployment](../phase-3-continuous-deployment/01-tu-manual-den-cd.md)
