# Bài 5: DevOps Lifecycle & Toolchain — bức tranh tổng thể các công cụ ta sẽ học

Bốn bài đầu phase này giải thích **vì sao** và **cái gì**. Bài này gắn tên **tool cụ thể** vào từng mảnh của bức tranh — giống bản đồ kho báu cho hành trình 30 section còn lại.

## Vòng đời DevOps — 8 giai đoạn

DevOps thường được vẽ thành **hình vô cực (∞)** vì là vòng lặp liên tục:

```text
       Plan ──► Code ──► Build ──► Test
        ▲                              │
        │                              ▼
   Monitor ◄── Operate ◄── Deploy ◄── Release
```

Mỗi giai đoạn có một họ công cụ riêng.

## Mapping giai đoạn → tool ta sẽ học

### 1. Plan — lên kế hoạch và quản lý task

| Tool | Vai trò |
|---|---|
| **Jira** | Quản lý sprint, backlog, ticket |
| **Trello, Asana, Linear** | Project management nhẹ |
| **Confluence, Notion** | Tài liệu kỹ thuật |
| **Miro, Lucidchart** | Diagram, architecture |

Trong khoá này: nhắc đến nguyên tắc, không deep-dive (vì là kỹ năng PM, không phải kỹ năng kỹ thuật).

### 2. Code — viết, lưu, version

| Tool | Vai trò |
|---|---|
| **Git** | Phiên bản code (sẽ học sâu phase Git) |
| **GitHub** | Hosting + collaboration (PR, review) |
| **GitLab** | Tương tự GitHub + CI tích hợp (học phase GitLab) |
| **Bitbucket** | Của Atlassian, tích hợp Jira |
| **VS Code, IntelliJ, Vim** | Editor / IDE |

Khoá này: học **Git CLI sâu**, GitHub + GitLab cơ bản.

### 3. Build — compile, package

| Ngôn ngữ | Build tool |
|---|---|
| Java | **Maven** (học sâu), Gradle |
| .NET | MSBuild, dotnet CLI |
| JS/TS | npm, yarn, webpack, vite |
| Python | pip, poetry, setuptools |
| Go | `go build` |
| Multi-language | Bazel, Buck |

Khoá này: học Maven sâu vì dự án mẫu (vProfile) viết bằng Java.

### 4. Test — kiểm tra chất lượng

| Loại test | Tool |
|---|---|
| Unit test (Java) | **JUnit, Mockito** |
| Unit test (JS) | Jest, Vitest |
| Unit test (Python) | pytest |
| Integration / E2E | Selenium, Cypress, Playwright |
| Load test | JMeter, k6, Gatling |
| Security | OWASP ZAP, Burp Suite |
| Static analysis | **SonarQube** (học) |

Khoá này: tích hợp JUnit + SonarQube vào pipeline.

### 5. Release / Build server / CI

| Tool | Đặc điểm |
|---|---|
| **Jenkins** | Học sâu — server CI mạnh, plugin nhiều |
| **GitHub Actions** | Học vừa — modern, YAML, tích hợp GitHub |
| **GitLab CI/CD** | Học vừa — tích hợp GitLab |
| **CircleCI, Travis** | SaaS — chỉ nhắc khái niệm |
| **Tekton, Argo Workflow** | Cloud-native, dùng K8s |

Khoá này: 3 tool CI/CD chính → đa dạng để bạn chọn ở công ty.

### 6. Deploy / Configure / Provision

#### 6a. Configuration Management — cài/cấu hình server

| Tool | Đặc điểm |
|---|---|
| **Ansible** | Học sâu — agentless, YAML, phổ biến nhất |
| Puppet | Của Puppet Labs, declarative |
| Chef | Của Progress, Ruby DSL |
| SaltStack | Event-driven |

#### 6b. Infrastructure as Code — tạo infra trên cloud

| Tool | Đặc điểm |
|---|---|
| **Terraform** | Học sâu — đa cloud, declarative HCL |
| Pulumi | Code thật (TS, Go, Python) thay HCL |
| CloudFormation | Chỉ AWS, YAML |
| ARM/Bicep | Chỉ Azure |
| OpenTofu | Fork Terraform sau khi Hashicorp đổi license |

#### 6c. Containers

| Tool | Vai trò |
|---|---|
| **Docker** | Học sâu — đóng gói app thành container |
| Podman | Thay thế Docker không cần daemon |
| Buildah, Buildkit | Build image hiệu năng cao |
| **Kubernetes** | Học sâu — orchestrator standard |
| EKS, GKE, AKS | Managed K8s trên AWS/GCP/Azure |
| ECS, Cloud Run, ACI | Container service khác |

### 7. Operate — vận hành cluster, app

| Tool | Vai trò |
|---|---|
| **Linux** | Học sâu phase 4 — nền tảng mọi server |
| **systemd** | Quản lý service trên Linux |
| nginx, Apache | Web server / reverse proxy |
| HAProxy | Load balancer |
| **AWS, GCP** | Cloud provider — học sâu |

### 8. Monitor — quan sát hệ thống

| Loại | Tool |
|---|---|
| Metric | **Prometheus**, **Grafana** (học) |
| Log | ELK Stack (Elasticsearch + Logstash + Kibana), Loki |
| Tracing | Jaeger, Tempo, Zipkin |
| APM | New Relic, Datadog, AppDynamics |
| Alerting | Alertmanager, PagerDuty, Opsgenie |

## Tool stack hoàn chỉnh sẽ build trong khoá

Khi học xong khoá này, bạn sẽ tự tay build pipeline với stack sau:

```text
                 ┌─────────────────────────┐
                 │      Developer          │
                 │      (Linux/Mac)        │
                 └──────────┬──────────────┘
                            │ git push
                            ▼
                 ┌─────────────────────────┐
                 │      GitHub             │
                 │      (source)           │
                 └──────────┬──────────────┘
                            │ webhook
                            ▼
                 ┌─────────────────────────┐
                 │      Jenkins            │
                 │  (build / test / scan)  │
                 └────┬───────┬────────┬───┘
                      │       │        │
                      ▼       ▼        ▼
              ┌─────────┐ ┌────────┐ ┌──────────┐
              │ Maven   │ │ JUnit  │ │ SonarQube│
              │ build   │ │ test   │ │ scan     │
              └────┬────┘ └────────┘ └──────────┘
                   │ artifact
                   ▼
              ┌──────────┐
              │  Nexus   │ (artifact repo)
              └────┬─────┘
                   │
                   ▼
              ┌──────────┐
              │  Docker  │ build image
              └────┬─────┘
                   │
                   ▼
              ┌─────────┐
              │  ECR    │ (image registry on AWS)
              └────┬────┘
                   │
                   ▼
        ┌────────────────────────┐
        │  Ansible / Terraform   │ provision + configure
        └─────────┬──────────────┘
                  │
                  ▼
        ┌────────────────────────┐
        │  AWS (EC2 / EKS / RDS) │
        └─────────┬──────────────┘
                  │ deploy
                  ▼
        ┌────────────────────────┐
        │      Kubernetes        │ orchestrate
        └─────────┬──────────────┘
                  │
                  ▼
        ┌────────────────────────┐
        │   App running          │
        │   (vProfile)           │
        └─────────┬──────────────┘
                  │ metric/log
                  ▼
        ┌────────────────────────┐
        │ Prometheus + Grafana   │ monitor
        └────────────────────────┘
```

Toàn bộ pipeline này **tự chạy** từ commit đến production. Đây là mục tiêu cuối khoá.

## Bản đồ 30 section → mục tiêu

| Section | Chủ đề | Kỹ năng tích lũy |
|---|---|---|
| 01 | DevOps concepts | Tư duy |
| 02 | Tool setup | Môi trường |
| 03 | VM setup | Lab |
| 04 | **Linux** | Nền tảng OS |
| 05 | **Git** | Version control |
| 06 | Vagrant, Linux servers | Multi-node lab |
| 07 | Variables, JSON, YAML | Data format |
| 08 | vProfile project | Dự án mẫu xuyên suốt |
| 09 | Networking | TCP/IP, DNS, HTTP |
| 10 | Containers intro | Docker khái niệm |
| 11 | **Bash scripting** | Tự động hoá cấp 1 |
| 12 | AI for scripting | LLM hỗ trợ scripting |
| 13 | **AWS Part 1** | IAM, EC2, VPC, S3 |
| 14 | AWS lift & shift | Migrate VM lên cloud |
| 15 | AWS re-architect | PaaS/SaaS pattern |
| 16 | Build tools | Maven, Gradle |
| 17 | **Jenkins** | CI/CD chính |
| 18 | **GitHub Actions** | CI/CD modern |
| 19 | GitLab | CI/CD tích hợp |
| 20 | **Python** | Tự động hoá cấp 2 |
| 21 | **Terraform** | IaC |
| 22 | **Ansible** | Configuration management |
| 23 | Monitoring | Prometheus, Grafana |
| 24 | AWS Part 2 | Advanced AWS |
| 25 | AWS CI/CD project | End-to-end AWS |
| 26 | GCP project | Đa cloud |
| 27 | **Docker** | Container sâu |
| 28 | Containerization | App → container |
| 29 | **Kubernetes** | Orchestration |
| 30 | App on K8s | Project cuối |

**Đậm** = section có deep-dive nhiều file. Còn lại trải đều.

## Văn hoá DevOps cần kèm theo tool

Học tool dễ. Áp dụng đúng văn hoá khó hơn. Khi vào team mới, để ý:

| Dấu hiệu DevOps **đúng** | Dấu hiệu DevOps **sai** (cosplay) |
|---|---|
| Dev biết app chạy ở đâu, monitor ở đâu | "Cứ deploy là việc của Ops" |
| On-call rotation chung, không riêng Ops | Chỉ Ops on-call, Dev đi ngủ |
| Post-mortem không đổ lỗi | "Lỗi tại thằng X commit" |
| Pipeline as code, mọi người sửa được | Chỉ 1 người biết Jenkins config |
| Test trước khi commit | "Để CI test giúp" — không tự test |
| Doc kèm code, không hơi tách rời | Wiki riêng, lỗi thời sau 1 tháng |
| Mọi deploy có rollback | "Hi vọng không lỗi" |

## Career path DevOps

Sau khi học xong khoá này, bạn có thể đi nhiều hướng:

```text
                  ┌─ DevOps Engineer (chung)
                  │   ├─ Platform Engineer (chuyên xây internal platform)
                  │   ├─ SRE (Site Reliability Engineer — chuyên ổn định prod)
                  │   ├─ Cloud Engineer (chuyên AWS/GCP/Azure)
                  │   └─ Build/Release Engineer (chuyên pipeline)
Backend Dev + DevOps skills
                  │
                  ├─ Security Engineer (DevSecOps)
                  │
                  ├─ Data Engineer (DataOps)
                  │
                  └─ MLOps Engineer (ML model pipeline)
```

Lương DevOps trên thị trường thường **cao hơn 20-40%** so với dev cùng level vì cầu lớn hơn cung.

## Lộ trình học sau khoá này

Để tiếp tục, các kiến thức ngoài khoá:

- **Service mesh**: Istio, Linkerd
- **Policy as Code**: OPA, Gatekeeper
- **Secrets management**: HashiCorp Vault, AWS Secrets Manager
- **Cost optimization**: FinOps, AWS Cost Explorer
- **Chaos engineering**: Chaos Monkey, Litmus
- **Internal Developer Platform**: Backstage
- **eBPF observability**: Cilium, Pixie
- **GitOps**: ArgoCD, Flux

## Câu hỏi gợi ý để tự kiểm tra cuối phase 1

Trước khi sang phase 2, đảm bảo trả lời được:

1. Tại sao Agile sinh ra nhu cầu DevOps?
2. CI khác gì với việc "git push lên GitHub"?
3. Continuous Delivery khác Continuous Deployment ở đâu?
4. 4 DORA metrics là gì?
5. 5 chiến lược deployment (Recreate, Rolling, Blue-Green, Canary, A/B) — khi nào dùng cái nào?
6. Tại sao cần feature flag?
7. Khi nào KHÔNG nên áp dụng DevOps?

Nếu chưa rõ, đọc lại bài tương ứng trong phase này.

## Tóm tắt bài 5

- DevOps lifecycle = 8 giai đoạn (Plan, Code, Build, Test, Release, Deploy, Operate, Monitor) lặp như vòng vô cực.
- Mỗi giai đoạn có **một họ công cụ riêng** — khoá này dạy các tool **phổ biến nhất ngành**.
- Stack hoàn chỉnh sẽ build: GitHub → Jenkins → Maven/JUnit/Sonar → Nexus → Docker → ECR → Ansible/Terraform → AWS → K8s → Prometheus/Grafana.
- Tool chỉ là một nửa — văn hoá (on-call chung, post-mortem không đổ lỗi, pipeline as code) là nửa còn lại.
- Career path DevOps rộng: Platform, SRE, Cloud, Security, MLOps...

**Bài kế tiếp** → [Phase 2 — Bài 1: Package Managers — Chocolatey và Homebrew cho dev environment](../phase-2-tools-aws-setup/01-package-managers.md)
