# Decodingdevops

> Lộ trình DevOps đầy đủ — 122 bài, từ Linux tới GitOps trên đa cloud.

Khoá lớn nhất repo. Đi từ nền tảng (SDLC, CI/CD, virtualization, Linux, Git) qua công cụ (Vagrant, Maven, Nexus, Jenkins, GitHub Actions, GitLab), scripting (Bash, Python), IaC (Terraform, Ansible), container (Docker, Kubernetes, Helm, ArgoCD), cloud (AWS lift-and-shift rồi refactor, GCP) và observability. Xuyên suốt là dự án **vProfile** được triển khai lại theo từng cách khác nhau.

**122 bài** trong 30 phần.

## Mục lục

### Phase 1 — devops foundations

| Bài | Nội dung |
|---|---|
| [01](phase-1-devops-foundations/01-devops-la-gi.md) | Bài 1: DevOps là gì? Vấn đề thực sự DevOps giải quyết |
| [02](phase-1-devops-foundations/02-sdlc-waterfall-agile.md) | Bài 2: SDLC — Waterfall, Agile và cuộc cách mạng cách thức làm phần mềm |
| [03](phase-1-devops-foundations/03-continuous-integration.md) | Bài 3: Continuous Integration — đào sâu pipeline tự động đầu tiên |
| [04](phase-1-devops-foundations/04-continuous-delivery-vs-deployment.md) | Bài 4: Continuous Delivery vs Continuous Deployment — đưa code đến tay user |
| [05](phase-1-devops-foundations/05-devops-lifecycle-toolchain.md) | Bài 5: DevOps Lifecycle & Toolchain — bức tranh tổng thể các công cụ ta sẽ học |

### Phase 2 — tools aws setup

| Bài | Nội dung |
|---|---|
| [01](phase-2-tools-aws-setup/01-package-managers.md) | Bài 1: Package Managers — Chocolatey và Homebrew cho dev environment |
| [02](phase-2-tools-aws-setup/02-cai-dat-cong-cu-co-ban.md) | Bài 2: Cài đặt công cụ DevOps cơ bản — VirtualBox, Vagrant, Git, JDK, Maven, AWS CLI |
| [03](phase-2-tools-aws-setup/03-tai-khoan-github-dockerhub-sonar.md) | Bài 3: Tạo tài khoản GitHub, Docker Hub, SonarCloud và (tùy chọn) mua domain |
| [04](phase-2-tools-aws-setup/04-aws-account-iam-mfa.md) | Bài 4: AWS Free Tier — đăng ký, root user, IAM user, MFA bảo mật |
| [05](phase-2-tools-aws-setup/05-aws-billing-ssl.md) | Bài 5: Billing Alarm + SSL Certificate — bảo vệ ví và HTTPS cho domain |

### Phase 3 — virtualization vm

| Bài | Nội dung |
|---|---|
| [01](phase-3-virtualization-vm/01-virtualization-la-gi.md) | Bài 1: Virtualization là gì? Vì sao nó là nền tảng của cloud computing |
| [02](phase-3-virtualization-vm/02-hypervisor-types.md) | Bài 2: Hypervisor Type 1 và Type 2 — đào sâu kiến trúc |
| [03](phase-3-virtualization-vm/03-tao-vm-virtualbox-thu-cong.md) | Bài 3: Tạo VM thủ công với VirtualBox — CentOS và Ubuntu |
| [04](phase-3-virtualization-vm/04-vagrant-tu-dong-hoa-vm.md) | Bài 4: Vagrant — tự động hoá toàn bộ vòng đời VM |
| [05](phase-3-virtualization-vm/05-vm-mac-m1-vmware-fusion.md) | Bài 5: VM trên Mac M1/M2/M3 — VMware Fusion + Vagrant provider |

### Phase 4 — linux

| Bài | Nội dung |
|---|---|
| [01](phase-4-linux/01-linux-nhap-mon.md) | Bài 1: Linux nhập môn — vì sao DevOps engineer phải làm chủ Linux |
| [02](phase-4-linux/02-filesystem-va-shell.md) | Bài 2: Filesystem và lệnh shell cơ bản — pwd, ls, cd, absolute/relative path |
| [03](phase-4-linux/03-quan-ly-file.md) | Bài 3: Quản lý file và thư mục — mkdir, cp, mv, rm, touch, file types |
| [04](phase-4-linux/04-vim-editor.md) | Bài 4: Vim editor — text editor sống còn trên server không GUI |
| [05](phase-4-linux/05-loc-tim-text.md) | Bài 5: Lọc, tìm và xử lý text — grep, cut, sort, awk, sed, find |
| [06](phase-4-linux/06-redirection-pipe.md) | Bài 6: Redirection và Pipe — chuyển output, đọc input, /dev/null |
| [07](phase-4-linux/07-users-permissions-sudo.md) | Bài 7: Users, Groups, Permissions, Sudo — kiểm soát truy cập trong Linux |
| [08](phase-4-linux/08-package-management.md) | Bài 8: Package Management — apt, dnf, rpm, snap |
| [09](phase-4-linux/09-services-processes.md) | Bài 9: Services và Processes — systemd, systemctl, ps, top, kill, signals |
| [10](phase-4-linux/10-archiving-tong-ket.md) | Bài 10: Archiving, network và tổng kết phase Linux |

### Phase 5 — git

| Bài | Nội dung |
|---|---|
| [01](phase-5-git/01-git-la-gi.md) | Bài 1: Git là gì? Version Control System trong DevOps |
| [02](phase-5-git/02-git-co-ban.md) | Bài 2: Git cơ bản — init, add, commit, log, diff |
| [03](phase-5-git/03-branches-merging.md) | Bài 3: Branches và Merging — làm việc song song với nhiều luồng phát triển |
| [04](phase-5-git/04-remote-github.md) | Bài 4: Remote, GitHub, push/pull/fetch và Pull Request workflow |
| [05](phase-5-git/05-rollback-stash.md) | Bài 5: Rollback — reset, revert, restore, stash, reflog |
| [06](phase-5-git/06-ssh-authentication.md) | Bài 6: SSH authentication và Git Credential |
| [07](phase-5-git/07-tags-versioning.md) | Bài 7: Git Tags và Semantic Versioning |

### Phase 6 — vagrant linux servers

| Bài | Nội dung |
|---|---|
| [01](phase-6-vagrant-linux-servers/01-vagrant-nang-cao.md) | Bài 1: Vagrant nâng cao — IP, RAM, CPU và network |
| [02](phase-6-vagrant-linux-servers/02-synced-folder-provisioning.md) | Bài 2: Synced folder và Provisioning — tự động cài app khi VM up |
| [03](phase-6-vagrant-linux-servers/03-website-httpd-centos.md) | Bài 3: Website setup trên CentOS với httpd — server đầu tiên |
| [04](phase-6-vagrant-linux-servers/04-lamp-wordpress-ubuntu.md) | Bài 4: LAMP stack và WordPress trên Ubuntu |
| [05](phase-6-vagrant-linux-servers/05-multi-vm-vagrantfile.md) | Bài 5: Multi-VM Vagrantfile — web + DB cluster trong một file |
| [06](phase-6-vagrant-linux-servers/06-systemctl-tomcat.md) | Bài 6: Custom systemd unit file với Tomcat 10 |

### Phase 7 — variables json yaml

| Bài | Nội dung |
|---|---|
| [01](phase-7-variables-json-yaml/01-variables-data-structures.md) | Bài 1: Variables và Data Structures — ngôn ngữ data của DevOps |
| [02](phase-7-variables-json-yaml/02-json-yaml.md) | Bài 2: JSON và YAML — 2 format dữ liệu nuôi sống cloud-native |

### Phase 8 — vprofile project

| Bài | Nội dung |
|---|---|
| [01](phase-8-vprofile-project/01-vprofile-architecture.md) | Bài 1: vProfile project — kiến trúc multi-tier baseline |
| [02](phase-8-vprofile-project/02-vagrant-multi-vm-setup.md) | Bài 2: Vagrant multi-VM setup cho 5 tier |
| [03](phase-8-vprofile-project/03-mysql-memcache-rabbitmq.md) | Bài 3: Setup MySQL, Memcached, RabbitMQ — data tier |
| [04](phase-8-vprofile-project/04-tomcat-app-deploy.md) | Bài 4: Tomcat setup và deploy vProfile.war |
| [05](phase-8-vprofile-project/05-nginx-load-balancer.md) | Bài 5: nginx reverse proxy và end-to-end validation |
| [06](phase-8-vprofile-project/06-automated-setup.md) | Bài 6: Tự động hoá toàn bộ setup với Vagrant provisioning |

### Phase 9 — networking

| Bài | Nội dung |
|---|---|
| [01](phase-9-networking/01-networking-co-ban.md) | Bài 1: Networking cơ bản — OSI model, TCP/IP, IP address |
| [02](phase-9-networking/02-protocols-ports.md) | Bài 2: Protocols, ports và firewall |
| [03](phase-9-networking/03-networking-commands.md) | Bài 3: Networking commands và troubleshooting |

### Phase 10 — containers

| Bài | Nội dung |
|---|---|
| [01](phase-10-containers/01-containers-la-gi.md) | Bài 1: Containers là gì? Khác biệt với VM |
| [02](phase-10-containers/02-docker-la-gi.md) | Bài 2: Docker overview — engine, image, registry |
| [03](phase-10-containers/03-docker-hands-on.md) | Bài 3: Hands-on Docker — chạy thực tế các container |
| [04](phase-10-containers/04-microservices-intro.md) | Bài 4: Microservices — kiến trúc cho scale lớn |

### Phase 11 — bash scripting

| Bài | Nội dung |
|---|---|
| [01](phase-11-bash-scripting/01-bash-intro.md) | Bài 1: Bash scripting — automation cấp 1 của DevOps |
| [02](phase-11-bash-scripting/02-variables-quotes.md) | Bài 2: Variables, quotes và command substitution |
| [03](phase-11-bash-scripting/03-args-decision.md) | Bài 3: Command-line arguments và decision making |
| [04](phase-11-bash-scripting/04-loops-functions.md) | Bài 4: Loops và functions |
| [05](phase-11-bash-scripting/05-remote-ssh.md) | Bài 5: Remote execution với SSH — automate nhiều server |

### Phase 12 — ai scripting

| Bài | Nội dung |
|---|---|
| [01](phase-12-ai-scripting/01-ai-cho-devops.md) | Bài 1: AI cho DevOps — Copilot, ChatGPT, Claude trong workflow |

### Phase 13 — aws part1

| Bài | Nội dung |
|---|---|
| [01](phase-13-aws-part1/01-aws-overview.md) | Bài 1: AWS overview — kiến trúc cloud và service map |
| [02](phase-13-aws-part1/02-iam-ec2-vpc.md) | Bài 2: IAM, EC2, VPC — 3 service nền tảng |
| [03](phase-13-aws-part1/03-s3-rds.md) | Bài 3: S3, RDS — storage và database AWS |

### Phase 14 — aws lift shift

| Bài | Nội dung |
|---|---|
| [01](phase-14-aws-lift-shift/01-aws-lift-shift.md) | Bài 1: Lift & Shift — vProfile lên AWS với EC2 |
| [02](phase-14-aws-lift-shift/02-vpc-network-setup.md) | Bài 2: VPC + subnet + security group — network foundation |
| [03](phase-14-aws-lift-shift/03-ec2-launch-vprofile.md) | Bài 3: Launch EC2 cho 5 service vProfile |
| [04](phase-14-aws-lift-shift/04-alb-target-group.md) | Bài 4: ALB + Target Group + Route 53 + HTTPS |
| [05](phase-14-aws-lift-shift/05-asg-cleanup.md) | Bài 5: Auto Scaling Group + monitor + cleanup |

### Phase 15 — aws refactor

| Bài | Nội dung |
|---|---|
| [01](phase-15-aws-refactor/01-aws-refactor.md) | Bài 1: Refactor vProfile với AWS managed services |
| [02](phase-15-aws-refactor/02-rds-migration.md) | Bài 2: Migration MariaDB EC2 → RDS Multi-AZ |
| [03](phase-15-aws-refactor/03-elasticache-mq-cloudfront.md) | Bài 3: ElastiCache + Amazon MQ + S3 CloudFront |
| [04](phase-15-aws-refactor/04-migration-checklist.md) | Bài 4: Migration checklist + monitoring + total architecture |

### Phase 16 — build tools

| Bài | Nội dung |
|---|---|
| [01](phase-16-build-tools/01-build-tools.md) | Bài 1: Build tools — Maven, Gradle và Nexus |
| [02](phase-16-build-tools/02-maven-deep.md) | Bài 2: Maven deep-dive — POM, dependency, plugin, lifecycle |
| [03](phase-16-build-tools/03-nexus-repo.md) | Bài 3: Nexus Repository Manager — artifact repo cho DevOps |

### Phase 17 — jenkins

| Bài | Nội dung |
|---|---|
| [01](phase-17-jenkins/01-jenkins-basics.md) | Bài 1: Jenkins basics — CI/CD server quan trọng nhất |
| [02](phase-17-jenkins/02-jenkins-installation-setup.md) | Bài 2: Jenkins installation và setup từ A-Z |
| [03](phase-17-jenkins/03-declarative-pipeline.md) | Bài 3: Declarative Pipeline syntax đầy đủ |
| [04](phase-17-jenkins/04-vprofile-cicd-pipeline.md) | Bài 4: vProfile CI/CD pipeline đầy đủ end-to-end |
| [05](phase-17-jenkins/05-shared-library.md) | Bài 5: Shared Library — DRY code cho nhiều pipeline |
| [06](phase-17-jenkins/06-jenkins-best-practices.md) | Bài 6: Jenkins best practices — security, scaling, observability |

### Phase 18 — github actions

| Bài | Nội dung |
|---|---|
| [01](phase-18-github-actions/01-github-actions.md) | Bài 1: GitHub Actions — CI/CD tích hợp GitHub |
| [02](phase-18-github-actions/02-workflow-advanced.md) | Bài 2: Workflow nâng cao — reusable, composite, matrix, environments |
| [03](phase-18-github-actions/03-vprofile-actions.md) | Bài 3: vProfile CI/CD với GitHub Actions |

### Phase 19 — gitlab

| Bài | Nội dung |
|---|---|
| [01](phase-19-gitlab/01-gitlab-overview.md) | Bài 1: GitLab — all-in-one DevOps platform |
| [02](phase-19-gitlab/02-gitlab-pipeline.md) | Bài 2: GitLab CI/CD pipeline — vProfile end-to-end |

### Phase 20 — python

| Bài | Nội dung |
|---|---|
| [01](phase-20-python/01-python-cho-devops.md) | Bài 1: Python cho DevOps — automation cấp 2 |
| [02](phase-20-python/02-python-syntax.md) | Bài 2: Python syntax đầy đủ cho DevOps |
| [03](phase-20-python/03-python-automation.md) | Bài 3: Python automation — subprocess, requests, boto3, parallel |
| [04](phase-20-python/04-cli-packaging.md) | Bài 4: CLI tool + packaging + testing — Python production-grade |

### Phase 21 — terraform

| Bài | Nội dung |
|---|---|
| [01](phase-21-terraform/01-terraform-basics.md) | Bài 1: Terraform — Infrastructure as Code (IaC) |
| [02](phase-21-terraform/02-terraform-state-backend.md) | Bài 2: Terraform state, backend, locking, workspaces |
| [03](phase-21-terraform/03-terraform-modules.md) | Bài 3: Terraform Modules — reusable infrastructure components |
| [04](phase-21-terraform/04-terraform-cicd.md) | Bài 4: CI/CD cho Terraform, Atlantis, security scan, best practices |

### Phase 22 — ansible

| Bài | Nội dung |
|---|---|
| [01](phase-22-ansible/01-ansible-basics.md) | Bài 1: Ansible — configuration management agentless |
| [02](phase-22-ansible/02-ansible-playbook-deep.md) | Bài 2: Ansible playbook deep — modules, handlers, conditionals, loops |
| [03](phase-22-ansible/03-ansible-roles.md) | Bài 3: Ansible Roles, Galaxy, và collection |
| [04](phase-22-ansible/04-ansible-advanced.md) | Bài 4: Ansible Vault, dynamic inventory, AWX/Tower |

### Phase 23 — monitoring

| Bài | Nội dung |
|---|---|
| [01](phase-23-monitoring/01-monitoring-basics.md) | Bài 1: Monitoring và Observability — Prometheus, Grafana, ELK |
| [02](phase-23-monitoring/02-prometheus-grafana-deep.md) | Bài 2: Prometheus + Grafana deep — setup production |
| [03](phase-23-monitoring/03-loki-elk-tracing.md) | Bài 3: Logs (Loki/ELK) + Distributed tracing (Jaeger) |

### Phase 24 — aws part2

| Bài | Nội dung |
|---|---|
| [01](phase-24-aws-part2/01-aws-advanced.md) | Bài 1: AWS Part 2 — Service nâng cao |
| [02](phase-24-aws-part2/02-aws-serverless.md) | Bài 2: AWS Serverless — Lambda, API Gateway, Step Functions, EventBridge |
| [03](phase-24-aws-part2/03-aws-ecs-eks.md) | Bài 3: ECS, EKS, CloudFront, Route 53 advanced |
| [04](phase-24-aws-part2/04-aws-ssm-secrets.md) | Bài 4: Systems Manager, Secrets Manager, Organizations, Governance |

### Phase 25 — aws cicd

| Bài | Nội dung |
|---|---|
| [01](phase-25-aws-cicd/01-aws-cicd.md) | Bài 1: AWS CI/CD project — Pipeline end-to-end trên AWS |
| [02](phase-25-aws-cicd/02-codebuild-codedeploy.md) | Bài 2: CodeBuild + CodeDeploy chi tiết |
| [03](phase-25-aws-cicd/03-github-aws-oidc.md) | Bài 3: GitHub Actions + AWS OIDC — Phương án hiện đại |

### Phase 26 — gcp

| Bài | Nội dung |
|---|---|
| [01](phase-26-gcp/01-gcp-overview.md) | Bài 1: GCP overview và multi-cloud strategy |
| [02](phase-26-gcp/02-gcp-services.md) | Bài 2: GCP services deep — Compute Engine, GKE, Cloud SQL, IAM |

### Phase 27 — docker

| Bài | Nội dung |
|---|---|
| [01](phase-27-docker/01-docker-deep.md) | Bài 1: Docker deep-dive — Dockerfile production-grade |
| [02](phase-27-docker/02-docker-compose-deep.md) | Bài 2: Docker Compose deep — networking, volumes, profiles |
| [03](phase-27-docker/03-docker-swarm-buildx.md) | Bài 3: Docker Swarm, Buildx, security scanning |

### Phase 28 — containerization

| Bài | Nội dung |
|---|---|
| [01](phase-28-containerization/01-containerization.md) | Bài 1: Containerization — Docker Compose cho vProfile |
| [02](phase-28-containerization/02-vprofile-dockerize.md) | Bài 2: Containerize vProfile từng service end-to-end |
| [03](phase-28-containerization/03-registry-supply-chain.md) | Bài 3: Container registry, image lifecycle, supply chain security |

### Phase 29 — kubernetes

| Bài | Nội dung |
|---|---|
| [01](phase-29-kubernetes/01-k8s-basics.md) | Bài 1: Kubernetes — Kiến trúc và các object cốt lõi |
| [02](phase-29-kubernetes/02-k8s-workload-types.md) | Bài 2: Kubernetes workload types deep — Deployment, StatefulSet, DaemonSet, Job |
| [03](phase-29-kubernetes/03-services-ingress-network.md) | Bài 3: Services, Ingress, Network Policy |
| [04](phase-29-kubernetes/04-config-secret-rbac.md) | Bài 4: ConfigMap, Secret, RBAC, Pod Security |

### Phase 30 — app on k8s

| Bài | Nội dung |
|---|---|
| [01](phase-30-app-on-k8s/01-deploy-vprofile-k8s.md) | Bài 1: Deploy vProfile lên Kubernetes — kiến trúc và manifest |
| [02](phase-30-app-on-k8s/02-helm-chart.md) | Bài 2: Helm chart cho vProfile — package manager K8s |
| [03](phase-30-app-on-k8s/03-argocd-observability.md) | Bài 3: GitOps với ArgoCD + observability cho Kubernetes |

## Nên bắt đầu từ đâu

| Bạn đang ở tình huống | Đọc từ |
|---|---|
| Mới vào DevOps | phase-1 → phase-7 tuần tự, đừng nhảy cóc |
| Đã biết Linux/Git, cần công cụ | phase-16 (build) → phase-17 (Jenkins) → phase-21 (Terraform) |
| Tập trung AWS | phase-13 → phase-14 → phase-15 → phase-24 → phase-25 |
| Tập trung Kubernetes | phase-29 → phase-30 |

---

*Mục lục này sinh từ cấu trúc thư mục và tiêu đề thật của từng bài. Thêm bài mới thì cập nhật lại bảng tương ứng.*
