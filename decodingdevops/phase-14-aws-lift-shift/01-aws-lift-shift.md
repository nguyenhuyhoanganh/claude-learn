# Bài 1: Lift & Shift — vProfile lên AWS với EC2

**Lift-and-Shift** = "nhấc nguyên kiến trúc on-prem lên cloud" với minimal changes. Đây là cách **migration đầu tiên** đa số công ty làm.

## Lift-Shift là gì?

```text
On-prem:                          AWS:
+──────────+                      +─────────+
│ nginx VM │      Lift            │ EC2 web │
+──────────+    ─────────►        +─────────+
│ Tomcat   │                      │ EC2 app │
+──────────+                      +─────────+
│ MySQL    │                      │ EC2 db  │
+──────────+                      +─────────+
│ Memcache │                      │EC2 cache│
+──────────+                      +─────────+
│ RabbitMQ │                      │ EC2 mq  │
+──────────+                      +─────────+
```

Architecture **giống hệt** — chỉ chuyển VM từ data center sang EC2.

### Pros
- **Fast**: lên cloud nhanh nhất (vài tuần).
- **Low risk**: ít thay đổi, ít break.
- **Reversible**: muốn về on-prem được.

### Cons
- **Không exploit cloud benefit** (managed service, scale).
- **Cost cao**: trả cloud price cho compute giống on-prem.
- **Technical debt**: vẫn quản lý OS, patch, scale.

### Pattern: phải refactor sau

Lift-shift = phase 1. Phase 2 (bài tiếp) = **refactor** dùng managed service (RDS, ElastiCache).

## Lab setup — 5 EC2 cho vProfile

Architecture:

```text
                      Internet
                          │
                          ▼
                +─────────────────+
                │  ELB (ALB)      │
                +─────────────────+
                          │
                          ▼
                +─────────────────+
                │ EC2: web01      │   nginx
                │ Public subnet   │
                +────────┬────────+
                          │
                          ▼
                +─────────────────+
                │ EC2: app01      │   Tomcat
                │ Private subnet  │
                +─┬───┬───┬───────+
                  │   │   │
       ┌──────────┘   │   └──────────┐
       ▼              ▼              ▼
+────────────+ +────────────+ +────────────+
│ EC2: db01  │ │EC2: mc01   │ │EC2: rmq01  │
│Private subnet│ │Private    │ │Private     │
+────────────+ +────────────+ +────────────+
   MariaDB      Memcached     RabbitMQ
```

## Bước 1: Tạo VPC + subnets

Console: VPC → "Create VPC and more":

- Name: `vprofile-vpc`.
- CIDR: `10.0.0.0/16`.
- AZs: 2.
- Public subnets: 2.
- Private subnets: 2.
- NAT Gateway: **1 per VPC** (rẻ hơn 1 per AZ, lab OK).
- VPC endpoint: S3 gateway (free).

CLI alternative (Terraform sẽ làm phase 21).

## Bước 2: Tạo Security Groups

5 SG:

### `vprofile-elb-sg` (ELB, web tier)

- Inbound: TCP 80, 443 from `0.0.0.0/0`.
- Outbound: all.

### `vprofile-app-sg` (app tier)

- Inbound: TCP 8080 from `vprofile-elb-sg`.
- Inbound: TCP 22 from My IP.
- Outbound: all.

### `vprofile-backend-sg` (db, cache, queue tier)

- Inbound: TCP 3306, 11211, 5672 from `vprofile-app-sg`.
- Inbound: TCP 22 from My IP.
- Outbound: all.

### `vprofile-bastion-sg`

- Inbound: TCP 22 from My IP.
- Outbound: all.

> SG **stateful** — response auto allowed. Chỉ define inbound rule.

## Bước 3: Tạo key pair

```bash
aws ec2 create-key-pair --key-name vprofile --query KeyMaterial --output text > vprofile.pem
chmod 400 vprofile.pem
```

## Bước 4: Tạo Route 53 private zone

DNS internal:

- Domain: `vprofile.internal`.
- Records:
  - `db01.vprofile.internal` → IP private db01.
  - `mc01.vprofile.internal` → IP private mc01.
  - `rmq01.vprofile.internal` → IP private rmq01.

App connect bằng tên thay IP → dễ đổi IP sau.

## Bước 5: Launch EC2 cho data tier

### db01 (MariaDB)

Console → Launch Instance:
- Name: `db01`.
- AMI: Amazon Linux 2023.
- Instance type: t3.micro.
- Subnet: private subnet AZ-a.
- Security group: `vprofile-backend-sg`.
- Key pair: `vprofile`.
- **User data** (script provision):

```bash
#!/bin/bash
dnf install -y mariadb-server git
systemctl enable --now mariadb

mysql -e "CREATE DATABASE accounts;"
mysql -e "CREATE USER 'admin'@'%' IDENTIFIED BY 'admin123';"
mysql -e "GRANT ALL ON accounts.* TO 'admin'@'%';"

cd /tmp
git clone -b local https://github.com/hkhcoder/vprofile-project.git
mysql accounts < vprofile-project/src/main/resources/db_backup.sql

systemctl restart mariadb
```

Launch. Sau ~3 phút, get private IP → update Route 53.

### mc01 (Memcached)

```bash
#!/bin/bash
dnf install -y memcached
sed -i 's/OPTIONS=.*/OPTIONS=""/' /etc/sysconfig/memcached
systemctl enable --now memcached
```

### rmq01 (RabbitMQ)

```bash
#!/bin/bash
dnf install -y epel-release wget
dnf install -y centos-release-rabbitmq-38
dnf install -y rabbitmq-server
systemctl enable --now rabbitmq-server
rabbitmqctl add_user test test
rabbitmqctl set_user_tags test administrator
rabbitmqctl set_permissions -p / test ".*" ".*" ".*"
```

## Bước 6: Launch app01 (Tomcat)

Sau khi data tier ready:

User data:

```bash
#!/bin/bash
dnf install -y java-17-openjdk wget git maven

useradd -r -m -U -d /opt/tomcat -s /sbin/nologin tomcat

cd /tmp
wget https://dlcdn.apache.org/tomcat/tomcat-10/v10.1.17/bin/apache-tomcat-10.1.17.tar.gz
tar -xzf apache-tomcat-10.1.17.tar.gz -C /opt/tomcat --strip-components=1
chown -R tomcat:tomcat /opt/tomcat
chmod +x /opt/tomcat/bin/*.sh

cat > /etc/systemd/system/tomcat.service <<'EOF'
[Unit]
Description=Tomcat
After=network.target

[Service]
Type=forking
User=tomcat
Environment="JAVA_HOME=/usr/lib/jvm/jre"
Environment="CATALINA_PID=/opt/tomcat/temp/tomcat.pid"
Environment="CATALINA_HOME=/opt/tomcat"
ExecStart=/opt/tomcat/bin/startup.sh
ExecStop=/opt/tomcat/bin/shutdown.sh
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now tomcat

# Build vProfile
cd /tmp
git clone -b local https://github.com/hkhcoder/vprofile-project.git
cd vprofile-project

# Update application.properties với hostname
sed -i 's/jdbc.url=.*/jdbc.url=jdbc:mysql:\/\/db01.vprofile.internal:3306\/accounts?useSSL=false/' src/main/resources/application.properties
sed -i 's/memcached.active.host=.*/memcached.active.host=mc01.vprofile.internal/' src/main/resources/application.properties
sed -i 's/rabbitmq.address=.*/rabbitmq.address=rmq01.vprofile.internal/' src/main/resources/application.properties

mvn install -B -DskipTests

systemctl stop tomcat
rm -rf /opt/tomcat/webapps/ROOT*
cp target/vprofile-v2.war /opt/tomcat/webapps/ROOT.war
chown tomcat:tomcat /opt/tomcat/webapps/ROOT.war
systemctl start tomcat
```

## Bước 7: Application Load Balancer (ALB)

Console → EC2 → Load Balancers → Create → **Application Load Balancer**:

- Name: `vprofile-elb`.
- Scheme: **Internet-facing**.
- VPC: vprofile-vpc.
- Subnets: 2 public subnets.
- Security group: `vprofile-elb-sg`.
- Listener: HTTP:80.
- Target group: **new** `vprofile-tg`:
  - Target type: **Instance**.
  - Protocol: HTTP, port 8080.
  - Health check: `/login`, healthy threshold 2.
  - Register targets: app01.

Sau khi tạo, ALB có **DNS name** kiểu `vprofile-elb-xxx.us-east-1.elb.amazonaws.com`.

## Bước 8: Verify

Browser: `http://vprofile-elb-xxx.us-east-1.elb.amazonaws.com`.

→ vProfile login form.

Login `admin_vp` / `admin_vp` → dashboard.

✓ Stack lift-shift xong.

## Bước 9: Optional — domain + HTTPS

### Domain Route 53

- Tạo hosted zone cho domain bạn mua (bài 5 phase 2).
- Tạo Record A:
  - Name: `vprofile.yourdomain.com`.
  - Type: A alias.
  - Target: ALB.

### ACM certificate

```bash
aws acm request-certificate \
    --domain-name vprofile.yourdomain.com \
    --validation-method DNS
```

ACM tạo CNAME validation → thêm vào Route 53.

### ALB listener HTTPS

- Add listener: HTTPS:443.
- Certificate: ACM cert vừa tạo.
- Forward to `vprofile-tg`.

Browser: `https://vprofile.yourdomain.com` → HTTPS work.

## Bước 10: Auto Scaling Group (preview)

App01 single → outage khi instance fail. Tạo ASG:

- **Launch Template** từ AMI snapshot of app01.
- ASG: min 2, max 5, desired 2.
- Target group: `vprofile-tg`.

Khi traffic peak → ASG launch app02, app03. Down → terminate.

Section 24 sẽ deep-dive ASG.

## So sánh lift-shift

| | Manual lift-shift (bài này) | Refactor (bài tiếp) |
|---|---|---|
| MySQL | EC2 instance | **RDS managed** |
| Memcached | EC2 instance | **ElastiCache managed** |
| Static asset | Tomcat serve | **S3 + CloudFront** |
| Operational burden | High | Low |
| Cost | Tương đương | Cao hơn (paid managed) |
| Scale | Manual | Auto |
| Backup | Cron job | Auto snapshot |

Refactor = AWS-native, ít quản lý hơn — trade-off cost.

## Cleanup

Sau lab phải cleanup tránh bill:

```bash
# Terminate EC2
aws ec2 terminate-instances --instance-ids $(aws ec2 describe-instances \
    --filters "Name=tag:Project,Values=vprofile" \
    --query 'Reservations[].Instances[].InstanceId' --output text)

# Delete ALB
aws elbv2 delete-load-balancer --load-balancer-arn arn:aws:elasticloadbalancing:...

# Delete NAT Gateway ($32/month!)
aws ec2 delete-nat-gateway --nat-gateway-id nat-xxx

# Release Elastic IP
aws ec2 release-address --allocation-id eipalloc-xxx

# Delete VPC (sau khi xoá hết resource trong)
aws ec2 delete-vpc --vpc-id vpc-xxx
```

Check console hoặc CLI sạch hết.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| User data script fail silent | EC2 up nhưng app chưa ready | Check `/var/log/cloud-init-output.log` |
| Security group block port | Connection refused | Verify SG inbound rule |
| Tomcat chưa ready khi ALB health check | Mark unhealthy | Tăng `HealthyThresholdCount`, grace period |
| App01 single AZ | Outage AZ → down | Multi-AZ ASG |
| NAT Gateway lab quên xoá | $32/month bill | Schedule remove sau lab |
| RDS không có vì lift-shift | Manage MySQL trên EC2 | Refactor phase tiếp |
| Bastion permanent open | SSH attack | Restrict IP / Session Manager |

## Tóm tắt bài 1

- **Lift-shift** = chuyển VM y nguyên from on-prem to cloud.
- 5 EC2 thay cho 5 Vagrant VM phase 8.
- VPC + public/private subnet + NAT Gateway = network foundation.
- Security Group **per tier** (elb / app / backend), reference SG khác cho clean rule.
- **ALB** + Target Group → frontend HTTPS.
- **Route 53 private hosted zone** cho DNS internal.
- Lift-shift đơn giản nhưng **không exploit cloud benefit** → refactor (bài tiếp).
- **Cleanup nghiêm túc** — NAT, ALB, EC2 đều tốn tiền.

**Phase kế tiếp** → [Phase 15 — Bài 1: Refactor với managed service](../phase-15-aws-refactor/01-aws-refactor.md)
