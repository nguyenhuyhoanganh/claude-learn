# Bài 1: Jenkins basics — CI/CD server quan trọng nhất

Jenkins = **CI/CD server mở open-source phổ biến nhất**. 70%+ tổ chức Java dùng. Master Jenkins = nắm vững job lương cao DevOps.

## Jenkins là gì?

> Jenkins = automation server, chạy **job** (build/test/deploy) khi có trigger (commit, schedule, manual).

Đặc điểm:
- **Open source** (MIT).
- **Plugin ecosystem khổng lồ** (~1800 plugin).
- Self-host (control + customize).
- 2 paradigm: **Freestyle job** (UI), **Pipeline as Code** (Jenkinsfile).

## Setup Jenkins

### Cài đặt

```bash
# Add Jenkins repo
sudo wget -O /etc/yum.repos.d/jenkins.repo https://pkg.jenkins.io/redhat-stable/jenkins.repo
sudo rpm --import https://pkg.jenkins.io/redhat-stable/jenkins.io-2023.key

# Dependencies (Java 17+)
sudo dnf install -y java-17-openjdk

# Install
sudo dnf install -y jenkins

# Start
sudo systemctl enable --now jenkins
```

Default port: **8080**. Initial admin password:

```bash
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
```

Browser: `http://server:8080` → paste password → install suggested plugins → tạo admin user.

## Concepts

### Job/Project

Unit of work. Có 2 loại:
- **Freestyle**: UI config, dễ start, hạn chế.
- **Pipeline**: code Jenkinsfile, mạnh, version control.

### Build

Lần chạy của 1 job. Mỗi build có:
- Build number (#1, #2, ...).
- Status (Success, Failed, Aborted, Unstable).
- Logs.
- Artifacts.

### Workspace

Folder trên agent chứa source code + build output.

### Trigger

Khi nào job chạy:
- **Manual**: click "Build Now".
- **SCM polling**: check Git mỗi N phút.
- **Webhook**: GitHub/GitLab push trigger ngay.
- **Schedule**: cron-like (vd nightly).
- **Upstream**: job khác trigger.

### Plugin

Extend Jenkins. Top plugin DevOps:
- **Git** (built-in).
- **Pipeline** (built-in).
- **Blue Ocean** — modern UI.
- **Docker** — build/push image.
- **Kubernetes** — deploy + run agent.
- **SonarQube Scanner**.
- **Slack Notification**.
- **Credentials Binding** — inject secret.

## Jenkinsfile — pipeline as code

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

**Declarative** (bài này) — `pipeline { ... }` block, structured.
**Scripted** — Groovy free-form, flexible nhưng phức tạp.

Modern Jenkins: declarative chính.

## Anatomy

| Section | Mục đích |
|---|---|
| `agent` | Where to run (any, label, docker, none) |
| `stages` | Logical step (Build, Test, Deploy) |
| `steps` | Action inside stage (sh, git, junit, ...) |
| `when` | Conditional execution |
| `post` | Action after stage/pipeline (always, success, failure, unstable, changed) |
| `environment` | Env variables |
| `tools` | Auto-install tool (Maven, JDK) |
| `parameters` | User input khi trigger |
| `triggers` | Cron, webhook |

## Multi-branch pipeline

Auto detect branch + PR, run pipeline per branch:

1. Create "Multibranch Pipeline" job.
2. Source: GitHub repo.
3. Jenkins scan: tìm `Jenkinsfile` ở mỗi branch.
4. Tự tạo job con cho mỗi branch.

Use case:
- `main` branch → deploy production.
- `dev` branch → deploy staging.
- PR → run test, không deploy.

## Credentials management

Secret (password, SSH key, API token) → **Jenkins Credentials Store**:

UI: Manage Jenkins → Credentials → System → Global → Add.

Loại:
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
        AWS_CREDS = credentials('aws-prod')          // Hai biến: AWS_CREDS_USR, AWS_CREDS_PSW
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

> **Không bao giờ** hardcode credential trong Jenkinsfile.

## Agents — distributed build

Jenkins **master** = controller. Build chạy trên **agent** (slave).

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

Agent provision:
- **Static**: VM cố định, JNLP/SSH connect master.
- **Cloud dynamic**: K8s/AWS provision khi cần, terminate sau build.

Modern recommend: **Kubernetes agents** (Jenkins K8s plugin).

## CI/CD pipeline cho vProfile

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
- Checkout → Build → Test → Quality scan → Quality gate → Publish → Deploy staging → Smoke → Approval → Deploy prod.
- Notify Slack.
- Use credentials managed.
- SSH agent forward.

## Best practices

| Practice | Why |
|---|---|
| Jenkinsfile in repo | Version control config |
| Pipeline as code | Reproducible |
| Multi-branch | Auto detect feature branch |
| Build in container | Reproducible env |
| Cleanup workspace | `cleanWs()` plugin |
| Timeout each stage | Avoid hanging |
| Parallel stages | Speed up |
| Use shared library | DRY across project |
| Backup `/var/lib/jenkins/` | Recovery |
| HA: master active/passive | Avoid SPOF |

## Backup

```bash
# Backup config + jobs
tar -czf jenkins-backup-$(date +%F).tar.gz \
    /var/lib/jenkins/jobs/ \
    /var/lib/jenkins/users/ \
    /var/lib/jenkins/secrets/ \
    /var/lib/jenkins/config.xml \
    /var/lib/jenkins/credentials.xml
```

Hoặc plugin **ThinBackup**.

## Trade-off Jenkins

### Pros
- Free, open source.
- Mature, plugin nhiều nhất.
- Self-host control.
- Active community.

### Cons
- Vận hành phức tạp (plugin update, version conflict).
- UI cũ.
- Configuration sprawl.
- Security: plugin vuln thường xuyên.

### Alternatives modern

| Tool | Pros |
|---|---|
| **GitHub Actions** | Tích hợp GitHub, free tier rộng, YAML đơn giản |
| **GitLab CI** | Tích hợp GitLab, mạnh built-in |
| **CircleCI** | SaaS, fast |
| **Drone** | Lightweight, container-native |
| **Argo CD** | GitOps for K8s |
| **Tekton** | Cloud-native pipeline cho K8s |

Khoá học làm cả Jenkins (section 17) và GitHub Actions (section 18) → so sánh.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Hardcode credential | Lộ secret | Credentials Store |
| Job chạy trên master | Master overload | Agent dedicated |
| Không cleanup workspace | Disk đầy | `cleanWs()` |
| Plugin outdated | Vuln | Auto-update plugin định kỳ |
| Pipeline không in repo | Khó track | Jenkinsfile commit Git |
| Single master | SPOF | HA setup hoặc backup nghiêm túc |
| Slow build | Productivity giảm | Parallel + cache |

## Tóm tắt bài 1

- **Jenkins** = CI/CD server self-host phổ biến nhất.
- **Jenkinsfile** = pipeline as code (declarative recommend).
- 6+ stage typical: Checkout → Build → Test → Sonar → Publish → Deploy.
- **Credentials Store** inject secret an toàn.
- **Multi-branch** auto detect branch + PR.
- **Agent** distribute build — Kubernetes agent là pattern modern.
- Backup `/var/lib/jenkins/` mandatory.
- Alternatives: GitHub Actions, GitLab CI, CircleCI, Drone, Tekton.

**Phase kế tiếp** → [Phase 18 — Bài 1: GitHub Actions](../phase-18-github-actions/01-github-actions.md)
