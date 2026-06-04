# Bài 6: Jenkins best practices — security, scaling, observability

Bài cuối của phase 17. Tổng hợp các **best practice cho Jenkins production** + các **giải pháp thay thế** khi đến lúc rời Jenkins.

## Security checklist (Bảo mật)

### Authentication (Xác thực)

- [ ] **Disable anonymous read** — không cho phép user vô danh xem job.
- [ ] Tích hợp LDAP / SAML / OAuth (không dùng tài khoản local riêng lẻ).
- [ ] **MFA** (Multi-Factor Authentication — xác thực 2 lớp) cho admin user — qua reverse proxy hoặc plugin.
- [ ] **Service account** riêng cho các integration CI (Slack, Jira, Email, ...).

### Authorization (Phân quyền)

- [ ] **Role-based authorization** (phân quyền theo vai trò) — dùng RBAC plugin.
- [ ] Phân quyền theo từng folder/project.
- [ ] Build user identity propagate (lan truyền danh tính user qua build) — Build User Vars plugin.
- [ ] Hạn chế `script` step — bắt buộc sandboxed Groovy (chạy trong môi trường cô lập).

```groovy
// Block tag: chỉ cho phép method an toàn
@Library('shared-lib@main') _
// Sandbox ngăn code malicious trong pipeline
```

### Credentials (Thông tin nhạy cảm)

- [ ] **Luôn dùng Credentials Store**, không bao giờ inline trong pipeline.
- [ ] **Mask password** trong log (plugin `maskPasswords`).
- [ ] Lưu external secret store: Vault, AWS Secrets Manager.
- [ ] **Rotate credential** mỗi 90 ngày.

```groovy
withCredentials([usernamePassword(credentialsId: 'nexus', usernameVariable: 'USER', passwordVariable: 'PASS')]) {
    sh 'mvn deploy -Dnexus.user=$USER -Dnexus.pass=$PASS'
}
```

### Plugin

- [ ] Auto-update plugin định kỳ.
- [ ] Theo dõi security advisory (cảnh báo bảo mật) — jenkins.io/security.
- [ ] Xoá plugin không dùng đến.
- [ ] Test việc upgrade plugin trên môi trường staging trước.

### Network (Mạng)

- [ ] **HTTPS bắt buộc** — đặt reverse proxy (nginx) phía trước Jenkins.
- [ ] Đặt Jenkins phía sau VPN / SSO gateway (Pomerium, Cloudflare Access).
- [ ] Restrict agent connection — firewall rule chỉ cho agent kết nối từ IP cụ thể.
- [ ] Disable JNLP nếu không dùng.

### Audit (Ghi nhật ký kiểm tra)

- [ ] Audit log mọi action — dùng Audit Trail plugin.
- [ ] Forward log → SIEM (Security Information Event Management) như Splunk, ELK.
- [ ] Alert (cảnh báo) khi:
  - Failed login attempts (đăng nhập sai liên tục).
  - Plugin install (cài plugin mới).
  - Credential changes (thay đổi credential).
  - Pipeline modify (sửa pipeline).

## Scaling (Mở rộng quy mô)

### Master capacity (Dung lượng master)

Master Jenkins chỉ làm orchestrator (điều phối). **Tránh build trực tiếp trên master** — sẽ ảnh hưởng đến performance toàn hệ thống.

```text
Master config khuyến nghị:
- Number of executors: 0 (không cho build chạy trên master)
- Java heap: -Xmx2g cho < 500 job
- -Xmx4g cho 500-2000 job
- -Xmx8g cho > 2000 job
```

### Static agents (Agent cố định)

| Workload | Số agent |
|---|---|
| < 50 build/day | 2-3 agent |
| 50-500 build/day | 5-10 agent |
| > 500 build/day | Nên dùng K8s dynamic agent |

Static agent trên EC2 → đặt trong Auto Scaling Group:

```bash
# Launch template với agent.jar + auto-connect
# ASG: min 2, max 10, target tracking CPU 70%
```

### Kubernetes dynamic agents (Modern best practice)

Đây là best practice hiện đại nhất — agent được tạo và xoá tự động theo nhu cầu:

```yaml
# casc.yaml
clouds:
  - kubernetes:
      name: k8s
      serverUrl: https://kubernetes.default
      namespace: jenkins
      jenkinsUrl: http://jenkins.jenkins.svc:8080
      maxRequestsPerHost: 100
      retentionTimeout: 5
      templates:
        - name: maven-builder
          label: maven
          instanceCap: 50          # Tối đa 50 pod song song
          idleMinutes: 1
          ...
```

Cơ chế: Job chờ trong queue → Jenkins spawn pod trên K8s → chạy xong → pod tự terminate sau 1 phút idle (không hoạt động).

→ Scale gần như không giới hạn, không phải trả cost cho agent idle.

### Job throttling (Giới hạn job đồng thời)

```groovy
options {
    throttle(['deploy-prod'])      // Tối đa 1 build chạy cùng lúc với tag này
}
```

Dùng plugin Throttle Concurrent Builds. Hữu ích cho job critical như deploy production — tránh 2 deploy đồng thời gây race condition.

### Pipeline performance (Tối ưu pipeline)

Các kỹ thuật tăng tốc:

- **Cache dependency**: dùng PersistentVolumeClaim (PVC) cho `~/.m2`, `node_modules`.
- **Parallel stages** — chạy song song nhiều stage độc lập.
- **Skip stages** với `when` conditional — bỏ qua stage không cần.
- **Shallow clone**: `git fetch --depth 1` — chỉ clone commit cuối cùng.
- **Layer Docker cache** — tận dụng cache layer Docker giữa các build.

```groovy
checkout([$class: 'GitSCM',
    extensions: [[$class: 'CloneOption', depth: 1, shallow: true]]
])
```

## Observability (Quan sát hệ thống)

### Prometheus metrics

Plugin "Prometheus metrics" expose endpoint cho Prometheus scrape:

```text
GET /prometheus/

# HELP jenkins_executor_count_value
jenkins_executor_count_value 50
jenkins_queue_size_value{type="buildable"} 3
jenkins_builds_duration_milliseconds{jobName="vprofile"} 245000
```

Prometheus scrape metric → đẩy lên Grafana dashboard hiển thị:
- Build duration trend (xu hướng thời gian build).
- Queue size (kích thước queue chờ).
- Executor utilization (tỉ lệ sử dụng executor).
- Plugin update available.

### Log aggregation (Gom log)

Jenkins ghi log ở:
- `/var/log/jenkins/jenkins.log` — log chính của Jenkins.
- `/var/lib/jenkins/jobs/<job>/builds/<n>/log` — log của từng build.

Forward log → ELK (Elasticsearch + Logstash + Kibana):

```bash
# Filebeat config
filebeat.inputs:
  - type: log
    paths:
      - /var/log/jenkins/*.log
      - /var/lib/jenkins/jobs/*/builds/*/log
    fields:
      service: jenkins
```

Query trong Kibana để phát hiện pattern lỗi của các build fail.

### Health check (Kiểm tra trạng thái)

```bash
# Lấy JSON status từ Jenkins API
curl -u user:token http://jenkins.acme.com/api/json?tree=jobs[name,color]

# Hoặc dùng built-in health endpoint
curl http://jenkins.acme.com/login
# Trả về 200 = Jenkins khoẻ
```

Setup uptime monitor: Pingdom, UptimeRobot, hoặc internal monitoring.

## Backup & Disaster Recovery (Sao lưu và phục hồi sự cố)

### Backup strategy (Chiến lược sao lưu)

**Quy tắc 3-2-1** kinh điển:
- **3** bản copy data.
- **2** loại media lưu trữ khác nhau.
- **1** bản đặt offsite (ở vị trí địa lý khác).

```text
Daily backup:
  ├── Local /var/backup (giữ 7 ngày)
  ├── S3 (giữ 90 ngày, lifecycle chuyển sang Glacier sau 30 ngày)
  └── Cross-region S3 (giữ 90 ngày — cho disaster recovery)
```

### What to backup (Sao lưu cái gì)

**Critical (bắt buộc):**
- `/var/lib/jenkins/config.xml`
- `/var/lib/jenkins/jobs/*/config.xml`
- `/var/lib/jenkins/users/`
- `/var/lib/jenkins/secrets/`
- `/var/lib/jenkins/credentials.xml`

**Skip (có thể bỏ qua):**
- `/var/lib/jenkins/workspace/` (workspace tạm, có thể tạo lại).
- `/var/lib/jenkins/jobs/*/builds/` (log build cũ, tuỳ chọn giữ).
- `/var/lib/jenkins/caches/`.

### Disaster Recovery test (Diễn tập phục hồi)

Thực hiện **mỗi quý**:
1. Spin up Jenkins instance mới từ backup.
2. Verify mọi job có thể restore được.
3. Verify credential decrypt được (do encryption key có thể bị mất).
4. Đo restore time → đây chính là RTO (Recovery Time Objective).

## Job DSL — Tạo job bằng code

Plugin "Job DSL" cho phép viết Groovy script để tạo job programmatically:

```groovy
// jobs.groovy
job('vprofile-build') {
    description('Build vProfile from main')
    scm {
        git {
            remote {
                url('git@github.com:acme/vprofile.git')
                credentials('github-ssh')
            }
            branch('main')
        }
    }
    triggers {
        scm('H/5 * * * *')
    }
    steps {
        maven('clean package', 'pom.xml')
    }
    publishers {
        archiveJunit('target/surefire-reports/*.xml')
        archiveArtifacts('target/*.war')
        slackNotifier {
            room('#ci')
            notifyFailure(true)
        }
    }
}

// Tạo 5 job tương tự bằng loop
['api', 'web', 'mobile', 'admin', 'worker'].each { name ->
    job("vprofile-${name}") {
        // ... template
    }
}
```

Cách dùng DSL job:
- Tạo "seed job" với bước "Process Job DSLs".
- Chạy seed job → tự động create/update tất cả job theo script.
- DSL script lưu trong Git → version control đầy đủ.

→ Khi cần thêm/sửa nhiều job, chỉ sửa code rồi chạy seed job.

## Folder organization (Tổ chức folder)

```text
Jenkins/
├── vprofile/                  ← Folder cho product vProfile
│   ├── build (Pipeline)
│   ├── deploy (Pipeline)
│   └── nightly (Pipeline)
├── shared-services/           ← Folder cho service dùng chung
│   ├── infra-update (Pipeline)
│   └── backup-rotate (Pipeline)
└── seed/                      ← Folder cho seed job
    └── job-dsl-seed (Freestyle)
```

Folder vừa là namespace (không gian tên), vừa là phạm vi permission — phân quyền team theo folder.

## Khi nào nên rời Jenkins (Alternatives)

| Lý do | Lựa chọn thay thế |
|---|---|
| Mệt với quản lý plugin | **GitHub Actions** (SaaS — không cần tự host) |
| Đang dùng GitLab | **GitLab CI/CD** (tích hợp sẵn) |
| Hệ thống K8s-native | **Tekton**, **Argo Workflows** |
| Theo hướng GitOps | **Argo CD**, **Flux** |
| Cloud-native AWS | **CodePipeline + CodeBuild** |
| Cần UI hiện đại | **CircleCI**, **Buildkite** |

### Migration strategy (Chiến lược chuyển đổi)

1. **Audit** mọi pipeline hiện có.
2. **Convert** 1-2 pipeline đơn giản → tool mới.
3. Chạy **song song** 1-3 tháng (parallel — Jenkins + tool mới).
4. **Migrate** các pipeline critical.
5. **Decommission** (ngừng sử dụng) Jenkins.

→ Không bao giờ migrate "big bang" — chia thành nhiều giai đoạn, mỗi giai đoạn có rollback path.

## So sánh các CI/CD tool

| | Jenkins | GitHub Actions | GitLab CI | Tekton |
|---|---|---|---|---|
| Self-host | ✓ | Enterprise | ✓ | ✓ |
| SaaS | ✗ | ✓ | ✓ | ✗ |
| Plugin | 1800+ | 20000+ actions | Less | Tasks |
| Pipeline language | Groovy | YAML | YAML | YAML |
| K8s-native | Via plugin | Không | Hạn chế | **Có** |
| Learning curve | Steep (khó) | Easy | Easy | Steep |
| Modern UI | Cũ (Blue Ocean đẹp hơn) | Hiện đại | Hiện đại | Chủ yếu CLI |
| Free tier | Free (self-host) | 2000 phút | 400 phút | Free (self-host) |
| Phù hợp cho | Legacy, phức tạp | Modern, dùng GitHub | Dùng GitLab | Cloud-native |

## Pipeline maturity model (Mô hình trưởng thành CI/CD)

| Level | Đặc điểm |
|---|---|
| **0** | Không có CI/CD. Deploy thủ công. |
| **1** | CI: build + test mỗi commit. Deploy thủ công. |
| **2** | CI/CD: auto-deploy đến staging. Prod vẫn thủ công. |
| **3** | Continuous Delivery: 1-click deploy prod. |
| **4** | Continuous Deployment: auto deploy prod khi build green. |
| **5** | GitOps: declarative deploy + observability đầy đủ. |

Sau khi học xong Phase 17 + 25 → bạn đang ở level 4. Tiến lên Argo CD/GitOps → level 5.

## Final checklist (Danh sách kiểm tra cuối cùng)

Jenkins production phải có:

- [ ] HTTPS + reverse proxy.
- [ ] Configuration as Code (JCasC).
- [ ] Plugin auto-update.
- [ ] LDAP/SAML authentication.
- [ ] RBAC (Role-Based Access Control).
- [ ] Credentials Store (không bao giờ inline).
- [ ] Audit log đầy đủ.
- [ ] Backup hàng ngày + S3.
- [ ] DR test mỗi quý.
- [ ] K8s dynamic agents.
- [ ] Prometheus metrics.
- [ ] Log → ELK.
- [ ] Multi-branch pipeline.
- [ ] Pipeline ở trong repo (không trong Jenkins UI).
- [ ] Shared library.
- [ ] Quality gate (Sonar).
- [ ] Security scan (Trivy, OWASP).
- [ ] Notification (Slack/email).
- [ ] Deploy strategy (Blue/Green, Canary).
- [ ] Smoke test sau deploy.
- [ ] Approval cho deploy prod.

## Tổng kết phase 17

6 bài đã cover:
1. Jenkins basics — kiến trúc, các loại job.
2. Installation + JCasC + agent setup.
3. Declarative Pipeline syntax.
4. vProfile CI/CD end-to-end.
5. Shared Library (code dùng chung).
6. Best practice + alternative.

Kỹ năng đạt được:
- Setup Jenkins production-grade từ đầu.
- Viết pipeline cho mọi tech stack.
- Tổ chức code dùng chung qua shared library.
- Security hardening (làm cứng bảo mật).
- Migration path khi cần đổi tool.

## Tóm tắt bài 6

- **Security**: HTTPS, RBAC, Credentials Store, audit log, plugin update đều đặn.
- **Scaling**: K8s dynamic agents là best practice hiện đại, Auto Scaling Group cho static agent, throttle cho job nhạy cảm.
- **Observability**: Prometheus + Grafana + ELK cho monitoring toàn diện.
- **Backup 3-2-1** + DR test mỗi quý.
- **Job DSL** để programmatic job creation.
- **Folder** tổ chức kiêm phân quyền.
- **Alternatives**: GitHub Actions, GitLab CI, Tekton tuỳ context.
- Mục tiêu pipeline maturity: level 4-5 (Continuous Deployment + GitOps).

**Phase kế tiếp** → [Phase 18 — GitHub Actions](../phase-18-github-actions/01-github-actions.md)
