# Bài 1: Jenkins basics — CI/CD server quan trọng nhất

Jenkins = **CI/CD server open-source phổ biến nhất**. 70%+ tổ chức Java đang dùng. Master Jenkins = nắm vững một skill cốt lõi cho DevOps engineer lương cao.

## Jenkins là gì?

> Jenkins = automation server, chạy các **job** (build / test / deploy) khi có trigger (commit, schedule, manual).

Đặc điểm chính:
- **Open source** (license MIT).
- **Plugin ecosystem khổng lồ** (~1800 plugin).
- Self-host (bạn tự control + customize).
- Hỗ trợ 2 paradigm: **Freestyle job** (qua UI) và **Pipeline as Code** (Jenkinsfile).

## Setup Jenkins

### Cài đặt

```bash
# Thêm Jenkins repo
sudo wget -O /etc/yum.repos.d/jenkins.repo https://pkg.jenkins.io/redhat-stable/jenkins.repo
sudo rpm --import https://pkg.jenkins.io/redhat-stable/jenkins.io-2023.key

# Dependencies (Java 17+)
sudo dnf install -y java-17-openjdk

# Install
sudo dnf install -y jenkins

# Start
sudo systemctl enable --now jenkins
```

Port mặc định: **8080**. Lấy initial admin password:

```bash
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
```

Browser: `http://server:8080` → paste password → install suggested plugin → tạo admin user.

## Các khái niệm cốt lõi

### Job/Project

Đơn vị công việc. Có 2 loại:
- **Freestyle**: config qua UI, dễ bắt đầu nhưng hạn chế.
- **Pipeline**: code Jenkinsfile, mạnh, version control được.

### Build

1 lần chạy của 1 job. Mỗi build có:
- Build number (#1, #2, ...).
- Status (Success, Failed, Aborted, Unstable).
- Logs.
- Artifacts.

### Workspace

Folder trên agent chứa source code + build output.

### Trigger (Khi nào job chạy)

- **Manual**: click "Build Now".
- **SCM polling**: kiểm tra Git mỗi N phút.
- **Webhook**: GitHub/GitLab push → trigger ngay (real-time).
- **Schedule**: cron-like (vd: nightly build).
- **Upstream**: job khác trigger.

### Plugin

Extend chức năng Jenkins. Top plugin cho DevOps:
- **Git** (built-in).
- **Pipeline** (built-in).
- **Blue Ocean** — UI hiện đại.
- **Docker** — build/push image.
- **Kubernetes** — deploy + chạy agent dynamic.
- **SonarQube Scanner**.
- **Slack Notification**.
- **Credentials Binding** — inject secret an toàn.

## Jenkinsfile — Pipeline as code

```groovy
pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                git url: 'https://github.com/acme/vprofile.git', branch: 'main'
            }
        }

        stage('Build') {
            steps {
                sh 'mvn clean package'
            }
        }

        stage('Test') {
            steps {
                sh 'mvn test'
            }
            post {
                always {
                    junit 'target/surefire-reports/*.xml'
                }
            }
        }

        stage('Deploy') {
            when {
                branch 'main'
            }
            steps {
                sh 'scp target/*.war ubuntu@app01:/opt/tomcat/webapps/ROOT.war'
                sh 'ssh ubuntu@app01 "sudo systemctl restart tomcat"'
            }
        }
    }

    post {
        success {
            slackSend channel: '#deploys', color: 'good', message: "✅ Deploy success #${BUILD_NUMBER}"
        }
        failure {
            slackSend channel: '#deploys', color: 'danger', message: "❌ Build failed #${BUILD_NUMBER}"
        }
    }
}
```

### Declarative vs Scripted

**Declarative** (bài này dùng) — block `pipeline { ... }`, có cấu trúc cố định.
**Scripted** — Groovy free-form, linh hoạt nhưng phức tạp hơn.

Jenkins hiện đại: **dùng declarative làm chính**.

## Anatomy của Pipeline (Cấu trúc các section)

| Section | Mục đích |
|---|---|
| `agent` | Chạy ở đâu (any, label, docker, none) |
| `stages` | Các bước logic (Build, Test, Deploy) |
| `steps` | Action trong stage (sh, git, junit, ...) |
| `when` | Điều kiện chạy stage |
| `post` | Action sau stage/pipeline (always, success, failure, unstable, changed) |
| `environment` | Env variables |
| `tools` | Auto-install tool (Maven, JDK) |
| `parameters` | User input khi trigger |
| `triggers` | Cron, webhook |

## Multi-branch pipeline

Tự động detect branch + PR, chạy pipeline riêng cho mỗi branch:

1. Tạo job "Multibranch Pipeline".
2. Source: GitHub repo.
3. Jenkins scan: tìm `Jenkinsfile` ở mỗi branch.
4. Tự tạo sub-job cho mỗi branch.

Use case điển hình:
- `main` branch → deploy production.
- `dev` branch → deploy staging.
- PR → chỉ chạy test, không deploy.

## Credentials management (Quản lý secret)

Secret (password, SSH key, API token) → lưu vào **Jenkins Credentials Store**:

UI: Manage Jenkins → Credentials → System → Global → Add.

Các loại:
- Username/password.
- SSH private key.
- Secret text (API token).
- Certificate.
- Secret file.

Inject vào pipeline:

```groovy
pipeline {
    agent any
    environment {
        AWS_CREDS = credentials('aws-prod')          // Tạo 2 biến: AWS_CREDS_USR, AWS_CREDS_PSW
        SONAR_TOKEN = credentials('sonar-token')      // 1 biến
    }
    stages {
        stage('Build') {
            steps {
                sh 'aws s3 cp build/ s3://bucket/'
                // AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY tự set
            }
        }
    }
}
```

> **Tuyệt đối không** hardcode credential trong Jenkinsfile.

## Agents — Distributed build

Jenkins **master** = controller. Build thực sự chạy trên **agent** (slave).

```text
Master (controller)
    │
    ├── Agent: linux-build-1 (Maven, JDK)
    ├── Agent: linux-build-2
    ├── Agent: docker-build (Docker host)
    └── Agent: windows-build (.NET)
```

Pipeline chỉ định agent:

```groovy
pipeline {
    agent { label 'docker' }
    // ...
}
```

Cách provision agent:
- **Static**: VM cố định, connect master qua JNLP/SSH.
- **Cloud dynamic**: K8s/AWS provision agent khi cần, terminate sau khi build xong.

Modern khuyến nghị: **Kubernetes agent** (qua Jenkins K8s plugin).

## CI/CD pipeline cho vProfile (Production-grade example)

```groovy
pipeline {
    agent any

    tools {
        maven 'Maven-3.9'
        jdk 'JDK-17'
    }

    environment {
        NEXUS_URL = 'http://nexus:8081'
        APP_NAME = 'vprofile'
    }

    stages {
        stage('Checkout') {
            steps {
                git url: 'https://github.com/acme/vprofile.git', branch: 'main'
            }
        }

        stage('Build') {
            steps {
                sh 'mvn clean package -DskipTests'
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

        stage('Code Quality') {
            steps {
                withSonarQubeEnv('SonarCloud') {
                    sh 'mvn sonar:sonar -Dsonar.projectKey=vprofile'
                }
            }
        }

        stage('Quality Gate') {
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('Publish Artifact') {
            steps {
                sh 'mvn deploy -DskipTests'
            }
        }

        stage('Deploy to Staging') {
            steps {
                sshagent(['staging-ssh-key']) {
                    sh '''
                        scp target/vprofile-v2.war ubuntu@staging:/opt/tomcat/webapps/ROOT.war
                        ssh ubuntu@staging "sudo systemctl restart tomcat"
                    '''
                }
            }
        }

        stage('Smoke Test') {
            steps {
                sh 'curl -fs http://staging.acme.com/health'
            }
        }

        stage('Approval') {
            steps {
                timeout(time: 1, unit: 'HOURS') {
                    input message: 'Deploy to production?', ok: 'Deploy'
                }
            }
        }

        stage('Deploy to Production') {
            steps {
                sshagent(['prod-ssh-key']) {
                    sh '''
                        scp target/vprofile-v2.war ubuntu@prod:/opt/tomcat/webapps/ROOT.war
                        ssh ubuntu@prod "sudo systemctl restart tomcat"
                    '''
                }
            }
        }
    }

    post {
        success {
            slackSend channel: '#deploys', color: 'good',
                      message: "✅ Deploy ${env.APP_NAME} #${env.BUILD_NUMBER}"
        }
        failure {
            slackSend channel: '#deploys', color: 'danger',
                      message: "❌ Build failed ${env.APP_NAME} #${env.BUILD_NUMBER}"
        }
    }
}
```

Đây là **pipeline production-grade**:
- Flow: Checkout → Build → Test → Quality scan → Quality gate → Publish → Deploy staging → Smoke test → Approval → Deploy prod.
- Notify Slack.
- Dùng credential managed (không hardcode).
- SSH agent forwarding để deploy.

## Best practices

| Practice | Lý do |
|---|---|
| Jenkinsfile trong repo | Version control config |
| Pipeline as code | Reproducible |
| Multi-branch | Tự động detect feature branch |
| Build trong container | Môi trường reproducible |
| Cleanup workspace | Plugin `cleanWs()` |
| Timeout cho mỗi stage | Tránh hanging |
| Parallel stage | Speed up build |
| Dùng shared library | DRY (Don't Repeat Yourself) qua nhiều project |
| Backup `/var/lib/jenkins/` | Phục hồi khi crash |
| HA: master active/passive | Tránh SPOF |

## Backup

```bash
# Backup config + job
tar -czf jenkins-backup-$(date +%F).tar.gz \
    /var/lib/jenkins/jobs/ \
    /var/lib/jenkins/users/ \
    /var/lib/jenkins/secrets/ \
    /var/lib/jenkins/config.xml \
    /var/lib/jenkins/credentials.xml
```

Hoặc dùng plugin **ThinBackup** (tự động hoá).

## Trade-off của Jenkins

### Pros

- Free, open source.
- Mature, plugin nhiều nhất ngành.
- Self-host = full control.
- Active community.

### Cons

- Vận hành phức tạp (plugin update, version conflict).
- UI cũ.
- Configuration sprawl (config rải rác khó quản).
- Security: plugin có vuln thường xuyên.

### Alternative hiện đại

| Tool | Pros |
|---|---|
| **GitHub Actions** | Tích hợp GitHub, free tier rộng, YAML đơn giản |
| **GitLab CI** | Tích hợp GitLab, built-in mạnh |
| **CircleCI** | SaaS, fast |
| **Drone** | Lightweight, container-native |
| **Argo CD** | GitOps cho K8s |
| **Tekton** | Cloud-native pipeline cho K8s |

Khoá học sẽ làm cả Jenkins (section 17) và GitHub Actions (section 18) → để so sánh.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Hardcode credential trong code | Lộ secret | Dùng Credentials Store |
| Job chạy trên master | Master overload | Dùng agent dedicated |
| Không cleanup workspace | Disk đầy | `cleanWs()` |
| Plugin outdated | Vuln | Auto-update plugin định kỳ |
| Pipeline không lưu in repo | Khó track thay đổi | Commit Jenkinsfile vào Git |
| Single master | SPOF | HA setup hoặc backup nghiêm túc |
| Build chậm | Productivity giảm | Parallel + cache |

## Tóm tắt bài 1

- **Jenkins** = CI/CD server self-host phổ biến nhất.
- **Jenkinsfile** = pipeline as code (khuyến nghị declarative).
- 6+ stage điển hình: Checkout → Build → Test → Sonar → Publish → Deploy.
- **Credentials Store** inject secret an toàn.
- **Multi-branch** tự động detect branch + PR.
- **Agent** distribute build — Kubernetes agent là pattern modern.
- Backup `/var/lib/jenkins/` bắt buộc.
- Alternative: GitHub Actions, GitLab CI, CircleCI, Drone, Tekton.

**Phase kế tiếp** → [Phase 18 — Bài 1: GitHub Actions](../phase-18-github-actions/01-github-actions.md)
