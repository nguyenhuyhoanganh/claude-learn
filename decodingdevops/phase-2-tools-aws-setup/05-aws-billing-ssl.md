# Bài 5: Billing Alarm + SSL Certificate — bảo vệ ví và HTTPS cho domain

Bài này hoàn thành setup AWS với 2 việc cực kỳ quan trọng:

1. **Billing Alarm** — báo email khi bill vượt ngưỡng. Bảo vệ bạn khỏi bill bất ngờ.
2. **SSL/TLS Certificate** — cho HTTPS hợp lệ trên domain bạn vừa mua.

Cả hai dùng dịch vụ **CloudWatch** và **AWS Certificate Manager (ACM)** — sẽ gặp lại nhiều lần sau.

## Phần 1 — Billing Alarm

### Vì sao cần Billing Alarm?

Câu chuyện thực tế nhiều người mới:

> Tối ngủ → sáng dậy bill $3000.
>
> Nguyên nhân: lỡ tạo NAT Gateway cho VPC bài tập, quên xoá. Hoặc IAM Access Key bị bot scan từ public GitHub commit → spawn 50 EC2 mining crypto.

AWS support có thể **refund** lần đầu cho new user (goodwill), nhưng:
- Không phải lúc nào cũng được.
- Mất thời gian xử lý.
- Tài khoản bị flag.

**Billing Alarm = bảo hiểm**. Tốn 0$ setup. Nên có ngay từ ngày 1.

### Bật notification từ AWS

Trước khi tạo alarm CloudWatch, phải bật **Billing notification** trong account preferences:

1. Top-right tên account → "Billing and Cost Management".
2. Left sidebar → "Billing preferences".
3. Edit → tick:
   - ✓ Receive free tier usage alerts (cảnh báo khi vượt free tier)
   - ✓ Receive billing alerts (cho phép CloudWatch theo dõi billing)
   - ✓ PDF invoice by email
4. Nhập email nhận alert.
5. Save.

> Nếu không tick "Receive billing alerts", CloudWatch sẽ không thấy metric `EstimatedCharges`.

### Tạo CloudWatch Alarm cho billing

**CloudWatch** = service monitoring + alerting trên AWS. Mọi metric (CPU, memory, request count, bill) đều có thể có alarm.

Billing metric **chỉ public ở region us-east-1** dù bill là toàn account. Phải switch về N. Virginia trước:

1. Top-right region selector → **N. Virginia (us-east-1)**.
2. Search "CloudWatch" → CloudWatch service.
3. Left sidebar → "Alarms" → "All alarms" → "Create alarm".
4. "Select metric" → "Billing" → "Total Estimated Charge".
5. Currency: USD → "Select metric".
6. Threshold:
   - Statistic: **Maximum**.
   - Period: **6 hours** (billing metric chỉ update mỗi 6 giờ).
   - Condition: **Greater/Equal** to threshold `5` (= $5).
7. Next → "Create new topic" trong SNS:
   - Topic name: `billing-alarm`.
   - Email endpoint: email của bạn.
   - "Create topic".
8. Next → alarm name: `billing-over-5usd` → Create alarm.
9. **Vào inbox confirm subscription email** từ AWS SNS.

### Vì sao chọn $5?

Tuỳ situation:
- **$5**: ngưỡng cảnh báo SỚM — biết ngay khi vượt free tier.
- **$20**: cảnh báo trước khi mất nhiều.
- **$100**: cảnh báo CRITICAL — phải hành động ngay.

Trong khoá học bạn nên có **3 alarm**: $5 (warn), $20 (critical), $50 (emergency). Set đa cấp giúp biết tình hình leo thang.

### SNS — Simple Notification Service

CloudWatch alarm gửi tin nhắn qua **SNS Topic**. Topic giống "kênh" — ai subscribe nhận tin.

```text
                 +─────────────+
                 | CloudWatch  |
                 | (alarm fire)|
                 +──────┬──────+
                        │
                        ▼
                 +─────────────+
                 | SNS Topic   │ <─── nhiều alarm có thể trỏ tới
                 | billing     │
                 +──────┬──────+
                        │
              ┌─────────┼─────────┬──────────┐
              ▼         ▼         ▼          ▼
        Email A    Email B    SMS      Lambda function
        (devops)   (CFO)              (auto remediate)
```

Sức mạnh SNS: 1 topic → nhiều subscriber. Sau này bạn có thể thêm Lambda tự động terminate EC2 khi bill > $100. Hoặc Slack webhook để báo team.

### AWS Budgets — alternative tốt hơn

CloudWatch billing alarm cũ. AWS có service mới hơn: **AWS Budgets**.

| Feature | CloudWatch Billing | AWS Budgets |
|---|---|---|
| Threshold alarm | ✓ | ✓ |
| Theo từng service | ✗ | ✓ |
| Theo tag (cost allocation) | ✗ | ✓ |
| Forecast | ✗ | ✓ (dự đoán bill cuối tháng) |
| Action (tự stop EC2) | Qua Lambda | Built-in |
| Free tier | Free | 2 budget free |

Trong production nên dùng Budgets. Cho lab học, CloudWatch alarm là đủ.

### Production: Cost Optimization checklist

Khi bill leo cao, đi qua checklist này:

- [ ] EC2: dùng Reserved Instance / Savings Plan cho workload dài hạn (-30-50%).
- [ ] EC2: dùng Spot Instance cho workload có thể đứt (-70-90%).
- [ ] S3: lifecycle policy chuyển object cũ sang Glacier (-80% storage).
- [ ] RDS: dùng Aurora Serverless v2 cho workload không đều.
- [ ] EBS: dùng gp3 thay gp2 (rẻ hơn 20%).
- [ ] CloudFront: cache aggressively giảm cost outbound.
- [ ] Lambda: tăng memory hợp lý (đôi khi tăng memory → giảm thời gian → rẻ hơn).
- [ ] Data transfer: dùng VPC endpoint cho S3, DynamoDB (free).
- [ ] NAT Gateway: cân nhắc VPC Endpoint nếu chỉ truy cập AWS services.
- [ ] Idle resource: bật **AWS Trusted Advisor** check tự động.

## Phần 2 — SSL/TLS Certificate cho Domain

### HTTPS quan trọng thế nào

Mọi traffic web hiện đại phải qua HTTPS:
- **Confidentiality** — data mã hoá end-to-end.
- **Integrity** — không bị MITM modify.
- **Authenticity** — chứng minh server đúng là chủ domain.
- **SEO** — Google rank thấp với HTTP.
- **Browser warning** — Chrome cảnh báo "Not Secure" với HTTP.
- **API gateway** — hầu hết yêu cầu HTTPS để hoạt động.

Để có HTTPS bạn cần **certificate** từ **Certificate Authority (CA)** trusted.

### Certificate Authority (CA)

CA = tổ chức được browser tin tưởng. Cấp cert sau khi xác minh bạn là chủ domain.

| CA | Đặc điểm |
|---|---|
| **Let's Encrypt** | Free, automated, 90 ngày renew |
| **AWS Certificate Manager (ACM)** | Free khi dùng với AWS service (CloudFront, ALB, API Gateway) |
| **DigiCert, Sectigo, GoDaddy** | Trả phí, validation thủ công |
| **Cloudflare** | Free tier, edge cert |

Trong khoá này dùng **ACM** vì:
- Free khi tích hợp AWS.
- Auto-renew, không lo expire.
- Tích hợp sẵn với CloudFront / ALB / API Gateway.

### Request certificate qua ACM

1. Console → search "Certificate Manager" → ACM service.
2. **Switch region về us-east-1** nếu định dùng với CloudFront (ACM cert cho CloudFront phải ở us-east-1).
3. "Request a certificate" → "Request a public certificate".
4. Domain names: nhập domain bạn mua.
   - `*.myinfo.xyz` (wildcard — cover mọi subdomain).
   - `myinfo.xyz` (apex domain).
   - Tick "Add another name to this certificate" để thêm.
5. Validation method: **DNS validation** (recommend, auto-renew).
6. Key algorithm: **RSA 2048** (default) hoặc **ECDSA P-256** (modern hơn).
7. Request.

Status sẽ là **Pending validation**.

### DNS Validation — chứng minh bạn chủ domain

ACM tạo cho bạn một **CNAME record** dạng:

```text
Name:  _abc123def.myinfo.xyz
Value: _xyz456.acm-validations.aws
Type:  CNAME
```

Bạn phải **thêm record này vào DNS của domain** ở provider (GoDaddy/Namecheap):

#### GoDaddy

1. Đăng nhập godaddy.com → My Products → Domain → click domain.
2. DNS → Manage DNS.
3. Add Record:
   - Type: **CNAME**.
   - Name: `_abc123def` (KHÔNG kèm `.myinfo.xyz`, GoDaddy tự thêm). Bỏ dấu chấm cuối nếu có.
   - Value: `_xyz456.acm-validations.aws` (giữ nguyên, bỏ dấu chấm cuối).
   - TTL: default (1h).
4. Save.

#### Namecheap

1. Advanced DNS → Add New Record.
2. Type: CNAME, Host: `_abc123def`, Value: `_xyz456.acm-validations.aws`.

#### Cloudflare

1. DNS → Add record → CNAME.
2. **Tắt Proxy** (orange cloud → grey cloud) để ACM verify được.

### Chờ validation

DNS propagation tốn vài phút đến **48 giờ** (đặc biệt nếu domain mới mua). Check status ở ACM dashboard.

Test DNS thủ công:

```bash
dig CNAME _abc123def.myinfo.xyz
# ;; ANSWER SECTION:
# _abc123def.myinfo.xyz. 60 IN CNAME _xyz456.acm-validations.aws.
```

Hoặc dùng `nslookup` trên Windows.

Khi ACM verify xong, status → **Issued**. Cert sẵn sàng dùng.

### Dùng cert ở đâu?

Cert ACM **không** download được — phải attach vào AWS resource:

| Resource | Khi nào |
|---|---|
| **CloudFront** | CDN, distribute static content |
| **Application Load Balancer (ALB)** | Frontend HTTPS cho EC2/EKS |
| **API Gateway** | REST/HTTP API HTTPS |
| **Elastic Beanstalk** | App platform |
| **AppSync** | GraphQL |

Section AWS Part 2 sẽ dùng cert này với ALB. Bài này chỉ **prepare**.

### Wildcard vs SAN cert

```text
Wildcard:  *.myinfo.xyz  → cover api.myinfo.xyz, web.myinfo.xyz, foo.myinfo.xyz
              ✗ KHÔNG cover myinfo.xyz (apex)
              ✗ KHÔNG cover a.b.myinfo.xyz (2 cấp)

SAN (Subject Alternative Name):
   myinfo.xyz + *.myinfo.xyz → cover cả apex và 1 cấp subdomain
   myinfo.xyz + *.myinfo.xyz + *.api.myinfo.xyz → cover thêm 2 cấp
```

**Best practice** với ACM: request cả `myinfo.xyz` + `*.myinfo.xyz` cùng 1 cert SAN.

### Cert lifecycle

```text
Request (Pending validation)
    │
    │ DNS CNAME thêm
    ▼
Issued (active)
    │
    │ 13 tháng (validity)
    │ ACM auto-renew khi còn 60 ngày
    ▼
Renewed (vẫn DNS validation, nếu CNAME còn → auto OK)
```

Nếu xoá CNAME → ACM không renew được → cert expire → HTTPS đứt. Giữ CNAME mãi mãi (kể cả khi đã issued).

## SSL chain — tại sao trust hoạt động

Khi browser nhận cert từ server:

```text
1. Server gửi cert của nó (cert con).
2. Cert con có thông tin "issued by intermediate CA".
3. Intermediate CA có cert do "root CA" cấp.
4. Browser có sẵn 100+ root CA trong trust store.
5. Browser verify chain: cert con → intermediate → root.
6. Nếu root nằm trong trust store → trusted → khoá xanh.
```

Mất một mắt xích → "Not Secure" hoặc "Untrusted certificate". Đây là vì sao tự ký cert (self-signed) không dùng được trên production.

## Lệnh check cert sau khi setup

```bash
# Check cert của server đang chạy
openssl s_client -connect example.com:443 -servername example.com < /dev/null \
  | openssl x509 -noout -text | head -20

# Check expiry
openssl s_client -connect example.com:443 -servername example.com < /dev/null 2>/dev/null \
  | openssl x509 -noout -dates
# notBefore=Jan  1 00:00:00 2025 GMT
# notAfter=Jan  1 00:00:00 2026 GMT

# Tool web
# https://www.ssllabs.com/ssltest/  → grade A+
```

## Phần 3 — Setup hoàn chỉnh

Sau bài này, bạn có:

```text
┌────────────────────────────────────────────────────┐
│  AWS Account                                       │
│  ├─ Root user + MFA                                │
│  ├─ IAM user (devops-admin) + MFA + AdminAccess    │
│  ├─ Access Key cho CLI                             │
│  ├─ Account alias (URL đẹp)                        │
│  ├─ Billing alert configured                       │
│  ├─ CloudWatch alarm @ $5 → SNS → email            │
│  └─ ACM Certificate cho *.yourdomain (Issued)     │
└────────────────────────────────────────────────────┘
```

Toàn bộ phase 2 xong. Sẵn sàng cho phase 3 (Virtualization & VM Setup).

## Bẫy thường gặp

| Bẫy | Hệ quả | Tránh |
|---|---|---|
| Tạo CloudWatch alarm ở region khác us-east-1 | Không thấy metric Billing | Switch region về us-east-1 |
| Quên confirm SNS email | Alarm fire nhưng không nhận email | Check inbox + spam, click confirm link |
| ACM ở region khác CloudFront | Cert không attach được | Cert cho CloudFront PHẢI ở us-east-1 |
| CNAME thiếu/sai dấu chấm | Validation pending mãi | Check kỹ — provider khác nhau format khác |
| Cloudflare proxy bật cho CNAME validation | ACM không thấy CNAME | Tắt proxy (grey cloud) khi validate |
| Wildcard cert dùng cho apex | apex vẫn báo lỗi | Request cả `domain` + `*.domain` |
| Free tier nghĩ là "miễn phí mãi mãi" | Vượt sau 12 tháng → bill | Đọc kỹ điều kiện từng service |

## Khi nào KHÔNG dùng ACM?

- **Cert dùng bên ngoài AWS** (vd nginx self-host trên VPS DigitalOcean) → dùng **Let's Encrypt** với certbot.
- **Cert custom CA** (vd internal CA của công ty) → ACM cho import nhưng không auto-renew được.
- **Code signing cert / email cert** → ACM không hỗ trợ, mua từ DigiCert/Sectigo.

## Production: Multi-region & DR

Trong production, certificate cũng cần High Availability:

- Mỗi region có ACM riêng → request cert riêng cho mỗi region.
- Cert backup: lưu offline cert chain (rare case ACM down).
- Monitoring: CloudWatch metric `DaysToExpiry` < 30 → alert.

Khoá này không deep vào DR — section AWS Part 2 sẽ touch.

## Tóm tắt bài 5

- **Billing alarm** = bảo hiểm $0 — set $5 / $20 / $50 cảnh báo đa cấp.
- Billing metric chỉ public ở **us-east-1**.
- **SNS** = kênh notification — 1 topic → nhiều subscriber.
- **ACM** cấp SSL/TLS cert free khi dùng với AWS service.
- DNS validation = thêm CNAME từ ACM vào DNS domain → auto-renew vĩnh viễn.
- Cert cho **CloudFront** phải ở us-east-1; cert cho ALB/API Gateway ở region của resource.

**Bài kế tiếp** → [Phase 3 — Bài 1: Virtualization là gì? Hypervisor Type 1 vs Type 2](../phase-3-virtualization-vm/01-virtualization-la-gi.md)
