# Bài 4: IAM — Quản lý quyền AWS

`aws s3 ls` fail vì thiếu credentials. Nhưng đừng dùng **root credentials** — quá nguy hiểm. AWS có service riêng cho identity management: **IAM** (Identity and Access Management).

## Vì sao không dùng root credentials?

Root account = "god mode" — toàn quyền AWS, kể cả delete account, change billing, ...

Nếu Jenkins cần upload file lên S3 → chỉ cần permission upload S3. Cho root → over-permission, rủi ro.

**Principle of Least Privilege**: cấp quyền **vừa đủ** để làm việc, không hơn.

→ Tạo **IAM user** riêng cho Jenkins, chỉ có quyền S3.

## IAM concepts

```text
AWS Account
├── Root user                                       ← KHÔNG dùng cho automation
│
├── IAM User: "alice" (human dev)
│   ├── Credentials: email + password + MFA
│   ├── Access Keys: AKIA... + secret (for CLI)
│   └── Policies attached
│
├── IAM User: "jenkins" (service account)          ← TẠO BÀI NÀY
│   ├── Access Keys: AKIA... + secret
│   └── Policies: AmazonS3FullAccess
│
├── IAM Group: "developers"
│   ├── Members: alice, bob
│   └── Policies: ReadOnlyAccess
│
├── IAM Role: "EC2ToS3Role"                        ← EC2 assume role
│   └── Policies: S3ReadAccess
│
└── IAM Policy: JSON định nghĩa quyền
```

4 core entity:

- **User** — định danh cho người hoặc service.
- **Group** — nhóm user, share policy.
- **Role** — định danh tạm thời, service/người **assume**. Ưu việt hơn user cho production.
- **Policy** — JSON document liệt kê quyền.

## Mở IAM service

Console → search bar `IAM` → click.

```text
┌─────────────────────────────────────────────────┐
│  IAM > Users                                    │
│                                                  │
│  ┌─ Sidebar ──┐                                  │
│  │ Dashboard  │                                  │
│  │ Users      │ ← Tạo user ở đây               │
│  │ Groups     │                                  │
│  │ Roles      │                                  │
│  │ Policies   │                                  │
│  │ ...        │                                  │
│  └────────────┘                                  │
└─────────────────────────────────────────────────┘
```

## Tạo IAM user cho Jenkins

1. Sidebar → **Users** → **Create user**.

### Step 1: User details

```text
User name:        jenkins
☐ Provide user access to the AWS Management Console
```

- Tên: `jenkins`.
- **Không tick** "Console access" → user này chỉ dùng CLI, không cần login UI.

Click **Next**.

### Step 2: Permissions

```text
○ Add user to group
● Attach policies directly       ← chọn
○ Copy permissions from existing user
```

Chọn **Attach policies directly**.

Search policy → `AmazonS3FullAccess` → tick.

```text
┌─ AWS managed policies ─────────────────────────┐
│ ☑ AmazonS3FullAccess                            │
│ ☐ AmazonS3ReadOnlyAccess                        │
│ ☐ ...                                           │
└─────────────────────────────────────────────────┘
```

→ `AmazonS3FullAccess` = full quyền với mọi S3 service (list, upload, delete bucket, ...). Đủ cho khoá.

Click **Next** → review → **Create user**.

### Step 3: Verify

Quay lại list Users → có `jenkins`. Click vào → tab **Permissions** → thấy `AmazonS3FullAccess` attached.

## Tạo Access Key cho user

User mới chưa có credentials. Tạo Access Key:

1. Click vào user `jenkins`.
2. Tab **Security credentials**.
3. Cuộn xuống section **Access keys** → **Create access key**.

```text
┌─ Use case ───────────────────────────────────────┐
│ ○ Command Line Interface (CLI)    ← chọn        │
│ ○ Local code                                     │
│ ○ Application running on AWS service             │
│ ○ Third-party service                            │
│ ○ Application outside AWS                        │
│ ○ Other                                          │
└──────────────────────────────────────────────────┘
```

→ **CLI**. Click checkbox "I understand..." → Next.

**Description tag**: `Jenkins CI Pipeline` (cho biết key này dùng cho gì).

Click **Create access key** → màn hình hiện 2 giá trị:

```text
Access key:       AKIA1234567890ABCDEF
Secret access key: ********************************
                  [Show]
```

→ **Copy ngay** (cả 2). Secret access key **chỉ hiện 1 lần** — đóng tab = mất, phải tạo mới.

### Lưu vào file tạm an toàn

```text
AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF
AWS_SECRET_ACCESS_KEY=abcdefghijklmnopqrstuvwxyz1234567890ABCDEF
```

→ Lưu trong password manager (1Password, Bitwarden) hoặc file `.env` không commit Git.

Bài 5 sẽ paste vào Jenkins Credentials.

## So sánh: Access Key vs Console password

| Loại                | Login                | Use case                        |
|---------------------|----------------------|---------------------------------|
| Console password    | UI web               | Human dev login Management Console |
| Access Key + Secret | CLI / SDK            | Automation (Jenkins, scripts)   |

Một user có thể có cả 2, hoặc chỉ 1.

→ User `jenkins`: chỉ có Access Key, không có console password. **Đúng spec**: service account không cần UI access.

## Policy là gì?

**Policy** = JSON document liệt kê quyền. Example `AmazonS3FullAccess`:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "s3:*",
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3-object-lambda:*"
            ],
            "Resource": "*"
        }
    ]
}
```

Phân tích:

- **`Effect`**: `Allow` hoặc `Deny`.
- **`Action`**: list API call permitted. `s3:*` = mọi action của S3. `s3:GetObject` = chỉ download.
- **`Resource`**: ARN cụ thể, hoặc `*` = mọi resource. ARN format: `arn:aws:s3:::bucket-name/key`.

→ Policy `AmazonS3FullAccess` = "user này được làm mọi thứ với mọi S3 bucket trong account".

### Policy hẹp hơn (production-grade)

Khuyến nghị tốt hơn: chỉ cho phép upload vào **1 bucket cụ thể**:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::learn-jenkins-20260105",
                "arn:aws:s3:::learn-jenkins-20260105/*"
            ]
        }
    ]
}
```

→ User `jenkins` chỉ upload/download bucket `learn-jenkins-20260105`, không đụng bucket khác.

→ Lý tưởng cho production. Khoá học dùng `AmazonS3FullAccess` cho đơn giản.

## AWS managed policies vs Customer managed

| Loại                | Ai maintain | Use case                       |
|---------------------|-------------|--------------------------------|
| **AWS managed**     | AWS         | Common patterns (S3FullAccess, ReadOnly...) |
| **Customer managed**| Bạn         | Custom cho org của bạn         |
| **Inline policy**   | Bạn         | Gắn 1-1 với user, không share  |

→ Production thường mix: AWS managed cho phổ biến + Customer managed cho specific.

## Best practices IAM

### 1. Không dùng root cho automation

Tạo IAM user/role riêng cho mỗi service automation.

### 2. Bật MFA cho user con người

User dev/admin → bật MFA giống root.

### 3. Rotate access key

Mỗi 90 ngày tạo key mới, xoá key cũ. Tránh key bị lộ tích luỹ.

### 4. Audit qua CloudTrail

Mọi action gọi qua user X được log trong **CloudTrail** → audit, debug, alert anomaly.

### 5. Dùng Role thay User cho EC2/Lambda

Service trong AWS không nên dùng access key — dùng **IAM Role** (auto-rotating temp credentials).

```text
EC2 instance assume role "EC2ToS3Role"
   → AWS tự generate temp credentials cho EC2 (rotate mỗi giờ)
   → EC2 dùng credentials đó gọi S3
   → Không có key lộ ra ngoài
```

→ Pattern Phase 6 (deploy lên ECS) sẽ dùng role.

### 6. SCP cho organization

AWS Organizations + Service Control Policies → giới hạn permission cả account.

### 7. Permissions Boundary

Cho user X permission max — dù attach policy nào cũng không vượt boundary.

## Pitfall

### Pitfall 1: lộ access key qua Git

Commit `.env` hoặc `aws credentials` lên public repo → bot scan trong giờ → lộ key → bị hack.

**Prevention**:
- Thêm `.env`, `~/.aws/credentials` vào `.gitignore`.
- Dùng tool **git-secrets**, **truffleHog** quét repo trước push.
- AWS auto-detect key lộ trên GitHub public → email cảnh báo + auto-revoke key.

### Pitfall 2: Quên xoá user/key không dùng

User cũ → tăng attack surface. Cleanup quý.

### Pitfall 3: Cấp `*:*` cho an

```json
{
    "Effect": "Allow",
    "Action": "*",
    "Resource": "*"
}
```

= cho user toàn quyền. Lười nhưng nguy hiểm. **Tuyệt đối tránh**.

### Pitfall 4: Confused deputy

User A có quyền X → tin tưởng giao việc cho user B → user B abuse quyền X. Giải pháp: dùng **session policy** giới hạn temporary.

## Tóm tắt

- **IAM** = identity + access management cho AWS. Không bao giờ dùng root cho automation.
- Entity: **User**, **Group**, **Role**, **Policy**.
- Tạo user `jenkins` với policy `AmazonS3FullAccess`.
- **Access Key + Secret Key** = "username + password" cho CLI. Secret chỉ hiện 1 lần khi tạo.
- Policy = JSON với `Effect` / `Action` / `Resource`.
- **Principle of Least Privilege**: cấp quyền vừa đủ.
- Best practices: MFA, rotate key, role > user cho service, audit qua CloudTrail.

---

→ [Bài tiếp theo: AWS credentials trong Jenkins](05-credentials-aws-trong-jenkins.md)
