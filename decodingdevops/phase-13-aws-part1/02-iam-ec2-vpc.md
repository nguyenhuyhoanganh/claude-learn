# Bài 2: IAM, EC2, VPC — 3 service nền tảng

3 service AWS bạn dùng **mỗi ngày**. Hiểu kỹ = base cho mọi thứ về sau.

## IAM — Identity and Access Management

Đã giới thiệu phase 2. Recap + đào sâu.

### 5 khái niệm cốt lõi

| Term | Mô tả |
|---|---|
| **User** | Human identity, có credential (password, access key) |
| **Group** | Tập user share permission |
| **Role** | "Identity tạm" — assume khi cần, không có credential cố định |
| **Policy** | JSON định nghĩa "ai làm gì với resource nào" |
| **Permission** | Granular action (vd `s3:GetObject`) |

### User vs Role — khác biệt cốt lõi

- **User** → human dùng console + CLI lâu dài.
- **Role** → service (EC2, Lambda) hoặc người tạm thời assume.

```text
EC2 cần đọc S3:
  ❌ Hardcode access key trong EC2 instance (security risk).
  ✓  Attach IAM role cho EC2 → EC2 tự fetch temporary credential.
```

### Policy JSON

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "ReadS3Bucket",
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::my-bucket",
                "arn:aws:s3:::my-bucket/*"
            ]
        }
    ]
}
```

| Field | Ý nghĩa |
|---|---|
| `Effect` | Allow / Deny |
| `Action` | API action (vd `s3:GetObject`) |
| `Resource` | ARN của resource |
| `Condition` | (Optional) chỉ apply khi condition match |

### AWS managed vs Customer managed policy

- **AWS managed**: AWS define + maintain (vd `AdministratorAccess`).
- **Customer managed**: bạn tự viết.
- **Inline**: gắn trực tiếp user/role, không reuse.

> **Best practice**: customer managed > inline. Reuse + version control.

### Least privilege principle

❌:

```json
{"Effect": "Allow", "Action": "*", "Resource": "*"}
```

✓:

```json
{
    "Effect": "Allow",
    "Action": ["s3:GetObject"],
    "Resource": "arn:aws:s3:::specific-bucket/data/*"
}
```

Lab dùng `AdministratorAccess` cho tiện. Production luôn least privilege.

### MFA + Identity Center

- **MFA** bắt buộc cho mọi user.
- **AWS Identity Center** (SSO) — quản nhiều account qua SAML / Google Workspace / Okta.

## EC2 — Elastic Compute Cloud

VM trong AWS. Service phổ biến nhất.

### Instance type — naming

```text
m5.large
│ │ │
│ │ └ Size (nano, micro, small, medium, large, xlarge, 2xlarge, ...)
│ └ Generation (5 = generation 5)
└ Family:
    - t   : burstable (CPU credit)
    - m   : general purpose
    - c   : compute-optimized (CPU heavy)
    - r   : memory-optimized (RAM heavy)
    - i   : storage-optimized (NVMe)
    - g   : GPU
    - p   : ML / high-performance GPU
```

| Family | Use case |
|---|---|
| **t3.micro / t3.small** | Dev/test, low traffic — free tier eligible |
| **t3.medium / t3.large** | Web server light |
| **m5.large / m5.xlarge** | Production general |
| **c5.xlarge** | CPU intensive (build, encode) |
| **r5.xlarge** | RAM intensive (DB, cache) |
| **i3.xlarge** | I/O intensive (DB local NVMe) |

### AMI — Amazon Machine Image

OS template:
- **Amazon Linux 2/2023** — AWS-optimized, free.
- **Ubuntu** — phổ biến.
- **RHEL** — enterprise, paid license.
- **Windows Server** — paid.
- **Custom AMI** — bạn tạo từ EC2 đã configure.

```bash
# Latest Amazon Linux 2023 AMI
aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
    --query "Parameter.Value" --output text
```

### EBS — disk cho EC2

EC2 root volume + thêm volume:

| Type | Use |
|---|---|
| **gp3** | General purpose (SSD), giá tốt — default |
| **gp2** | Older SSD |
| **io1/io2** | Provisioned IOPS, DB |
| **st1** | Throughput HDD |
| **sc1** | Cold HDD |

```bash
# Snapshot EBS
aws ec2 create-snapshot --volume-id vol-xxx

# Attach EBS vào EC2
aws ec2 attach-volume --volume-id vol-yyy --instance-id i-zzz --device /dev/sdf
```

### Security Group — firewall instance

```text
Inbound:
- Allow TCP 22 (SSH) from 1.2.3.4/32     ← My IP
- Allow TCP 80 (HTTP) from 0.0.0.0/0     ← Internet
- Allow TCP 443 (HTTPS) from 0.0.0.0/0
- Allow TCP 3306 from sg-db-sg            ← Only from DB SG

Outbound:
- Allow ALL → 0.0.0.0/0 (default)
```

**Stateful** — response auto allowed.

### Key pair — SSH key cho EC2

```bash
# Tạo key pair
aws ec2 create-key-pair --key-name my-key --query KeyMaterial --output text > my-key.pem
chmod 400 my-key.pem

# SSH
ssh -i my-key.pem ec2-user@ec2-x-x-x-x.compute.amazonaws.com
```

User mặc định:
- Amazon Linux: `ec2-user`.
- Ubuntu: `ubuntu`.
- RHEL: `ec2-user` hoặc `root`.

### EC2 pricing

- **On-Demand**: trả per second.
- **Reserved Instance**: commit 1-3 năm, -30-50%.
- **Savings Plan**: flexible commit.
- **Spot**: -70-90%, có thể terminate 2-minute notice.
- **Dedicated Host**: hardware riêng (compliance).

### EC2 lifecycle

```text
Pending → Running → Stopping → Stopped → Starting → Running
                            ↘            ↗
                              Terminating → Terminated
```

- **Stop**: tắt, giữ EBS, không tính tiền compute. Restart → có thể đổi IP public.
- **Terminate**: xoá hoàn toàn (mất EBS root if "delete on termination").

## VPC — Virtual Private Cloud

Network ảo của bạn trong AWS. Foundation cho mọi resource.

### Components

```text
VPC (10.0.0.0/16)
├── Subnet Public AZ-a   (10.0.1.0/24)  → Internet Gateway
├── Subnet Public AZ-b   (10.0.2.0/24)
├── Subnet Private AZ-a  (10.0.10.0/24) → NAT Gateway
├── Subnet Private AZ-b  (10.0.20.0/24)
├── Route Tables          (define routing)
├── Internet Gateway      (IGW, for public subnet outbound + inbound)
├── NAT Gateway           (for private subnet outbound only)
├── Security Groups       (instance firewall)
└── NACLs                 (subnet firewall, optional)
```

### Public vs Private subnet

- **Public**: route 0.0.0.0/0 → IGW → có public IP, reach internet bidirectional.
- **Private**: route 0.0.0.0/0 → NAT → outbound OK, inbound only from VPC.

Pattern:
- Web tier (ALB): public subnet.
- App tier (EC2): private subnet.
- DB tier (RDS): private subnet.

### Default VPC

Account mới có **default VPC** với:
- CIDR `172.31.0.0/16`.
- 1 subnet/AZ, all public.
- IGW attached.

Tốt cho học. Production tạo VPC riêng.

### Create VPC nhanh

```bash
# Console: VPC → "Create VPC and more" → wizard
# CLI:
aws ec2 create-vpc --cidr-block 10.0.0.0/16
aws ec2 create-subnet --vpc-id vpc-xxx --cidr-block 10.0.1.0/24 --availability-zone us-east-1a
```

Hoặc Terraform module (phase 21).

### NAT Gateway — đắt

Mỗi NAT gateway = **$32/month** + $0.045/GB data. Đáng giá production. Lab nhỏ → dùng NAT instance (EC2 tự host) rẻ hơn.

### VPC Peering, Transit Gateway

Multi-VPC connectivity:
- **VPC Peering**: 1-1 connection.
- **Transit Gateway**: hub-and-spoke, scale tốt.
- **VPN**: site-to-site to on-prem.
- **Direct Connect**: dedicated link to AWS.

## Lab — launch EC2 đầu tiên

### Bước 1: Console launch

1. EC2 → **Launch Instance**.
2. Name: `web01`.
3. AMI: **Amazon Linux 2023** (free tier).
4. Instance type: **t3.micro** (free tier).
5. Key pair: tạo `my-key` (download `.pem`).
6. Network: default VPC, public subnet, auto-assign public IP.
7. Security Group:
   - SSH (22) from My IP.
   - HTTP (80) from anywhere.
8. Storage: 8 GB gp3.
9. **Launch**.

### Bước 2: SSH

```bash
chmod 400 my-key.pem
ssh -i my-key.pem ec2-user@<public-ip>
```

Trong VM:

```bash
sudo dnf install -y nginx
sudo systemctl enable --now nginx
echo "<h1>Hello from EC2</h1>" | sudo tee /usr/share/nginx/html/index.html
```

Browser → `http://<public-ip>` → "Hello from EC2".

### Bước 3: Stop khi xong lab

```bash
# Console hoặc CLI
aws ec2 stop-instances --instance-ids i-xxx

# Terminate hoàn toàn
aws ec2 terminate-instances --instance-ids i-xxx
```

> **Stop** ≠ **Terminate**. Stop giữ EBS (tốn $1-2/month). Terminate xoá hoàn toàn.

## CLI — quick reference

```bash
# Instance
aws ec2 describe-instances
aws ec2 describe-instances --instance-ids i-xxx
aws ec2 run-instances --image-id ami-xxx --instance-type t3.micro \
    --key-name my-key --security-group-ids sg-xxx --subnet-id subnet-xxx

aws ec2 start-instances --instance-ids i-xxx
aws ec2 stop-instances --instance-ids i-xxx
aws ec2 reboot-instances --instance-ids i-xxx
aws ec2 terminate-instances --instance-ids i-xxx

# AMI
aws ec2 describe-images --owners self
aws ec2 create-image --instance-id i-xxx --name my-ami

# Volume
aws ec2 describe-volumes
aws ec2 create-volume --size 10 --availability-zone us-east-1a
aws ec2 attach-volume --volume-id vol-xxx --instance-id i-yyy --device /dev/sdf

# Security group
aws ec2 describe-security-groups
aws ec2 create-security-group --group-name web --description "Web"
aws ec2 authorize-security-group-ingress --group-id sg-xxx \
    --protocol tcp --port 80 --cidr 0.0.0.0/0

# Key pair
aws ec2 create-key-pair --key-name my-key --query KeyMaterial --output text > my-key.pem

# Elastic IP
aws ec2 allocate-address
aws ec2 associate-address --instance-id i-xxx --allocation-id eipalloc-xxx
```

## Cleanup lab — quan trọng

```bash
# Stop EC2
aws ec2 terminate-instances --instance-ids i-xxx

# Delete key pair
aws ec2 delete-key-pair --key-name my-key

# Release Elastic IP (charge nếu không attach)
aws ec2 release-address --allocation-id eipalloc-xxx

# Delete EBS unused
aws ec2 delete-volume --volume-id vol-xxx

# Delete snapshot
aws ec2 delete-snapshot --snapshot-id snap-xxx
```

Verify bill: Console → Billing → check cost.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Bỏ EC2 chạy | Bill $0.012/h × 24h × 30d = $9/instance | Stop khi xong |
| Quên release Elastic IP | $3.6/month | Release sau terminate |
| EBS không "delete on termination" | EBS orphan | Tick "delete on termination" khi launch |
| Security group quá rộng (0.0.0.0/0 cho SSH) | SSH brute force | Restrict IP |
| Key pair lost | Mất access EC2 | Backup key, dùng SSM Session Manager |
| Public subnet không có route IGW | Instance không ra internet | Check route table |
| RDS public subnet | Security risk | DB luôn private |
| Default VPC dùng prod | Limit flexibility | Tạo VPC riêng |

## Tóm tắt bài 2

- **IAM**: User (human), Role (service/temp), Policy (JSON), MFA bắt buộc.
- **Least privilege** — không bao giờ `Action: "*"`.
- **EC2**: instance type (family.size), AMI, EBS (gp3 default), Security Group.
- Free tier: **t3.micro** 750h/month. Pricing: On-Demand / Reserved / Spot.
- **Stop ≠ Terminate** — stop giữ EBS, terminate xoá.
- **VPC**: CIDR, public subnet (IGW), private subnet (NAT), Security Group.
- Default VPC ổn cho học; production tự tạo.
- **Cleanup sau lab** — luôn terminate, release IP, delete EBS.

**Bài kế tiếp** → [Bài 3: S3, RDS và các service quan trọng khác](03-s3-rds.md)
