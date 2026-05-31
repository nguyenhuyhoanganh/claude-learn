# Bài 3: Continuous Integration — đào sâu pipeline tự động đầu tiên

## Vấn đề gốc: "Merge Hell"

Bạn là 1 trong 8 developer làm việc trên cùng một codebase. Mỗi người làm trên branch riêng (feature/login, feature/cart, feature/checkout...) suốt 3 tuần.

Đến ngày deadline, tất cả phải merge vào nhánh main:

- 8 branch × 3 tuần thay đổi = hàng nghìn dòng code đụng nhau.
- Conflict trên 50+ file.
- Mỗi conflict mất 15-30 phút giải quyết.
- Sau merge, code không build được — ai đó đổi signature một hàm chung.
- Build được rồi → test fail hàng loạt — hai feature giả định nhau khác.

Đây gọi là **integration hell** hoặc **merge hell**. Càng để lâu, càng khủng khiếp. Một số dự án mất **cả tuần** để integrate xong.

**Continuous Integration (CI)** sinh ra để diệt vấn đề này tận gốc.

## Định nghĩa CI

> **Continuous Integration** là thực hành kỹ thuật trong đó **mỗi developer merge code vào nhánh chính (main/trunk) ít nhất một lần mỗi ngày**, và mọi merge tự động kích hoạt **build + test** để phát hiện lỗi tích hợp sớm.

3 thành phần:

1. **Frequent integration** — merge nhỏ, sớm, thường xuyên (vài lần/ngày), không gom thành lô lớn.
2. **Automated build** — máy chạy build, không phải con người.
3. **Automated test** — test chạy ngay sau build, không chờ QA.

Mục tiêu **không phải** "có một Jenkins server". Mục tiêu là **giữ main luôn ở trạng thái deploy được**.

## Workflow CI điển hình

```text
Developer máy local
   │
   │ git push origin feature/x
   ▼
+----------------+
| Git server     | (GitHub, GitLab, Bitbucket)
| (VCS)          |
+----------------+
   │ webhook
   ▼
+----------------+
| CI server      | (Jenkins, GitHub Actions, GitLab CI...)
+----------------+
   │
   ├─► Bước 1: Pull code mới nhất
   ├─► Bước 2: Compile / build (mvn package, npm run build, go build...)
   ├─► Bước 3: Unit test (mvn test, jest, pytest...)
   ├─► Bước 4: Static analysis (SonarQube, ESLint, Bandit...)
   ├─► Bước 5: Tạo artifact (war, jar, docker image, exe...)
   ├─► Bước 6: Đẩy artifact lên repository (Nexus, Artifactory, ECR, GHCR...)
   │
   ▼
+----------------+
| Artifact repo  |
+----------------+
   │
   ▼
Thông báo kết quả ──► Slack / email / commit status
```

Mỗi bước **tự động**, không cần ai click chuột. Từ commit đến có artifact: **vài phút đến vài chục phút**.

## Mỏi mảnh ghép trong pipeline CI

### 1. Version Control System (VCS)

Nơi lưu code và quản lý lịch sử:

| Tool | Note |
|---|---|
| **Git** + GitHub | Mặc định ngành, > 90% dự án mới dùng |
| Git + GitLab | Self-hosted dễ, CI tích hợp sẵn |
| Git + Bitbucket | Tích hợp Jira mạnh |
| SVN, Mercurial | Cũ, hiếm gặp ở dự án mới |

CI **bắt đầu** từ commit lên VCS — không có VCS, không có CI.

### 2. Build Tool

Compile + đóng gói code theo ngôn ngữ:

| Ngôn ngữ | Tool phổ biến | Output |
|---|---|---|
| Java | Maven, Gradle | .jar, .war |
| .NET | MSBuild, dotnet CLI | .dll, .exe, .msi |
| Node.js/TS | npm, yarn, pnpm, webpack | bundle .js |
| Python | pip + setuptools, poetry | .whl, .tar.gz |
| Go | `go build` | binary |
| Rust | cargo | binary |
| C/C++ | make, CMake, Bazel | binary, .so |

CI server gọi build tool — không tự build. Đây là vì sao build tool **phải đặt được trên CI agent**.

### 3. CI Server / Orchestrator

Phần mềm chạy pipeline:

| Tool | Đặc điểm |
|---|---|
| **Jenkins** | Self-hosted, plugin nhiều nhất, từ 2011. Lúc nào cũng có job cho người biết Jenkins. |
| **GitHub Actions** | Tích hợp sẵn GitHub, YAML đơn giản, free tier rộng. Mặc định cho dự án mới trên GitHub. |
| **GitLab CI/CD** | Tích hợp sẵn GitLab, tốt cho self-host. |
| **CircleCI** | SaaS, nhanh, parallel mạnh. |
| **Argo Workflows / Tekton** | Cloud-native, chạy trên Kubernetes. |
| **Bamboo, TeamCity** | Của Atlassian / JetBrains, giảm thị phần. |

Khoá này sẽ học cả Jenkins (sâu) và GitHub Actions (trung).

### 4. Test Runner

Khung chạy test:

| Ngôn ngữ | Tool |
|---|---|
| Java | JUnit, TestNG |
| JS/TS | Jest, Vitest, Mocha |
| Python | pytest, unittest |
| Go | `go test` built-in |
| Ruby | RSpec, Minitest |

CI server đọc kết quả test (JUnit XML format chuẩn) và hiển thị trong UI.

### 5. Artifact Repository

Nơi lưu output build:

| Tool | Lưu gì |
|---|---|
| **Nexus, JFrog Artifactory** | jar, war, npm, Docker image |
| **AWS ECR, GHCR, Docker Hub** | Docker image |
| **AWS S3** | Bất kỳ binary nào (custom) |
| **GitHub Packages, GitLab Registry** | Tích hợp sẵn VCS |

Tại sao cần artifact repo riêng? Để **deploy có thể tái sử dụng** cùng artifact mà CI đã test. Không build lại ở môi trường khác — vì kết quả build có thể khác.

## Một ngày làm việc với CI

Ngày 1 — Dev mới chưa quen với CI:

```text
09:00 — Pull main
09:30 — Code feature, chưa commit
12:00 — Đi ăn, máy đang chạy
14:00 — Code tiếp, đụng vào module B
16:00 — Build local thành công
17:30 — Push 1 commit lớn
17:35 — CI fail: ai đó đã merge thay đổi vào module B → conflict
17:40 — Đau đầu xử lý
```

Ngày 30 — Dev đã quen với CI nhịp nhanh:

```text
09:00 — Pull main (auto rebase)
09:30 — Code 30 phút
10:00 — Commit nhỏ, push, mở PR
10:01 — CI chạy → 4 phút → pass
10:05 — Reviewer auto-trigger, comment trong 1 giờ
11:00 — Sửa, commit, push lại → CI lại pass
11:05 — Approve → merge → CI on main → tự deploy staging
... (chu kỳ ngắn, ít rủi ro)
```

Khác biệt: **commit nhỏ + thường xuyên + CI nhanh** → ít conflict, ít stress.

## "10-Minute Rule"

Một CI pipeline tốt nên **chạy xong dưới 10 phút**. Lý do:

- Quá 10 phút → Dev chuyển sang việc khác → mất context khi quay lại.
- Quá 10 phút → ngại commit nhỏ → quay về thói quen batch lớn → mất lợi ích CI.

Cách giữ < 10 phút:

| Kỹ thuật | Lợi ích |
|---|---|
| Cache dependency (Maven .m2, npm node_modules) | Giảm 30-70% thời gian fetch |
| Parallel test (chia test thành nhóm chạy song song) | Giảm 50-80% thời gian test |
| Layer Docker image, BuildKit cache | Giảm 70-90% build image |
| Chỉ chạy test liên quan (test impact analysis) | Giảm 50-90% với codebase lớn |
| Tách smoke test (1 phút) vs full test (15 phút) | Smoke chạy mỗi commit, full chạy nightly |

## Cấp độ "trưởng thành CI"

| Cấp | Trạng thái | Hành động cụ thể |
|---|---|---|
| 0 | Không có CI | Manual build, không có test tự động |
| 1 | CI cơ bản | Push → build + unit test tự động |
| 2 | CI + Quality gate | Thêm linter, code coverage, security scan; fail PR nếu không đạt |
| 3 | CI nhanh | < 10 phút từ commit → kết quả |
| 4 | CI có insight | Chỉ chạy test liên quan, flake test bị quarantine, có dashboard về trend |
| 5 | CI + Trunk-based | Mọi người commit thẳng vào main (qua PR ngắn), không có long-lived branch |

Hầu hết team ngành ở cấp 1-2. Cấp 3 cần đầu tư công cụ. Cấp 4-5 yêu cầu văn hoá và kỹ thuật cao.

## Bẫy thường gặp khi setup CI

| Bẫy | Hệ quả | Cách tránh |
|---|---|---|
| CI chỉ build, không test | Có cảm giác "có CI" nhưng vẫn fail integration | Thêm unit test + integration test |
| Test viết quá broad (1 test = 1000 ASSERT) | Khó debug, dễ flake | Test atomic, mỗi test 1 hành vi |
| Cho phép merge khi CI fail | Phá vỡ tâm lý "main luôn xanh" | Branch protection: không merge khi CI đỏ |
| Build artifact mỗi lần ở môi trường khác | Artifact prod ≠ artifact đã test | Build 1 lần, reuse |
| Secrets trong CI log | Lộ credential | Mask secret, không print biến môi trường |
| CI pipeline file không version control | Đổi pipeline không track được | Pipeline-as-code (Jenkinsfile, .github/workflows/) |

## Code-along nhỏ: pipeline mẫu cho Java + Maven

Đây là file `Jenkinsfile` thật cho dự án Java backend:

```groovy
pipeline {
    agent any

    tools {
        maven 'Maven-3.9'
        jdk   'JDK-17'
    }

    stages {
        stage('Checkout') {
            steps {
                git url: 'https://github.com/acme/payment-service',
                    branch: 'main',
                    credentialsId: 'github-pat'
            }
        }

        stage('Build') {
            steps {
                sh 'mvn -B -DskipTests clean package'
            }
        }

        stage('Unit Test') {
            steps {
                sh 'mvn test'
            }
            post {
                always {
                    junit 'target/surefire-reports/*.xml'
                }
            }
        }

        stage('Static Analysis') {
            steps {
                withSonarQubeEnv('SonarCloud') {
                    sh 'mvn sonar:sonar -Dsonar.projectKey=payment-service'
                }
            }
        }

        stage('Publish Artifact') {
            when { branch 'main' }
            steps {
                sh 'mvn deploy -DskipTests'
            }
        }
    }

    post {
        failure {
            slackSend channel: '#ci-alerts',
                      color: 'danger',
                      message: "Build #${env.BUILD_NUMBER} FAILED on ${env.JOB_NAME}"
        }
    }
}
```

Toàn bộ chuỗi build → test → analysis → publish chạy trong vài phút. Mỗi commit kích hoạt webhook. Pipeline file nằm trong repo cùng code — version control luôn.

## CI áp dụng cho nhiều ngôn ngữ — pattern chung

Dù ngôn ngữ gì, pipeline CI luôn có khung tương tự:

```text
1. Checkout      — git pull code
2. Setup         — cài runtime, restore cache
3. Build         — compile/transpile
4. Test          — chạy unit/integration test
5. Analyze       — static analysis, security scan
6. Package       — tạo artifact (jar/wheel/binary/image)
7. Publish       — đẩy lên artifact repo
8. Notify        — báo Slack/email kết quả
```

Học pattern này một lần, áp dụng cho mọi project — Java, Node, Python, Go đều cùng khung.

## Tóm tắt bài 3

- CI giải quyết "merge hell" bằng **tích hợp + test sớm và liên tục**.
- 5 thành phần: VCS, build tool, CI server, test runner, artifact repo.
- Mục tiêu vận hành: **main luôn ở trạng thái deploy được**.
- Mục tiêu hiệu năng: **pipeline < 10 phút** để giữ vòng feedback ngắn.
- CI **chỉ là một nửa** câu chuyện — phải có Continuous Delivery để đưa artifact ra production.

**Bài kế tiếp** → [Bài 4: Continuous Delivery vs Continuous Deployment — đưa code đến tay user](04-continuous-delivery-vs-deployment.md)
