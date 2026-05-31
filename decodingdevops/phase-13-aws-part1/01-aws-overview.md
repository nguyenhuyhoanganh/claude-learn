# Bài 1: AWS overview — kiến trúc cloud và service map

AWS = cloud provider #1 thế giới (32% market share 2026). DevOps engineer **phải biết AWS** — ngay cả khi công ty bạn dùng GCP/Azure, concept tương tự, recruiters đa số hỏi AWS.

## Cloud computing — vì sao?

Trước cloud:
- Mua server, rack vào data center.
- Capex lớn ($10k+/server), waste khi underutilized.
- Setup 6 tuần — đặt hàng, ship, install.
- Scale = mua thêm server.
- Bảo trì = đội nhân viên on-site.

Cloud:
- **Pay-per-use** — chỉ trả khi dùng.
- Setup **giây-phút** — provision API.
- **Elastic** — scale up/down tự động.
- **Global** — deploy nhiều region.
- AWS manage hardware, network, power, cooling.

## AWS — lịch sử ngắn

- **2002**: Amazon launch web services for internal use.
- **2006**: S3 + EC2 public — cloud computing chính thức.
- **2026**: 200+ services, $90B+ revenue.

## Regions và Availability Zones

```text
us-east-1 (N. Virginia)
├── AZ us-east-1a
├── AZ us-east-1b
├── AZ us-east-1c
├── AZ us-east-1d
├── AZ us-east-1e
└── AZ us-east-1f

ap-southeast-1 (Singapore)
├── AZ ap-southeast-1a
├── AZ ap-southeast-1b
└── AZ ap-southeast-1c
```

- **Region** = cụm data center địa lý độc lập (~32 regions 2026).
- **AZ** = 1 hoặc nhiều data center vật lý trong region, isolated power + network.

### Vì sao quan trọng?

- **Latency**: chọn region gần user (vd VN → Singapore).
- **HA**: deploy multi-AZ → 1 AZ down, app vẫn chạy.
- **Compliance**: vd EU GDPR cần data trong EU region.
- **Cost**: us-east-1 (N.Virginia) rẻ nhất.

### Region phổ biến

| Region | Code | Note |
|---|---|---|
| N. Virginia | us-east-1 | Cũ nhất, **rẻ nhất**, **mọi service mới ra đây trước** |
| Oregon | us-west-2 | Renewable energy, cheap |
| Frankfurt | eu-central-1 | EU compliance |
| Ireland | eu-west-1 | EU compliance |
| Singapore | ap-southeast-1 | Latency tốt VN |
| Tokyo | ap-northeast-1 | Latency tốt VN |
| Mumbai | ap-south-1 | South Asia |
| São Paulo | sa-east-1 | LATAM |

## Service categories — bản đồ AWS

200+ services chia ~25 category. Top 20 service DevOps phải biết:

### Compute

| Service | Mục đích |
|---|---|
| **EC2** | Virtual machine — service cũ nhất, phổ biến nhất |
| **Lambda** | Serverless function — chạy code không quản server |
| **ECS** | Container orchestration (AWS native) |
| **EKS** | Managed Kubernetes |
| **Fargate** | Serverless container (chạy ECS/EKS không quản node) |
| **Beanstalk** | PaaS — upload code, AWS deploy |
| **Lightsail** | VPS đơn giản (compete DigitalOcean) |

### Storage

| Service | Mục đích |
|---|---|
| **S3** | Object storage (file, image, backup) — service nổi tiếng nhất |
| **EBS** | Block storage cho EC2 (như disk gắn VM) |
| **EFS** | NFS shared filesystem |
| **FSx** | Managed Windows / Lustre filesystem |
| **Storage Gateway** | Bridge on-prem ↔ cloud |
| **Glacier** | Archive lạnh (cold storage) |

### Database

| Service | Mục đích |
|---|---|
| **RDS** | Managed SQL (MySQL, PostgreSQL, MariaDB, SQL Server, Oracle) |
| **Aurora** | RDS but optimized, fast, scalable |
| **DynamoDB** | NoSQL key-value, scale infinite |
| **ElastiCache** | Redis / Memcached managed |
| **DocumentDB** | MongoDB-compatible |
| **Redshift** | Data warehouse OLAP |

### Network

| Service | Mục đích |
|---|---|
| **VPC** | Virtual private network — foundation network |
| **Route 53** | DNS managed |
| **CloudFront** | CDN — cache content global |
| **ELB** | Load balancer (ALB, NLB) |
| **API Gateway** | Manage REST/HTTP API |
| **Direct Connect** | Dedicated link từ data center on-prem |
| **VPN** | Site-to-site VPN |

### Security & Identity

| Service | Mục đích |
|---|---|
| **IAM** | User, role, permission |
| **KMS** | Key management cho encryption |
| **Secrets Manager** | Lưu password, API key |
| **Certificate Manager (ACM)** | SSL/TLS cert free |
| **WAF** | Web application firewall |
| **Shield** | DDoS protection |
| **GuardDuty** | Threat detection |

### DevOps / Management

| Service | Mục đích |
|---|---|
| **CloudWatch** | Monitor (metric, log, alarm) |
| **CloudTrail** | Audit log mọi API call |
| **CloudFormation** | IaC native (rival Terraform) |
| **Systems Manager** | Manage EC2 (run command, patch) |
| **CodeCommit / CodeBuild / CodeDeploy / CodePipeline** | CI/CD AWS native |
| **Step Functions** | Workflow orchestration |

### Messaging

| Service | Mục đích |
|---|---|
| **SQS** | Message queue (như RabbitMQ) |
| **SNS** | Pub-sub notification |
| **EventBridge** | Event bus, schedule |
| **MQ** | Managed RabbitMQ / ActiveMQ |
| **Kinesis** | Real-time stream (như Kafka) |

## AWS Free Tier

Khi đăng ký (phase 2 đã làm), 12 tháng đầu free:

| Service | Limit |
|---|---|
| EC2 | 750 hours/month t2.micro hoặc t3.micro |
| S3 | 5 GB |
| RDS | 750 hours db.t3.micro |
| Lambda | 1M requests/month (always-free) |
| CloudWatch | 10 alarm, 10 metric |
| DynamoDB | 25 GB always-free |
| SNS / SQS | 1M / 1M requests always-free |

> Vượt = trả tiền. **Set billing alarm** (đã làm phase 2) để khỏi shock.

## Console vs CLI vs SDK

```text
Same resource, 3 cách create:

1. Console (web UI):
   Click click click → create EC2

2. CLI:
   aws ec2 run-instances --image-id ami-xxx --instance-type t3.micro

3. SDK (Python boto3):
   import boto3
   ec2 = boto3.client('ec2')
   ec2.run_instances(ImageId='ami-xxx', InstanceType='t3.micro', ...)

4. IaC (Terraform):
   resource "aws_instance" "web" {
     ami = "ami-xxx"
     instance_type = "t3.micro"
   }
```

DevOps dùng **IaC + CLI** chủ yếu. Console cho demo, learn.

## Pricing model

### Pay-per-use

EC2: trả per second (hoặc per hour).
S3: trả per GB-month + per request + per transfer.
Lambda: trả per invocation + GB-second.

### Discount

- **Reserved Instance**: commit 1-3 năm, giảm 30-50%.
- **Savings Plan**: flexible commitment.
- **Spot Instance**: unused capacity, giảm 70-90%, có thể bị terminate.
- **Free Tier**: 12 tháng đầu / always-free.

### Cost optimization

- Auto-shutdown dev/test EC2 ngoài giờ.
- Right-size instance (đừng dùng m5.4xlarge cho test).
- Delete unused: EBS, Elastic IP, snapshot.
- Lifecycle S3 → Glacier cho data cũ.
- Reserved instance cho prod load steady.

## Architecture pattern — 3-tier

```text
                    Route 53 (DNS)
                          │
                          ▼
                   CloudFront (CDN)
                          │
                          ▼
                ALB (Application LB)
                          │
                ┌─────────┼─────────┐
                ▼         ▼         ▼
              EC2/      EC2/      EC2/
              ECS       ECS       ECS    ← Web tier (auto scaling)
                          │
                          ▼
                       RDS Multi-AZ      ← DB tier
                          │
                          ▼
                  ElastiCache (Redis)    ← Cache tier

                  + S3 (static)
                  + SQS (async)
                  + CloudWatch (monitor)
```

vProfile sẽ deploy lên architecture này (section 14-15).

## Well-Architected Framework

AWS có **6 pillar** đánh giá architecture:

1. **Operational Excellence** — run + monitor operations.
2. **Security** — protect info + system.
3. **Reliability** — recover from failure.
4. **Performance Efficiency** — efficient use of resources.
5. **Cost Optimization** — avoid unnecessary spend.
6. **Sustainability** — minimize environmental impact (2021+).

Tool: **AWS Well-Architected Tool** trên console review architecture.

## Cert path

DevOps thường target:
- **AWS Cloud Practitioner** (CLF-C02): foundation, $100.
- **AWS Solutions Architect Associate** (SAA-C03): general SA, $150.
- **AWS DevOps Engineer Professional** (DOP-C02): advanced, $300.
- **AWS Security Specialty** (SCS-C02): security focus.

Khoá có riêng SAA-C03 trong workspace (folder `aws-certified-solutions-architect-associate-saa-c03`).

## Trade-off AWS vs alternatives

| | AWS | GCP | Azure |
|---|---|---|---|
| Market share | 32% | 11% | 23% |
| Service count | 200+ | 100+ | 200+ |
| Pricing | Median | Cheaper for compute | Median |
| K8s | EKS | GKE (best) | AKS |
| Database | RDS, Aurora | Cloud SQL, Spanner | Azure SQL, Cosmos |
| AI/ML | Bedrock, SageMaker | Vertex AI | Azure ML, OpenAI |
| Best for | Most workloads | Data-heavy, K8s | Microsoft shop, .NET |

Hầu hết DevOps engineer Việt Nam gặp AWS đầu tiên.

## Khi nào KHÔNG dùng cloud?

- App siêu nhỏ, traffic thấp → VPS (DigitalOcean, Vultr) rẻ hơn.
- Compliance ngặt → on-prem private cloud.
- Predictable workload steady → có thể bare-metal rẻ hơn long-term.
- Data subject to local law không cho ra ngoài.

## AWS docs + community

- **docs.aws.amazon.com** — official.
- **AWS Well-Architected Labs** — hands-on.
- **AWS Workshops** — workshops.aws.
- **r/aws** Reddit.
- **AWS Community Builders** program.

## Bẫy thường gặp người mới

| Bẫy | Hậu quả | Phòng |
|---|---|---|
| Quên tắt EC2 sau lab | $60/month/instance | Auto-shutdown, billing alarm |
| Spawn 100 instance bằng script lỗi | Bill $1000 trong giờ | Set budget alarm, IAM limit |
| Public S3 bucket | Data leak | Block public access default |
| IAM key trong git | Bot scan + abuse | Pre-commit scan, IAM least privilege |
| Quên delete snapshot | $0.05/GB/month tích lại | Lifecycle policy |
| NAT Gateway dev không tắt | $32/month + traffic | Schedule stop |
| Cross-region transfer | $0.02/GB | Architecture đúng region |

## Tóm tắt bài 1

- AWS = cloud provider #1 (32%), 200+ services, ~32 regions.
- **Region** = cụm data center, **AZ** = data center isolated.
- Phổ biến: **us-east-1** (rẻ nhất, mọi service mới ra), **ap-southeast-1** (latency VN).
- Top 20 service: EC2, S3, RDS, VPC, IAM, CloudWatch, Lambda, ELB, CloudFront, Route 53, ...
- 4 cách deploy: Console (UI), **CLI**, SDK, **IaC** (CloudFormation/Terraform).
- 4 pricing: on-demand, **Reserved Instance**, Savings Plan, **Spot**.
- 6 pillar **Well-Architected**: Ops, Security, Reliability, Performance, Cost, Sustainability.
- Free tier 12 tháng + always-free cho Lambda, DynamoDB, SNS, SQS.

**Bài kế tiếp** → [Bài 2: IAM + EC2 + VPC basics](02-iam-ec2-vpc.md)
