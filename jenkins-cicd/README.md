# Khoá học Jenkins CI/CD cho người mới bắt đầu

> Stack: **Jenkins** + **Docker** + **AWS** (S3, EC2, ECS)

Khoá học dành cho developer hoặc kỹ sư DevOps muốn học CI/CD từ con số 0. Sau khoá, bạn có thể: viết được Jenkinsfile hoàn chỉnh, dựng pipeline build + test + deploy tự động cho ứng dụng web, hiểu vì sao chọn cách triển khai này thay vì cách khác, debug khi pipeline lỗi, và đưa container lên cloud (AWS ECS).

## Tổng quan kiến trúc khoá học

Khoá xoay quanh **một dự án xuyên suốt**: lấy code website từ Git → build trong Docker → test → deploy lên AWS.

```text
                ┌───────────────────────────────────────────────┐
                │           Developer push code lên Git          │
                └───────────────────┬───────────────────────────┘
                                    │
                                    ▼
                ┌───────────────────────────────────────────────┐
                │     Jenkins Controller (Master) — điều phối    │
                │  • Đọc Jenkinsfile từ repo                     │
                │  • Phân stage cho agent thực thi               │
                │  • Lưu log, artifact, kết quả test             │
                └───────────────────┬───────────────────────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                ▼                   ▼                   ▼
        ┌────────────┐      ┌────────────┐      ┌────────────┐
        │  Agent 1   │      │  Agent 2   │      │  Agent N   │
        │  (Docker)  │      │  (Docker)  │      │  (Docker)  │
        │  Build +   │      │  Run unit  │      │  Deploy →  │
        │  Test      │      │  + E2E test│      │  AWS       │
        └────────────┘      └────────────┘      └────────────┘
```

Trong khoá, bạn sẽ tự tay:

1. Cài Jenkins bằng Docker, viết pipeline đầu tiên.
2. Đặt Jenkinsfile vào Git, chạy CI: build + unit test + E2E test (Playwright) + JUnit report.
3. Mở rộng sang CD: deploy code ra môi trường staging → manual approval → production.
4. Đóng gói ứng dụng vào Docker image, push lên registry, dùng custom image trong pipeline.
5. Triển khai lên AWS: lưu file lên S3, host static website, tự động sync qua AWS CLI.
6. Cuối cùng, deploy container lên **AWS ECS** (Elastic Container Service) — cách công ty thực tế chạy ứng dụng container production.

## Vì sao chọn Jenkins (và không phải GitHub Actions / GitLab CI)?

Jenkins là **CI/CD server đời đầu**, ra đời 2011 (fork từ Hudson), và đến nay vẫn là **standard de facto** trong rất nhiều tổ chức enterprise. Vì sao?

- **Self-hosted**: bạn chạy Jenkins trên server của mình → kiểm soát toàn bộ dữ liệu, không phụ thuộc nhà cung cấp.
- **Plugin ecosystem**: ~1900 plugin chính thức, hỗ trợ hầu hết tool và cloud provider.
- **Pipeline-as-Code**: Jenkinsfile (viết bằng Groovy) được commit cùng source code → versioning, code review, rollback dễ dàng.
- **Trung lập với cloud**: pipeline chạy y nguyên dù bạn deploy lên AWS, GCP, Azure, on-prem.

Hiểu Jenkins giúp bạn dễ chuyển sang công cụ khác (GitHub Actions, GitLab CI, CircleCI) vì khái niệm cốt lõi (stage, agent, artifact, trigger…) đều giống.

## Cấu trúc khoá học (7 phase, ~50 bài)

```text
jenkins-cicd/
├── README.md                                    ← Bạn đang ở đây
│
├── phase-1-jenkins-va-devops-can-ban/           ← Khái niệm & pipeline đầu tiên
│   ├── 01-jenkins-va-devops.md                  ← Jenkins là gì + DevOps cốt lõi
│   ├── 02-cai-dat-jenkins-voi-docker.md         ← Cài Jenkins bằng Docker Desktop
│   ├── 03-jobs-va-jenkins-architecture.md       ← Freestyle vs Pipeline + Controller/Agent
│   ├── 04-pipeline-dau-tien.md                  ← Laptop assembly pipeline
│   ├── 05-workspace-artifacts-post-actions.md   ← Workspace, archive, post blocks
│   ├── 06-shell-debugging-toi-uu-pipeline.md    ← Shell, troubleshoot, gộp sh, sleep
│   ├── 07-test-stage-va-exit-codes.md           ← Stage test + grep + exit codes
│   └── 08-env-vars-graph-view-tong-ket.md       ← Variables + Pipeline Graph + tổng kết
│
├── phase-2-continuous-integration/              ← ⭐ CI thật sự
│   ├── 01-gioi-thieu-ci.md                      ← CI là gì, vì sao cần
│   ├── 02-du-an-website-va-github.md            ← Setup repo + project
│   ├── 03-docker-lam-build-environment.md       ← Chạy build trong container
│   ├── 04-workspace-sync-va-git-checkout.md     ← Pull code từ Git
│   ├── 05-running-tests-va-junit-report.md      ← Unit test + JUnit report
│   ├── 06-e2e-tests-voi-playwright.md           ← E2E tests + HTML report
│   ├── 07-parallel-stages-va-blue-ocean.md      ← Chạy song song + Blue Ocean
│   └── 08-cau-truc-pipeline-va-update.md        ← Cách tổ chức pipeline + nâng cấp Jenkins
│
├── phase-3-continuous-deployment/               ← ⭐ CD: từ build đến production
│   ├── 01-tu-manual-den-cd.md                   ← Manual deploy → automated
│   ├── 02-cli-tools-va-env-config.md            ← Cài CLI, biến môi trường
│   ├── 03-secrets-va-credentials.md             ← Lưu secret an toàn trong Jenkins
│   ├── 04-deploy-production.md                  ← Pipeline deploy lần đầu
│   ├── 05-build-triggers.md                     ← Scheduled build + SCM polling
│   ├── 06-staging-environment.md                ← Vì sao cần staging
│   ├── 07-manual-approval-va-dynamic-data.md    ← Bước duyệt + truyền data giữa stage
│   ├── 08-post-deployment-tests.md              ← Test sau deploy, smoke test
│   └── 09-build-version-va-cd-vs-cd.md          ← Versioning + phân biệt Delivery/Deployment
│
├── phase-4-docker-cho-devops/                   ← Docker chuyên sâu cho pipeline
│   ├── 01-docker-tong-quan.md                   ← Docker là gì, image vs container
│   ├── 02-chon-base-image-cho-app.md            ← Node, Python, Java, PHP, .NET
│   ├── 03-build-docker-image.md                 ← Dockerfile + build context
│   ├── 04-custom-image-trong-pipeline.md        ← Dùng image riêng cho build env
│   ├── 05-nightly-image-build.md                ← Job build image hàng đêm
│   └── 06-cai-package-trong-dockerfile.md       ← Thêm Linux packages
│
├── phase-5-deploy-len-aws/                      ← ⭐ Deploy thực tế lên AWS
│   ├── 01-cloud-computing-va-aws.md             ← Cloud là gì, AWS overview
│   ├── 02-amazon-s3-file-storage.md             ← S3: bucket, object, region
│   ├── 03-aws-cli.md                            ← AWS CLI v1/v2
│   ├── 04-iam-quan-ly-quyen.md                  ← IAM user, policy, access key
│   ├── 05-credentials-aws-trong-jenkins.md      ← Lưu AWS key trong Jenkins
│   ├── 06-upload-file-len-s3.md                 ← Upload object qua CLI
│   ├── 07-host-website-tren-s3.md               ← Static website hosting
│   ├── 08-sync-files-s3.md                      ← aws s3 sync trong pipeline
│   └── 09-ec2-va-nginx-optional.md              ← EC2 + Nginx (optional)
│
├── phase-6-deploy-len-aws-ecs/                  ← ⭐ Container production trên AWS
│   ├── 01-ecs-tong-quan.md                      ← ECS, Fargate, EC2 launch type
│   ├── 02-ecr-container-registry.md             ← Push image lên ECR
│   ├── 03-task-definition-va-service.md         ← Khái niệm task + service
│   ├── 04-pipeline-deploy-ecs.md                ← Pipeline đầy đủ build → ECR → ECS
│   └── 05-rolling-update-va-rollback.md         ← Update không downtime + rollback
│
└── phase-7-tong-ket/                            ← Wrap-up & roadmap
    ├── 01-terminate-aws-resources.md            ← Tắt resource AWS để tránh tốn tiền
    ├── 02-jenkins-qua-khu-va-tuong-lai.md       ← Lịch sử + Jenkins X, alternatives
    └── 03-roadmap-tiep-theo.md                  ← Học gì sau Jenkins
```

## Lộ trình học (8–10 tuần)

| Phase | Nội dung                         | Thời gian | Ưu tiên       |
|-------|----------------------------------|-----------|---------------|
| 1     | Jenkins & DevOps căn bản         | 1 tuần    | Phải học      |
| **2** | **Continuous Integration**       | **1.5 tuần** | **⭐ Core** |
| **3** | **Continuous Deployment**        | **1.5 tuần** | **⭐ Core** |
| 4     | Docker cho DevOps                | 1 tuần    | Cần biết      |
| **5** | **Deploy lên AWS (S3, EC2)**     | **1.5 tuần** | **⭐ Core** |
| 6     | Deploy container lên ECS         | 1 tuần    | Quan trọng    |
| 7     | Tổng kết & tương lai             | 2 ngày    | Tham khảo     |

## Yêu cầu nền tảng

- **Lập trình**: biết 1 ngôn ngữ bất kỳ (JavaScript, Python, Java, PHP…). Không cần giỏi.
- **Linux command line**: biết `cd`, `ls`, `cat` là đủ. Khoá sẽ dạy thêm `echo`, `grep`, `mkdir`, `touch`, `test`, `rm`, `sleep`.
- **Git**: clone, commit, push, pull cơ bản.
- **Docker**: chưa biết cũng ổn — Phase 1 dùng Docker chỉ để cài Jenkins, Phase 4 sẽ học sâu.
- **AWS**: không cần — Phase 5 dạy từ đầu.

## Nguyên tắc học

1. **Mỗi bài có hands-on** — đọc xong **phải tự gõ Jenkinsfile, chạy thấy log mới qua bài**. Không gõ sẽ không nhớ.
2. **Đọc log từ đầu đến cuối** — 70% thời gian DevOps là đọc log để debug. Tập thói quen này ngay từ Phase 1.
3. **Hiểu WHY trước HOW** — Vì sao cần exit code? Vì sao có staging? Vì sao deploy bằng container? Hiểu lý do mới linh hoạt áp dụng sang công cụ khác.
4. **Đừng skip phần "tại sao cách kia tệ"** — khoá sẽ chỉ ra cách tệ trước, để bạn cảm được vấn đề mà cách tốt giải quyết.

## Bắt đầu

→ [Phase 1: Jenkins & DevOps căn bản](phase-1-jenkins-va-devops-can-ban/01-jenkins-va-devops.md)
