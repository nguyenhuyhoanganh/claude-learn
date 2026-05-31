# Bài 1: Refactor vProfile với AWS managed services

Lift-shift work nhưng vẫn quản EC2 cho DB, cache. **Refactor** = thay từng EC2 bằng **managed service** AWS (RDS, ElastiCache, Amazon MQ) → bớt operational burden.

## Vì sao refactor?

| | EC2 self-managed | AWS managed |
|---|---|---|
| Patch OS | Bạn | AWS |
| Backup | Cron | Auto snapshot |
| Failover | Manual cluster | 1 click Multi-AZ |
| Scale | Tự build | Auto scaling built-in |
| Monitor | Setup CloudWatch agent | Built-in metrics |
| Cost | Rẻ hơn | +30-50% |

Trade-off: trả thêm tiền để **không phải quản** infrastructure. Với team nhỏ → cực đáng.

## Architecture sau refactor

```text
                 Route 53 (DNS)
                       │
                       ▼
                  CloudFront (CDN)
                       │
                       ▼
                  ALB (HTTPS)
                       │
                       ▼
              +────────────────+
              │ ECS / Beanstalk│   ← Web tier
              │ (Tomcat in     │
              │  container)    │
              +────┬───┬───┬───+
                   │   │   │
        ┌──────────┘   │   └──────────┐
        ▼              ▼              ▼
   +─────────+   +─────────────+ +─────────────+
   │ RDS     │   │ ElastiCache │ │ Amazon MQ   │
   │ MariaDB │   │ Memcached   │ │ RabbitMQ    │
   │Multi-AZ │   │             │ │             │
   +─────────+   +─────────────+ +─────────────+

         + S3 (static asset)
```

5 EC2 (lift-shift) → 1 EC2 (app) + 3 managed service + S3.

## Bước 1: RDS thay MariaDB EC2

### Subnet group

Khai báo subnet nào RDS chạy:

```bash
aws rds create-db-subnet-group \
    --db-subnet-group-name vprofile-db-subnet \
    --db-subnet-group-description "Private subnets" \
    --subnet-ids subnet-private-a subnet-private-b
```

### Tạo RDS instance

```bash
aws rds create-db-instance \
    --db-instance-identifier vprofile-rds \
    --db-instance-class db.t3.micro \
    --engine mariadb \
    --engine-version 10.11 \
    --master-username admin \
    --master-user-password 'StrongPass123!' \
    --allocated-storage 20 \
    --db-name accounts \
    --vpc-security-group-ids sg-backend \
    --db-subnet-group-name vprofile-db-subnet \
    --backup-retention-period 7 \
    --multi-az
```

Hoặc qua Console — RDS → Create database → Standard → MariaDB → Production template.

### Endpoint

Sau ~5 phút tạo xong:

```text
vprofile-rds.xxx.us-east-1.rds.amazonaws.com:3306
```

### Migrate data từ EC2 db → RDS

```bash
# Trên EC2 db01
mysqldump -u admin -padmin123 accounts > /tmp/accounts.sql

# Restore vào RDS
mysql -h vprofile-rds.xxx.us-east-1.rds.amazonaws.com -u admin -p accounts < /tmp/accounts.sql
```

### Update app01 connection string

```properties
jdbc.url=jdbc:mysql://vprofile-rds.xxx.us-east-1.rds.amazonaws.com:3306/accounts?useSSL=true
jdbc.username=admin
jdbc.password=StrongPass123!
```

Rebuild + redeploy `.war`. Test login.

### Decommission db01

```bash
aws ec2 terminate-instances --instance-ids i-db01
```

## Bước 2: ElastiCache thay Memcached EC2

```bash
aws elasticache create-cache-subnet-group \
    --cache-subnet-group-name vprofile-cache-subnet \
    --cache-subnet-group-description "Private" \
    --subnet-ids subnet-private-a subnet-private-b

aws elasticache create-cache-cluster \
    --cache-cluster-id vprofile-cache \
    --cache-node-type cache.t3.micro \
    --engine memcached \
    --num-cache-nodes 1 \
    --cache-subnet-group-name vprofile-cache-subnet \
    --security-group-ids sg-backend
```

Endpoint: `vprofile-cache.xxx.cache.amazonaws.com:11211`.

Update `application.properties`:

```properties
memcached.active.host=vprofile-cache.xxx.cache.amazonaws.com
memcached.active.port=11211
```

Rebuild + redeploy. Decommission mc01.

## Bước 3: Amazon MQ thay RabbitMQ EC2

```bash
aws mq create-broker \
    --broker-name vprofile-mq \
    --engine-type RABBITMQ \
    --engine-version 3.12.13 \
    --host-instance-type mq.t3.micro \
    --deployment-mode SINGLE_INSTANCE \
    --users Username=test,Password=testpassword \
    --publicly-accessible false \
    --subnet-ids subnet-private-a \
    --security-groups sg-backend
```

Endpoint: `amqps://b-xxx-1.mq.us-east-1.amazonaws.com:5671`.

Update properties (RabbitMQ over AMQPS — TLS):

```properties
rabbitmq.address=b-xxx-1.mq.us-east-1.amazonaws.com
rabbitmq.port=5671
rabbitmq.username=test
rabbitmq.password=testpassword
```

Lưu ý: Amazon MQ enforce TLS → app cần TLS support. Có thể cần config Java truststore.

Rebuild, decommission rmq01.

## Bước 4: S3 cho static asset

Tomcat serve static (CSS, JS, image) chậm + tốn CPU. Tách sang S3 + CloudFront:

```bash
# Bucket
aws s3 mb s3://vprofile-static-2026

# Upload static
aws s3 sync /tmp/vprofile-project/src/main/webapp/static/ s3://vprofile-static-2026/static/

# Block public + CloudFront OAI
```

CloudFront distribution:
- Origin: `vprofile-static-2026.s3.us-east-1.amazonaws.com`.
- Behavior: cache aggressive, TTL 1 year.

Update HTML template trong app: link `/static/style.css` → `https://dxxxxx.cloudfront.net/static/style.css`.

## Bước 5: Auto Scaling Group cho app tier

App01 single → fragile. ASG:

### Launch Template

- AMI: tạo từ app01 (snapshot).
- Instance type: t3.small.
- Key pair: vprofile.
- Security group: app-sg.
- User data: pull `.war` mới nhất từ S3.

```bash
aws ec2 create-launch-template \
    --launch-template-name vprofile-app-lt \
    --version-description "v1" \
    --launch-template-data file://launch-template.json
```

### ASG

```bash
aws autoscaling create-auto-scaling-group \
    --auto-scaling-group-name vprofile-asg \
    --launch-template LaunchTemplateName=vprofile-app-lt,Version='$Latest' \
    --min-size 2 \
    --max-size 5 \
    --desired-capacity 2 \
    --target-group-arns arn:aws:elasticloadbalancing:... \
    --vpc-zone-identifier "subnet-private-a,subnet-private-b" \
    --health-check-type ELB \
    --health-check-grace-period 300
```

ASG launch 2 app instance. ALB route traffic. Auto scale theo metric.

### Scaling policy

```bash
# Scale up khi CPU > 70%
aws autoscaling put-scaling-policy \
    --auto-scaling-group-name vprofile-asg \
    --policy-name cpu-scale-up \
    --policy-type TargetTrackingScaling \
    --target-tracking-configuration '{
        "TargetValue": 70.0,
        "PredefinedMetricSpecification": {"PredefinedMetricType": "ASGAverageCPUUtilization"}
    }'
```

## Architecture cost so sánh

Approximate cost/month us-east-1:

| Resource | Lift-shift (5 EC2) | Refactor |
|---|---|---|
| Compute | 5 × t3.small = $61 | 2 × t3.small ASG = $24 |
| RDS | (in EC2) | db.t3.micro Multi-AZ = $30 |
| ElastiCache | (in EC2) | cache.t3.micro = $12 |
| Amazon MQ | (in EC2) | mq.t3.micro = $25 |
| ALB | $20 | $20 |
| NAT Gateway | $32 | $32 |
| EBS, transfer | $10 | $10 |
| **Total** | **~$150** | **~$155** |

Cost gần bằng nhưng **operational burden** giảm cực nhiều — không phải quản OS patch, backup, failover.

## Cost optimization

### Reserved Instance / Savings Plan

Commit 1-3 năm → giảm 30-50%:

```bash
# Standard 1-year RI
aws ec2 purchase-reserved-instances-offering \
    --reserved-instances-offering-id offering-xxx
```

### Spot for non-critical

ASG mix policy: 50% on-demand + 50% spot → giảm cost peak.

### Right-sizing

CloudWatch metric → CPU < 20% → giảm instance type.

### Auto-stop dev

```bash
# Cron tag-based stop
aws ec2 describe-instances \
    --filters "Name=tag:AutoStop,Values=true" \
    --query 'Reservations[].Instances[].InstanceId' --output text | \
    xargs aws ec2 stop-instances --instance-ids
```

## Monitoring

CloudWatch dashboard:
- RDS CPU, connection count, slow query.
- ALB request count, 4xx/5xx, latency.
- ASG capacity.
- CloudFront cache hit ratio.

Alarm:
- RDS CPU > 80% (5 min) → SNS email.
- ALB 5xx > 10/min → PagerDuty.
- ASG desired < 2 → alert.

## Multi-AZ vs Multi-Region

- **Multi-AZ**: cùng region, ASG span 2-3 AZ. Survive AZ failure. **Default** cho prod.
- **Multi-Region**: replica region khác. Survive region failure. Complex + expensive. Chỉ critical app (banking, payments).

vProfile lab → Multi-AZ đủ.

## Disaster Recovery

| Strategy | RTO | RPO | Cost |
|---|---|---|---|
| **Backup & Restore** | Hours-days | Hours | Cheap |
| **Pilot Light** | < 1 hour | Minutes | Med |
| **Warm Standby** | Minutes | Minutes | High |
| **Multi-site Active-Active** | Seconds | None | Very high |

RTO = Recovery Time Objective (bao lâu phải up lại).
RPO = Recovery Point Objective (mất bao nhiêu data).

vProfile lab → Backup & Restore (RDS automated snapshot + EBS snapshot).

## Cleanup

```bash
# Delete in reverse order
aws autoscaling delete-auto-scaling-group --auto-scaling-group-name vprofile-asg --force-delete

aws elbv2 delete-load-balancer --load-balancer-arn arn:...
aws elbv2 delete-target-group --target-group-arn arn:...

aws rds delete-db-instance --db-instance-identifier vprofile-rds \
    --skip-final-snapshot --delete-automated-backups

aws elasticache delete-cache-cluster --cache-cluster-id vprofile-cache

aws mq delete-broker --broker-id b-xxx

aws s3 rb s3://vprofile-static-2026 --force

# NAT Gateway, IGW, VPC
aws ec2 delete-nat-gateway --nat-gateway-id nat-xxx
aws ec2 release-address --allocation-id eipalloc-xxx
aws ec2 delete-vpc --vpc-id vpc-xxx
```

Verify console clean.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| RDS public subnet | Security risk | Private subnet only |
| RDS không Multi-AZ prod | AZ outage = down | Multi-AZ mandatory |
| ElastiCache cùng SG với app | Network isolation yếu | Backend SG riêng |
| Amazon MQ TLS không config | App fail connect | Setup Java truststore |
| S3 public bucket | Data leak | OAI + CloudFront only |
| Forget delete RDS sau lab | $30/month | Always cleanup |
| Multi-region overengineer | Cost + complexity | Multi-AZ đủ cho 99% |

## Tổng kết phase 14+15

vProfile journey:

```text
Phase 8: Vagrant local (5 VM, manual)
    │
    ▼
Phase 14: AWS lift-shift (5 EC2)
    │
    ▼
Phase 15: AWS refactor (managed services)
    │
    ▼
Phase 27-28: Containerize (Docker)
    │
    ▼
Phase 29-30: Kubernetes deploy (EKS)
```

Mỗi phase 1 lần refactor. Đây là **real cloud migration journey** đa số công ty đi qua.

## Tóm tắt bài 1

- **Refactor** = thay EC2 self-managed bằng AWS managed service.
- **RDS** thay MariaDB EC2: Multi-AZ HA, auto backup, patching.
- **ElastiCache** thay Memcached EC2: managed cluster.
- **Amazon MQ** thay RabbitMQ EC2: managed broker.
- **S3 + CloudFront** thay Tomcat serve static.
- **ASG** thay single app01: auto-scale, multi-AZ.
- Cost gần bằng — trade-off cho **giảm operational burden**.
- DR strategy: Backup-Restore → Pilot Light → Warm Standby → Active-Active.

**Phase kế tiếp** → [Phase 16 — Bài 1: Build tools — Maven, Gradle](../phase-16-build-tools/01-build-tools.md)
