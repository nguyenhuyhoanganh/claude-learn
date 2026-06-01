# Bài 2: Jenkins installation và setup từ A-Z

Bài 1 đã overview Jenkins. Bài này thực hành **cài đặt Jenkins production-grade** + cấu hình plugin + agent + security.

## Setup Jenkins server

### Launch EC2

```bash
aws ec2 run-instances \
    --image-id $AMI_ID \
    --instance-type t3.medium \
    --key-name vprofile-key \
    --subnet-id $PUB_SUBNET \
    --security-group-ids $JENKINS_SG \
    --user-data file://jenkins-install.sh \
    --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=30,VolumeType=gp3}' \
    --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=jenkins-master}]'
```

`t3.medium` (4 GB RAM) là minimum cho Jenkins master. Build agent nên tách riêng (không build trên master).

### Script user data `jenkins-install.sh`

```bash
#!/bin/bash
set -e

dnf update -y

# Java 17 (Jenkins LTS 2.426+ bắt buộc Java 17)
dnf install -y java-17-openjdk java-17-openjdk-devel

# Thêm repo Jenkins
wget -O /etc/yum.repos.d/jenkins.repo \
    https://pkg.jenkins.io/redhat-stable/jenkins.repo
rpm --import https://pkg.jenkins.io/redhat-stable/jenkins.io-2023.key

# Cài đặt
dnf install -y jenkins

# Tinh chỉnh JVM
sed -i 's|^Environment="JAVA_OPTS=.*|Environment="JAVA_OPTS=-Djava.awt.headless=true -Xms1g -Xmx2g"|' \
    /lib/systemd/system/jenkins.service

systemctl daemon-reload
systemctl enable --now jenkins
```

### Lần đầu login

```bash
# Lấy initial admin password
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
```

Truy cập browser `http://<jenkins-ip>:8080`:
1. Paste initial password.
2. **Install suggested plugins** (Git, Pipeline, ...).
3. Tạo admin user.
4. Cấu hình URL.

## Reverse proxy nginx + HTTPS

Jenkins chạy ở port 8080 → expose qua nginx :443 với cert HTTPS:

```bash
dnf install -y nginx

cat > /etc/nginx/conf.d/jenkins.conf <<'EOF'
upstream jenkins {
    server 127.0.0.1:8080;
    keepalive 32;
}

server {
    listen 80;
    server_name jenkins.acme.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name jenkins.acme.com;

    ssl_certificate /etc/letsencrypt/live/jenkins.acme.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/jenkins.acme.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://jenkins;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_redirect off;
        proxy_buffering off;
        proxy_http_version 1.1;

        # Hỗ trợ CLI websocket
        proxy_set_header Connection "upgrade";
        proxy_set_header Upgrade $http_upgrade;
    }
}
EOF

# Cert với Let's Encrypt
dnf install -y certbot python3-certbot-nginx
certbot --nginx -d jenkins.acme.com --non-interactive --agree-tos -m admin@acme.com

systemctl reload nginx
```

Cập nhật Jenkins URL: Manage Jenkins → System → Jenkins URL = `https://jenkins.acme.com/`.

## Configuration as Code (JCasC) — Cấu hình bằng code

Jenkins config thường được click chuột → khó reproduce. **JCasC** cho phép cấu hình bằng file YAML, version control được:

```bash
# Cài plugin "configuration-as-code"
```

File `/var/lib/jenkins/casc.yaml`:

```yaml
jenkins:
  systemMessage: "Jenkins for vProfile production"
  numExecutors: 0          # Không build trên master
  scmCheckoutRetryCount: 3

  authorizationStrategy:
    roleBased:
      roles:
        global:
          - name: "admin"
            permissions:
              - "Overall/Administer"
            assignments:
              - "alice"
              - "bob"
          - name: "developer"
            permissions:
              - "Job/Build"
              - "Job/Read"
              - "Job/Workspace"
              - "Overall/Read"
            assignments:
              - "authenticated"

  securityRealm:
    ldap:
      configurations:
        - server: "ldap://ldap.acme.com:389"
          rootDN: "dc=acme,dc=com"
          managerDN: "cn=jenkins,ou=services,dc=acme,dc=com"
          managerPasswordSecret: "${LDAP_PASSWORD}"

  clouds:
    - kubernetes:
        name: "k8s"
        serverUrl: "https://kubernetes.default"
        namespace: "jenkins"
        templates:
          - name: "maven-builder"
            label: "maven"
            containers:
              - name: "maven"
                image: "maven:3.9-eclipse-temurin-17"
                command: "sleep"
                args: "9999999"

tool:
  jdk:
    installations:
      - name: "JDK-17"
        home: "/usr/lib/jvm/java-17-openjdk"
  maven:
    installations:
      - name: "Maven-3.9"
        properties:
          - installSource:
              installers:
                - maven:
                    id: "3.9.6"

unclassified:
  location:
    url: "https://jenkins.acme.com/"
    adminAddress: "admin@acme.com"
  slackNotifier:
    teamDomain: "acme"
    tokenCredentialId: "slack-token"

credentials:
  system:
    domainCredentials:
      - credentials:
          - usernamePassword:
              scope: GLOBAL
              id: "nexus"
              username: "jenkins"
              password: "${NEXUS_PASSWORD}"
              description: "Nexus credentials"
          - string:
              scope: GLOBAL
              id: "sonar-token"
              secret: "${SONAR_TOKEN}"
              description: "SonarCloud"
```

Mount casc.yaml + env file → Jenkins tự động apply khi start.

Export config hiện tại để track:

```bash
# Browser: Manage Jenkins → Configuration as Code → Download
```

Commit `casc.yaml` lên Git → version control toàn bộ Jenkins config.

## Plugin management

Các plugin DevOps must-install (bắt buộc):

| Plugin | Mục đích |
|---|---|
| **Pipeline** | Declarative pipeline (built-in) |
| **Blue Ocean** | UI pipeline hiện đại |
| **Git** | SCM (built-in) |
| **GitHub** | Tích hợp GitHub |
| **GitHub Branch Source** | Multi-branch pipeline |
| **Docker** | Docker build/push |
| **Kubernetes** | K8s agent + deploy |
| **Pipeline Maven** | Tích hợp Maven |
| **Pipeline Utility Steps** | readJSON, readYaml, ... |
| **Credentials Binding** | Inject secret vào pipeline |
| **AnsiColor** | Output terminal có màu |
| **Build Timeout** | Tự kill build chạy quá lâu |
| **Workspace Cleanup** | Cleanup khi build xong |
| **Email Extension** | Email notification có rich content |
| **Slack Notification** | Tích hợp Slack |
| **SonarQube Scanner** | Phân tích code với Sonar |
| **JUnit** | Báo cáo test (built-in) |
| **HTML Publisher** | Custom HTML report |
| **Build Discarder** | Cleanup build cũ |
| **OWASP Dependency-Check** | Quét lỗ hổng |
| **Configuration as Code** | YAML config (JCasC) |
| **Role-based Authorization** | RBAC |
| **Job DSL** | Tạo job bằng code |
| **Build User Vars** | Variable `BUILD_USER` trong pipeline |

Cài qua UI: Manage Jenkins → Plugins → Available → check → Install without restart.

Cài qua CLI:

```bash
# Lấy Jenkins CLI jar
wget http://jenkins.acme.com/jnlpJars/jenkins-cli.jar

# Cài plugin
java -jar jenkins-cli.jar -s https://jenkins.acme.com -auth admin:token \
    install-plugin docker-workflow:1.28
```

## Build agents (Máy build)

### Static agent on EC2 (Agent cố định)

EC2 chạy Java + Jenkins agent JAR:

```bash
# Trên EC2 agent
dnf install -y java-17-openjdk git maven docker

# Tạo jenkins user
useradd -m -s /bin/bash jenkins
usermod -aG docker jenkins
mkdir -p /home/jenkins/agent
chown -R jenkins:jenkins /home/jenkins

# Lấy agent.jar
wget http://jenkins.acme.com/jnlpJars/agent.jar -O /home/jenkins/agent.jar
```

Master: Manage Jenkins → Nodes → New Node:
- Name: `build-agent-01`.
- Permanent agent.
- Remote root directory: `/home/jenkins/agent`.
- Labels: `linux maven docker`.
- Launch method: **Launch agent by connecting it to the controller** (JNLP).
- Availability: Always.

Lấy secret token → copy command → chạy trên agent:

```bash
sudo -u jenkins java -jar /home/jenkins/agent.jar \
    -url https://jenkins.acme.com \
    -secret abc123 \
    -name build-agent-01 \
    -workDir /home/jenkins/agent
```

Tạo systemd unit để agent chạy persistent (tự restart khi crash):

```ini
# /etc/systemd/system/jenkins-agent.service
[Unit]
Description=Jenkins Agent
After=network.target

[Service]
Type=simple
User=jenkins
ExecStart=/usr/bin/java -jar /home/jenkins/agent.jar \
    -url https://jenkins.acme.com \
    -secret abc123 \
    -name build-agent-01 \
    -workDir /home/jenkins/agent
Restart=always

[Install]
WantedBy=multi-user.target
```

### Kubernetes agent (dynamic — best practice hiện đại)

Cách tiếp cận khuyến nghị: agent ephemeral (tạm thời) chạy trong K8s pod, tự tạo và tự huỷ.

```yaml
# casc.yaml — section clouds
clouds:
  - kubernetes:
      name: k8s
      serverUrl: https://kubernetes.default
      namespace: jenkins
      templates:
        - name: maven-builder
          label: maven
          containers:
            - name: maven
              image: maven:3.9-eclipse-temurin-17
              command: sleep
              args: 9999999
              resourceRequestCpu: 500m
              resourceRequestMemory: 1Gi
              resourceLimitMemory: 2Gi
            - name: docker
              image: docker:24-cli
              command: sleep
              args: 9999999
          volumes:
            - hostPathVolume:
                hostPath: /var/run/docker.sock
                mountPath: /var/run/docker.sock
```

Pipeline sử dụng:

```groovy
pipeline {
    agent {
        label 'maven'
    }
    stages {
        stage('Build') {
            steps {
                container('maven') {
                    sh 'mvn package'
                }
                container('docker') {
                    sh 'docker build -t app .'
                }
            }
        }
    }
}
```

Mỗi build → spawn pod mới → tự terminate sau khi xong. **Zero ops** (không cần vận hành thủ công), **scale infinite** (không giới hạn).

### Spot agent on AWS

EC2 Fleet plugin + Spot instance → tiết kiệm 70% so với on-demand.

Master định nghĩa template → Jenkins tự provision spot khi queue có job → tự terminate khi idle.

## Backup strategy

Toàn bộ state Jenkins lưu ở `/var/lib/jenkins/`:
- `config.xml` — config master.
- `jobs/` — định nghĩa job + lịch sử build.
- `users/` — tài khoản user.
- `secrets/` — credential đã encrypt.
- `plugins/` — plugin đã cài.

### Thin Backup plugin

Manage Jenkins → Plugin → Install "Thin Backup":

Cấu hình: Manage Jenkins → ThinBackup → Configuration:
- Backup directory: `/var/backup/jenkins`.
- Full backup schedule: `H 2 * * *` (mỗi ngày 2h sáng).
- Differential: `H * * * *` (mỗi giờ).
- Max stored backups: 7.

### Manual backup script

```bash
#!/bin/bash
# /usr/local/bin/jenkins-backup.sh
set -e

DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/var/backup/jenkins"
S3_BUCKET="s3://acme-backups/jenkins"

mkdir -p $BACKUP_DIR

# Loại trừ workspace + cache
tar -czf $BACKUP_DIR/jenkins-$DATE.tar.gz \
    --exclude='workspace' \
    --exclude='caches' \
    --exclude='logs' \
    -C /var/lib jenkins

# Upload lên S3
aws s3 cp $BACKUP_DIR/jenkins-$DATE.tar.gz $S3_BUCKET/

# Giữ 30 ngày local, 90 ngày trên S3
find $BACKUP_DIR -name 'jenkins-*.tar.gz' -mtime +30 -delete
aws s3 ls $S3_BUCKET/ | awk '{print $4}' | sort | head -n -90 | \
    xargs -I {} aws s3 rm $S3_BUCKET/{}

echo "Backup complete: jenkins-$DATE.tar.gz"
```

```bash
chmod +x /usr/local/bin/jenkins-backup.sh

# Cron hàng ngày 2h sáng
echo "0 2 * * * /usr/local/bin/jenkins-backup.sh" | crontab -
```

### Restore (Phục hồi)

```bash
systemctl stop jenkins
rm -rf /var/lib/jenkins
tar -xzf jenkins-backup.tar.gz -C /var/lib/
chown -R jenkins:jenkins /var/lib/jenkins
systemctl start jenkins
```

## Security hardening

### Disable Jenkins CLI nếu không dùng

`JENKINS_OPTS="--httpListenAddress=127.0.0.1"` → chỉ accept kết nối local + qua reverse proxy.

### CSRF protection

Mặc định đã bật. Manage Jenkins → Security → "Prevent Cross Site Request Forgery exploits" — giữ on.

### CSP cho plugin

```bash
# /etc/sysconfig/jenkins hoặc systemd override
JAVA_OPTS="-Dhudson.model.DirectoryBrowserSupport.CSP=\"sandbox; default-src 'self'; ...\""
```

### Audit log

Plugin `Audit Trail`:
- Log mọi action vào file.
- Forward đến ELK/Splunk để phân tích.

### Block plugin known unsafe

Manage Jenkins → Plugin → kiểm tra security advisory. Update hoặc remove plugin có lỗ hổng.

### Update Jenkins định kỳ

LTS release ra mỗi quý. Security patch ra mỗi 2-4 tuần.

```bash
dnf update -y jenkins
systemctl restart jenkins
```

## Monitor Jenkins

### Built-in metrics

Manage Jenkins → System Information → xem JVM metric, executor utilization, ...

### Prometheus export

Plugin "Prometheus metrics":
- Endpoint `/prometheus/`.
- Scrape bằng Prometheus.
- Có sẵn dashboard cho Grafana.

### Alert khi queue bị stuck (kẹt)

Queue dài = bottleneck (nút thắt cổ chai). Alarm khi queue > 10:

```promql
jenkins_queue_size_value{type="buildable"} > 10
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Build trên master | OOM master crash | Build trên agent, set master executor = 0 |
| Plugin outdated | Vuln + pipeline broken | Auto-update + monitor |
| Disk Jenkins đầy | Build fail | Workspace cleanup + log rotation |
| Static agent thành SPOF | Build queue kẹt | Chuyển sang K8s dynamic agent |
| Config click chuột | Không reproduce được | Dùng Configuration as Code |
| Credential trong Jenkinsfile | Lộ secret | Dùng Credentials Store + binding |
| Plugin install không test | Crash production | Test trên Jenkins staging trước |
| Không backup | Mất config khi crash | Daily backup + sync lên S3 |

## Tóm tắt bài 2

- Jenkins master EC2 t3.medium + Java 17 + JVM tune Xmx 2g.
- **Nginx reverse proxy** + Let's Encrypt cert cho HTTPS.
- **Configuration as Code** (JCasC) → cấu hình bằng YAML → version control.
- 20+ plugin DevOps must-have.
- **Kubernetes agent dynamic** = best practice hiện đại.
- **Thin Backup** plugin + sync S3 hàng ngày.
- Security: CSRF on, audit log, update LTS định kỳ.
- Export Prometheus metric cho monitoring.

**Bài kế tiếp** → [Bài 3: Declarative Pipeline syntax đầy đủ](03-declarative-pipeline.md)
