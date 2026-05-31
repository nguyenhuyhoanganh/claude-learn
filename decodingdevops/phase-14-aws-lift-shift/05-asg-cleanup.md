# Bài 5: Auto Scaling Group + monitor + cleanup

App01 single instance = fragile. Bài này setup **Auto Scaling Group** (ASG) cho HA + scale, đặt monitor, và cleanup nghiêm túc.

## Vì sao ASG?

Single app01:
- Crash → outage (cho đến khi manual restart).
- Traffic peak → 1 instance quá tải.
- AZ failure → toàn app down.

ASG fix:
- **Self-healing**: instance unhealthy → auto-replace.
- **Multi-AZ**: spread instance qua nhiều AZ.
- **Auto-scale**: thêm/bớt theo metric.
- **Rolling deploy**: update template → ASG launch instance mới, kill cũ.

## Launch Template

Replace deprecated "Launch Configuration":

```bash
# Trước hết tạo AMI từ app01 đã configure
APP_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=app01" \
    --query 'Reservations[0].Instances[0].InstanceId' --output text)

AMI_ID=$(aws ec2 create-image \
    --instance-id $APP_ID \
    --name "vprofile-app-$(date +%Y%m%d-%H%M%S)" \
    --description "vProfile app server" \
    --no-reboot \
    --query 'ImageId' --output text)

aws ec2 wait image-available --image-ids $AMI_ID
echo "AMI ready: $AMI_ID"
```

`--no-reboot` = snapshot khi instance running (filesystem có thể inconsistent — OK cho stateless app).

### Launch template

```bash
# User data tóm tắt — pull artifact + start
USER_DATA=$(base64 -w 0 <<'EOF'
#!/bin/bash
set -e
# Tomcat đã preinstalled trong AMI

# Pull latest .war từ S3
aws s3 cp s3://vprofile-artifacts/latest.war /opt/tomcat/webapps/ROOT.war
chown tomcat:tomcat /opt/tomcat/webapps/ROOT.war

systemctl restart tomcat
EOF
)

aws ec2 create-launch-template \
    --launch-template-name vprofile-app-lt \
    --version-description "v1" \
    --launch-template-data "{
        \"ImageId\": \"$AMI_ID\",
        \"InstanceType\": \"t3.small\",
        \"KeyName\": \"vprofile-key\",
        \"IamInstanceProfile\": {\"Name\": \"ec2-vprofile-role\"},
        \"SecurityGroupIds\": [\"$APP_SG\"],
        \"UserData\": \"$USER_DATA\",
        \"MetadataOptions\": {
            \"HttpEndpoint\": \"enabled\",
            \"HttpTokens\": \"required\"
        },
        \"TagSpecifications\": [{
            \"ResourceType\": \"instance\",
            \"Tags\": [
                {\"Key\": \"Name\", \"Value\": \"vprofile-app\"},
                {\"Key\": \"Project\", \"Value\": \"vprofile\"}
            ]
        }],
        \"BlockDeviceMappings\": [{
            \"DeviceName\": \"/dev/xvda\",
            \"Ebs\": {
                \"VolumeSize\": 20,
                \"VolumeType\": \"gp3\",
                \"DeleteOnTermination\": true,
                \"Encrypted\": true
            }
        }]
    }"
```

Versioned: có thể tạo `v2`, `v3` → ASG dùng `$Latest` hoặc pin version.

## Create ASG

```bash
# Get private subnets
PRIV_SUBNETS=$(aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:Name,Values=vprofile-private-*" \
    --query 'Subnets[].SubnetId' --output text | tr '\t' ',')

# Create ASG
aws autoscaling create-auto-scaling-group \
    --auto-scaling-group-name vprofile-app-asg \
    --launch-template "LaunchTemplateName=vprofile-app-lt,Version=\$Latest" \
    --min-size 2 \
    --max-size 6 \
    --desired-capacity 2 \
    --vpc-zone-identifier "$PRIV_SUBNETS" \
    --target-group-arns $TG_API \
    --health-check-type ELB \
    --health-check-grace-period 300 \
    --termination-policies "OldestInstance" \
    --tags "Key=Name,Value=vprofile-app,PropagateAtLaunch=true,ResourceId=vprofile-app-asg,ResourceType=auto-scaling-group" \
    --enabled-metrics GroupMinSize GroupMaxSize GroupDesiredCapacity GroupInServiceInstances
```

| Tham số | Vai trò |
|---|---|
| `min-size` 2 | Luôn ≥ 2 instance (HA) |
| `max-size` 6 | Không quá 6 (cost cap) |
| `desired-capacity` 2 | Bắt đầu 2 |
| `health-check-type ELB` | Dùng ALB health check (chính xác hơn EC2) |
| `health-check-grace-period` 300 | Cho phép 5 phút đầu instance boot |
| `termination-policies OldestInstance` | Scale-in kill instance cũ nhất |

## Scaling policy — target tracking

```bash
# Scale theo CPU
aws autoscaling put-scaling-policy \
    --auto-scaling-group-name vprofile-app-asg \
    --policy-name cpu-target-tracking \
    --policy-type TargetTrackingScaling \
    --target-tracking-configuration '{
        "TargetValue": 70.0,
        "PredefinedMetricSpecification": {
            "PredefinedMetricType": "ASGAverageCPUUtilization"
        },
        "ScaleOutCooldown": 60,
        "ScaleInCooldown": 300
    }'

# Scale theo request count
aws autoscaling put-scaling-policy \
    --auto-scaling-group-name vprofile-app-asg \
    --policy-name request-target-tracking \
    --policy-type TargetTrackingScaling \
    --target-tracking-configuration "{
        \"TargetValue\": 1000.0,
        \"PredefinedMetricSpecification\": {
            \"PredefinedMetricType\": \"ALBRequestCountPerTarget\",
            \"ResourceLabel\": \"app/vprofile-alb/xxx/targetgroup/vprofile-api-tg/yyy\"
        }
    }"
```

CPU > 70% → scale-up. Request > 1000/target → scale-up.

Cooldown: **scale-out fast** (60s, đáp ứng peak), **scale-in slow** (5 phút, tránh thrashing).

## Scheduled scaling

```bash
# Scale up trước peak time (9 AM weekday)
aws autoscaling put-scheduled-update-group-action \
    --auto-scaling-group-name vprofile-app-asg \
    --scheduled-action-name peak-morning \
    --recurrence "0 9 * * MON-FRI" \
    --min-size 4 \
    --desired-capacity 4

# Scale down sau giờ làm việc
aws autoscaling put-scheduled-update-group-action \
    --auto-scaling-group-name vprofile-app-asg \
    --scheduled-action-name off-peak \
    --recurrence "0 19 * * *" \
    --min-size 2 \
    --desired-capacity 2
```

Cron-like schedule. Use case: traffic predictable theo time-of-day.

## Lifecycle hook

Pause instance lifecycle để run custom action:

```bash
aws autoscaling put-lifecycle-hook \
    --lifecycle-hook-name pre-terminate-drain \
    --auto-scaling-group-name vprofile-app-asg \
    --lifecycle-transition autoscaling:EC2_INSTANCE_TERMINATING \
    --heartbeat-timeout 300 \
    --default-result CONTINUE
```

Terminate event → instance vào `Terminating:Wait` state → bạn drain connection → call `complete-lifecycle-action` → instance terminate.

Use case:
- Drain ALB target trước khi kill.
- Backup local data.
- De-register service discovery.

## Mix On-Demand + Spot

```bash
aws autoscaling create-auto-scaling-group \
    --auto-scaling-group-name vprofile-app-asg \
    --mixed-instances-policy '{
        "LaunchTemplate": {
            "LaunchTemplateSpecification": {
                "LaunchTemplateName": "vprofile-app-lt"
            },
            "Overrides": [
                {"InstanceType": "t3.small"},
                {"InstanceType": "t3.medium"},
                {"InstanceType": "t3a.small"}
            ]
        },
        "InstancesDistribution": {
            "OnDemandBaseCapacity": 2,
            "OnDemandPercentageAboveBaseCapacity": 30,
            "SpotAllocationStrategy": "capacity-optimized"
        }
    }' \
    ...
```

Base 2 instance on-demand (đảm bảo HA). Trên đó 30% on-demand + 70% spot → save ~50% cost.

Spot có thể terminate 2-min notice → app phải tolerate.

## Monitoring

### CloudWatch dashboard

```bash
aws cloudwatch put-dashboard --dashboard-name vprofile \
    --dashboard-body file://dashboard.json
```

`dashboard.json`:

```json
{
    "widgets": [
        {
            "type": "metric",
            "properties": {
                "metrics": [
                    ["AWS/ApplicationELB", "RequestCount", {"stat": "Sum"}],
                    [".", "TargetResponseTime", {"stat": "Average"}],
                    [".", "HTTPCode_Target_5XX_Count", {"stat": "Sum"}]
                ],
                "period": 60,
                "region": "us-east-1"
            }
        },
        {
            "type": "metric",
            "properties": {
                "metrics": [
                    ["AWS/AutoScaling", "GroupInServiceInstances", "AutoScalingGroupName", "vprofile-app-asg"],
                    [".", "GroupDesiredCapacity", ".", "."]
                ]
            }
        }
    ]
}
```

### CloudWatch alarm

```bash
# Alert nếu CPU > 80% sustained 5 phút
aws cloudwatch put-metric-alarm \
    --alarm-name vprofile-high-cpu \
    --metric-name CPUUtilization \
    --namespace AWS/EC2 \
    --statistic Average \
    --period 60 \
    --threshold 80 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 5 \
    --dimensions Name=AutoScalingGroupName,Value=vprofile-app-asg \
    --alarm-actions arn:aws:sns:us-east-1:123:vprofile-alerts \
    --treat-missing-data notBreaching

# 5xx error rate
aws cloudwatch put-metric-alarm \
    --alarm-name vprofile-5xx-errors \
    --metric-name HTTPCode_Target_5XX_Count \
    --namespace AWS/ApplicationELB \
    --statistic Sum \
    --period 60 \
    --threshold 10 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 5 \
    --alarm-actions $SNS_TOPIC
```

### SNS topic cho alert

```bash
SNS_TOPIC=$(aws sns create-topic --name vprofile-alerts \
    --query TopicArn --output text)

# Subscribe email
aws sns subscribe \
    --topic-arn $SNS_TOPIC \
    --protocol email \
    --notification-endpoint devops@acme.com

# Hoặc Slack webhook (qua Lambda)
```

## CloudWatch Logs

```bash
# Tạo log group
aws logs create-log-group --log-group-name /aws/ec2/vprofile

# Set retention
aws logs put-retention-policy \
    --log-group-name /aws/ec2/vprofile \
    --retention-in-days 30
```

Install CloudWatch Agent trên EC2:

```bash
# Trong user data hoặc Ansible:
dnf install -y amazon-cloudwatch-agent

cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<'EOF'
{
    "logs": {
        "logs_collected": {
            "files": {
                "collect_list": [
                    {
                        "file_path": "/opt/tomcat/logs/catalina.out",
                        "log_group_name": "/aws/ec2/vprofile",
                        "log_stream_name": "{instance_id}-tomcat"
                    }
                ]
            }
        }
    },
    "metrics": {
        "metrics_collected": {
            "mem": {"measurement": ["mem_used_percent"]},
            "disk": {"measurement": ["disk_used_percent"], "resources": ["/"]}
        }
    }
}
EOF

systemctl enable --now amazon-cloudwatch-agent
```

EC2 đẩy log vào CloudWatch. Query qua Logs Insights:

```sql
fields @timestamp, @message
| filter @message like /ERROR/
| sort @timestamp desc
| limit 100
```

## Cleanup — quan trọng

Lab xong **phải cleanup** tránh bill.

### Script cleanup

```bash
#!/bin/bash
set -e

# Delete ASG (instances tự terminate)
aws autoscaling update-auto-scaling-group \
    --auto-scaling-group-name vprofile-app-asg \
    --min-size 0 --max-size 0 --desired-capacity 0

aws autoscaling delete-auto-scaling-group \
    --auto-scaling-group-name vprofile-app-asg \
    --force-delete

# Delete launch template
aws ec2 delete-launch-template --launch-template-name vprofile-app-lt

# Terminate standalone EC2
for tag in db01 mc01 rmq01 web01 bastion; do
    ID=$(aws ec2 describe-instances --filters "Name=tag:Name,Values=$tag" \
        --query 'Reservations[0].Instances[0].InstanceId' --output text 2>/dev/null)
    [ "$ID" != "None" ] && aws ec2 terminate-instances --instance-ids $ID
done

# Wait terminate
sleep 60

# Delete ALB
aws elbv2 delete-load-balancer --load-balancer-arn $ALB_ARN
sleep 30

# Delete target groups
aws elbv2 delete-target-group --target-group-arn $TG_ARN

# Delete cert (only nếu không reuse)
aws acm delete-certificate --certificate-arn $CERT_ARN

# Delete NAT GW
aws ec2 delete-nat-gateway --nat-gateway-id $NAT_ID

# Wait NAT delete
sleep 60

# Release EIP của NAT
aws ec2 release-address --allocation-id $EIP_ALLOC

# Delete subnets
for sub in $SUBNETS_TO_DELETE; do
    aws ec2 delete-subnet --subnet-id $sub
done

# Detach + delete IGW
aws ec2 detach-internet-gateway --internet-gateway-id $IGW_ID --vpc-id $VPC_ID
aws ec2 delete-internet-gateway --internet-gateway-id $IGW_ID

# Delete SG (sau khi instance terminate)
for sg in $ALB_SG $APP_SG $BACKEND_SG $BASTION_SG; do
    aws ec2 delete-security-group --group-id $sg
done

# Delete VPC
aws ec2 delete-vpc --vpc-id $VPC_ID

# Verify
aws ec2 describe-instances --filters "Name=tag:Project,Values=vprofile" "Name=instance-state-name,Values=running,stopped"
# Phải rỗng

echo "Cleanup complete"
```

### Check bill

```bash
# Cost trong tháng hiện tại
aws ce get-cost-and-usage \
    --time-period Start=2026-05-01,End=2026-05-31 \
    --granularity MONTHLY \
    --metrics BlendedCost \
    --group-by Type=DIMENSION,Key=SERVICE
```

Sau cleanup, mọi service cost còn ~0.

## Architecture cuối lift-shift

```text
                Internet
                    │
                    ▼
              Route 53
                    │
                    ▼
              ALB :443 + ACM cert
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
    web01 (AZ-a)           web01-asg-2 (AZ-b)  ← Khả thi nếu ASG cho web
    Public subnet           Public subnet
        │                       │
        └───────────┬───────────┘
                    │
                    ▼ (nginx upstream)
            ASG: app01-N (Private)
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
      db01        mc01       rmq01
    (Private)   (Private)   (Private)
```

✓ Multi-AZ ALB.
✓ Auto-scale app tier.
✓ Private DB/cache/queue.
✓ HTTPS với ACM.
✓ Monitoring + alarm.

Phase 15 sẽ refactor data tier sang managed services.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| AMI từ "running" instance | Filesystem inconsistent | `--no-reboot` OK cho stateless |
| Launch template không version | Update phá ASG | Pin version, không $Latest cho prod |
| Grace period quá ngắn | New instance kill ngay | 300s+ cho Tomcat slow boot |
| Scale-in trong peak | Drop connection | Cooldown 5+ phút |
| Spot không tolerate | App crash khi spot reclaim | Stateless + checkpoint |
| Health check ELB nhưng app /health 404 | Loop replace instance | Implement /health endpoint |
| Forget log retention | $0.5/GB tích | Set 30d retention |

## Tóm tắt bài 5

- **Launch Template** versioned thay Launch Configuration deprecated.
- **ASG** min/max/desired + multi-AZ subnet → HA + auto-scale.
- Target tracking scaling đơn giản nhất: CPU 70%, request 1000/target.
- **Scheduled scaling** cho traffic predictable.
- **Mix On-Demand + Spot** save 50%.
- **CloudWatch Agent** push log + custom metric.
- **Cleanup nghiêm túc** — ASG → ALB → NAT → subnet → VPC.
- Always check Cost Explorer sau lab.

**Bài kế tiếp** → [Phase 15 — Refactor sang managed services](../phase-15-aws-refactor/01-aws-refactor.md)
