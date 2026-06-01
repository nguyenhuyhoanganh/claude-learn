# Bài 1: AWS Part 2 — Service nâng cao

Phase 13 đã cover IAM, EC2, VPC, S3, RDS. Bài này về các service nâng cao: **Lambda, ECS, EKS, CloudFront, Route 53, Auto Scaling, Systems Manager** — đây là các service production-grade bạn sẽ gặp hằng ngày.

## Lambda — Serverless function

> **Lambda** = chạy code mà không cần quản lý server. Trả tiền theo lần invoke + duration. Free tier 1 triệu request/tháng.

```python
# lambda_handler.py
import json

def lambda_handler(event, context):
    name = event.get('queryStringParameters', {}).get('name', 'World')
    return {
        'statusCode': 200,
        'body': json.dumps({'message': f'Hello {name}'})
    }
```

```bash
# Deploy
zip function.zip lambda_handler.py

aws lambda create-function \
    --function-name hello \
    --runtime python3.12 \
    --role arn:aws:iam::123:role/lambda-exec \
    --handler lambda_handler.lambda_handler \
    --zip-file fileb://function.zip

# Invoke
aws lambda invoke --function-name hello --payload '{}' response.json
```

### Triggers (Nguồn kích hoạt Lambda)

| Trigger | Use case |
|---|---|
| API Gateway | REST API |
| S3 event | Xử lý khi có upload (resize image, scan virus) |
| EventBridge | Schedule (như cron), system event |
| SQS / SNS | Async messaging |
| DynamoDB Stream | React khi DB thay đổi |
| CloudWatch Logs | Log processing |
| ALB | HTTP backend (như EC2) |
| Lambda function URL | Endpoint HTTPS trực tiếp, không qua API Gateway |

### Limit (Giới hạn)

- **Memory**: 128 MB – 10 GB.
- **Timeout**: tối đa 15 phút.
- **Package size**: 50 MB (zip), 250 MB (unzipped).
- **Concurrent**: 1000 invocation song song / account (mặc định, có thể request tăng).

### Cold start (Vấn đề khởi động lạnh)

Lần invoke đầu tiên = init runtime + load code → mất 100ms-2s. Sau đó function "warm" trong 5-15 phút (Lambda giữ container lại).

Cách giảm cold start:
- **Provisioned concurrency** (luôn warm, tốn tiền).
- **SnapStart** (cho Java — snapshot state).
- Giảm package size để load nhanh.

## API Gateway

REST/HTTP API frontend cho Lambda hoặc các service khác.

```yaml
# Cách đơn giản nhất: Lambda Function URL
aws lambda create-function-url-config \
    --function-name hello \
    --auth-type NONE
# → https://xxx.lambda-url.us-east-1.on.aws/
```

Hoặc dùng API Gateway:
- **HTTP API** (rẻ, ít feature).
- **REST API** (đầy đủ feature: transformation, validation).

Pattern serverless backend phổ biến:

```text
Client → API Gateway → Lambda → DynamoDB
                              → S3
                              → Service khác
```

## ECS — Elastic Container Service

Container orchestration native của AWS. Đơn giản hơn K8s nhiều.

### Khái niệm

| Term | Mô tả |
|---|---|
| **Cluster** | Tập compute (EC2 hoặc Fargate) |
| **Task definition** | JSON spec container (image, port, env, resource limit) |
| **Task** | Instance đang chạy của task definition |
| **Service** | Đảm bảo có N task đang chạy, auto-restart khi fail |

### Launch type

- **EC2**: bạn tự quản EC2 host (cheaper, more control).
- **Fargate**: AWS manage host hộ — trả tiền theo task vCPU + memory + duration.

Fargate = serverless container — đơn giản hơn nhưng đắt hơn EC2 khoảng 20%.

### Task definition example

```json
{
    "family": "vprofile-app",
    "networkMode": "awsvpc",
    "containerDefinitions": [{
        "name": "tomcat",
        "image": "123.dkr.ecr.us-east-1.amazonaws.com/vprofile:v1.0",
        "portMappings": [{"containerPort": 8080}],
        "essential": true,
        "environment": [
            {"name": "DB_HOST", "value": "vprofile-rds.xxx.rds.amazonaws.com"}
        ],
        "logConfiguration": {
            "logDriver": "awslogs",
            "options": {
                "awslogs-group": "/ecs/vprofile",
                "awslogs-region": "us-east-1"
            }
        }
    }],
    "requiresCompatibilities": ["FARGATE"],
    "cpu": "512",
    "memory": "1024"
}
```

### Service

```bash
aws ecs create-service \
    --cluster vprofile \
    --service-name app \
    --task-definition vprofile-app \
    --desired-count 3 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx]}" \
    --load-balancers "targetGroupArn=arn:...,containerName=tomcat,containerPort=8080"
```

3 task chạy + auto-restart khi fail, đứng sau ALB, log vào CloudWatch.

## EKS — Elastic Kubernetes Service

Managed Kubernetes. Section 29-30 sẽ đi sâu.

```bash
# Tạo cluster
eksctl create cluster --name vprofile --region us-east-1 --nodes 3

# Chờ ~15 phút

# kubectl đã sẵn sàng
kubectl get nodes
```

ECS vs EKS:
- **ECS**: đơn giản, chỉ chạy trên AWS, học nhanh.
- **EKS**: standard K8s, portable đa cloud, ecosystem khổng lồ, học phức tạp.

Khoá học chọn K8s (section 29-30) vì là standard hơn.

## CloudFront — CDN của AWS

Cache content trên các edge location toàn cầu, giảm latency:

```text
User ở châu Á → CloudFront Asia edge (cached HTML)
                ↓ cache miss
                S3 us-east-1
```

CloudFront có 200+ edge location trên thế giới.

```bash
aws cloudfront create-distribution \
    --origin-domain-name my-bucket.s3.amazonaws.com \
    --default-root-object index.html
```

Use case:
- Static site (S3 + CloudFront).
- Reverse proxy cho ALB (cache + WAF tích hợp).
- Video stream.
- Software download.

## Route 53

DNS + health check + DNS-based routing.

```bash
# Tạo hosted zone
aws route53 create-hosted-zone --name acme.com --caller-reference $(date +%s)

# Thêm A record (alias đến ALB)
aws route53 change-resource-record-sets --hosted-zone-id Z123 --change-batch '{
    "Changes": [{
        "Action": "CREATE",
        "ResourceRecordSet": {
            "Name": "app.acme.com",
            "Type": "A",
            "AliasTarget": {
                "HostedZoneId": "Z35SXDOTRQ7X7K",
                "DNSName": "alb-xxx.us-east-1.elb.amazonaws.com",
                "EvaluateTargetHealth": true
            }
        }
    }]
}'
```

### Routing policy (Chính sách routing)

- **Simple**: 1 record duy nhất.
- **Weighted**: split traffic để A/B test.
- **Latency-based**: route user về region gần nhất.
- **Failover**: primary down → chuyển sang secondary.
- **Geolocation**: theo quốc gia / bang.
- **Multi-value**: như round-robin DNS (trả nhiều IP, client tự chọn).

## Auto Scaling Group (ASG)

Đã đề cập sơ ở phase 15. Đào sâu hơn:

### Scaling policies (Chính sách scale)

**Target tracking** (khuyến nghị):

```bash
aws autoscaling put-scaling-policy \
    --auto-scaling-group-name vprofile \
    --policy-name cpu-target \
    --policy-type TargetTrackingScaling \
    --target-tracking-configuration '{
        "TargetValue": 70.0,
        "PredefinedMetricSpecification": {"PredefinedMetricType": "ASGAverageCPUUtilization"}
    }'
```

Auto add/remove instance để giữ CPU ở ~70%.

**Step scaling**: thay đổi N instance khi metric cross qua các ngưỡng cụ thể.

**Scheduled**: cron-like (vd: Friday peak hour → +5 instance).

### Lifecycle hook (Action tuỳ chỉnh khi launch/terminate)

Custom action khi instance start/terminate:

```text
Launch:
  1. ASG launch EC2 mới
  2. Hook PAUSE — chờ
  3. Chạy script (warm up cache, register với service mesh)
  4. CONTINUE → instance vào service
```

## Systems Manager (SSM)

Quản lý EC2 mà không cần SSH:

### Session Manager

```bash
aws ssm start-session --target i-xxx
# Tương đương SSH nhưng qua IAM, không cần key pair, không cần mở SSH port
```

### Run Command

```bash
aws ssm send-command \
    --instance-ids i-xxx i-yyy \
    --document-name AWS-RunShellScript \
    --parameters '{"commands":["uptime","df -h"]}'
```

### Parameter Store

Lưu config + secret (free đến 10k parameter):

```bash
aws ssm put-parameter --name /vprofile/db-host --value "vprofile-rds.xxx" --type String
aws ssm put-parameter --name /vprofile/db-password --value "secret" --type SecureString

# Đọc
aws ssm get-parameter --name /vprofile/db-password --with-decryption
```

App đọc qua SDK → không hardcode secret trong code.

### Patch Manager

Tự động patch OS + app trên fleet.

### Inventory

Hiển thị software đã cài trên mọi EC2.

## Secrets Manager

Tốt hơn Parameter Store cho secret:
- **Auto-rotate** (password RDS tự đổi mỗi 30 ngày).
- Tích hợp IAM.
- Versioning.

```bash
aws secretsmanager create-secret \
    --name prod/db/password \
    --secret-string '{"username":"admin","password":"xxx"}'

# Retrieve
aws secretsmanager get-secret-value --secret-id prod/db/password
```

Cost: $0.40 / secret / tháng + $0.05 / 10k API call.

## CloudTrail

Audit log mọi API call:

```bash
# Bật trail
aws cloudtrail create-trail --name org-trail --s3-bucket-name acme-trail-bucket
aws cloudtrail start-logging --name org-trail
```

Log đi vào S3. Query bằng Athena:

```sql
SELECT eventName, userIdentity.arn, sourceIPAddress, eventTime
FROM cloudtrail_logs
WHERE eventName = 'TerminateInstances'
  AND eventTime > '2026-05-01'
```

## Cost optimization advanced (Tối ưu chi phí)

### Cost Explorer

Console → Billing → Cost Explorer:
- Cost theo service.
- Cost theo tag.
- Cost theo AZ.
- Forecast (dự báo).

### Trusted Advisor

Auto-suggest:
- EC2 idle (xoá).
- EBS snapshot cũ.
- Elastic IP chưa dùng (vẫn tính phí).
- RDS underutilized.

### Compute Savings Plan

Commit $/giờ trong 1-3 năm, áp dụng cho mọi compute (EC2, Fargate, Lambda).

### Spot cho non-critical workload

Mix on-demand + spot trong ASG:

```bash
aws autoscaling create-auto-scaling-group \
    --mixed-instances-policy "InstancesDistribution={OnDemandPercentageAboveBaseCapacity=30}"
```

70% spot, 30% on-demand → tiết kiệm ~50% cost.

## AWS Organizations

Cấu trúc multi-account:

```text
Management account (billing)
├── OU: Production
│   ├── Account: prod-app
│   ├── Account: prod-data
│   └── Account: prod-logging
├── OU: Non-Production
│   ├── Account: dev
│   ├── Account: staging
│   └── Account: qa
└── OU: Security
    ├── Account: security
    └── Account: audit
```

**Lợi ích:**
- Giới hạn blast radius (phạm vi ảnh hưởng khi có sự cố).
- Phân tách chi phí theo team.
- Cô lập compliance.

Service free.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Lambda cold start ở critical path | Latency spike | Provisioned concurrency |
| ECS Fargate cost | $$$ khi traffic cao | EC2 launch type rẻ hơn |
| CloudFront cache HTML | Content cũ | TTL ngắn cho HTML, dài cho static asset |
| Route 53 health check quá strict | Failover không cần thiết | Tinh chỉnh threshold |
| ASG terminate instance đang active | Connection bị drop | Bật connection draining |
| SSM Session Manager log | Compliance | Log session vào S3/CW |
| Multiple account loạn | Permission hell | Dùng Organizations + IAM Identity Center |

## Tóm tắt bài 1

- **Lambda**: serverless function, trả tiền theo invocation, tối đa 15 phút.
- **ECS**: container orchestration của AWS (Fargate serverless / EC2).
- **EKS**: managed Kubernetes.
- **CloudFront**: CDN global edge cache.
- **Route 53**: DNS + health check + routing policy.
- **ASG**: auto-scale theo metric, lifecycle hook tuỳ chỉnh.
- **SSM**: Session Manager (no SSH), Parameter Store, Patch Manager.
- **Secrets Manager**: tốt hơn Parameter Store cho secret + auto-rotate.
- **CloudTrail**: audit mọi API call.
- **Organizations**: cấu trúc multi-account để cô lập + tách cost.

**Phase kế tiếp** → [Phase 25 — Bài 1: AWS CI/CD project](../phase-25-aws-cicd/01-aws-cicd.md)
