# Bài 4: Systems Manager, Secrets Manager, Organizations, governance

Bài cuối phase 24. Operational service + multi-account governance.

## Systems Manager (SSM)

Manage EC2 + on-prem at scale.

### Session Manager — SSH replacement

```bash
# Connect (no SSH key, no bastion needed)
aws ssm start-session --target i-xxx

# Run port forward
aws ssm start-session \
    --target i-xxx \
    --document-name AWS-StartPortForwardingSession \
    --parameters '{"portNumber":["3306"],"localPortNumber":["13306"]}'

# Audit log to S3 / CloudWatch
```

EC2 cần IAM role `AmazonSSMManagedInstanceCore`. Then any user với SSM permission có thể access. No bastion, no SSH key public.

### Run Command — execute on multi-instance

```bash
aws ssm send-command \
    --instance-ids i-xxx i-yyy i-zzz \
    --document-name AWS-RunShellScript \
    --parameters '{"commands":["uptime","df -h"]}' \
    --comment "Health check" \
    --output-s3-bucket-name acme-ssm-output \
    --max-concurrency 50% \
    --max-errors 5%

# Or by tag
aws ssm send-command \
    --targets "Key=tag:Environment,Values=production" \
    --document-name AWS-RunShellScript \
    --parameters '{"commands":["yum update -y"]}'

# Or by ASG
aws ssm send-command \
    --targets "Key=tag:AutoScalingGroupName,Values=vprofile-asg" \
    ...
```

Cron-like: schedule với State Manager.

### Patch Manager

Auto patch OS on fleet:

```bash
# Define baseline
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

# Apply weekly via maintenance window
aws ssm create-maintenance-window \
    --name vprofile-patching \
    --schedule "cron(0 2 ? * SUN *)" \
    --duration 4 \
    --cutoff 1
```

### Parameter Store

Hierarchical config + secret (free up to 10k params).

```bash
# Standard parameter (free)
aws ssm put-parameter \
    --name /vprofile/prod/db/host \
    --value vprofile-rds.xxx.rds.amazonaws.com \
    --type String

# Encrypted (still free)
aws ssm put-parameter \
    --name /vprofile/prod/db/password \
    --value "SuperSecret123!" \
    --type SecureString \
    --key-id alias/aws/ssm

# Advanced parameter ($0.05/10k)
aws ssm put-parameter \
    --name /vprofile/prod/config \
    --value "$(cat config.json)" \
    --type SecureString \
    --tier Advanced
```

Read in app:

```python
import boto3
ssm = boto3.client("ssm")

# Single
db_host = ssm.get_parameter(Name="/vprofile/prod/db/host")["Parameter"]["Value"]
db_pass = ssm.get_parameter(Name="/vprofile/prod/db/password",
                             WithDecryption=True)["Parameter"]["Value"]

# By path (all under /vprofile/prod/)
resp = ssm.get_parameters_by_path(
    Path="/vprofile/prod/",
    Recursive=True,
    WithDecryption=True
)
```

EC2/Lambda IAM role với `ssm:GetParameter` permission.

### State Manager

Configuration drift detection:

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

Daily 6am → run Ansible playbook → enforce config.

## Secrets Manager

Like Parameter Store SecureString but with:
- **Auto-rotation** (RDS password tự đổi periodically).
- **Versioning** (current + previous version).
- **Cross-account share**.
- **Replication** cross-region.

Cost: $0.40/secret/month + $0.05/10k API call.

### Create + auto-rotate RDS password

```bash
aws secretsmanager create-secret \
    --name prod/vprofile/rds \
    --secret-string '{"username":"admin","password":"InitialPass123!"}'

# Enable auto-rotate
aws secretsmanager rotate-secret \
    --secret-id prod/vprofile/rds \
    --rotation-lambda-arn arn:aws:lambda:us-east-1:123:function:SecretsManagerRDSMariaDBRotationSingleUser \
    --rotation-rules AutomaticallyAfterDays=30
```

Every 30 days → Lambda rotate RDS password + update secret. App auto-fetch new password.

### Use in ECS task

```json
"secrets": [{
    "name": "DB_PASSWORD",
    "valueFrom": "arn:aws:secretsmanager:us-east-1:123:secret:prod/vprofile/rds:password::"
}]
```

ECS inject env var DB_PASSWORD = password field từ secret.

### Cross-account access

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

Account 222 read secret from account 111. Avoid duplicate secret.

## CloudTrail — audit log

Every API call logged:

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

Query với Athena:

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

Critical: untrust trusted user, regulatory compliance, incident investigation.

## Config — compliance + drift

```bash
aws configservice put-configuration-recorder \
    --configuration-recorder name=default,roleARN=arn:aws:iam::123:role/config-role \
    --recording-group allSupported=true,includeGlobalResourceTypes=true
```

Predefined rules:
- S3 bucket public access.
- RDS encryption.
- EC2 with IMDSv1.
- ELB without HTTPS.

Custom rules với Lambda.

Auto-remediation: rule fail → trigger SSM Automation → fix.

## Organizations — multi-account

```text
Management Account (billing)
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
    └── audit (read-only auditor)
```

### Setup

```bash
# Enable Organizations
aws organizations create-organization --feature-set ALL

# Create OU
aws organizations create-organizational-unit \
    --parent-id r-xxx \
    --name Production

# Create account
aws organizations create-account \
    --email aws+prod-app@acme.com \
    --account-name prod-app \
    --iam-user-access-to-billing DENY
```

### Service Control Policy (SCP)

Limit max permission for account:

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

Even root user trong dev account không thể launch t3.16xlarge.

### Centralized billing

Management account see all account billing → reserved instance share, savings plan.

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

Admin trong prod account assume role trong dev → manage without separate login.

## IAM Identity Center (SSO)

Replace per-account user:

1. Identity source: Active Directory / Okta / built-in.
2. Permission sets: defined roles (Admin, Developer, ReadOnly).
3. Assign user/group → account + permission set.

User login portal → choose account + role → assume.

Audit: who accessed what when.

## AWS Control Tower

Auto setup Organizations + landing zone + guardrails. Recommended cho enterprise new account.

## Cost optimization advanced

### Trusted Advisor

Free dashboard:
- Idle EC2.
- Underutilized EBS.
- Old snapshot.
- Public S3 bucket.

### Compute Optimizer

ML-based right-sizing:
- EC2: suggest smaller instance.
- EBS: suggest gp2 → gp3.
- Lambda: suggest memory tune.

### Compute Savings Plan

Commit $/hour 1-3 năm, apply across:
- EC2 (any family).
- Fargate.
- Lambda.

Save 27-72% vs On-Demand.

### EC2 Instance Savings Plan

Commit specific family (e.g., m5) — higher discount but less flexible.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| SSM agent not running | Session Manager fail | Verify cloudwatch-agent installed |
| Secret rotate but app cache password | App fail after rotation | Cache TTL short hoặc refresh on auth fail |
| CloudTrail one region | Miss API call other region | Multi-region trail |
| SCP too restrictive | Block admin work | Test in OU first |
| Organizations no SCP | No guardrail | At least deny dangerous actions |
| Patch baseline auto-approve all | Surprise update | Test in dev first |
| Parameter Store standard limit 4 KB | Config truncated | Advanced tier 8 KB |

## Tổng kết phase 24

4 bài cover:
1. AWS service overview.
2. Lambda + API Gateway + Step Functions + EventBridge.
3. ECS + EKS + CloudFront + Route 53 advanced.
4. SSM + Secrets Manager + Organizations + governance.

Skills:
- Serverless application architecture.
- Container orchestration AWS-native.
- Operational excellence với SSM.
- Multi-account governance.

## Tóm tắt bài 4

- **SSM Session Manager** replace SSH, audit log.
- **SSM Parameter Store** free config/secret hierarchical.
- **SSM Patch Manager** auto-patch fleet.
- **Secrets Manager** auto-rotate + cross-account share.
- **CloudTrail** audit + Athena query.
- **Config** compliance + drift detection + auto-remediation.
- **Organizations** multi-account + SCP guardrail.
- **IAM Identity Center** SSO portal.
- **Compute Optimizer + Savings Plan** advanced cost optimization.

**Phase kế tiếp** → [Phase 25 — AWS CI/CD project](../phase-25-aws-cicd/01-aws-cicd.md)
