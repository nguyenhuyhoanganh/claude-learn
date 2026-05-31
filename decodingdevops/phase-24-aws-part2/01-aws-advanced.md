# Bài 1: AWS Part 2 — service nâng cao

Phase 13 cover IAM, EC2, VPC, S3, RDS. Bài này nâng cao: **Lambda, ECS, EKS, CloudFront, Route 53, Auto Scaling, Systems Manager** — service production-grade.

## Lambda — serverless function

> **Lambda** = chạy code không quản server. Pay per invocation + duration. Free tier 1M req/month.

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

### Triggers

| Trigger | Use case |
|---|---|
| API Gateway | REST API |
| S3 event | Process upload (resize image, scan) |
| EventBridge | Schedule, system event |
| SQS / SNS | Async messaging |
| DynamoDB Stream | React to DB change |
| CloudWatch Logs | Log processing |
| ALB | HTTP backend |
| Lambda function URL | Direct HTTPS endpoint |

### Limit

- Memory: 128 MB - 10 GB.
- Timeout: max 15 phút.
- Package size: 50 MB zip, 250 MB unzipped.
- Concurrent: 1000/account default.

### Cold start

First invoke = init runtime + load code → 100ms-2s. Sau đó "warm" cho 5-15 phút.

Mitigation:
- Provisioned concurrency (always warm, $).
- SnapStart (Java).
- Smaller package.

## API Gateway

REST/HTTP API frontend cho Lambda hoặc service khác.

```yaml
# Đơn giản nhất: Lambda Function URL
aws lambda create-function-url-config \
    --function-name hello \
    --auth-type NONE
# → https://xxx.lambda-url.us-east-1.on.aws/
```

Hoặc API Gateway:
- HTTP API (cheaper, fewer features).
- REST API (full features, transformation, validation).

Pattern serverless backend:

```text
Client → API Gateway → Lambda → DynamoDB
                              → S3
                              → Other service
```

## ECS — Elastic Container Service

AWS native container orchestration. Đơn giản hơn K8s.

### Concepts

| Term | Mô tả |
|---|---|
| **Cluster** | Tập compute (EC2 hoặc Fargate) |
| **Task definition** | JSON spec container (image, port, env, resource) |
| **Task** | Instance của task definition đang chạy |
| **Service** | Maintain N task running, auto-restart fail |

### Launch type

- **EC2**: bạn quản EC2 host.
- **Fargate**: AWS quản — pay per task vCPU + memory + duration.

Fargate = serverless container. Đơn giản hơn nhưng đắt hơn EC2 ~20%.

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

3 task auto-restart, behind ALB, log to CloudWatch.

## EKS — Elastic Kubernetes Service

Managed K8s. Section 29-30 sẽ deep-dive.

```bash
# Create cluster
eksctl create cluster --name vprofile --region us-east-1 --nodes 3

# Wait ~15 phút

# kubectl ready
kubectl get nodes
```

ECS vs EKS:
- **ECS**: đơn giản, AWS-only, học nhanh.
- **EKS**: K8s standard, portable cross-cloud, ecosystem khổng lồ, học phức tạp.

Khoá học làm K8s (section 29-30) vì standard hơn.

## CloudFront — CDN

Cache content global, giảm latency:

```text
User in Asia → CloudFront Asia edge (cached HTML) ← cache miss → S3 us-east-1
```

200+ edge location.

```bash
aws cloudfront create-distribution \
    --origin-domain-name my-bucket.s3.amazonaws.com \
    --default-root-object index.html
```

Use case:
- Static site (S3 + CF).
- Reverse proxy cho ALB (cache + WAF).
- Video stream.
- Software download.

## Route 53

DNS + health check + DNS-based routing.

```bash
# Create hosted zone
aws route53 create-hosted-zone --name acme.com --caller-reference $(date +%s)

# Add A record
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

### Routing policy

- **Simple**: 1 record.
- **Weighted**: split traffic A/B test.
- **Latency-based**: route đến region gần user.
- **Failover**: primary down → secondary.
- **Geolocation**: theo country/state.
- **Multi-value**: như round-robin DNS.

## Auto Scaling Group (ASG)

Đã touch phase 15. Deep:

### Scaling policies

**Target tracking** (recommend):

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

Auto add/remove instance để CPU ~ 70%.

**Step scaling**: thay đổi N instance khi metric cross threshold.

**Scheduled**: cron-like (vd Friday peak hour: +5 instance).

### Lifecycle hook

Custom action khi instance start/terminate:

```text
Launch:
  1. ASG launch EC2
  2. Hook PAUSE
  3. Run script (warm up, register service mesh)
  4. CONTINUE → in service
```

## Systems Manager (SSM)

Manage EC2 không SSH:

### Session Manager

```bash
aws ssm start-session --target i-xxx
# Tương đương SSH nhưng qua IAM, không cần key pair, không cần SSH port open
```

### Run Command

```bash
aws ssm send-command \
    --instance-ids i-xxx i-yyy \
    --document-name AWS-RunShellScript \
    --parameters '{"commands":["uptime","df -h"]}'
```

### Parameter Store

Lưu config + secret (free up to 10k params):

```bash
aws ssm put-parameter --name /vprofile/db-host --value "vprofile-rds.xxx" --type String
aws ssm put-parameter --name /vprofile/db-password --value "secret" --type SecureString

# Read
aws ssm get-parameter --name /vprofile/db-password --with-decryption
```

App đọc qua SDK → no hardcode secret.

### Patch Manager

Auto patch OS + app.

### Inventory

Hiện software cài đặt mọi EC2.

## Secrets Manager

Tốt hơn Parameter Store cho secret:
- Auto-rotate (RDS password tự đổi mỗi 30 ngày).
- IAM-integrated.
- Versioning.

```bash
aws secretsmanager create-secret \
    --name prod/db/password \
    --secret-string '{"username":"admin","password":"xxx"}'

# Retrieve
aws secretsmanager get-secret-value --secret-id prod/db/password
```

Cost: $0.40/secret/month + $0.05/10k API call.

## CloudTrail

Audit log mọi API call:

```bash
# Bật trail
aws cloudtrail create-trail --name org-trail --s3-bucket-name acme-trail-bucket
aws cloudtrail start-logging --name org-trail
```

Log đi vào S3. Query với Athena:

```sql
SELECT eventName, userIdentity.arn, sourceIPAddress, eventTime
FROM cloudtrail_logs
WHERE eventName = 'TerminateInstances'
  AND eventTime > '2026-05-01'
```

## Cost optimization advanced

### Cost Explorer

Console → Billing → Cost Explorer:
- Cost per service.
- Cost per tag.
- Cost per AZ.
- Forecast.

### Trusted Advisor

Auto-suggest:
- Idle EC2 (delete).
- Old EBS snapshot.
- Unused Elastic IP.
- Low-utilization RDS.

### Compute Savings Plan

Commit $/hour 1-3 năm, apply mọi compute (EC2, Fargate, Lambda).

### Spot for non-critical

Mix on-demand + spot trong ASG:

```bash
aws autoscaling create-auto-scaling-group \
    --mixed-instances-policy "InstancesDistribution={OnDemandPercentageAboveBaseCapacity=30}"
```

70% spot, 30% on-demand → save ~50%.

## AWS Organizations

Multi-account structure:

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

Pros:
- Blast radius limit.
- Cost separation per team.
- Compliance isolation.

Free service.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Lambda cold start critical path | Latency spike | Provisioned concurrency |
| ECS Fargate cost | $$$ for high traffic | EC2 launch type cheaper |
| CloudFront cache HTML | Stale content | TTL ngắn cho HTML, dài cho asset |
| Route 53 health check too strict | Failover unnecessary | Tune threshold |
| ASG terminate active instance | Connection drop | Connection draining |
| SSM Session Manager log | Compliance | Log session vào S3/CW |
| Multiple account chaos | Permission hell | Organizations + IAM Identity Center |

## Tóm tắt bài 1

- **Lambda**: serverless function, pay per invocation, max 15 phút.
- **ECS**: AWS container orchestrate (Fargate serverless / EC2).
- **EKS**: managed Kubernetes.
- **CloudFront**: CDN global edge cache.
- **Route 53**: DNS + health check + routing policy.
- **ASG**: auto-scale theo metric, lifecycle hook custom.
- **SSM**: Session Manager (no SSH), Parameter Store, Patch Manager.
- **Secrets Manager**: better than Parameter Store cho secret + auto-rotate.
- **CloudTrail**: audit mọi API call.
- **Organizations**: multi-account structure cho isolation + cost.

**Phase kế tiếp** → [Phase 25 — Bài 1: AWS CI/CD project](../phase-25-aws-cicd/01-aws-cicd.md)
