# Bài 2: Jenkins installation và setup từ A-Z

Bài 1 overview. Bài này **install Jenkins production-grade** + configure plugin + agent + security.

## Setup Jenkins server

### EC2 launch

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

`t3.medium` (4 GB RAM) minimum cho Jenkins master. Build agents = separate.

### `jenkins-install.sh` user data

```bash
#!/bin/bash
set -e

dnf update -y

# Java 17 (Jenkins LTS 2.426+ require)
dnf install -y java-17-openjdk java-17-openjdk-devel

# Jenkins repo
wget -O /etc/yum.repos.d/jenkins.repo \
    https://pkg.jenkins.io/redhat-stable/jenkins.repo
rpm --import https://pkg.jenkins.io/redhat-stable/jenkins.io-2023.key

# Install
dnf install -y jenkins

# Configure JVM
sed -i 's|^Environment="JAVA_OPTS=.*|Environment="JAVA_OPTS=-Djava.awt.headless=true -Xms1g -Xmx2g"|' \
    /lib/systemd/system/jenkins.service

systemctl daemon-reload
systemctl enable --now jenkins
```

### First login

```bash
# Get initial admin password
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
```

Browser `http://<jenkins-ip>:8080`:
1. Paste initial password.
2. **Install suggested plugins** (Git, Pipeline, ...).
3. Create admin user.
4. URL config.

## Reverse proxy nginx + HTTPS

Jenkins port 8080 → nginx :443 với cert:

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

        # CLI websocket
        proxy_set_header Connection "upgrade";
        proxy_set_header Upgrade $http_upgrade;
    }
}
EOF

# Cert with Let's Encrypt
dnf install -y certbot python3-certbot-nginx
certbot --nginx -d jenkins.acme.com --non-interactive --agree-tos -m admin@acme.com

systemctl reload nginx
```

Update Jenkins URL: Manage Jenkins → System → Jenkins URL = `https://jenkins.acme.com/`.

## Configuration as Code (JCasC)

Jenkins config thường click chuột → khó reproduce. **JCasC** = YAML config:

```bash
# Install plugin "configuration-as-code"
```

`/var/lib/jenkins/casc.yaml`:

```yaml
jenkins:
  systemMessage: "Jenkins for vProfile production"
  numExecutors: 0          # No build on master
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

Mount casc.yaml + env file → Jenkins auto-apply.

Export current config:

```bash
# Browser: Manage Jenkins → Configuration as Code → Download
```

Commit `casc.yaml` lên Git → version control config.

## Plugin management

Top plugin DevOps must install:

| Plugin | Mục đích |
|---|---|
| **Pipeline** | Declarative pipeline (built-in) |
| **Blue Ocean** | Modern pipeline UI |
| **Git** | SCM (built-in) |
| **GitHub** | GitHub integration |
| **GitHub Branch Source** | Multi-branch pipeline |
| **Docker** | Docker build/push |
| **Kubernetes** | K8s agents + deploy |
| **Pipeline Maven** | Maven integration |
| **Pipeline Utility Steps** | readJSON, readYaml, ... |
| **Credentials Binding** | Inject secret |
| **AnsiColor** | Color terminal output |
| **Build Timeout** | Auto-kill long build |
| **Workspace Cleanup** | Cleanup khi end |
| **Email Extension** | Rich email notification |
| **Slack Notification** | Slack integration |
| **SonarQube Scanner** | Sonar analysis |
| **JUnit** | Test report (built-in) |
| **HTML Publisher** | Custom HTML report |
| **Build Discarder** | Old build cleanup |
| **OWASP Dependency-Check** | Vuln scan |
| **Configuration as Code** | YAML config |
| **Role-based Authorization** | RBAC |
| **Job DSL** | Programmatic job creation |
| **Build User Vars** | Variable `BUILD_USER` |

Install: Manage Jenkins → Plugins → Available → check → Install without restart.

CLI install:

```bash
# Jenkins CLI jar
wget http://jenkins.acme.com/jnlpJars/jenkins-cli.jar

# Install plugin
java -jar jenkins-cli.jar -s https://jenkins.acme.com -auth admin:token \
    install-plugin docker-workflow:1.28
```

## Build agents

### Static agent on EC2

EC2 chạy Java + Jenkins agent JAR:

```bash
# Trên EC2 agent
dnf install -y java-17-openjdk git maven docker

# Add jenkins user
useradd -m -s /bin/bash jenkins
usermod -aG docker jenkins
mkdir -p /home/jenkins/agent
chown -R jenkins:jenkins /home/jenkins

# Get agent jar
wget http://jenkins.acme.com/jnlpJars/agent.jar -O /home/jenkins/agent.jar
```

Master: Manage Jenkins → Nodes → New Node:
- Name: `build-agent-01`.
- Permanent agent.
- Remote root directory: `/home/jenkins/agent`.
- Labels: `linux maven docker`.
- Launch method: **Launch agent by connecting it to the controller** (JNLP).
- Availability: Always.

Get secret token → copy command → run trên agent:

```bash
sudo -u jenkins java -jar /home/jenkins/agent.jar \
    -url https://jenkins.acme.com \
    -secret abc123 \
    -name build-agent-01 \
    -workDir /home/jenkins/agent
```

Tạo systemd unit để agent persistent:

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

### Kubernetes agent (dynamic)

Recommended modern approach: ephemeral agent in K8s pod.

```yaml
# casc.yaml clouds section
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

Pipeline:

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

Mỗi build → spawn pod mới → terminate sau xong. Zero ops, scale infinite.

### Spot agent on AWS

EC2 Fleet plugin + Spot instance → save 70%.

Master define template → Jenkins auto-provision spot khi queue có job → terminate khi idle.

## Backup strategy

Jenkins state ở `/var/lib/jenkins/`:
- `config.xml` — master config.
- `jobs/` — job definition + build history.
- `users/` — user account.
- `secrets/` — encrypted credential.
- `plugins/` — installed plugins.

### Thin Backup plugin

Manage Jenkins → Plugin → Install "Thin Backup":

Config: Manage Jenkins → ThinBackup → Configuration:
- Backup directory: `/var/backup/jenkins`.
- Full backup schedule: `H 2 * * *` (daily 2am).
- Differential: `H * * * *` (hourly).
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

# Exclude workspace + cache
tar -czf $BACKUP_DIR/jenkins-$DATE.tar.gz \
    --exclude='workspace' \
    --exclude='caches' \
    --exclude='logs' \
    -C /var/lib jenkins

# Upload S3
aws s3 cp $BACKUP_DIR/jenkins-$DATE.tar.gz $S3_BUCKET/

# Retention 30d local, 90d S3
find $BACKUP_DIR -name 'jenkins-*.tar.gz' -mtime +30 -delete
aws s3 ls $S3_BUCKET/ | awk '{print $4}' | sort | head -n -90 | \
    xargs -I {} aws s3 rm $S3_BUCKET/{}

echo "Backup complete: jenkins-$DATE.tar.gz"
```

```bash
chmod +x /usr/local/bin/jenkins-backup.sh

# Cron daily 2am
echo "0 2 * * * /usr/local/bin/jenkins-backup.sh" | crontab -
```

### Restore

```bash
systemctl stop jenkins
rm -rf /var/lib/jenkins
tar -xzf jenkins-backup.tar.gz -C /var/lib/
chown -R jenkins:jenkins /var/lib/jenkins
systemctl start jenkins
```

## Security hardening

### Disable Jenkins CLI nếu không cần

`JENKINS_OPTS="--httpListenAddress=127.0.0.1"` → chỉ accept local + reverse proxy.

### CSRF protection

Default enabled. Manage Jenkins → Security → "Prevent Cross Site Request Forgery exploits" — keep on.

### CSP for plugin

```bash
# /etc/sysconfig/jenkins or systemd override
JAVA_OPTS="-Dhudson.model.DirectoryBrowserSupport.CSP=\"sandbox; default-src 'self'; ...\""
```

### Audit log

Plugin `Audit Trail`:
- Log mọi action vào file.
- Forward to ELK/Splunk for analysis.

### Block known unsafe plugin

Manage Jenkins → Plugin → check vuln advisory. Update or remove.

### Update Jenkins thường xuyên

LTS release mỗi quý. Security patch mỗi 2-4 tuần.

```bash
dnf update -y jenkins
systemctl restart jenkins
```

## Monitor Jenkins

### Built-in metrics

Manage Jenkins → System Information → JVM metrics, executor utilization, ...

### Prometheus export

Plugin "Prometheus metrics":
- Endpoint `/prometheus/`.
- Scrape with Prometheus.
- Dashboard Grafana có sẵn.

### Alert on stuck queue

Long queue = bottleneck. Alarm khi queue > 10:

```promql
jenkins_queue_size_value{type="buildable"} > 10
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Build trên master | OOM master | Build trên agent, master executor = 0 |
| Plugin outdated | Vuln, broken pipeline | Auto-update + monitor |
| Disk Jenkins đầy | Build fail | Workspace cleanup, log rotation |
| Static agent SPOF | Build queue stuck | Use K8s dynamic agents |
| Config click chuột | Không reproduce | Configuration as Code |
| Credential trong Jenkinsfile | Lộ secret | Credentials Store + binding |
| Plugin install không test | Crash production | Test trên staging Jenkins |
| Backup không có | Loss config | Daily backup S3 |

## Tóm tắt bài 2

- Jenkins master EC2 t3.medium + Java 17 + JVM tune Xmx 2g.
- **Nginx reverse proxy** + Let's Encrypt cert cho HTTPS.
- **Configuration as Code** (JCasC) → YAML config → version control.
- 20+ plugin DevOps must-have.
- **Kubernetes agents** dynamic = best practice modern.
- **Thin Backup** plugin + S3 sync daily.
- Security: CSRF on, audit log, update LTS định kỳ.
- Prometheus metric export cho monitoring.

**Bài kế tiếp** → [Bài 3: Declarative Pipeline syntax đầy đủ](03-declarative-pipeline.md)
