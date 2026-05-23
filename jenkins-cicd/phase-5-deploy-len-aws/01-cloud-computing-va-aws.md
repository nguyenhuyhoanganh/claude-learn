# Bài 1: Cloud computing và AWS

Phase 3 deploy lên Netlify — đơn giản, đủ học CD concept. Phase 5 deploy lên **AWS** — cloud provider lớn nhất thế giới, là chuẩn enterprise. Bài này: vì sao cloud, AWS là gì, setup tài khoản.

## Vì sao cloud computing?

Trước cloud (2000s), công ty muốn host website phải:

1. **Mua server vật lý** — vài nghìn USD/máy.
2. **Thuê data center** — đặt máy, trả điện, mạng, AC.
3. **Hire sysadmin** — cài OS, patch, monitor 24/7.
4. **Mua đủ cho peak** — Black Friday cần 10x máy, ngày thường dùng 10%.

→ Vốn ban đầu lớn, lãng phí lúc thấp tải, không scale nhanh.

**Cloud** đảo ngược: **thuê hạ tầng theo giờ**. Pay-as-you-use.

### 4 lợi ích chính

1. **Scalability** — traffic tăng đột biến → cloud tự thêm máy. Giảm → tự xoá. Không quan tâm hardware.
2. **Cost efficient** — không trả tiền cho server idle. Black Friday trả 10x, ngày thường trả 1x.
3. **Global reach** — data center khắp thế giới. Deploy gần user → latency thấp.
4. **Reliability + Security** — cloud provider có team chuyên về uptime + compliance + security mà công ty bạn không có.

### Khi cloud KHÔNG phù hợp

- **Workload steady high** — server tự host rẻ hơn cloud về lâu dài.
- **Compliance nghiêm** — data không được rời khỏi nước (Đức, Trung Quốc).
- **Air-gapped systems** — quân sự, năng lượng.
- **Cost sensitive at scale** — Dropbox từng dùng AWS S3, giờ tự host (tiết kiệm hàng trăm triệu USD/năm).

→ **Cloud không phải silver bullet**. Hiểu trade-off.

## 3 cloud provider lớn

| Provider                    | Market share | Đặc trưng                         |
|-----------------------------|--------------|-----------------------------------|
| **AWS** (Amazon)            | ~32%         | Lâu đời nhất (2006), nhiều service nhất (200+) |
| **Azure** (Microsoft)       | ~23%         | Tốt cho enterprise dùng Microsoft stack |
| **GCP** (Google Cloud)      | ~10%         | Mạnh về AI/ML, BigQuery        |

→ Khoá học chọn **AWS** vì:
- Pricing rõ ràng, free tier hào phóng cho học.
- Documentation cực kỳ đầy đủ.
- Industry-standard — học AWS = mở cửa nhiều công ty.

> Concepts (S3, IAM, EC2) tương đương ở Azure / GCP — học AWS rồi chuyển provider dễ.

## AWS — Amazon Web Services

**AWS** ra đời 2006, khởi đầu từ S3 (storage) và EC2 (compute). Đến nay có **200+ services**:

- **Compute**: EC2 (VM), Lambda (serverless), ECS/EKS (containers).
- **Storage**: S3 (object), EBS (block), EFS (filesystem).
- **Database**: RDS (managed SQL), DynamoDB (NoSQL), Aurora (cloud-native).
- **Networking**: VPC, CloudFront (CDN), Route 53 (DNS), API Gateway.
- **AI/ML**: SageMaker, Bedrock, Rekognition.
- **DevOps**: CodePipeline, CloudFormation, ECR.
- ...

→ Đa số tổ chức chỉ dùng 5-10 services. **Không cần học hết**. Học các service cơ bản: S3, IAM, EC2, ECS.

### Câu chuyện nổi tiếng

Năm 2007, **The New York Times** muốn số hoá 1 triệu bài báo cũ (~4 TB scan). Cách truyền thống cần vài tuần + đầu tư server.

→ Một software architect dùng EC2: 100 instance trong 24 giờ + S3 lưu PDF. **Chi phí**: ~240 USD. **Thời gian**: < 1 ngày.

Đây là **case study cổ điển** về sức mạnh cloud.

## Đăng ký AWS account

1. <https://aws.amazon.com> → **Create an AWS Account**.
2. Email + password + account name.
3. Chọn **Personal account** (cho học) hoặc **Business**.
4. Nhập **credit/debit card** — bắt buộc, dù dùng Free Tier. AWS chỉ charge khi vượt free.
5. Verify phone bằng SMS.
6. Chọn **Basic Support — Free** (đủ học).
7. Đợi 5-10 phút verify → login vào **AWS Management Console**.

> **AWS Free Tier** (12 tháng đầu, miễn phí): 5 GB S3, 750 giờ EC2 t2.micro, 1 triệu Lambda invocations/tháng, RDS db.t2.micro... Đủ cho khoá học.

### Bật MFA (multi-factor authentication)

**Bắt buộc** cho mọi AWS account, đặc biệt root account.

1. Console → góc phải trên (avatar) → **Security credentials**.
2. **MFA** → **Assign MFA device**.
3. Dùng app **Google Authenticator** / **Authy** / **1Password** scan QR code.
4. Nhập 2 mã liên tiếp.

→ Mỗi lần login: email + password + 6-digit code từ app. Nếu account bị hack lộ password, không vào được nếu không có điện thoại.

> Root account bị hack = thảm hoạ. Có những vụ developer commit AWS key lên GitHub, bot scan trong 5 phút, dùng key chạy crypto mining → bill 50,000 USD trong 1 đêm. Bật MFA + IAM user (bài 4) là **phải làm ngày đầu**.

## Khái niệm Region

AWS có data center tại **30+ region** (cuối 2024). Mỗi region là một **địa lý độc lập**.

```text
Region: us-east-1 (N. Virginia)
├── AZ a (data center A)
├── AZ b (data center B)
└── AZ c (data center C)

Region: eu-west-1 (Ireland)
├── AZ a
├── AZ b
└── AZ c

...
```

- **AZ** (Availability Zone) = data center riêng biệt trong cùng region. Cấp HA (high availability).
- **Region** = nhóm AZ + service riêng cho khu vực địa lý.

### Chọn region nào?

- **Latency**: gần user → nhanh hơn. Site cho user Vietnam → `ap-southeast-1` (Singapore).
- **Cost**: us-east-1 rẻ nhất (data center lớn nhất). Region xa hơn đắt hơn.
- **Compliance**: data EU phải ở EU (GDPR) → `eu-west-1` (Ireland) hoặc `eu-central-1` (Frankfurt).
- **Service availability**: vài service ra mắt ở us-east-1 trước → các region khác có sau.

→ Khoá học dùng **us-east-1** (default, rẻ).

Chọn region: console góc phải trên, dropdown bên cạnh avatar.

## AWS Console UI

Sau khi login, **Management Console**:

```text
┌─────────────────────────────────────────────────────────────┐
│  AWS    [Search services]    🔔   us-east-1 ▾   Account ▾  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Recently visited                                           │
│  • S3                                                       │
│  • EC2                                                      │
│  • IAM                                                      │
│                                                              │
│  Service categories                                         │
│  • Compute              • Storage         • Database         │
│  • Networking           • Analytics       • AI              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

- **Search bar** trên cùng — gõ tên service (`S3`, `IAM`, `EC2`) → click vào.
- **Region** ở góc phải — đảm bảo đúng region trước khi tạo gì.
- **Account** ở góc phải — xem profile, logout, switch role.

## AWS Lab environment (nếu có)

Nếu khoá học cấp **AWS Lab access** (qua Udemy/Skillsoft…), bạn có sandbox tạm không cần đăng ký AWS account riêng:

- Click **Practice** trong khoá → **Open Workspace**.
- Sandbox tự terminate sau 60 phút.
- Lấy CLI credentials qua nút **CLI credentials** (3 giá trị: Access Key ID, Secret Access Key, **Session Token**).
- Temporary credentials có prefix `ASIA*` (vs long-term `AKIA*`).
- Khi authenticate, cần **cả 3 giá trị** (không chỉ 2 như account thường).

→ Nếu không có lab, đăng ký AWS account riêng — vẫn free tier đủ học.

## Tổng quan Phase 5

```text
Bài 1: Cloud + AWS overview         ← bài này
Bài 2: Amazon S3 (file storage)
Bài 3: AWS CLI (tool gọi AWS)
Bài 4: IAM (quản lý quyền)
Bài 5: AWS credentials trong Jenkins
Bài 6: Upload file lên S3 từ Jenkins
Bài 7: Host static website từ S3
Bài 8: aws s3 sync — pipeline cuối
Bài 9 (optional): EC2 + Nginx
```

→ Sau Phase 5, có pipeline tự deploy website lên AWS S3 mỗi commit.

## Lưu ý chi phí

Khoá học **không vượt free tier** nếu làm theo. Nhưng cẩn thận:

- **Tắt EC2 instance** khi không dùng (bài 9).
- **Xoá S3 bucket** sau khi học xong (tránh bị tính storage cost dài hạn).
- **Đặt Billing Alert**: <https://console.aws.amazon.com/billing> → **Budgets** → tạo budget 1 USD/tháng, alert qua email.

→ Dù không vào free tier, hầu hết workload khoá học < 1 USD/tháng.

## Tóm tắt

- **Cloud computing** = thuê hạ tầng theo giờ, scale theo demand, không sở hữu hardware.
- **AWS** lớn nhất, lâu đời nhất, ~32% market share. 200+ services.
- Đăng ký AWS cần card, có Free Tier 12 tháng đầu.
- **Bật MFA ngày đầu** — bảo vệ root account.
- **Region + AZ** — chọn region gần user + đúng compliance.
- Phase 5 sẽ deploy lên **S3** với **AWS CLI** từ Jenkins, dùng **IAM** quản lý quyền an toàn.

---

→ [Bài tiếp theo: Amazon S3 — File storage cloud](02-amazon-s3-file-storage.md)
