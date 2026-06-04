# Bài 4: Systems Manager, Secrets Manager, Organizations, Governance

Bài cuối của phase 24. Tổng hợp các service vận hành (operational) + governance (quản trị) cho mô hình multi-account.

## Systems Manager (SSM)

Service để quản lý EC2 + on-premises ở quy mô lớn.

### Session Manager — Thay thế SSH

```bash
# Connect vào EC2 (không cần SSH key, không cần bastion host)
aws ssm start-session --target i-xxx

# Port forwarding qua Session Manager (vd: forward MySQL port)
aws ssm start-session \
    --target i-xxx \
    --document-name AWS-StartPortForwardingSession \
    --parameters '{"portNumber":["3306"],"localPortNumber":["13306"]}'

# Audit log được ghi vào S3 / CloudWatch
```

Yêu cầu: EC2 phải gắn IAM role `AmazonSSMManagedInstanceCore`. Sau đó user nào có quyền SSM đều có thể access. **Không cần bastion, không cần SSH key public** → giảm rất nhiều rủi ro bảo mật.

### Run Command — Chạy lệnh trên nhiều instance

```bash
# Chạy lệnh trên các instance cụ thể
aws ssm send-command \
    --instance-ids i-xxx i-yyy i-zzz \
    --document-name AWS-RunShellScript \
    --parameters '{"commands":["uptime","df -h"]}' \
    --comment "Health check" \
    --output-s3-bucket-name acme-ssm-output \
    --max-concurrency 50% \
    --max-errors 5%

# Chạy theo tag (target tất cả EC2 có tag Environment=production)
aws ssm send-command \
    --targets "Key=tag:Environment,Values=production" \
    --document-name AWS-RunShellScript \
    --parameters '{"commands":["yum update -y"]}'

# Chạy theo Auto Scaling Group
aws ssm send-command \
    --targets "Key=tag:AutoScalingGroupName,Values=vprofile-asg" \
    ...
```

Có thể schedule như cron qua **State Manager**.

### Patch Manager — Tự động vá lỗi OS

Tự động update OS cho cả fleet (đội ngũ máy):

```bash
# Định nghĩa patch baseline (tiêu chuẩn patch)
aws ssm create-patch-baseline \
    --name vprofile-baseline \
    --operating-system AMAZON_LINUX_2023 \
    --approval-rules '{
        "PatchRules": [{
            "PatchFilterGroup": {
                "PatchFilters": [
                    {"Key": "CLASSIFICATION", "Values": ["Security"]},
                    {"Key": "SEVERITY", "Values": ["Critical", "Important"]}
                ]
            },
            "ApproveAfterDays": 0,
            "ComplianceLevel": "CRITICAL"
        }]
    }'

# Apply hàng tuần qua maintenance window
aws ssm create-maintenance-window \
    --name vprofile-patching \
    --schedule "cron(0 2 ? * SUN *)" \
    --duration 4 \
    --cutoff 1
```

### Parameter Store — Lưu config + secret

Lưu config dạng **hierarchical** (phân cấp theo đường dẫn) + secret. **Free** đến 10,000 parameter.

```bash
# Standard parameter (free)
aws ssm put-parameter \
    --name /vprofile/prod/db/host \
    --value vprofile-rds.xxx.rds.amazonaws.com \
    --type String

# Parameter encrypt (vẫn free)
aws ssm put-parameter \
    --name /vprofile/prod/db/password \
    --value "SuperSecret123!" \
    --type SecureString \
    --key-id alias/aws/ssm

# Advanced parameter ($0.05 / 10k API call)
aws ssm put-parameter \
    --name /vprofile/prod/config \
    --value "$(cat config.json)" \
    --type SecureString \
    --tier Advanced
```

Đọc từ app:

```python
import boto3
ssm = boto3.client("ssm")

# Đọc 1 parameter
db_host = ssm.get_parameter(Name="/vprofile/prod/db/host")["Parameter"]["Value"]
db_pass = ssm.get_parameter(Name="/vprofile/prod/db/password",
                             WithDecryption=True)["Parameter"]["Value"]

# Đọc theo path (tất cả parameter dưới /vprofile/prod/)
resp = ssm.get_parameters_by_path(
    Path="/vprofile/prod/",
    Recursive=True,
    WithDecryption=True
)
```

Yêu cầu EC2 / Lambda có IAM role với quyền `ssm:GetParameter`.

### State Manager — Phát hiện và sửa Config drift

```bash
aws ssm create-association \
    --name AWS-ApplyAnsiblePlaybooks \
    --targets "Key=tag:Project,Values=vprofile" \
    --schedule-expression "cron(0 6 ? * * *)" \
    --parameters '{
        "SourceType": ["S3"],
        "SourceInfo": ["{\"path\":\"https://s3.amazonaws.com/acme-config/playbook.yml\"}"],
        "PlaybookFile": ["playbook.yml"]
    }'
```

Mỗi sáng 6h → chạy Ansible playbook → enforce config về đúng trạng thái mong muốn. Nếu có ai thay đổi thủ công (drift) → sẽ bị undo.

## Secrets Manager

Giống Parameter Store SecureString nhưng có thêm:

- **Auto-rotation** (tự động rotate — vd: đổi password RDS định kỳ).
- **Versioning** (có version current + previous, rollback được).
- **Cross-account share** (share giữa nhiều AWS account).
- **Replication** cross-region.

**Cost**: $0.40 / secret / tháng + $0.05 / 10k API call. Đắt hơn Parameter Store nhưng tính năng mạnh hơn.

### Tạo secret + Auto-rotate password RDS

```bash
aws secretsmanager create-secret \
    --name prod/vprofile/rds \
    --secret-string '{"username":"admin","password":"InitialPass123!"}'

# Bật auto-rotate
aws secretsmanager rotate-secret \
    --secret-id prod/vprofile/rds \
    --rotation-lambda-arn arn:aws:lambda:us-east-1:123:function:SecretsManagerRDSMariaDBRotationSingleUser \
    --rotation-rules AutomaticallyAfterDays=30
```

Mỗi 30 ngày → Lambda function rotate password RDS + update secret. App tự fetch password mới — không cần can thiệp thủ công.

### Dùng secret trong ECS task

```json
"secrets": [{
    "name": "DB_PASSWORD",
    "valueFrom": "arn:aws:secretsmanager:us-east-1:123:secret:prod/vprofile/rds:password::"
}]
```

ECS tự inject env var `DB_PASSWORD` = giá trị field `password` từ secret.

### Cross-account access (Chia sẻ secret giữa các account)

```json
{
    "Version": "2012-10-17",
    "Statement": [{
        "Effect": "Allow",
        "Principal": {"AWS": "arn:aws:iam::222:root"},
        "Action": "secretsmanager:GetSecretValue",
        "Resource": "*"
    }]
}
```

Account 222 có thể đọc secret từ account 111 — tránh duplicate secret ở nhiều account.

## CloudTrail — Audit log toàn bộ API call

Mỗi API call vào AWS đều được log lại:

```bash
aws cloudtrail create-trail \
    --name org-trail \
    --s3-bucket-name acme-cloudtrail-logs \
    --include-global-service-events \
    --is-multi-region-trail \
    --enable-log-file-validation \
    --kms-key-id arn:aws:kms:us-east-1:123:key/xxx

aws cloudtrail start-logging --name org-trail
```

Query log bằng Athena (SQL trên S3):

```sql
SELECT
    eventTime,
    eventName,
    userIdentity.arn,
    sourceIPAddress
FROM cloudtrail_logs
WHERE eventName = 'TerminateInstances'
  AND eventTime > '2026-05-01'
ORDER BY eventTime DESC;
```

CloudTrail là **bắt buộc** cho: detect untrusted user (user không tin cậy), regulatory compliance (tuân thủ luật), incident investigation (điều tra sự cố).

## AWS Config — Compliance + drift detection

```bash
aws configservice put-configuration-recorder \
    --configuration-recorder name=default,roleARN=arn:aws:iam::123:role/config-role \
    --recording-group allSupported=true,includeGlobalResourceTypes=true
```

Các predefined rule (rule có sẵn) thường dùng:
- S3 bucket có public access không.
- RDS có encryption không.
- EC2 có dùng IMDSv1 (phiên bản cũ, kém bảo mật) không.
- ELB có yêu cầu HTTPS không.

Có thể viết custom rule bằng Lambda.

**Auto-remediation**: Khi rule fail → trigger SSM Automation → tự fix vấn đề.

## Organizations — Multi-account governance

Mô hình quản lý nhiều AWS account:

```text
Management Account (billing — trả tiền tập trung)
├── OU: Production
│   ├── prod-app (account)
│   ├── prod-data (account)
│   └── prod-logging (account)
├── OU: Non-Prod
│   ├── dev
│   ├── staging
│   └── sandbox
└── OU: Security
    ├── security (consolidated CloudTrail + GuardDuty)
    └── audit (auditor read-only)
```

OU = Organizational Unit (đơn vị tổ chức).

### Setup

```bash
# Bật Organizations
aws organizations create-organization --feature-set ALL

# Tạo OU
aws organizations create-organizational-unit \
    --parent-id r-xxx \
    --name Production

# Tạo account mới
aws organizations create-account \
    --email aws+prod-app@acme.com \
    --account-name prod-app \
    --iam-user-access-to-billing DENY
```

### Service Control Policy (SCP) — Guardrail (rào chắn)

Giới hạn quyền tối đa cho một account — kể cả root user cũng không vượt qua được:

```json
{
    "Version": "2012-10-17",
    "Statement": [{
        "Sid": "DenyExpensiveInstances",
        "Effect": "Deny",
        "Action": "ec2:RunInstances",
        "Resource": "arn:aws:ec2:*:*:instance/*",
        "Condition": {
            "StringNotLike": {
                "ec2:InstanceType": ["t3.*", "t4g.*", "m5.large", "m5.xlarge"]
            }
        }
    }, {
        "Sid": "DenyDeleteCloudTrail",
        "Effect": "Deny",
        "Action": "cloudtrail:DeleteTrail",
        "Resource": "*"
    }]
}
```

Kể cả root user trong dev account cũng **không thể** launch instance t3.16xlarge. Vô cùng hữu ích cho cost control + security.

### Centralized billing (Billing tập trung)

Management account thấy được billing của tất cả các account → tận dụng được Reserved Instance share, Savings Plan.

### Cross-account IAM

```json
{
    "Version": "2012-10-17",
    "Statement": [{
        "Effect": "Allow",
        "Principal": {"AWS": "arn:aws:iam::PROD_ACCOUNT:role/admin"},
        "Action": "sts:AssumeRole"
    }]
}
```

Admin trong prod account assume role vào dev → quản lý nhiều account mà không cần đăng nhập riêng từng cái.

## IAM Identity Center (SSO)

Thay thế việc tạo user riêng cho từng account:

1. **Identity source**: Active Directory / Okta / built-in directory.
2. **Permission sets**: Định nghĩa các role (Admin, Developer, ReadOnly).
3. **Assign**: Gán user/group vào account + permission set.

User login vào portal trung tâm → chọn account + role → assume.

**Audit**: log đầy đủ ai vào account nào, làm gì, khi nào.

## AWS Control Tower

Tự động setup Organizations + landing zone + guardrails sẵn. Khuyến nghị dùng cho enterprise mới bắt đầu — tiết kiệm cả tháng setup thủ công.

## Cost optimization advanced (Tối ưu chi phí nâng cao)

### Trusted Advisor

Dashboard miễn phí check các vấn đề thường gặp:
- EC2 đang idle (không dùng).
- EBS volume underutilized (chưa khai thác hết).
- Old snapshot (snapshot cũ tốn dung lượng).
- S3 bucket có public access (rủi ro bảo mật).

### Compute Optimizer

Đề xuất right-sizing dựa trên ML:
- EC2: gợi ý chuyển sang instance nhỏ hơn nếu underutilized.
- EBS: gợi ý chuyển gp2 → gp3 (rẻ hơn).
- Lambda: gợi ý tinh chỉnh memory tối ưu.

### Compute Savings Plan

Cam kết chi $X / giờ trong 1-3 năm, áp dụng cho:
- EC2 (mọi instance family).
- Fargate.
- Lambda.

**Tiết kiệm 27-72%** so với On-Demand.

### EC2 Instance Savings Plan

Cam kết cụ thể 1 instance family (vd: m5) — discount cao hơn nhưng kém linh hoạt hơn.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| SSM agent không chạy | Session Manager fail | Verify SSM agent installed |
| Secret rotate nhưng app cache password cũ | App fail sau rotation | Cache TTL ngắn hoặc refresh khi auth fail |
| CloudTrail chỉ 1 region | Miss API call ở region khác | Multi-region trail |
| SCP quá restrictive | Block luôn admin work | Test trong OU dev trước |
| Organizations không có SCP | Không có guardrail | Tối thiểu deny các action nguy hiểm |
| Patch baseline auto-approve all | Update bất ngờ gây outage | Test trong dev trước |
| Parameter Store standard giới hạn 4 KB | Config bị truncate | Dùng Advanced tier (8 KB) |

## Tổng kết phase 24

4 bài đã cover:
1. AWS service overview.
2. Lambda + API Gateway + Step Functions + EventBridge.
3. ECS + EKS + CloudFront + Route 53 advanced.
4. SSM + Secrets Manager + Organizations + governance.

Skill đạt được:
- Thiết kế serverless application.
- Container orchestration AWS-native.
- Operational excellence với SSM.
- Multi-account governance.

## Tóm tắt bài 4

- **SSM Session Manager** thay thế SSH, có audit log.
- **SSM Parameter Store** free cho config/secret theo cấu trúc phân cấp.
- **SSM Patch Manager** tự động patch fleet.
- **Secrets Manager** auto-rotate + cross-account share.
- **CloudTrail** audit + Athena query.
- **Config** compliance + drift detection + auto-remediation.
- **Organizations** multi-account + SCP làm guardrail.
- **IAM Identity Center** SSO portal tập trung.
- **Compute Optimizer + Savings Plan** tối ưu chi phí nâng cao.

**Phase kế tiếp** → [Phase 25 — AWS CI/CD project](../phase-25-aws-cicd/01-aws-cicd.md)
