# Bài 4: Migration checklist + monitoring + total architecture

Bài cuối phase 15. Tổng hợp **migration checklist cho production**, setup **CloudWatch monitoring đầy đủ**, và tổng kết kiến trúc.

## Migration playbook — Pattern chuẩn

Mọi migration đều follow 8 phase chuẩn:

```text
1. Assess     — Phân tích current state, dependency
2. Plan       — Architecture target, runbook từng bước
3. Build      — Provision infra mới (chạy parallel với cũ)
4. Test       — Smoke test, load test, security test
5. Pilot      — Cutover 1% traffic (canary)
6. Migrate    — Cutover toàn bộ traffic
7. Validate   — Monitor 1-7 ngày
8. Decom      — Tear down infrastructure cũ
```

### Phase 1: Assess (Đánh giá hiện trạng)

Checklist:
- [ ] Liệt kê mọi service + version + dependency.
- [ ] Identify external integration (API, DB, SMTP, ...).
- [ ] Document file cấu hình (env var, password, cert).
- [ ] Measure performance baseline hiện tại (RPS, latency, error rate).
- [ ] Identify maintenance window (cửa sổ thời gian được phép downtime).
- [ ] Ước tính cost của target architecture.
- [ ] Risk analysis: cái gì có thể break?

### Phase 2: Plan (Lập kế hoạch)

- [ ] Architecture diagram target.
- [ ] Runbook step-by-step (T-7 ngày, T-1 ngày, T-giờ, T+1, T+7).
- [ ] Rollback plan cho **mỗi step** (cực kỳ quan trọng).
- [ ] Communication plan (stakeholder, user, on-call).
- [ ] Test plan: unit, integration, load, security.
- [ ] Success criteria define rõ ràng (tiêu chí thành công).

### Phase 3: Build (Xây dựng song song)

```bash
# Tạo infra mới với Terraform
terraform plan -out=migrate.plan
terraform apply migrate.plan
```

- [ ] VPC + network.
- [ ] Security group.
- [ ] RDS (chưa có data).
- [ ] ElastiCache.
- [ ] Amazon MQ.
- [ ] S3 + CloudFront.
- [ ] ASG + ALB (với image).
- [ ] Monitoring + alerting.
- [ ] CI/CD pipeline.

### Phase 4: Test

- [ ] **Functional test**: feature có hoạt động không?
- [ ] **Smoke test**: critical path (login, checkout) có chạy không?
- [ ] **Load test**: chịu được expected traffic không?
- [ ] **Failure test**: kill 1 AZ, app vẫn chạy không?
- [ ] **Security test**: penetration, OWASP top 10.
- [ ] **Backup/restore test**: thực sự restore được không?
- [ ] **DNS failover test**.

### Phase 5: Pilot (Soft launch với canary)

```bash
# Route 53 weighted routing
# Old infrastructure: weight 99
# New infrastructure: weight 1

aws route53 change-resource-record-sets --hosted-zone-id $ZONE \
    --change-batch file://canary-1pct.json
```

Monitor:
- Error rate có giữ hoặc thấp hơn không?
- Latency có giữ hoặc thấp hơn không?
- User feedback có tiêu cực không?

**Stop canary** nếu có issue. **Tăng weight** nếu OK: 1% → 5% → 25% → 50% → 100%.

### Phase 6: Migrate (Cutover toàn bộ)

Cutover hoàn toàn. Thường thực hiện giữa đêm (off-peak hour):

```text
T-0 phút:       Enable maintenance page (tuỳ chọn)
T+5:            Final data sync (RDS dump + restore delta)
T+15:           DNS switch — 100% sang new
T+20:           Smoke test trên new
T+30:           Disable maintenance page
T+60:           Bắt đầu giai đoạn monitor cường độ cao
```

Data sync tricky cho stateful (DB). Tool hỗ trợ:
- **AWS DMS** (Database Migration Service): replication liên tục.
- **mysqldump + apply delta**: đơn giản.
- **Aurora cluster from snapshot**: zero downtime.

### Phase 7: Validate (Theo dõi liên tục)

24-72 giờ monitor liên tục:
- Mọi metric có trong SLO không?
- Có user complaint không?
- Trend error rate ra sao?
- Cost thực tế so với estimate?

### Phase 8: Decom (Tháo dỡ hệ thống cũ)

```bash
# Verify không có gì connect tới hệ thống cũ
aws ec2 describe-network-interfaces --filters "Name=group-id,Values=$OLD_SG"

# Snapshot để cold storage phòng cần khôi phục
aws ec2 create-snapshot --volume-id $OLD_VOL

# Terminate
aws ec2 terminate-instances --instance-ids $OLD_EC2_LIST

# Chờ 30 ngày, sau đó mới xoá hẳn snapshot:
aws ec2 delete-snapshot --snapshot-id $OLD_SNAPSHOT
```

> Quan trọng: **Giữ snapshot ~30 ngày** phòng trường hợp cần rollback.

## CloudWatch comprehensive monitoring

### Application metrics

CloudWatch Agent setup trên mỗi EC2 (đã có trong AMI):

```json
{
    "agent": {
        "metrics_collection_interval": 60,
        "run_as_user": "cwagent"
    },
    "metrics": {
        "namespace": "vprofile",
        "metrics_collected": {
            "cpu": {
                "measurement": [
                    {"name": "cpu_usage_idle", "rename": "CPU_IDLE", "unit": "Percent"},
                    "cpu_usage_iowait"
                ],
                "metrics_collection_interval": 60
            },
            "mem": {
                "measurement": ["mem_used_percent", "mem_available"]
            },
            "disk": {
                "measurement": ["disk_used_percent"],
                "resources": ["/", "/var"]
            },
            "netstat": {
                "measurement": ["tcp_established", "tcp_time_wait"]
            }
        }
    },
    "logs": {
        "logs_collected": {
            "files": {
                "collect_list": [
                    {
                        "file_path": "/opt/tomcat/logs/catalina.out",
                        "log_group_name": "/aws/ec2/vprofile/tomcat",
                        "log_stream_name": "{instance_id}"
                    },
                    {
                        "file_path": "/var/log/nginx/access.log",
                        "log_group_name": "/aws/ec2/vprofile/nginx",
                        "log_stream_name": "{instance_id}-access"
                    }
                ]
            }
        }
    }
}
```

### Custom metric (Metric tự định nghĩa)

App publish custom metric (vd: số đơn hàng):

```python
import boto3

cw = boto3.client('cloudwatch')

cw.put_metric_data(
    Namespace='vprofile',
    MetricData=[{
        'MetricName': 'OrderCount',
        'Value': 1,
        'Unit': 'Count',
        'Dimensions': [{'Name': 'Environment', 'Value': 'production'}]
    }]
)
```

Hoặc trong Java:

```java
@Autowired
private CloudWatchClient cw;

cw.putMetricData(PutMetricDataRequest.builder()
    .namespace("vprofile")
    .metricData(MetricDatum.builder()
        .metricName("OrderCount")
        .value(1.0)
        .unit(StandardUnit.COUNT)
        .build())
    .build());
```

### Dashboard JSON

```json
{
    "widgets": [
        {
            "type": "metric",
            "x": 0, "y": 0, "width": 12, "height": 6,
            "properties": {
                "title": "ALB Traffic",
                "metrics": [
                    ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", "app/vprofile-alb/xxx", {"stat": "Sum"}],
                    [".", "HTTPCode_Target_2XX_Count", ".", ".", {"stat": "Sum"}],
                    [".", "HTTPCode_Target_4XX_Count", ".", ".", {"stat": "Sum"}],
                    [".", "HTTPCode_Target_5XX_Count", ".", ".", {"stat": "Sum"}]
                ],
                "period": 60,
                "stacked": false
            }
        },
        {
            "type": "metric",
            "x": 12, "y": 0, "width": 12, "height": 6,
            "properties": {
                "title": "Response Time",
                "metrics": [
                    ["AWS/ApplicationELB", "TargetResponseTime", {"stat": "p50"}],
                    [".", ".", {"stat": "p95"}],
                    [".", ".", {"stat": "p99"}]
                ]
            }
        },
        {
            "type": "metric",
            "x": 0, "y": 6, "width": 12, "height": 6,
            "properties": {
                "title": "RDS",
                "metrics": [
                    ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", "vprofile-rds"],
                    [".", "DatabaseConnections", ".", "."],
                    [".", "FreeableMemory", ".", "."]
                ]
            }
        },
        {
            "type": "metric",
            "x": 12, "y": 6, "width": 12, "height": 6,
            "properties": {
                "title": "ElastiCache",
                "metrics": [
                    ["AWS/ElastiCache", "CPUUtilization"],
                    [".", "CacheMisses"],
                    [".", "CacheHits"]
                ]
            }
        },
        {
            "type": "log",
            "x": 0, "y": 12, "width": 24, "height": 6,
            "properties": {
                "title": "Recent Errors",
                "query": "SOURCE '/aws/ec2/vprofile/tomcat' | fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc | limit 50",
                "region": "us-east-1"
            }
        }
    ]
}
```

```bash
aws cloudwatch put-dashboard \
    --dashboard-name vprofile-prod \
    --dashboard-body file://dashboard.json
```

### Alarm đầy đủ (Comprehensive alarms)

```bash
# SNS topic cho alert
SNS_ALERTS=$(aws sns create-topic --name vprofile-alerts \
    --query TopicArn --output text)

aws sns subscribe --topic-arn $SNS_ALERTS \
    --protocol email --notification-endpoint devops@acme.com

# 5xx error rate
aws cloudwatch put-metric-alarm \
    --alarm-name vprofile-5xx-rate \
    --metric-name HTTPCode_Target_5XX_Count \
    --namespace AWS/ApplicationELB \
    --statistic Sum --period 60 --threshold 10 \
    --evaluation-periods 5 --comparison-operator GreaterThanThreshold \
    --alarm-actions $SNS_ALERTS

# Response time P99
aws cloudwatch put-metric-alarm \
    --alarm-name vprofile-p99-latency \
    --metric-name TargetResponseTime \
    --namespace AWS/ApplicationELB \
    --extended-statistic p99 --period 60 --threshold 2 \
    --evaluation-periods 3 --comparison-operator GreaterThanThreshold \
    --alarm-actions $SNS_ALERTS

# RDS CPU
aws cloudwatch put-metric-alarm \
    --alarm-name vprofile-rds-cpu \
    --metric-name CPUUtilization \
    --namespace AWS/RDS \
    --dimensions Name=DBInstanceIdentifier,Value=vprofile-rds \
    --statistic Average --period 300 --threshold 80 \
    --evaluation-periods 3 --comparison-operator GreaterThanThreshold \
    --alarm-actions $SNS_ALERTS

# RDS Free storage
aws cloudwatch put-metric-alarm \
    --alarm-name vprofile-rds-storage-low \
    --metric-name FreeStorageSpace \
    --namespace AWS/RDS \
    --dimensions Name=DBInstanceIdentifier,Value=vprofile-rds \
    --statistic Average --period 300 \
    --threshold 5368709120 \
    --evaluation-periods 1 --comparison-operator LessThanThreshold \
    --alarm-actions $SNS_ALERTS

# Cache miss rate cao
aws cloudwatch put-metric-alarm \
    --alarm-name vprofile-cache-miss-high \
    --metric-name CacheMisses \
    --namespace AWS/ElastiCache \
    --statistic Sum --period 300 --threshold 1000 \
    --evaluation-periods 3 --comparison-operator GreaterThanThreshold \
    --alarm-actions $SNS_ALERTS

# ASG instance < desired
aws cloudwatch put-metric-alarm \
    --alarm-name vprofile-asg-undercapacity \
    --metric-name GroupInServiceInstances \
    --namespace AWS/AutoScaling \
    --dimensions Name=AutoScalingGroupName,Value=vprofile-app-asg \
    --statistic Minimum --period 60 --threshold 2 \
    --evaluation-periods 5 --comparison-operator LessThanThreshold \
    --alarm-actions $SNS_ALERTS
```

→ 8+ alarm cover golden signals + infrastructure.

## SNS → Slack (qua Lambda)

Email + Slack: tạo Lambda forward từ SNS sang Slack:

```python
# lambda_function.py
import json
import urllib3

http = urllib3.PoolManager()
WEBHOOK = "https://hooks.slack.com/services/..."

def lambda_handler(event, context):
    for record in event['Records']:
        msg = json.loads(record['Sns']['Message'])
        alarm = msg.get('AlarmName', 'Unknown')
        state = msg.get('NewStateValue', '?')
        reason = msg.get('NewStateReason', '')

        color = 'good' if state == 'OK' else 'danger'
        slack_msg = {
            "attachments": [{
                "color": color,
                "title": f"{state}: {alarm}",
                "text": reason
            }]
        }

        http.request(
            'POST', WEBHOOK,
            body=json.dumps(slack_msg),
            headers={'Content-Type': 'application/json'}
        )

    return {"statusCode": 200}
```

Subscribe Lambda vào SNS topic.

## Cost monitoring + budget alarm

```bash
# Budget $200/tháng, alert ở 80% và 100%
aws budgets create-budget --account-id $ACCOUNT_ID --budget '{
    "BudgetName": "vprofile-monthly",
    "BudgetLimit": {"Amount": "200", "Unit": "USD"},
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST",
    "CostFilters": {"TagKeyValue": ["user:Project$vprofile"]}
}' --notifications-with-subscribers '[
    {
        "Notification": {
            "NotificationType": "ACTUAL",
            "ComparisonOperator": "GREATER_THAN",
            "Threshold": 80
        },
        "Subscribers": [{"SubscriptionType": "EMAIL", "Address": "devops@acme.com"}]
    },
    {
        "Notification": {
            "NotificationType": "FORECASTED",
            "ComparisonOperator": "GREATER_THAN",
            "Threshold": 100
        },
        "Subscribers": [{"SubscriptionType": "EMAIL", "Address": "devops@acme.com"}]
    }
]'
```

Budget track cost theo tag `Project=vprofile`. Gửi email khi vượt 80% + dự báo (forecast) > 100%.

## Final architecture diagram (Kiến trúc hoàn chỉnh)

```text
                              Internet Users
                                    │
                                    ▼
                              Route 53
                                    │
                       ┌────────────┴────────────┐
                       │                         │
                       ▼                         ▼
                  CloudFront                    ALB :443
                  (static)                   (HTTPS, multi-AZ)
                       │                         │
                       ▼                         ▼
                S3 (vprofile-static)      ┌──────────────┐
                                          │ ASG: app-*   │
                                          │ Private SN   │
                                          │ Tomcat       │
                                          │ × 2-6 inst   │
                                          └──┬──┬──┬─────┘
                                             │  │  │
                            ┌────────────────┘  │  └────────────────┐
                            ▼                   ▼                   ▼
                    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
                    │ RDS MariaDB  │    │ ElastiCache  │    │ Amazon MQ    │
                    │ Multi-AZ     │    │ Memcached    │    │ RabbitMQ     │
                    │ 7d backup    │    │ 2 nodes      │    │ Single-AZ    │
                    └──────────────┘    └──────────────┘    └──────────────┘

CloudWatch: dashboard, alarm, log (Tomcat + nginx + ALB + RDS)
SNS → Email + Slack alert
Budget: $200/tháng
Secrets Manager: DB password, MQ password
ACM: TLS cert (ALB + CloudFront)
```

## Tổng kết Phase 14 + 15

| Aspect | Phase 8 (Vagrant) | Phase 14 (Lift-shift EC2) | Phase 15 (Refactor) |
|---|---|---|---|
| Infrastructure | Local VM | AWS EC2 | AWS managed service |
| HA | Không | Single instance | Multi-AZ |
| Auto-scale | Không | Manual | ASG + HPA |
| Backup | Manual | Manual | Auto RDS + S3 versioning |
| Monitor | Không | Basic | CloudWatch toàn diện |
| TLS | Không | ACM | ACM mọi nơi |
| Cost (lab) | $0 | $130 | $180 |
| Ops time | Cao | Cao | Thấp |
| Production-ready | Không | Gần | **Có** |

vProfile sau phase 15 = **production-grade SaaS**.

## Bẫy thường gặp khi migration

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Migration không có runbook | Step bị missed bất ngờ | Document step-by-step |
| Không có rollback plan | Stuck khi fail | Plan rollback trước tiên |
| Cutover giờ peak | User bị ảnh hưởng | Off-peak window |
| Skip canary | Issue lộ ra 100% user | 1% → 5% → 100% |
| Decom quá nhanh | Không rollback được | Chờ 30 ngày để observation |
| Không load test trước migration | Bottleneck bất ngờ | Load test 2-3x expected |
| Cost overrun không có budget alarm | Bill shock | Setup budget alarm trước |

## Tóm tắt bài 4

- 8-phase migration playbook: Assess → Plan → Build → Test → Pilot → Migrate → Validate → Decom.
- **Canary deployment** qua Route 53 weighted routing.
- **CloudWatch Agent** push log + custom metric.
- **Dashboard JSON** programmatic creation.
- **8+ alarm** cover golden signals + infrastructure.
- **SNS + Lambda** route alert sang Slack.
- **AWS Budgets** alert khi cost overrun.
- Final architecture: production-grade với HA, auto-scale, monitoring đầy đủ.

**Phase kế tiếp** → [Phase 16 — Build Tools](../phase-16-build-tools/01-build-tools.md)
