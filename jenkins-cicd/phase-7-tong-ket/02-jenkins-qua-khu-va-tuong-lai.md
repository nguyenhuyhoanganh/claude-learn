# Bài 2: Quá khứ và tương lai của Jenkins

Jenkins **không phải lựa chọn duy nhất** cho CI/CD. Bài này: lịch sử Jenkins, tại sao platform mới hot hơn (GitHub Actions, GitLab CI), khi nào nên ở lại Jenkins.

## Lịch sử Jenkins

- **2004**: dự án **Hudson** ra mắt — Kohsuke Kawaguchi (Sun Microsystems) viết để tự động hoá build cá nhân.
- **2008**: Hudson trở thành open-source standard, ngày càng phổ biến.
- **2010**: Oracle mua Sun → tranh chấp trademark "Hudson".
- **2011**: Cộng đồng fork → **Jenkins** ra đời. Hudson tiếp tục bởi Oracle nhưng tàn dần.
- **2016**: **Jenkins Pipeline** plugin — Pipeline-as-Code era. Bước ngoặt.
- **2018**: **Jenkins X** — biến thể cloud-native + Kubernetes-first. Không phổ biến lắm.
- **2024**: Jenkins LTS 2.426+, vẫn maintain active.

→ **20+ năm tuổi**. Lâu đời nhất trong category. Triệu installation production toàn cầu.

## Vì sao Jenkins thống trị 1 thập kỷ?

- **Open source** — không lock-in vendor.
- **Self-hosted** — control data 100%.
- **Plugin ecosystem** — 1900+ plugin chính thức.
- **Cloud-agnostic** — chạy mọi nơi.
- **Mature** — battle-tested, mọi edge case đã có người gặp.

→ Đến giờ vẫn là **standard de facto** ở rất nhiều enterprise.

## Vì sao platform mới hot hơn (2020+)?

Tools mới như **GitHub Actions**, **GitLab CI**, **CircleCI**, **Buildkite** lấy điểm tốt của Jenkins + fix điểm yếu:

### 1. Tích hợp Git-native

Jenkins: tách rời Git. Phải config webhook, polling, hoặc click Build Now.

GitHub Actions: Code + CI/CD **cùng platform**. Push code → Action tự trigger. Không config webhook.

```yaml
# .github/workflows/ci.yml — đặt trong repo
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test
```

→ 8 dòng = full CI. Jenkins cần job config + Jenkinsfile + plugin.

### 2. Managed platform = không maintain Jenkins

Jenkins: bạn maintain server, update OS, update Jenkins, update plugin, fix CVE.

GitHub Actions: GitHub maintain hết. Bạn chỉ viết YAML.

→ Phase 2 bài 9 (update Jenkins + plugin) — work eternal mà GitHub Actions không cần.

### 3. Container-native

Jenkins: bolted-on Docker support (cần plugin, args mount socket).

GitHub Actions: chạy trên container tự nhiên. Mỗi job tự chọn runner image.

### 4. Pricing transparent

Jenkins self-host: cost = server + manpower (đắt nhưng ẩn).

GitHub Actions: $/build-minute, easy budget.

GitHub Actions Free tier:
- Repo public: unlimited.
- Repo private: 2000 build-minute/tháng.

→ Đủ cho startup nhỏ.

### 5. UI hiện đại

Jenkins: UI 2010-era, Blue Ocean fix một phần nhưng chưa hoàn hảo.

GitHub/GitLab: clean, mobile-friendly, integrate code review.

### 6. YAML vs Groovy

Jenkins Declarative Pipeline: Groovy (lạ với newcomer).

```groovy
pipeline {
    agent any
    stages {
        stage('Test') {
            steps { sh 'npm test' }
        }
    }
}
```

GitHub Actions: YAML (universal).

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
```

→ YAML dễ đọc, không cần học Groovy.

### 7. Built-in security features

- **Dependency scanning** (Dependabot) — báo CVE deps tự động.
- **Secret scanning** — quét key lộ trong commit.
- **Code scanning** (CodeQL) — SAST trong CI.

Jenkins: cài plugin riêng cho từng cái.

## So sánh tóm tắt

| Aspect              | Jenkins                     | GitHub Actions / GitLab CI       |
|---------------------|------------------------------|----------------------------------|
| Hosting             | Self-hosted (work to maintain) | Managed (zero ops)             |
| Config format       | Groovy (Jenkinsfile)          | YAML                              |
| Git integration     | Need plugin                   | Native                            |
| UI                  | Old-school                    | Modern                            |
| Container native    | Bolted-on                     | Built-in                          |
| Cost                | Server + manpower             | $/minute (predict-able)           |
| Plugin ecosystem    | 1900+ (mọi thứ)               | 100+ (đủ cho 95% need)            |
| Security            | Self-manage                   | Managed (auto-patch)              |
| Best for            | Enterprise legacy, on-prem    | Modern startup, cloud-first      |

## Khi nào vẫn nên dùng Jenkins?

Không phải mọi tổ chức nên migrate. Jenkins hợp lý khi:

### 1. Compliance / Air-gapped

- Data không được rời on-premise (banks, gov).
- GitHub.com không truy cập được → self-host GitLab/Jenkins.

### 2. Legacy investment

- Có 500 Jenkins job production → migrate cost > maintain cost.
- Knowledge team đã thành thạo Jenkins.

### 3. Build agent cực mạnh / cực đặc biệt

- Build C++ trên 64-core, 256GB RAM.
- Cross-compile cho ARM, RISC-V, embedded.
- → GitHub-hosted runner không đủ. Self-host Jenkins agent đáp ứng.

### 4. Multi-cloud / hybrid

- Trigger deploy AWS + Azure + GCP cùng pipeline.
- Jenkins agent đứng giữa, cloud-agnostic.

### 5. Plugin specific cần thiết

- 1 plugin Jenkins không có alternative (vd integrate ERP cổ).

## Jenkins X — phiên bản "cloud-native"

**Jenkins X** ra mắt 2018: rewrite Jenkins cho **Kubernetes** + **GitOps**:

- Pipeline as Code (Tekton).
- Mỗi PR có preview environment tự sinh.
- Auto-promote staging → prod.

→ Concept tốt nhưng **adoption thấp**. Cộng đồng chuyển sang **Argo CD + GitHub Actions** thay vì Jenkins X.

## Quan điểm cá nhân

Sau khi học khoá này, gợi ý:

1. **Hiểu Jenkins** — phỏng vấn nhiều công ty hỏi. Maintain Jenkins legacy là kỹ năng có giá.
2. **Học thêm GitHub Actions** — modern stack, dễ apply ngay project cá nhân.
3. **Hiểu concepts CI/CD** quan trọng hơn công cụ — stage, agent, artifact, trigger, secret... đều giống nhau.

## Migration path

Từ Jenkins → GitHub Actions:

```text
Jenkinsfile                          GitHub Actions
pipeline {                           ──────────────
    agent { docker { image '...' }   on: [push]
    stages {                         jobs:
        stage('Build') {                build:
            steps {                       runs-on: ubuntu-latest
                sh 'npm ci'               container: node:18-alpine
            }                             steps:
        }                                   - uses: actions/checkout@v4
    }                                       - run: npm ci
}
```

→ Concept match 1:1. Nửa ngày học YAML là quen.

## Resource học GitHub Actions / GitLab CI

- **GitHub Actions docs**: <https://docs.github.com/en/actions>
- **GitHub Actions Marketplace**: <https://github.com/marketplace?type=actions>
- **GitLab CI docs**: <https://docs.gitlab.com/ee/ci/>
- **"GitHub Actions in Action"** (Manning) — sách tốt.

## Tóm tắt

- Jenkins ra đời 2004 (Hudson), fork 2011, vẫn maintain.
- Mới hot: **GitHub Actions, GitLab CI** — Git-native, managed, YAML, container-native, security tự động.
- Jenkins vẫn hợp lý cho: legacy investment, compliance, hardware-specific agent, multi-cloud.
- Concept CI/CD (stage, agent, artifact, trigger) **universal** — học Jenkins → chuyển công cụ dễ.
- Nửa ngày học GitHub Actions là quen sau khoá Jenkins này.

---

→ [Bài tiếp theo: Roadmap học tiếp](03-roadmap-tiep-theo.md)
