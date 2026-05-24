# Bài 3: Roadmap học tiếp

Bạn đã hoàn thành khoá Jenkins CI/CD. Bài cuối cùng: gợi ý hướng học tiếp để trở thành DevOps engineer thực thụ.

## Bạn vừa học được gì

Tổng kết toàn khoá:

- **Phase 1**: Jenkins căn bản, pipeline đầu tiên, exit codes, env vars.
- **Phase 2**: Continuous Integration — build, test, E2E parallel, JUnit + HTML reports.
- **Phase 3**: Continuous Deployment — Netlify, secrets, staging, approval, dynamic data.
- **Phase 4**: Docker — Dockerfile, custom build, nightly job.
- **Phase 5**: AWS S3 — IAM, sync deploy.
- **Phase 6**: AWS ECS — ECR, Fargate, container deploy.
- **Phase 7**: Maintenance + tương lai.

→ Đây là **stack DevOps fullstack** cho hầu hết tổ chức tech-modern.

## Roadmap đề xuất theo thứ tự

### Cấp 1: Củng cố nền tảng (1-2 tháng)

**a. Linux command line sâu**

DevOps = 70% Linux. Cần thạo:

- Shell scripting (bash): function, if, loop, regex.
- Tool: `grep`, `awk`, `sed`, `find`, `xargs`, `tee`, `tr`.
- File operations: `tar`, `gzip`, `rsync`.
- Process: `ps`, `top`, `kill`, `nohup`, `systemd`.
- Network: `curl`, `dig`, `nc`, `ss`, `iptables`.

**Resource**:
- "The Linux Command Line" (William Shotts) — free PDF.
- <https://linuxjourney.com>.

**b. Git advanced**

- Rebase, cherry-pick, reset, reflog.
- Conflict resolution chuyên sâu.
- Submodule, hooks.

**Resource**:
- "Pro Git" (Scott Chacon) — free online.

### Cấp 2: CI/CD platforms khác (1 tháng)

Sau Jenkins, học ít nhất 1 platform khác:

- **GitHub Actions** — modern, hot nhất 2024.
- **GitLab CI** — alternative phổ biến.

Concepts giống Jenkins, cú pháp khác. Nửa ngày là quen.

**Resource**:
- GitHub Actions docs.
- "Continuous Delivery with GitHub Actions" — book.

### Cấp 3: Container Orchestration (2-3 tháng)

ECS là entry-level. Bước tiếp theo là **Kubernetes** — industry standard.

- **Kubernetes basics**: pod, deployment, service, configmap, secret, ingress.
- **kubectl** CLI.
- **Helm** — package manager k8s.
- **Argo CD** — GitOps cho k8s.

**Resource**:
- "Kubernetes Up & Running" (Kelsey Hightower).
- <https://kubernetes.io/docs/tutorials/> — official tutorials.
- Free Kubernetes course từ Linux Foundation (edx.org).

### Cấp 4: Infrastructure as Code (2 tháng)

Quản lý cloud bằng code, không click UI:

- **Terraform** — multi-cloud, HCL.
- **Pulumi** — viết bằng TypeScript/Python.
- **AWS CDK** — Python/TypeScript cho AWS.

Provision EC2, RDS, ECS, ALB... bằng code, version control, code review.

**Resource**:
- "Terraform Up & Running" (Yevgeniy Brikman).
- <https://learn.hashicorp.com/terraform>.

### Cấp 5: Cloud provider sâu (3-6 tháng)

Chọn 1 cloud → học chuyên sâu:

**AWS path**:
- **AWS Certified Solutions Architect Associate** — entry cert.
- Service: VPC, ALB, RDS, Lambda, CloudFront, Route 53.

**GCP path**:
- **Google Associate Cloud Engineer** cert.

**Azure path**:
- **Microsoft AZ-104** cert.

→ Cert có giá trị xin việc cao.

### Cấp 6: Monitoring & Observability (1-2 tháng)

Production cần biết "đang chạy ra sao":

- **Metrics**: Prometheus + Grafana.
- **Logs**: ELK stack (Elasticsearch + Logstash + Kibana) hoặc Loki + Grafana.
- **Traces**: Jaeger, OpenTelemetry.
- **Cloud-managed**: AWS CloudWatch, GCP Cloud Monitoring, Datadog, New Relic.

**Resource**:
- "Site Reliability Engineering" (Google) — free.
- "Observability Engineering" (O'Reilly).

### Cấp 7: Security (DevSecOps)

DevOps + Security = **DevSecOps**:

- **Secret management**: HashiCorp Vault, AWS Secrets Manager.
- **SAST**: SonarQube, CodeQL.
- **DAST**: OWASP ZAP.
- **Container scanning**: Trivy, Snyk.
- **Compliance**: SOC 2, ISO 27001, PCI-DSS basics.

### Cấp 8: Site Reliability Engineering

DevOps cao cấp:

- **SLO/SLI/SLA**.
- **Error budgets**.
- **Postmortems** blameless.
- **Chaos engineering** (Chaos Monkey).
- **Capacity planning**.

**Resource**:
- "Seeking SRE" (David Blank-Edelman).
- "The SRE Workbook" (Google).

## Career path

DevOps có nhiều ngạch:

```text
Junior DevOps Engineer
   ↓
DevOps Engineer
   ↓
   ├── Senior DevOps Engineer (deep technical)
   ├── DevOps Architect (system design)
   ├── Site Reliability Engineer (SRE)
   ├── Cloud Engineer / Architect
   ├── Platform Engineer (internal platform for devs)
   ├── Security Engineer (DevSecOps)
   └── Engineering Manager (people leadership)
```

Salary US (2024 ballpark):
- Junior: $60-90k
- Mid: $100-150k
- Senior: $150-200k
- Staff/Principal: $200-350k+

Việt Nam: ~30-70% mức US tương ứng.

## Soft skills DevOps cần

Kỹ thuật không đủ. Cần:

- **Documentation** — viết doc rõ ràng (Markdown, Confluence).
- **Communication** — bridge dev và ops.
- **Incident response** — calm, methodical khi down production.
- **Blameless culture** — học từ incident, không đổ lỗi.
- **Cost awareness** — tối ưu cloud bill.

## Tham gia cộng đồng

- **Reddit**: r/devops, r/sysadmin, r/kubernetes.
- **DevOps Subreddit Discord**.
- **CNCF Slack** — Kubernetes community.
- **AWS re:Invent** (Nov yearly), **KubeCon** (3 lần/năm) — conferences.
- **Local meetups**: Meetup.com search "DevOps".

## Side projects để học

Học qua làm:

1. **Personal blog** trên Hugo/Jekyll + GitHub Actions + S3 + CloudFront.
2. **Side app** Node.js + Docker + ECS + RDS — copy stack khoá học mở rộng.
3. **Home lab** với Raspberry Pi + K3s (Kubernetes nhẹ).
4. **Contribute open source**: tìm dự án DevOps tool trên GitHub, fix bug, gửi PR.

→ Portfolio GitHub thật quan trọng. Recruiter nhìn vào.

## Sách bắt buộc

Top 5 sách DevOps mọi engineer phải đọc:

1. **The Phoenix Project** (Gene Kim) — tiểu thuyết DevOps.
2. **The DevOps Handbook** (Gene Kim et al.).
3. **Site Reliability Engineering** (Google) — free PDF.
4. **Accelerate** (Nicole Forsgren) — research-backed DevOps.
5. **Continuous Delivery** (Jez Humble & David Farley).

Đọc xong = mindset DevOps có nền tảng vững.

## Lời cuối

Khoá học này chỉ là **bước đầu**. DevOps là field rộng + thay đổi nhanh — học mãi không hết. Quan trọng:

1. **Consistent practice** — code mỗi ngày, dù 30 phút.
2. **Build trong production thật** — học labs chỉ scratchsurface, production teach reality.
3. **Document mọi thứ bạn học** — viết blog, Twitter thread, share team. Teaching reinforce learning.
4. **Stay curious** — đừng dừng ở comfort zone.

Cảm ơn bạn đã đi đến cuối khoá. Hy vọng kiến thức ở đây giúp ích cho sự nghiệp.

> **"The best time to plant a tree was 20 years ago. The second best time is now."**

Hôm nay là ngày tốt để bắt đầu next chapter.

Chúc may mắn! 🚀

---

## Quick reference: pipeline cuối khoá

```groovy
pipeline {
    agent any
    environment {
        APP_NAME             = 'learn-jenkins-app'
        AWS_DEFAULT_REGION   = 'us-east-1'
        AWS_DOCKER_REGISTRY  = '<account>.dkr.ecr.us-east-1.amazonaws.com'
        AWS_ECS_CLUSTER      = 'learn-jenkins-app-cluster-prod'
        AWS_ECS_SERVICE_PROD = 'learn-jenkins-app-service-prod'
        AWS_ECS_TD_PROD      = 'learn-jenkins-app-task-definition-prod'
        REACT_APP_VERSION    = "1.0.${BUILD_ID}"
    }
    stages {
        stage('Build') {
            agent { docker { image 'node:18-alpine'; reuseNode true } }
            steps { sh 'npm ci && npm run build' }
        }
        stage('Run Tests') {
            parallel {
                stage('Unit Tests') { ... }
                stage('Local E2E')  { ... }
            }
        }
        stage('Build Docker image') {
            agent { docker { image 'my-aws-cli'; args '-u root -v /var/run/docker.sock:/var/run/docker.sock'; reuseNode true } }
            steps {
                sh 'docker build -t $APP_NAME:$REACT_APP_VERSION .'
            }
        }
        stage('Push & Deploy ECS') {
            agent { docker { image 'my-aws-cli'; args '-u root -v /var/run/docker.sock:/var/run/docker.sock'; reuseNode true } }
            steps {
                withCredentials([usernamePassword(credentialsId: 'my-aws', ...)]) {
                    sh '''
                        # ECR login + push
                        aws ecr get-login-password | docker login --username AWS --password-stdin $AWS_DOCKER_REGISTRY
                        docker tag $APP_NAME:$REACT_APP_VERSION $AWS_DOCKER_REGISTRY/$APP_NAME:$REACT_APP_VERSION
                        docker push $AWS_DOCKER_REGISTRY/$APP_NAME:$REACT_APP_VERSION

                        # ECS deploy
                        sed -i "s/#APP_VERSION#/$REACT_APP_VERSION/g" aws/task-definition-prod.json
                        LATEST_TD_REVISION=$(aws ecs register-task-definition --cli-input-json file://aws/task-definition-prod.json | jq -r '.taskDefinition.revision')
                        aws ecs update-service --cluster $AWS_ECS_CLUSTER --service $AWS_ECS_SERVICE_PROD --task-definition $AWS_ECS_TD_PROD:$LATEST_TD_REVISION
                        aws ecs wait services-stable --cluster $AWS_ECS_CLUSTER --services $AWS_ECS_SERVICE_PROD
                    '''
                }
            }
        }
    }
}
```

→ Đây là **toàn bộ khoá học gói gọn**.

Chúc bạn xa! 🎓
