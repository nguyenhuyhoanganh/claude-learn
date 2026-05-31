# Bài 2: VPC + subnet + security group — network foundation

Phase 13 đã giới thiệu VPC. Bài này **thực hành tạo VPC production-grade** cho lift-shift vProfile, đào sâu pattern chuẩn ngành.

## Architecture network đầy đủ

```text
+──────────────────────────────────────────────────────────+
│  VPC: 10.0.0.0/16 (~65K IP)                              │
│                                                          │
│  ┌────────────────────┐    ┌────────────────────┐        │
│  │ AZ us-east-1a      │    │ AZ us-east-1b      │        │
│  │                    │    │                    │        │
│  │ Public 10.0.1.0/24 │    │ Public 10.0.2.0/24 │        │
│  │ ┌──────────┐       │    │ ┌──────────┐       │        │
│  │ │ ALB      │◄──────┼────┼─┤ ALB      │       │        │
│  │ └──────────┘       │    │ └──────────┘       │        │
│  │ ┌──────────┐       │    │                    │        │
│  │ │ NAT GW   │       │    │                    │        │
│  │ └──────────┘       │    │                    │        │
│  │                    │    │                    │        │
│  │ Private 10.0.11/24 │    │ Private 10.0.12/24 │        │
│  │ ┌──────────┐       │    │ ┌──────────┐       │        │
│  │ │ EC2 app01│       │    │ │ EC2 app02│       │        │
│  │ └──────────┘       │    │ └──────────┘       │        │
│  │                    │    │                    │        │
│  │ DB 10.0.21.0/24    │    │ DB 10.0.22.0/24    │        │
│  │ ┌──────────┐       │    │ ┌──────────┐       │        │
│  │ │ RDS Mast │       │    │ │ RDS Stby │       │        │
│  │ │ MariaDB  │       │    │ │ MariaDB  │       │        │
│  │ └──────────┘       │    │ └──────────┘       │        │
│  └────────────────────┘    └────────────────────┘        │
│                                                          │
│  Internet Gateway (IGW): attached                        │
│  NAT Gateway: 1 per AZ (cost optimization: 1 chung)      │
│                                                          │
+──────────────────────────────────────────────────────────+
```

3 loại subnet × 2 AZ = 6 subnet. Pattern Multi-AZ HA.

## Bước 1: Tạo VPC

### Qua Console

1. VPC → Create VPC → "VPC and more" wizard.
2. Name: `vprofile-vpc`.
3. IPv4 CIDR: `10.0.0.0/16`.
4. Tenancy: Default.
5. Number of AZ: 2.
6. Public subnet: 2 (`10.0.1.0/24`, `10.0.2.0/24`).
7. Private subnet: 2 (`10.0.11.0/24`, `10.0.12.0/24`).
8. NAT Gateway: **In 1 AZ** (1 NAT $32/month, in each AZ = $64).
9. VPC endpoints: **S3 Gateway** (free).
10. DNS options: tick "DNS hostnames" và "DNS resolution".
11. Create.

Tự động:
- VPC.
- 4 subnet.
- IGW + attach.
- 1 NAT GW.
- Route table cho từng subnet.

### Qua CLI

```bash
# VPC
VPC_ID=$(aws ec2 create-vpc \
    --cidr-block 10.0.0.0/16 \
    --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=vprofile-vpc}]' \
    --query 'Vpc.VpcId' --output text)

aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-hostnames

# IGW
IGW_ID=$(aws ec2 create-internet-gateway \
    --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=vprofile-igw}]' \
    --query 'InternetGateway.InternetGatewayId' --output text)

aws ec2 attach-internet-gateway --vpc-id $VPC_ID --internet-gateway-id $IGW_ID

# Public subnet AZ-a
PUB_A=$(aws ec2 create-subnet \
    --vpc-id $VPC_ID \
    --cidr-block 10.0.1.0/24 \
    --availability-zone us-east-1a \
    --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=vprofile-public-a}]' \
    --query 'Subnet.SubnetId' --output text)

aws ec2 modify-subnet-attribute --subnet-id $PUB_A --map-public-ip-on-launch

# ... lặp lại cho public-b, private-a, private-b
```

Hoặc Terraform (recommended — section 21).

### Bước 2: Tạo subnet thêm cho RDS

RDS yêu cầu **DB subnet group** với subnet trong **≥ 2 AZ**:

```bash
# RDS subnet AZ-a
RDS_A=$(aws ec2 create-subnet \
    --vpc-id $VPC_ID \
    --cidr-block 10.0.21.0/24 \
    --availability-zone us-east-1a \
    --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=vprofile-db-a}]' \
    --query 'Subnet.SubnetId' --output text)

# RDS subnet AZ-b
RDS_B=$(aws ec2 create-subnet \
    --vpc-id $VPC_ID \
    --cidr-block 10.0.22.0/24 \
    --availability-zone us-east-1b \
    --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=vprofile-db-b}]' \
    --query 'Subnet.SubnetId' --output text)

# DB subnet group
aws rds create-db-subnet-group \
    --db-subnet-group-name vprofile-db-subnet \
    --db-subnet-group-description "vProfile DB" \
    --subnet-ids $RDS_A $RDS_B
```

## Route tables — quyết định traffic flow

### Public route table

```text
Destination       Target
10.0.0.0/16       local
0.0.0.0/0         igw-xxxxx (Internet Gateway)
```

### Private route table (qua NAT)

```text
Destination       Target
10.0.0.0/16       local
0.0.0.0/0         nat-xxxxx (NAT Gateway)
```

### DB private route table (no internet)

```text
Destination       Target
10.0.0.0/16       local
(không có 0.0.0.0/0)
```

DB không cần internet → tránh phơi nhiễm.

```bash
# Tạo public route table
PUB_RT=$(aws ec2 create-route-table --vpc-id $VPC_ID \
    --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=vprofile-public-rt}]' \
    --query 'RouteTable.RouteTableId' --output text)

# Route 0.0.0.0/0 → IGW
aws ec2 create-route --route-table-id $PUB_RT \
    --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID

# Associate với public subnet
aws ec2 associate-route-table --route-table-id $PUB_RT --subnet-id $PUB_A
aws ec2 associate-route-table --route-table-id $PUB_RT --subnet-id $PUB_B

# Private route table — qua NAT
PRIV_RT=$(aws ec2 create-route-table --vpc-id $VPC_ID --query 'RouteTable.RouteTableId' --output text)
aws ec2 create-route --route-table-id $PRIV_RT \
    --destination-cidr-block 0.0.0.0/0 --nat-gateway-id $NAT_ID

aws ec2 associate-route-table --route-table-id $PRIV_RT --subnet-id $PRIV_A
aws ec2 associate-route-table --route-table-id $PRIV_RT --subnet-id $PRIV_B
```

## Security Groups — chuẩn micro-segmentation

5 SG, reference qua SG ID (không phải IP):

### 1. ELB Security Group

```bash
ELB_SG=$(aws ec2 create-security-group \
    --group-name vprofile-elb-sg \
    --description "ALB security group" \
    --vpc-id $VPC_ID --query 'GroupId' --output text)

# HTTP/HTTPS từ internet
aws ec2 authorize-security-group-ingress --group-id $ELB_SG \
    --protocol tcp --port 80 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress --group-id $ELB_SG \
    --protocol tcp --port 443 --cidr 0.0.0.0/0
```

### 2. Bastion Security Group

```bash
BASTION_SG=$(aws ec2 create-security-group \
    --group-name vprofile-bastion-sg \
    --description "Bastion host" \
    --vpc-id $VPC_ID --query 'GroupId' --output text)

# SSH chỉ từ IP của bạn
MY_IP=$(curl -s ifconfig.me)
aws ec2 authorize-security-group-ingress --group-id $BASTION_SG \
    --protocol tcp --port 22 --cidr ${MY_IP}/32
```

### 3. App Security Group

```bash
APP_SG=$(aws ec2 create-security-group \
    --group-name vprofile-app-sg \
    --description "Tomcat app" \
    --vpc-id $VPC_ID --query 'GroupId' --output text)

# Tomcat 8080 từ ELB only
aws ec2 authorize-security-group-ingress --group-id $APP_SG \
    --protocol tcp --port 8080 --source-group $ELB_SG

# SSH từ bastion only
aws ec2 authorize-security-group-ingress --group-id $APP_SG \
    --protocol tcp --port 22 --source-group $BASTION_SG
```

### 4. Backend (DB/Cache/MQ) Security Group

```bash
BACKEND_SG=$(aws ec2 create-security-group \
    --group-name vprofile-backend-sg \
    --description "RDS, ElastiCache, MQ" \
    --vpc-id $VPC_ID --query 'GroupId' --output text)

# MySQL từ app
aws ec2 authorize-security-group-ingress --group-id $BACKEND_SG \
    --protocol tcp --port 3306 --source-group $APP_SG

# Memcached
aws ec2 authorize-security-group-ingress --group-id $BACKEND_SG \
    --protocol tcp --port 11211 --source-group $APP_SG

# RabbitMQ
aws ec2 authorize-security-group-ingress --group-id $BACKEND_SG \
    --protocol tcp --port 5672 --source-group $APP_SG

# SSH từ bastion (for EC2-based; nếu dùng RDS managed thì không cần)
aws ec2 authorize-security-group-ingress --group-id $BACKEND_SG \
    --protocol tcp --port 22 --source-group $BASTION_SG
```

### 5. EFS / Shared storage (optional)

```bash
EFS_SG=$(aws ec2 create-security-group \
    --group-name vprofile-efs-sg \
    --description "EFS NFS" \
    --vpc-id $VPC_ID --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress --group-id $EFS_SG \
    --protocol tcp --port 2049 --source-group $APP_SG
```

## Tag everything

Mọi resource phải có tag cho cost allocation + management:

```bash
aws ec2 create-tags --resources $VPC_ID $IGW_ID $NAT_ID \
    --tags Key=Project,Value=vprofile \
           Key=Environment,Value=production \
           Key=ManagedBy,Value=terraform \
           Key=Owner,Value=devops-team
```

Cost Explorer → group by Tag Project → thấy chính xác vProfile tốn bao nhiêu.

## Network ACL — defense in depth

NACL = firewall **stateless** ở subnet level (trên SG ở instance level).

| | Security Group | NACL |
|---|---|---|
| Level | Instance | Subnet |
| Stateful | ✓ | ✗ |
| Rules | Allow only | Allow + Deny |
| Order matter | ✗ | ✓ (numbered) |

Default NACL allow all. Production có thể strict thêm.

```bash
# Default NACL của VPC
aws ec2 describe-network-acls --filters "Name=vpc-id,Values=$VPC_ID"

# Custom rule deny incoming traffic từ blacklist IP
aws ec2 create-network-acl-entry \
    --network-acl-id acl-xxx \
    --rule-number 100 \
    --protocol -1 \
    --rule-action deny \
    --ingress \
    --cidr-block 1.2.3.4/32
```

NACL hay dùng cho compliance regulation (PCI-DSS, HIPAA).

## VPC Flow Logs — audit traffic

```bash
aws ec2 create-flow-logs \
    --resource-type VPC \
    --resource-ids $VPC_ID \
    --traffic-type ALL \
    --log-destination-type cloud-watch-logs \
    --log-group-name /aws/vpc/vprofile-flow-logs
```

Log mọi packet accept/reject → debug + security forensic.

Cost: $0.50/GB. Production essential cho compliance.

## VPC Endpoints — không qua internet

EC2 access S3 thường route qua **public internet** → tốn NAT traffic. **VPC Endpoint** route private:

```bash
# S3 Gateway endpoint (FREE)
aws ec2 create-vpc-endpoint \
    --vpc-id $VPC_ID \
    --service-name com.amazonaws.us-east-1.s3 \
    --route-table-ids $PRIV_RT

# DynamoDB Gateway (FREE)
aws ec2 create-vpc-endpoint \
    --vpc-id $VPC_ID \
    --service-name com.amazonaws.us-east-1.dynamodb \
    --route-table-ids $PRIV_RT

# Interface endpoint cho service khác ($7/month/AZ + traffic)
aws ec2 create-vpc-endpoint \
    --vpc-id $VPC_ID \
    --vpc-endpoint-type Interface \
    --service-name com.amazonaws.us-east-1.ssm \
    --subnet-ids $PRIV_A $PRIV_B \
    --security-group-ids $APP_SG
```

Lợi:
- Tiết kiệm NAT traffic cost ($0.045/GB).
- Latency thấp hơn.
- Security cao hơn (không qua internet).

## Bastion / Jump host

Pattern: EC2 nhỏ ở public subnet làm "cầu" SSH vào private:

```bash
# Launch bastion
aws ec2 run-instances \
    --image-id ami-xxx \
    --instance-type t3.nano \
    --key-name vprofile \
    --subnet-id $PUB_A \
    --security-group-ids $BASTION_SG \
    --associate-public-ip-address \
    --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=bastion}]'
```

SSH:

```bash
# Via bastion
ssh -J ec2-user@<bastion-ip> ec2-user@<app01-private-ip>

# Hoặc set ~/.ssh/config:
Host bastion
    HostName <bastion-public-ip>
    User ec2-user
    IdentityFile ~/.ssh/vprofile.pem

Host app01
    HostName <app01-private-ip>
    User ec2-user
    IdentityFile ~/.ssh/vprofile.pem
    ProxyJump bastion

# Use:
ssh app01
```

### Alternative: SSM Session Manager

```bash
# Cần IAM role: AmazonSSMManagedInstanceCore
aws ssm start-session --target i-app01
```

- Không cần bastion.
- Không cần SSH key.
- Log session vào CloudWatch.
- IAM-based access control.

Modern recommend SSM thay bastion.

## Troubleshoot network

```bash
# Reach test
aws ec2 describe-network-interfaces --filters "Name=vpc-id,Values=$VPC_ID"

# Route table check
aws ec2 describe-route-tables --filters "Name=vpc-id,Values=$VPC_ID"

# SG rules
aws ec2 describe-security-groups --group-ids $APP_SG

# VPC Reachability Analyzer
aws ec2 create-network-insights-path \
    --source $BASTION_INSTANCE \
    --destination $APP_INSTANCE \
    --protocol TCP \
    --destination-port 8080

aws ec2 start-network-insights-analysis --network-insights-path-id nip-xxx
```

Reachability Analyzer = pet tool — debug "tại sao A không reach B" với 1 lệnh.

## IPv6 (optional)

Modern: enable IPv6 cho mọi resource.

```bash
aws ec2 associate-vpc-cidr-block --vpc-id $VPC_ID --amazon-provided-ipv6-cidr-block
```

Lợi: cost transfer rẻ hơn, scale lớn. Required cho vài compliance.

## Cost breakdown VPC

| Component | Monthly |
|---|---|
| VPC | Free |
| Subnet | Free |
| Internet Gateway | Free |
| NAT Gateway (1) | $32 + $0.045/GB |
| NAT Gateway (per AZ × 3) | $96 |
| VPC Endpoint Gateway (S3) | Free |
| VPC Endpoint Interface | $7/AZ + traffic |
| VPC Flow Logs | $0.50/GB |
| Elastic IP (unused) | $3.6/month |

Cost optimization:
- Single NAT cho dev (1 AZ ok).
- Multi NAT cho prod (HA).
- VPC Endpoint cho S3/DynamoDB free.
- Release Elastic IP unused.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Public subnet không có IGW route | Instance không ra internet | Add 0.0.0.0/0 → IGW |
| Private subnet thiếu NAT | App fail update package | NAT GW + route |
| RDS public subnet | Lộ DB ra internet | Always private |
| SG inbound 0.0.0.0/0 cho 22 | SSH brute force | Restrict My IP hoặc SSM |
| Quên associate route table với subnet | Subnet inherit main route | Explicit associate |
| NAT GW per AZ → cost x3 | Bill shock | Single NAT cho lab |
| Mỗi service mở ports lớn | Surface attack | Tight SG rules |
| Subnet quá nhỏ (/28) | IP exhaust khi scale | Plan /24 cho subnet |
| CIDR overlap với on-prem | VPN không setup được | Plan CIDR cross-org |

## Tóm tắt bài 2

- VPC `10.0.0.0/16` → 3 loại subnet × 2 AZ = 6 subnet.
- **Public** (web/ALB/NAT) + **Private** (app) + **DB private** (no internet).
- **Route table**: public → IGW, private → NAT, DB → local only.
- **5 SG** reference nhau: ELB → app → backend; bastion → app/backend.
- **VPC Endpoint** S3/DynamoDB **free** — tiết kiệm NAT cost.
- **SSM Session Manager** modern alternative cho bastion.
- **VPC Flow Logs** + **Reachability Analyzer** debug + audit.
- Tag mọi resource cho cost allocation.

**Bài kế tiếp** → [Bài 3: Launch EC2 cho 5 service vProfile](03-ec2-launch-vprofile.md)
