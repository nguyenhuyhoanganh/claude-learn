# Bài 1: Terminate AWS resources (tránh bill bất ngờ)

Khoá học đến đây gần xong. Trước khi nghỉ — **một việc cực kỳ quan trọng**: cleanup mọi cloud resource đã tạo. Không cleanup = vài tuần/tháng sau bill đến.

## Tại sao phải cảnh giác?

### Câu chuyện thật

- Có user Netlify nhận **$104k bill** chỉ vì host static site bị bot DDoS request liên tục.
- Có dev AWS commit access key lên GitHub → bot khai thác chạy crypto mining → **$50,000 trong 1 đêm**.
- Có team quên ELB → mỗi tháng **$20/ELB**, vài ELB quên = bill silent build up cả năm.

→ Cloud cost không immediate visible. **Resource chạy = tiền chạy**, ngay cả khi bạn không dùng.

## Pricing trap kinh điển

### Free tier ≠ Free mãi

- AWS Free Tier: **12 tháng đầu** kể từ ngày đăng ký account.
- Sau 12 tháng → mọi service charge full price.
- Account có thể "ngủ đông" → bạn quên → 1 năm sau bill đến.

### Free plan vẫn có ngưỡng

Netlify Starter plan **free**, nhưng:

- Bandwidth: 100 GB free → vượt **$55/100GB**.
- Build minutes: 300/tháng → vượt **$7/500 phút**.
- Form submissions: 100/tháng → vượt.

→ Site bị crawl bot / DDoS → bandwidth nổ → bill.

### Service "không tính tiền" vẫn có hidden cost

- **EC2 stop** không tính compute, **vẫn tính EBS storage** (~$0.08/GB/tháng).
- **Elastic IP** rảnh (không gắn instance) → tính tiền $0.005/giờ.
- **CloudWatch Log Group** giữ log forever → storage cost累積.
- **Snapshot** không tự xoá.

## Checklist cleanup khoá học

### AWS

Cleanup theo thứ tự (vì có dependencies):

**1. ECS**

```text
ECS Console → Cluster → Services → Update → Desired tasks: 0
            → Service → Delete service
            → Cluster → Delete cluster (gõ tên confirm)
```

**2. ECR**

```text
ECR Console → Repository → Delete (gõ "delete" confirm)
```

→ Image xoá theo.

**3. S3**

```text
S3 Console → Bucket → Empty (xoá hết object)
           → Bucket → Delete
```

> Bucket phải **empty** trước khi delete. UI tự hint.

**4. EC2 (nếu có dùng bài 9 Phase 5)**

```text
EC2 Console → Instances → Stop / Terminate
            → Elastic IPs → Release (nếu có)
            → Volumes → Delete orphan (nếu có)
            → Snapshots → Delete (nếu có)
            → Security Groups custom → Delete
            → Key Pairs custom → Delete
```

**5. IAM (giữ lại nếu vẫn dùng)**

User `jenkins` + policy không tốn tiền → có thể giữ. Nếu xoá:

```text
IAM Console → Users → jenkins → Security credentials → Delete Access Key
                    → Permissions → Remove all policies
                    → Delete user
```

**6. CloudWatch Logs (optional)**

```text
CloudWatch → Log groups → /ecs/learn-jenkins-app... → Delete
```

→ Log dài hạn cũng tính storage.

### Netlify

```text
Netlify Dashboard → Site → Site Configuration → Delete site
```

→ Tránh bandwidth bill bất ngờ nếu site bị DDoS.

### Jenkins local

```bash
# Trong thư mục install-jenkins-docker
docker compose down -v        # -v = xoá volume luôn
docker rmi my-playwright my-aws-cli my-jenkins
```

→ Free ~10 GB disk + RAM.

## Verify cleanup thành công

### AWS Billing Dashboard

1. Console → Billing & Cost Management.
2. **Bills** → kiểm tra service hiện tại có cost.
3. Sau 1-2 ngày → "Cost Explorer" → check đã về 0 chưa.

### Set Billing Alarm

Cài đặt lại để monitor:

1. **Budgets** → **Create budget** → Monthly cost budget.
2. Threshold: $1.00 (rất thấp để alarm ngay khi vượt).
3. Notify email khi forecast vượt 80% và 100%.

→ Nếu có cost lén → email báo trong vài ngày.

## Set reminder calendar

> Sau khoá học xong, mở Google Calendar / Outlook tạo event **+1 tháng** sau với title: *"Check AWS billing — terminate zombie services"*.

→ 1 tháng sau, vào AWS Billing → check còn cost không. Có thì truy ngay.

Cũng set **+1 năm** (gần expire free tier) — review lại mọi resource.

## Nếu lỡ bị charge bất ngờ

AWS thường **forgive bill** cho cá nhân lỡ — nếu:

- Lần đầu bị.
- Account không có pattern abuse.
- Mở support ticket chân thành giải thích.

→ Tạo case tại <https://console.aws.amazon.com/support/> → Account & Billing Support → "Request a billing adjustment".

Tỷ lệ thành công cao cho dev cá nhân. Đừng ngại hỏi.

## Best practice production

Trong tổ chức thật:

1. **Cost allocation tags** — gắn tag mọi resource (`team=backend`, `env=prod`, `cost-center=eng`).
2. **AWS Cost Anomaly Detection** — ML phát hiện spike bất thường.
3. **Trusted Advisor** — báo cáo idle resource.
4. **Service Quotas** — set hard limit (vd max 5 EC2 instances).
5. **SCP** (Service Control Policies) qua Organizations — ban region không dùng, ban service expensive.

→ Nhiều layer phòng vệ.

## Tóm tắt

- **Cloud cost không immediate visible** — resource = tiền dù không dùng.
- Free tier **12 tháng** với AWS. Sau đó full price.
- **Cleanup checklist**: ECS → ECR → S3 → EC2 → IAM → CloudWatch.
- Verify qua Billing Dashboard.
- **Set Billing Alarm** + **Calendar reminder**.
- Lỡ bị charge → mở support ticket — thường được forgive.
- Production: cost allocation tags, Anomaly Detection, Trusted Advisor.

---

→ [Bài tiếp theo: Quá khứ và tương lai của Jenkins](02-jenkins-qua-khu-va-tuong-lai.md)
