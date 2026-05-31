# Bài 4: ALB + Target Group + Route 53 + HTTPS

5 EC2 đã chạy. Bài này expose ra Internet qua **ALB** (Application Load Balancer), gắn domain, bật HTTPS với ACM.

## ALB là gì?

> **ALB** (Application Load Balancer) = layer 7 load balancer, route HTTP/HTTPS traffic dựa **path**, **host**, **header**.

So với 3 loại ELB:

| | Classic (CLB) | Application (ALB) | Network (NLB) | Gateway (GLB) |
|---|---|---|---|---|
| Layer | 4+7 | **7 (HTTP)** | 4 (TCP/UDP) | 3 |
| Path routing | ✗ | **✓** | ✗ | ✗ |
| Host routing | ✗ | **✓** | ✗ | ✗ |
| Performance | OK | Tốt | Cực cao (millions/s) | High |
| WebSocket | ✗ | ✓ | ✓ | ✓ |
| Lambda target | ✗ | ✓ | ✗ | ✗ |
| TLS termination | Yes | Yes | Yes (cert at NLB) | No |
| Static IP | ✗ | ✗ | ✓ | ✓ |
| Status | Legacy | **Default** | Performance | Firewall/IPS |

Hầu hết web app dùng **ALB**.

## Target Group

ALB không route trực tiếp đến EC2 — qua **Target Group**:

```text
ALB → Target Group → EC2 instance / IP / Lambda
```

Target Group:
- Define **target type** (instance, IP, Lambda).
- Define **health check** (path, interval, threshold).
- Maintain **list of healthy targets**.

ALB chỉ route đến healthy targets.

## Tạo Target Group

```bash
# Get VPC ID
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=tag:Name,Values=vprofile-vpc" \
    --query 'Vpcs[0].VpcId' --output text)

# Create Target Group cho web01
TG_ARN=$(aws elbv2 create-target-group \
    --name vprofile-web-tg \
    --protocol HTTP \
    --port 80 \
    --vpc-id $VPC_ID \
    --target-type instance \
    --health-check-protocol HTTP \
    --health-check-path /health \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 5 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --matcher HttpCode=200 \
    --tags Key=Project,Value=vprofile \
    --query 'TargetGroups[0].TargetGroupArn' --output text)
```

### Health check tuning

| Tham số | Mặc định | Vai trò |
|---|---|---|
| `health-check-path` | `/` | Endpoint health check |
| `health-check-interval` | 30s | Gọi mỗi N giây |
| `health-check-timeout` | 5s | Timeout per call |
| `healthy-threshold` | 5 | Consecutive success → healthy |
| `unhealthy-threshold` | 2 | Consecutive fail → unhealthy |
| `matcher` | 200 | HTTP code chấp nhận |

> Tomcat slow boot → tăng interval lên 60s; web01 fast → giảm.

## Register web01 vào Target Group

```bash
WEB_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=web01" \
    --query 'Reservations[0].Instances[0].InstanceId' --output text)

aws elbv2 register-targets --target-group-arn $TG_ARN \
    --targets Id=$WEB_ID
```

### Verify health

```bash
aws elbv2 describe-target-health --target-group-arn $TG_ARN

# Output:
# TargetHealth: {
#   "State": "healthy",
#   "Reason": "",
#   "Description": ""
# }
```

Nếu `unhealthy`:
- Check SG: ALB SG có outbound, target SG có inbound port 80.
- Check `/health` endpoint trả 200.
- Check route table.

## Tạo ALB

```bash
# Get public subnets
SUBNETS=$(aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:Name,Values=vprofile-public-*" \
    --query 'Subnets[].SubnetId' --output text | tr '\t' ' ')

# Create ALB
ALB_ARN=$(aws elbv2 create-load-balancer \
    --name vprofile-alb \
    --type application \
    --scheme internet-facing \
    --ip-address-type ipv4 \
    --subnets $SUBNETS \
    --security-groups $ELB_SG \
    --tags Key=Project,Value=vprofile \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text)

# Get DNS name
ALB_DNS=$(aws elbv2 describe-load-balancers \
    --load-balancer-arns $ALB_ARN \
    --query 'LoadBalancers[0].DNSName' --output text)

echo "ALB DNS: $ALB_DNS"
# vprofile-alb-xxx.us-east-1.elb.amazonaws.com
```

ALB **multi-AZ mandatory** — phải ≥ 2 subnet ở khác AZ.

### Internet-facing vs internal

- `internet-facing`: public IP, accessible từ internet.
- `internal`: chỉ private subnet, không có public IP.

vProfile public app → `internet-facing`.

## Listener — define entry port

```bash
# HTTP listener (will redirect to HTTPS later)
aws elbv2 create-listener \
    --load-balancer-arn $ALB_ARN \
    --protocol HTTP \
    --port 80 \
    --default-actions Type=forward,TargetGroupArn=$TG_ARN
```

Browser → `http://vprofile-alb-xxx.elb.amazonaws.com` → ALB forward → web01 (port 80) → Tomcat (app01:8080).

## Verify end-to-end

```bash
# Wait ALB active (~3 phút)
aws elbv2 wait load-balancer-available --load-balancer-arns $ALB_ARN

# Test
curl -v http://$ALB_DNS
# Phải trả vProfile login page
```

Browser test: copy `$ALB_DNS` paste vào address bar.

## Custom domain với Route 53

### Đăng ký domain (hoặc dùng có sẵn)

Phase 2 đã mua domain. Nếu chưa có:

```bash
aws route53domains check-domain-availability --domain-name vprofile-acme.com
aws route53domains register-domain \
    --domain-name vprofile-acme.com \
    --duration-in-years 1 \
    --admin-contact file://contact.json \
    --registrant-contact file://contact.json \
    --tech-contact file://contact.json
```

Domain qua AWS = auto-create hosted zone.

### Hosted Zone

```bash
# Nếu chưa có
ZONE_ID=$(aws route53 create-hosted-zone \
    --name vprofile-acme.com \
    --caller-reference $(date +%s) \
    --query 'HostedZone.Id' --output text)
```

Note 4 nameserver Route 53 → vào registrar update NS records.

### Tạo A record alias trỏ ALB

```bash
# Get ALB hosted zone (cố định per region)
ALB_HOSTED_ZONE=$(aws elbv2 describe-load-balancers \
    --load-balancer-arns $ALB_ARN \
    --query 'LoadBalancers[0].CanonicalHostedZoneId' --output text)

aws route53 change-resource-record-sets --hosted-zone-id $ZONE_ID --change-batch "{
    \"Changes\": [{
        \"Action\": \"CREATE\",
        \"ResourceRecordSet\": {
            \"Name\": \"vprofile.acme.com\",
            \"Type\": \"A\",
            \"AliasTarget\": {
                \"HostedZoneId\": \"$ALB_HOSTED_ZONE\",
                \"DNSName\": \"$ALB_DNS\",
                \"EvaluateTargetHealth\": true
            }
        }
    }]
}"
```

**A alias** (không phải CNAME) — Route 53 đặc biệt, free + auto-resolve ALB IP.

```bash
dig vprofile.acme.com
# vprofile.acme.com. 60 IN A 1.2.3.4
```

Browser: `http://vprofile.acme.com` → ALB → web01 → Tomcat.

## HTTPS với ACM

### Request cert

```bash
CERT_ARN=$(aws acm request-certificate \
    --domain-name vprofile.acme.com \
    --subject-alternative-names "*.vprofile.acme.com" \
    --validation-method DNS \
    --tags Key=Project,Value=vprofile \
    --query CertificateArn --output text)
```

### DNS validation

```bash
# Get validation CNAME
sleep 30
VALIDATION=$(aws acm describe-certificate \
    --certificate-arn $CERT_ARN \
    --query 'Certificate.DomainValidationOptions[0].ResourceRecord')

NAME=$(echo $VALIDATION | jq -r .Name)
VALUE=$(echo $VALIDATION | jq -r .Value)

# Add CNAME vào Route 53
aws route53 change-resource-record-sets --hosted-zone-id $ZONE_ID --change-batch "{
    \"Changes\": [{
        \"Action\": \"CREATE\",
        \"ResourceRecordSet\": {
            \"Name\": \"$NAME\",
            \"Type\": \"CNAME\",
            \"TTL\": 60,
            \"ResourceRecords\": [{\"Value\": \"$VALUE\"}]
        }
    }]
}"

# Wait cert Issued
aws acm wait certificate-validated --certificate-arn $CERT_ARN
```

5-30 phút sau, cert status → **Issued**.

### Add HTTPS listener

```bash
aws elbv2 create-listener \
    --load-balancer-arn $ALB_ARN \
    --protocol HTTPS \
    --port 443 \
    --certificates CertificateArn=$CERT_ARN \
    --ssl-policy ELBSecurityPolicy-TLS-1-2-2017-01 \
    --default-actions Type=forward,TargetGroupArn=$TG_ARN
```

`ssl-policy` quan trọng — dùng TLS 1.2+ chỉ:

| Policy | TLS version | Status |
|---|---|---|
| `ELBSecurityPolicy-TLS-1-2-2017-01` | 1.2 | Recommend |
| `ELBSecurityPolicy-TLS13-1-2-2021-06` | 1.2 + 1.3 | Modern |
| `ELBSecurityPolicy-2016-08` | 1.0 + 1.1 | Avoid (vuln) |

### Redirect HTTP → HTTPS

```bash
# Update HTTP listener với redirect action
HTTP_LISTENER=$(aws elbv2 describe-listeners --load-balancer-arn $ALB_ARN \
    --query "Listeners[?Port==\`80\`].ListenerArn" --output text)

aws elbv2 modify-listener \
    --listener-arn $HTTP_LISTENER \
    --default-actions '[{
        "Type": "redirect",
        "RedirectConfig": {
            "Protocol": "HTTPS",
            "Port": "443",
            "StatusCode": "HTTP_301"
        }
    }]'
```

Browser `http://...` → 301 → `https://...`.

## Test HTTPS

```bash
curl -v https://vprofile.acme.com

# Verify cert
openssl s_client -connect vprofile.acme.com:443 -servername vprofile.acme.com < /dev/null
```

Browser: 🔒 → green lock → certificate valid.

## Path-based routing

ALB có thể route theo path:

```bash
# Tạo Target Group thứ 2 cho /api
TG_API=$(aws elbv2 create-target-group \
    --name vprofile-api-tg \
    --protocol HTTP --port 8080 \
    --vpc-id $VPC_ID \
    --target-type instance \
    --query 'TargetGroups[0].TargetGroupArn' --output text)

# Register app01 instance vào API target group
aws elbv2 register-targets --target-group-arn $TG_API \
    --targets Id=$APP_ID

# Listener rule: /api/* → api-tg
HTTPS_LISTENER=$(aws elbv2 describe-listeners --load-balancer-arn $ALB_ARN \
    --query "Listeners[?Port==\`443\`].ListenerArn" --output text)

aws elbv2 create-rule \
    --listener-arn $HTTPS_LISTENER \
    --priority 100 \
    --conditions '[{"Field":"path-pattern","Values":["/api/*"]}]' \
    --actions Type=forward,TargetGroupArn=$TG_API
```

URL `https://vprofile.acme.com/api/users` → app01 (port 8080).
URL `https://vprofile.acme.com/` → web01 (port 80, nginx).

## Host-based routing

```bash
# Sub-domain admin.vprofile.acme.com → admin target group
aws elbv2 create-rule \
    --listener-arn $HTTPS_LISTENER \
    --priority 50 \
    --conditions '[{"Field":"host-header","Values":["admin.vprofile.acme.com"]}]' \
    --actions Type=forward,TargetGroupArn=$ADMIN_TG
```

1 ALB → nhiều domain → nhiều backend. Tiết kiệm cost.

## ALB access log

```bash
# Tạo S3 bucket
aws s3 mb s3://vprofile-alb-logs --region us-east-1

# Bucket policy cho phép ALB write
aws s3api put-bucket-policy --bucket vprofile-alb-logs --policy '{...}'

# Enable
aws elbv2 modify-load-balancer-attributes \
    --load-balancer-arn $ALB_ARN \
    --attributes \
        Key=access_logs.s3.enabled,Value=true \
        Key=access_logs.s3.bucket,Value=vprofile-alb-logs \
        Key=access_logs.s3.prefix,Value=alb
```

Log mỗi 5 phút vào S3 → query Athena.

## Sticky session

```bash
# Enable session stickiness (cookie-based)
aws elbv2 modify-target-group-attributes \
    --target-group-arn $TG_ARN \
    --attributes \
        Key=stickiness.enabled,Value=true \
        Key=stickiness.type,Value=lb_cookie \
        Key=stickiness.lb_cookie.duration_seconds,Value=86400
```

Cookie giữ user → cùng backend → session in-memory work.

Modern: stateless app + external session store (Redis) — không cần sticky.

## Monitor ALB

CloudWatch metric quan trọng:
- `RequestCount` — số request.
- `TargetResponseTime` — latency backend.
- `HTTPCode_Target_5XX_Count` — error 5xx.
- `HealthyHostCount` / `UnHealthyHostCount`.

Alarm 5xx > 10/min → SNS Slack.

## Cost ALB

| | $/month |
|---|---|
| LCU (load balancer capacity unit) | $5.84/month minimum |
| Per LCU per hour | $0.008 |
| Data transfer | $0.008/GB |

Typical app: $20-50/month.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Target unhealthy | 502 từ ALB | Check SG + health check path |
| Quên `Route 53 A alias` | CNAME apex không hợp lệ | Dùng A alias từ AWS |
| Cert pending validation | HTTPS không work | Verify CNAME validation đúng |
| ALB SG outbound thiếu | Health check fail | Allow all outbound |
| Sticky không work | Session reset | Enable stickiness, app must read cookie |
| Path priority sai thứ tự | Wrong target hit | Lower priority = higher precedence |
| TLS 1.0 policy | Vuln, browser cảnh báo | Update policy 1.2+ |

## Tóm tắt bài 4

- **ALB** = layer 7 LB, route theo path/host/header.
- **Target Group** = pool target có health check.
- **Listener** define port (80 HTTP, 443 HTTPS).
- **ACM cert** free, DNS validation → attach listener.
- **Route 53 A alias** trỏ domain → ALB.
- HTTP listener → redirect 301 → HTTPS listener.
- Path/host routing chia traffic theo URL.
- Access log → S3 → Athena query.
- Cost ~$25-50/month for medium traffic.

**Bài kế tiếp** → [Bài 5: Auto Scaling Group + cleanup](05-asg-cleanup.md)
