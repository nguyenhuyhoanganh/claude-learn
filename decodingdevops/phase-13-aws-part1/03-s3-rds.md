# Bài 3: S3, RDS — storage và database AWS

S3 và RDS = 2 service storage chính. Hiểu = build được 90% app.

## S3 — Simple Storage Service

> S3 = **object storage** vô hạn — lưu file (image, video, backup, log) với URL HTTP truy cập.

Khác file system:
- **Object** (không phải file).
- Phẳng (không có folder thật, chỉ prefix).
- Truy cập qua HTTP API (`PUT`, `GET`, `DELETE`).
- Vô hạn dung lượng + scale.

### Bucket — container của object

```text
my-app-bucket/
├── images/
│   ├── logo.png
│   └── banner.jpg
├── backups/
│   └── 2026-05-31.tar.gz
└── logs/
    └── access.log
```

URL pattern:

```text
https://my-app-bucket.s3.us-east-1.amazonaws.com/images/logo.png
```

### Tạo bucket

```bash
# CLI
aws s3 mb s3://my-app-bucket-2026 --region us-east-1
```

Bucket name **globally unique** — không trùng với ai trên thế giới.

### Upload / download

```bash
# Upload
aws s3 cp file.txt s3://my-bucket/

# Download
aws s3 cp s3://my-bucket/file.txt .

# Sync (như rsync)
aws s3 sync local-folder/ s3://my-bucket/folder/

# List
aws s3 ls s3://my-bucket/
aws s3 ls s3://my-bucket/ --recursive

# Delete
aws s3 rm s3://my-bucket/file.txt
aws s3 rm s3://my-bucket/folder/ --recursive
```

### Storage classes — trade-off cost vs latency

| Class | Use | Cost (per GB-month) |
|---|---|---|
| **Standard** | Frequent access | ~$0.023 |
| **Intelligent-Tiering** | Unknown pattern, auto-move | ~$0.023 + per-1k object |
| **Standard-IA** (Infrequent Access) | Read 1-2x/month | ~$0.0125 |
| **One Zone-IA** | IA but 1 AZ (cheaper) | ~$0.01 |
| **Glacier Instant Retrieval** | Archive, ms retrieve | ~$0.004 |
| **Glacier Flexible Retrieval** | Archive, minute-hour retrieve | ~$0.0036 |
| **Glacier Deep Archive** | Archive, 12h retrieve | ~$0.00099 |

### Lifecycle policy — auto-move data

```json
{
    "Rules": [{
        "Status": "Enabled",
        "Filter": {"Prefix": "logs/"},
        "Transitions": [
            {"Days": 30, "StorageClass": "STANDARD_IA"},
            {"Days": 90, "StorageClass": "GLACIER"},
            {"Days": 365, "StorageClass": "DEEP_ARCHIVE"}
        ],
        "Expiration": {"Days": 2555}
    }]
}
```

7 năm tuổi → xoá. Giảm cost tự động.

### Security

**Mặc định bucket private**. Để public:

```json
{
    "Version": "2012-10-17",
    "Statement": [{
        "Sid": "PublicRead",
        "Effect": "Allow",
        "Principal": "*",
        "Action": "s3:GetObject",
        "Resource": "arn:aws:s3:::my-public-bucket/*"
    }]
}
```

> **Cẩn thận**: public S3 = data breach phổ biến nhất. Default deny public.

Options:
- **Block Public Access**: account-level flag, off public mọi bucket.
- **Pre-signed URL**: temporary public URL có expiry.

```bash
# Tạo pre-signed URL 1 giờ
aws s3 presign s3://my-bucket/file.txt --expires-in 3600
# https://my-bucket.s3.amazonaws.com/file.txt?AWSAccessKeyId=xxx&Signature=yyy&Expires=zzz
```

### Versioning

Bật → mọi PUT/DELETE giữ version cũ:

```bash
aws s3api put-bucket-versioning \
    --bucket my-bucket \
    --versioning-configuration Status=Enabled
```

Recover file đã xoá / overwrite. Tốn storage 2x.

### Encryption

- **SSE-S3**: AWS manage key (default từ 2023).
- **SSE-KMS**: AWS KMS key — audit chi tiết.
- **SSE-C**: customer-provided key.

```bash
aws s3 cp file s3://bucket/ --sse aws:kms --sse-kms-key-id alias/my-key
```

### Use cases

- Static website hosting.
- Backup destination.
- Data lake (Athena query SQL trên S3).
- ML training data.
- Software distribution.
- Log aggregation.
- Big data analytics.

### Static website hosting

```bash
# Tạo bucket
aws s3 mb s3://my-static-site

# Enable static hosting
aws s3 website s3://my-static-site --index-document index.html --error-document error.html

# Upload
aws s3 cp index.html s3://my-static-site/ --acl public-read

# URL:
# http://my-static-site.s3-website-us-east-1.amazonaws.com
```

Production thường thêm CloudFront để có HTTPS + CDN.

## RDS — Relational Database Service

> RDS = **managed SQL database**. AWS lo backup, patch, replication, failover. Bạn chỉ care schema + data.

### Engines

| Engine | Note |
|---|---|
| **MySQL** | 5.7, 8.0 |
| **MariaDB** | 10.x |
| **PostgreSQL** | 13-16 |
| **Oracle** | Paid |
| **SQL Server** | Paid |
| **Aurora MySQL/PostgreSQL** | AWS proprietary, faster |

### Instance class

Như EC2: `db.t3.micro`, `db.m5.large`, ...

Free tier: **db.t3.micro** 750h/month.

### Multi-AZ — High Availability

```text
Primary (us-east-1a)        Standby (us-east-1b)
        │                          │
        └──── Synchronous ─────────┘
              replication

App connect to endpoint → automatic failover if primary down
```

- Sync replication → no data loss.
- Failover ~60-120s.
- 2x cost.

### Read Replica — scale read

```text
Primary (writes)
    │
    └─ Read Replica 1 (us-east-1a) — async replication
    └─ Read Replica 2 (us-east-1b)
    └─ Read Replica 3 (ap-southeast-1) — cross-region OK
```

App route read → replica, write → primary.

### Backup

- **Automated backup**: daily snapshot + transaction log → point-in-time restore.
- **Manual snapshot**: bạn trigger, giữ vô hạn.

```bash
# Manual snapshot
aws rds create-db-snapshot --db-snapshot-identifier my-snap-2026-05-31 \
    --db-instance-identifier my-db

# Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
    --db-instance-identifier new-db \
    --db-snapshot-identifier my-snap-2026-05-31
```

### Create RDS

```bash
aws rds create-db-instance \
    --db-instance-identifier vprofile-db \
    --db-instance-class db.t3.micro \
    --engine mariadb \
    --engine-version 10.11 \
    --master-username admin \
    --master-user-password 'StrongPass123!' \
    --allocated-storage 20 \
    --db-name accounts \
    --vpc-security-group-ids sg-xxx \
    --db-subnet-group-name default
```

Endpoint sau khi tạo: `vprofile-db.xxx.us-east-1.rds.amazonaws.com:3306`.

### Connect

```bash
mysql -h vprofile-db.xxx.us-east-1.rds.amazonaws.com -u admin -p

# JDBC
jdbc:mysql://vprofile-db.xxx.us-east-1.rds.amazonaws.com:3306/accounts
```

### RDS vs self-hosted MySQL trên EC2

| | RDS | EC2 + MySQL |
|---|---|---|
| Setup | Console 5 phút | Setup tay |
| Backup | Tự động | Bạn lo |
| Patching | Tự động | Bạn lo |
| Multi-AZ | 1 click | Cluster setup phức tạp |
| Read Replica | 1 click | Cluster setup |
| Cost | Cao hơn (~30%) | Rẻ hơn |
| Customize | Hạn chế | Full control |

DevOps thường chọn RDS — đáng tiền cho operational simplicity.

### Aurora — AWS proprietary

- Compatible MySQL / PostgreSQL.
- 5x faster than vanilla MySQL.
- Storage scale tự động.
- Up to 15 read replicas.
- Cost: tương đương RDS multi-AZ.

Pattern: dùng Aurora cho prod, RDS cho dev/staging.

## DynamoDB — NoSQL

Brief intro:

```bash
# Tạo table
aws dynamodb create-table \
    --table-name Users \
    --attribute-definitions AttributeName=user_id,AttributeType=S \
    --key-schema AttributeName=user_id,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST

# Insert
aws dynamodb put-item \
    --table-name Users \
    --item '{"user_id": {"S": "alice"}, "age": {"N": "30"}}'

# Query
aws dynamodb get-item \
    --table-name Users \
    --key '{"user_id": {"S": "alice"}}'
```

DynamoDB always-free 25 GB. Use case: session, cart, real-time scale.

## ElastiCache — Redis / Memcached

Managed Redis hoặc Memcached.

```bash
aws elasticache create-cache-cluster \
    --cache-cluster-id my-redis \
    --cache-node-type cache.t3.micro \
    --engine redis \
    --num-cache-nodes 1
```

Endpoint: `my-redis.xxx.cache.amazonaws.com:6379`.

App connect Redis như local — AWS lo replication, failover, scale.

## Lab — host static site trên S3 + CloudFront

```bash
# 1. Create bucket
aws s3 mb s3://my-site-2026 --region us-east-1

# 2. Upload site
aws s3 cp index.html s3://my-site-2026/ --acl public-read
aws s3 cp style.css s3://my-site-2026/ --acl public-read

# 3. Enable website hosting
aws s3 website s3://my-site-2026/ --index-document index.html

# 4. (Optional) CloudFront distribution
aws cloudfront create-distribution \
    --origin-domain-name my-site-2026.s3.us-east-1.amazonaws.com \
    --default-root-object index.html
```

CloudFront URL: `dXXXXX.cloudfront.net`.

## Cost tip

```bash
# Check S3 cost
aws ce get-cost-and-usage \
    --time-period Start=2026-05-01,End=2026-05-31 \
    --granularity MONTHLY \
    --metrics BlendedCost \
    --filter '{"Dimensions": {"Key": "SERVICE", "Values": ["Amazon Simple Storage Service"]}}'
```

S3 cost optimization:
- Lifecycle → IA/Glacier.
- Intelligent-Tiering cho unknown.
- Delete incomplete multipart uploads.
- Compress trước upload.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Bucket public accidentally | Data leak | Block Public Access + IAM policy |
| Versioning enable + delete | Storage tích lũy | Lifecycle expire old version |
| RDS public subnet | Hack risk | Private subnet always |
| RDS không multi-AZ prod | Outage AZ → down | Multi-AZ for prod |
| Forget delete RDS sau lab | $15/month/db.t3.micro | Delete khi xong |
| S3 transfer cross-region | $0.02/GB | Architecture đúng region |
| RDS master password trong git | Compromise | Secrets Manager |
| DynamoDB on-demand cho high traffic | Spike cost | Provisioned cho predictable |

## Tóm tắt bài 3

- **S3** = object storage vô hạn, URL HTTP, bucket name globally unique.
- 7 storage classes: Standard → IA → Glacier → Deep Archive (cheap → cold).
- **Lifecycle policy** auto-move data tier theo tuổi.
- Default **private bucket** — public S3 = #1 cause data breach.
- **RDS**: managed SQL (MySQL/PostgreSQL/...), Multi-AZ HA, read replica scale read.
- Free tier: db.t3.micro 750h.
- **Aurora** 5x MySQL nhưng cost cao hơn.
- **DynamoDB** NoSQL pay-per-request scale infinite.
- **ElastiCache** Redis/Memcached managed.

**Phase kế tiếp** → [Phase 14 — Bài 1: Lift-Shift vProfile lên AWS](../phase-14-aws-lift-shift/01-aws-lift-shift.md)
