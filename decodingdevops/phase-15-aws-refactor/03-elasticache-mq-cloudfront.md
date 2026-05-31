# Bài 3: ElastiCache + Amazon MQ + S3 CloudFront

Tiếp tục refactor: thay Memcached EC2 → ElastiCache, RabbitMQ EC2 → Amazon MQ, static asset → S3 + CloudFront.

## ElastiCache — Memcached managed

### Vì sao?

Memcached EC2:
- Setup memcached config thủ công.
- Single instance = SPOF.
- Restart = mất hết cache.
- Scale = thêm node manually.

ElastiCache Memcached:
- Cluster multi-node 1 click.
- Auto-discovery client.
- Maintenance window managed.
- Metric built-in.

Note: ElastiCache cũng support Redis (mạnh hơn Memcached). vProfile dùng Memcached → tiếp tục dùng.

### Subnet group

```bash
aws elasticache create-cache-subnet-group \
    --cache-subnet-group-name vprofile-cache-subnet \
    --cache-subnet-group-description "Private subnets cho ElastiCache" \
    --subnet-ids $PRIV_SUBNET_A $PRIV_SUBNET_B
```

### Parameter group

```bash
aws elasticache create-cache-parameter-group \
    --cache-parameter-group-name vprofile-memcached-params \
    --cache-parameter-group-family memcached1.6 \
    --description "Custom Memcached params"

# Adjust max memory
aws elasticache modify-cache-parameter-group \
    --cache-parameter-group-name vprofile-memcached-params \
    --parameter-name-values \
        ParameterName=max_item_size,ParameterValue=10485760 \
        ParameterName=evictions,ParameterValue=allow
```

### Create cluster

```bash
aws elasticache create-cache-cluster \
    --cache-cluster-id vprofile-cache \
    --cache-node-type cache.t3.micro \
    --engine memcached \
    --engine-version 1.6.22 \
    --num-cache-nodes 2 \
    --cache-subnet-group-name vprofile-cache-subnet \
    --security-group-ids $BACKEND_SG \
    --cache-parameter-group-name vprofile-memcached-params \
    --preferred-availability-zones us-east-1a us-east-1b \
    --tags Key=Project,Value=vprofile
```

2 node spread 2 AZ → fail 1 AZ vẫn còn cache (partial).

Wait available (~5 phút):

```bash
aws elasticache wait cache-cluster-available --cache-cluster-id vprofile-cache

# Get endpoint
CACHE_ENDPOINT=$(aws elasticache describe-cache-clusters \
    --cache-cluster-id vprofile-cache \
    --show-cache-node-info \
    --query 'CacheClusters[0].ConfigurationEndpoint.Address' --output text)

echo "Cache endpoint: $CACHE_ENDPOINT"
# vprofile-cache.xxx.cfg.use1.cache.amazonaws.com:11211
```

### Update app

```properties
# application.properties
memcached.active.host=vprofile-cache.xxx.cfg.use1.cache.amazonaws.com
memcached.active.port=11211
```

vProfile dùng **XMemcached** Java lib — connect bằng host:port là OK.

Rebuild + redeploy.

### Auto-discovery

Memcached classic = bạn liệt kê IP từng node trong app. Khi thêm node → update code → fragile.

ElastiCache **auto-discovery**: app dùng **configuration endpoint** → tự discover mọi node.

```java
MemcachedClientBuilder builder = new XMemcachedClientBuilder(
    AddrUtil.getAddresses("vprofile-cache.xxx.cfg.use1.cache.amazonaws.com:11211")
);
```

Thêm node → cluster tự thêm vào → app tự thấy → no code change.

### Decommission mc01

Sau verify app work với ElastiCache:

```bash
aws ec2 terminate-instances --instance-ids $MC_EC2_ID
```

## Amazon MQ — RabbitMQ managed

### Setup broker

```bash
# Tạo Secrets Manager cho MQ credential
aws secretsmanager create-secret \
    --name prod/vprofile/mq \
    --secret-string '{"username":"vprofileuser","password":"'$(openssl rand -base64 16)'"}'

MQ_USER=$(aws secretsmanager get-secret-value --secret-id prod/vprofile/mq \
    --query SecretString --output text | jq -r .username)
MQ_PASS=$(aws secretsmanager get-secret-value --secret-id prod/vprofile/mq \
    --query SecretString --output text | jq -r .password)

# Create broker
aws mq create-broker \
    --broker-name vprofile-mq \
    --engine-type RABBITMQ \
    --engine-version 3.12.13 \
    --host-instance-type mq.t3.micro \
    --deployment-mode SINGLE_INSTANCE \
    --users Username=$MQ_USER,Password=$MQ_PASS \
    --publicly-accessible false \
    --subnet-ids $PRIV_SUBNET_A \
    --security-groups $BACKEND_SG \
    --auto-minor-version-upgrade true \
    --logs General=true \
    --maintenance-window-start-time DayOfWeek=SUNDAY,TimeOfDay=04:00,TimeZone=UTC
```

| Deployment mode | Note |
|---|---|
| `SINGLE_INSTANCE` | 1 broker, no HA — dev/test |
| `CLUSTER_MULTI_AZ` | RabbitMQ cluster 3 node, HA |
| `ACTIVE_STANDBY_MULTI_AZ` | ActiveMQ specific |

Production = CLUSTER_MULTI_AZ. Lab → SINGLE_INSTANCE OK.

### Wait ready

```bash
# ~15-20 phút
aws mq wait broker-running --broker-id $MQ_ARN

# Get endpoint
MQ_ENDPOINT=$(aws mq describe-broker --broker-id $MQ_ARN \
    --query 'BrokerInstances[0].Endpoints[0]' --output text)

echo "MQ endpoint: $MQ_ENDPOINT"
# amqps://b-xxx-1.mq.us-east-1.amazonaws.com:5671
```

### TLS connection

Amazon MQ **enforce TLS** (port 5671 thay vì 5672). App phải support AMQPS.

Java Spring AMQP:

```properties
spring.rabbitmq.host=b-xxx-1.mq.us-east-1.amazonaws.com
spring.rabbitmq.port=5671
spring.rabbitmq.username=${MQ_USER}
spring.rabbitmq.password=${MQ_PASS}
spring.rabbitmq.ssl.enabled=true
spring.rabbitmq.ssl.algorithm=TLSv1.2
```

vProfile native Java client config:

```java
ConnectionFactory factory = new ConnectionFactory();
factory.setHost("b-xxx-1.mq.us-east-1.amazonaws.com");
factory.setPort(5671);
factory.useSslProtocol("TLSv1.2");
factory.setUsername(System.getenv("MQ_USER"));
factory.setPassword(System.getenv("MQ_PASS"));
```

### Web UI

Amazon MQ provide RabbitMQ web console:

```text
https://b-xxx.mq.us-east-1.amazonaws.com
```

Login user/password vừa tạo.

### Decommission rmq01

```bash
aws ec2 terminate-instances --instance-ids $RMQ_EC2_ID
```

## S3 + CloudFront cho static asset

### Vì sao tách static asset?

Tomcat serve static (CSS, JS, image) → tốn CPU + bandwidth. Pattern:
- Tomcat serve **dynamic** content (JSP, REST API).
- nginx serve **static** local — đỡ Tomcat.
- **CDN** (CloudFront) cache static globally — đỡ origin.

### S3 bucket cho static

```bash
aws s3 mb s3://vprofile-static-2026 --region us-east-1

# Block public access (sẽ access qua CloudFront OAI)
aws s3api put-public-access-block \
    --bucket vprofile-static-2026 \
    --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Upload static asset
cd /tmp/vprofile-project/src/main/webapp/static
aws s3 sync . s3://vprofile-static-2026/static/ \
    --cache-control "public, max-age=31536000, immutable"

# Cache-control = 1 year (immutable cho versioned asset)
```

### CloudFront Origin Access Control (OAC)

Modern replacement của OAI:

```bash
aws cloudfront create-origin-access-control \
    --origin-access-control-config \
    "Name=vprofile-oac,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3"
```

### CloudFront distribution

`cf-config.json`:

```json
{
    "CallerReference": "vprofile-cf-2026",
    "Comment": "vProfile static CDN",
    "Origins": {
        "Quantity": 1,
        "Items": [{
            "Id": "vprofile-s3",
            "DomainName": "vprofile-static-2026.s3.us-east-1.amazonaws.com",
            "S3OriginConfig": {"OriginAccessIdentity": ""},
            "OriginAccessControlId": "OAC_ID"
        }]
    },
    "DefaultCacheBehavior": {
        "TargetOriginId": "vprofile-s3",
        "ViewerProtocolPolicy": "redirect-to-https",
        "AllowedMethods": {
            "Quantity": 2,
            "Items": ["GET", "HEAD"]
        },
        "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
        "Compress": true
    },
    "Enabled": true,
    "PriceClass": "PriceClass_100"
}
```

`PriceClass_100` = chỉ US/EU edge (rẻ nhất). `_200` thêm Asia. `_All` toàn cầu.

```bash
aws cloudfront create-distribution --distribution-config file://cf-config.json
```

Wait ~15 phút deploy. Get URL:

```bash
CF_DOMAIN=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?Comment=='vProfile static CDN'].DomainName" \
    --output text)

echo "CloudFront: https://$CF_DOMAIN"
```

### Bucket policy cho phép CloudFront

```bash
aws s3api put-bucket-policy --bucket vprofile-static-2026 --policy '{
    "Version": "2012-10-17",
    "Statement": [{
        "Sid": "AllowCloudFrontServicePrincipal",
        "Effect": "Allow",
        "Principal": {"Service": "cloudfront.amazonaws.com"},
        "Action": "s3:GetObject",
        "Resource": "arn:aws:s3:::vprofile-static-2026/*",
        "Condition": {
            "StringEquals": {
                "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT:distribution/CF_DIST_ID"
            }
        }
    }]
}'
```

### Custom domain + cert

```bash
# ACM cert us-east-1 (CloudFront yêu cầu)
CERT_CF=$(aws acm request-certificate \
    --domain-name static.vprofile.acme.com \
    --validation-method DNS \
    --region us-east-1 \
    --query CertificateArn --output text)

# Add validation CNAME vào Route 53...
# Wait Issued

# Update distribution với alternate domain
aws cloudfront update-distribution \
    --id $CF_DIST_ID \
    --distribution-config "{
        ...
        \"Aliases\": {\"Quantity\": 1, \"Items\": [\"static.vprofile.acme.com\"]},
        \"ViewerCertificate\": {
            \"ACMCertificateArn\": \"$CERT_CF\",
            \"SSLSupportMethod\": \"sni-only\",
            \"MinimumProtocolVersion\": \"TLSv1.2_2021\"
        }
    }"

# A alias Route 53
aws route53 change-resource-record-sets --hosted-zone-id $ZONE_ID --change-batch '{
    "Changes": [{
        "Action": "CREATE",
        "ResourceRecordSet": {
            "Name": "static.vprofile.acme.com",
            "Type": "A",
            "AliasTarget": {
                "HostedZoneId": "Z2FDTNDATAQYW2",
                "DNSName": "'$CF_DOMAIN'",
                "EvaluateTargetHealth": false
            }
        }
    }]
}'
```

`Z2FDTNDATAQYW2` = global hosted zone ID của CloudFront (cố định).

### Update HTML template app

App link `/static/style.css` → đổi thành `https://static.vprofile.acme.com/static/style.css`.

JSP code update:

```jsp
<link rel="stylesheet" href="https://static.vprofile.acme.com/static/css/style.css">
<script src="https://static.vprofile.acme.com/static/js/main.js"></script>
```

Rebuild + redeploy app.

### Cache invalidation

```bash
# Invalidate sau khi update asset
aws cloudfront create-invalidation \
    --distribution-id $CF_DIST_ID \
    --paths "/static/css/*" "/static/js/*"
```

Cost: 1000 path/month free, sau đó $0.005/path. Tránh invalidate thường xuyên → dùng versioned filename: `style.v2.css`.

## Architecture sau refactor

```text
                  CloudFront (CDN)
                        │ static asset
                        ▼
                 S3 (vprofile-static)
                        ▲
                        │
User → Route 53 → ALB ──┼─► EC2 ASG (app01-N) ──┐
                        │   nginx + Tomcat       │
                        │                        │
                        │   1 instance:          │ JDBC
                        │   - Tomcat (8080)      ├─► RDS Multi-AZ
                        │   - nginx (80, deprec) ├─► ElastiCache (2 node)
                        │                        └─► Amazon MQ (1 broker)
```

5 EC2 → 1-N EC2 (ASG) + RDS + ElastiCache + Amazon MQ + S3 + CloudFront.

Operational burden giảm cực nhiều.

## Cost comparison

| Component | Lift-shift | Refactor |
|---|---|---|
| Compute | 5 × t3.micro = $38 | 2 × t3.small ASG = $30 |
| Storage | 5 × 20GB EBS = $10 | EBS ASG = $4 |
| RDS Multi-AZ | (in EC2) | $30 |
| ElastiCache | (in EC2) | $24 (2 node) |
| Amazon MQ | (in EC2) | $25 |
| S3 + CloudFront | - | $5-15 |
| ALB | $20 | $20 |
| NAT | $32 | $32 |
| **Total** | **~$130** | **~$180** |

Refactor đắt hơn ~$50/month nhưng:
- Multi-AZ HA cho DB/cache/MQ.
- Auto backup + patch + monitoring.
- Scale dễ.
- Less ops time (= cheaper engineer hour).

## Disaster Recovery patterns

### Backup & Restore

- RDS automated backup 7 ngày.
- S3 versioning + cross-region replication.
- AMI snapshot weekly.
- RTO: hours, RPO: minutes.

### Pilot Light

- Primary region full prod.
- DR region: stopped EC2 (template ready) + RDS read replica.
- Failover: start EC2, promote read replica.
- RTO: ~30 phút, RPO: < 5 phút.

### Warm Standby

- DR region run scaled-down version.
- Failover: scale up.
- RTO: ~10 phút.

### Multi-site Active-Active

- 2 regions both serve traffic.
- Route 53 latency routing.
- Global DB (Aurora Global, DynamoDB Global).
- RTO/RPO: ~0.
- Cost: 2x.

vProfile lab → Backup & Restore đủ.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| ElastiCache cross-region | Latency tăng | Cùng region với app |
| Amazon MQ TLS không config | App fail connect | TLS 1.2 + truststore |
| S3 public bucket | Data leak | OAC + private bucket |
| CloudFront cache stale | User thấy old asset | Versioned filename hoặc invalidate |
| Cert CloudFront ở region khác us-east-1 | Cert không attach | CloudFront cert PHẢI us-east-1 |
| Invalidation thường xuyên | $$$ | Versioned asset, không invalidate |

## Tóm tắt bài 3

- **ElastiCache** Memcached managed cluster với auto-discovery.
- **Amazon MQ** RabbitMQ managed, **enforce TLS** (port 5671).
- **S3 + CloudFront + OAC** = CDN static asset, app HTML chỉ HTML/API.
- **Versioned filename** thay invalidation.
- **CloudFront cert** ở us-east-1 mandatory.
- DR pattern: Backup/Pilot Light/Warm Standby/Active-Active.
- Refactor cost +~$50/month, ops time giảm 80%.

**Bài kế tiếp** → [Bài 4: Migration checklist + monitoring + final architecture](04-migration-checklist.md)
