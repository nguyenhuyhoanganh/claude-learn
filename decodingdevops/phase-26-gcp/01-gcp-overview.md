# Bài 1: GCP overview và multi-cloud strategy

Thị phần cloud (2026): AWS 32%, Azure 23%, GCP 11%. DevOps engineer phải biết **ít nhất 2** cloud platform. Bài này về GCP + chiến lược multi-cloud.

## Vì sao nên học GCP?

**Điểm mạnh:**
- **GKE** (Google Kubernetes Engine) = best-in-class K8s (Google chính là người tạo ra Kubernetes).
- **BigQuery** = data warehouse cực mạnh + giá rẻ.
- **Spanner** = SQL database distributed globally.
- **Vertex AI** = nền tảng ML đã trưởng thành.
- **Pricing** thường rẻ hơn AWS cho compute.
- **UX** sạch hơn, ít rối hơn AWS.

**Điểm yếu:**
- Số lượng service ít hơn AWS (100 vs 200+).
- Enterprise feature ít hơn Azure.
- Thị phần thấp hơn → ít job hơn AWS/Azure.

## Service mapping AWS ↔ GCP ↔ Azure

Bảng đối chiếu service tương đương giữa 3 cloud lớn:

| Category | AWS | GCP | Azure |
|---|---|---|---|
| VM | EC2 | Compute Engine | Virtual Machine |
| Container orchestration | ECS / EKS | GKE | AKS |
| Serverless function | Lambda | Cloud Functions / Cloud Run | Functions |
| Container service | Fargate | Cloud Run | Container Instances |
| Object storage | S3 | Cloud Storage | Blob Storage |
| Block storage | EBS | Persistent Disk | Managed Disk |
| SQL DB | RDS | Cloud SQL | Azure SQL |
| NoSQL | DynamoDB | Firestore / Bigtable | Cosmos DB |
| Data warehouse | Redshift | BigQuery | Synapse |
| Cache | ElastiCache | Memorystore | Cache for Redis |
| Message queue | SQS | Pub/Sub | Service Bus |
| Streaming | Kinesis | Pub/Sub + Dataflow | Event Hubs |
| CDN | CloudFront | Cloud CDN | CDN |
| DNS | Route 53 | Cloud DNS | DNS |
| Identity | IAM | IAM | Azure AD |
| Secret | Secrets Manager | Secret Manager | Key Vault |
| Monitoring | CloudWatch | Cloud Monitoring | Monitor |
| Logs | CloudWatch Logs | Cloud Logging | Log Analytics |
| CI/CD | CodePipeline | Cloud Build | DevOps |
| IaC native | CloudFormation | Deployment Manager | ARM/Bicep |

DevOps có thể **chuyển từ AWS → GCP** trong 2-4 tuần nếu đã nắm vững concept (vì hầu hết khái niệm tương đồng).

## Setup GCP

### Tạo Account

1. Vào **console.cloud.google.com** → Sign up.
2. **Free trial $300 credit** trong 90 ngày.
3. Tạo Project (giống AWS account — đơn vị cô lập resource).

### Cài gcloud CLI

```bash
# Install
curl https://sdk.cloud.google.com | bash
# Hoặc:
brew install --cask google-cloud-sdk

# Init
gcloud init
# Login + chọn project + chọn region

# Verify
gcloud auth list
gcloud config list
```

## Cấu trúc tổ chức GCP

```text
Organization (acme.com)
├── Folder: Production
│   ├── Project: prod-app
│   ├── Project: prod-data
│   └── Project: prod-logging
└── Folder: Non-Prod
    ├── Project: dev
    └── Project: staging
```

- **Organization**: top-level (cấp công ty).
- **Folder**: nested grouping (nhóm con).
- **Project**: ranh giới cô lập (tương đương AWS account).

## Compute Engine — VM

```bash
# Tạo VM
gcloud compute instances create web01 \
    --zone us-central1-a \
    --machine-type e2-micro \
    --image-family ubuntu-2204-lts \
    --image-project ubuntu-os-cloud \
    --tags http-server,https-server

# List
gcloud compute instances list

# SSH (gcloud tự handle SSH key)
gcloud compute ssh web01 --zone us-central1-a

# Delete
gcloud compute instances delete web01 --zone us-central1-a
```

GCP machine types: `e2-micro` (free tier), `e2-small`, `n2-standard-4`, ...

## GKE — Google Kubernetes Engine

K8s tốt nhất trong các cloud (vì Google sáng tạo ra Kubernetes):

```bash
# Tạo cluster
gcloud container clusters create vprofile \
    --zone us-central1-a \
    --num-nodes 3 \
    --machine-type e2-medium

# Lấy kubeconfig
gcloud container clusters get-credentials vprofile --zone us-central1-a

kubectl get nodes
```

GKE Autopilot mode (serverless K8s — chỉ trả tiền cho pod, không trả node):

```bash
gcloud container clusters create-auto vprofile-auto --region us-central1
```

## Cloud Storage — tương đương S3

```bash
# Tạo bucket
gsutil mb gs://my-app-bucket

# Upload
gsutil cp file.txt gs://my-app-bucket/

# Sync folder
gsutil rsync -r local-folder/ gs://my-app-bucket/folder/

# Public bucket
gsutil iam ch allUsers:objectViewer gs://my-app-bucket
```

## Cloud SQL — tương đương RDS

```bash
gcloud sql instances create vprofile-db \
    --tier db-f1-micro \
    --database-version MYSQL_8_0 \
    --region us-central1 \
    --root-password StrongPass123!

# Connect qua proxy (an toàn hơn expose public)
cloud_sql_proxy -instances=PROJECT:us-central1:vprofile-db=tcp:3306
```

## Cloud Run — serverless container

Container nghe HTTP, GCP tự serve. Không cần manage K8s:

```bash
# Build + deploy trong 1 lệnh
gcloud run deploy vprofile \
    --source . \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated
```

URL nhận được: `https://vprofile-xxx-uc.a.run.app`.

Trả tiền theo request + CPU/memory. Scale về 0 khi không có request → tiết kiệm cực mạnh.

So với AWS Lambda:
- **Lambda**: function (zip code), runtime giới hạn.
- **Cloud Run**: full container, expose port 8080. Linh hoạt hơn nhiều.

## BigQuery — data warehouse

```sql
-- Query 1TB data trong vài giây
SELECT
    user_id,
    COUNT(*) AS event_count
FROM `acme.events.web_events`
WHERE date BETWEEN '2026-05-01' AND '2026-05-31'
GROUP BY user_id
ORDER BY event_count DESC
LIMIT 100;
```

Pricing: $5 / TB scanned. Free tier 1TB/tháng.

Use case: log aggregation, user behavior analytics, ML training data.

## Pub/Sub — tương đương SQS + SNS + Kinesis (gộp lại)

```bash
# Tạo topic
gcloud pubsub topics create events

# Tạo subscription
gcloud pubsub subscriptions create events-sub --topic=events

# Publish message
gcloud pubsub topics publish events --message='{"user":"alice","action":"login"}'

# Pull message
gcloud pubsub subscriptions pull events-sub --auto-ack
```

Đặc điểm Pub/Sub:
- Hỗ trợ cả pull-based và push-based delivery.
- Scale gần như vô hạn.
- 1 publisher → N subscriber.
- Dùng cho streaming + async task.

## IAM trong GCP

GCP IAM khác AWS — **resource-based** (theo resource):

```bash
# Cấp role cho user
gcloud projects add-iam-policy-binding PROJECT_ID \
    --member="user:alice@acme.com" \
    --role="roles/storage.objectViewer"

# Service account (tương đương IAM role của AWS)
gcloud iam service-accounts create my-app \
    --display-name="My App"

# Generate key (tránh dùng nếu có thể — chuyển sang Workload Identity)
gcloud iam service-accounts keys create key.json \
    --iam-account my-app@PROJECT.iam.gserviceaccount.com
```

Các loại role trong GCP:
- **Primitive**: Owner, Editor, Viewer (cấp quá rộng — tránh dùng cho production).
- **Predefined**: `roles/storage.admin`, `roles/compute.networkAdmin` (khuyến nghị).
- **Custom**: tự define permission theo nhu cầu.

## Cloud Build — CI/CD

File `cloudbuild.yaml`:

```yaml
steps:
  - name: 'gcr.io/cloud-builders/mvn'
    args: ['test']

  - name: 'gcr.io/cloud-builders/mvn'
    args: ['package', '-DskipTests']

  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/vprofile:$COMMIT_SHA', '.']

  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/vprofile:$COMMIT_SHA']

  - name: 'gcr.io/cloud-builders/kubectl'
    args:
      - set
      - image
      - deployment/vprofile
      - vprofile=gcr.io/$PROJECT_ID/vprofile:$COMMIT_SHA
    env:
      - 'CLOUDSDK_COMPUTE_ZONE=us-central1-a'
      - 'CLOUDSDK_CONTAINER_CLUSTER=vprofile'
```

Trigger tự động khi có push từ GitHub/GitLab.

## Multi-cloud strategy

### Vì sao multi-cloud?

- **Tránh vendor lock-in** (phụ thuộc vào 1 nhà cung cấp).
- **Cost optimization** — dùng cloud rẻ nhất cho từng workload.
- **Compliance** — yêu cầu region cụ thể.
- **Disaster recovery** — chống cả khi 1 provider sập.
- **Best-of-breed** — BigQuery cho analytics, S3 cho storage.

### Vì sao KHÔNG multi-cloud?

- **Complexity tăng 2-3 lần** — networking, IAM, billing đều phức tạp hơn.
- **Egress cost** — $0.08-0.12 / GB transfer cross-cloud (tốn rất nhiều tiền).
- **Skill team bị dàn mỏng**.
- **Lock-in vẫn xảy ra** ở app level.

> **Thực tế**: 80% công ty stick với 1 cloud chính + dùng SaaS thứ ba (Datadog, MongoDB Atlas) cho các tính năng đặc biệt.

### Multi-cloud done right (làm đúng)

**Active-active**:
- Mỗi cloud đều deploy đầy đủ.
- DNS load balance phân bổ traffic.
- Thách thức lớn nhất: sync data giữa các cloud.

**Active-passive (DR)**:
- Primary trên cloud A, DR (disaster recovery) trên cloud B.
- Sync định kỳ.
- Failover khi A down.

**Workload split** (chia workload theo cloud):
- Compute trên AWS, BigQuery trên GCP.
- Pattern phổ biến nhất.

### Tool agnostic (tool không phụ thuộc cloud)

| Tool | Multi-cloud? |
|---|---|
| Terraform | ✓ — có provider cho mọi cloud |
| Kubernetes | ✓ — universal |
| Crossplane | ✓ — K8s-native cloud control plane |
| Pulumi | ✓ — code thật thay vì DSL |
| HashiCorp Vault | ✓ — secret management |
| Datadog / New Relic | ✓ — monitoring SaaS |

## Hybrid cloud — On-prem + Cloud

Combine on-premises với cloud:
- **Anthos** (GCP) — K8s on-prem được Google manage hộ.
- **AWS Outposts** — phần cứng AWS đặt tại data center của bạn.
- **Azure Arc** — Azure manage cả non-Azure resource.
- **OpenShift** — Red Hat K8s chạy ở bất cứ đâu.

Use case điển hình: data nhạy cảm giữ on-prem (vì regulation), compute spike → mượn cloud.

## So sánh chi phí (ước tính)

Cho cùng 1 workload (3 VM, 1 RDS, ALB, S3-equivalent):

| Cloud | Cost / tháng |
|---|---|
| AWS | $300 |
| GCP | $250 |
| Azure | $280 |

GCP thường rẻ nhất cho compute + storage. AWS đắt hơn nhưng dev experience tốt nhất.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Multi-cloud egress cost | $0.08/GB transfer tốn nhiều | Thiết kế architecture giảm cross-cloud traffic |
| IAM model khác nhau | Permission confusion | Map kỹ, dùng Terraform để chuẩn hoá |
| Vendor lock-in (Lambda) | Khó migrate | Dùng Cloud Run / serverless container portable |
| Team bị dàn mỏng | Quality giảm | Chọn 1 primary + 1 secondary |
| Compliance per region | Vi phạm data sovereignty | Verify regulations từng region |

## Tóm tắt bài 1

- **GCP**: 11% market share, điểm mạnh K8s + BigQuery + ML + dev UX.
- **Compute Engine** tương đương EC2, **GKE** là K8s tốt nhất, **Cloud Run** serverless container.
- **BigQuery** data warehouse cheap + fast.
- **Pub/Sub** unified messaging (gộp chức năng SQS + SNS + Kinesis).
- IAM resource-based với role predefined (dùng predefined, tránh primitive).
- **Cloud Build** CI/CD native.
- Multi-cloud: trade-off complexity vs flexibility — đa số stick với 1 cloud chính.
- **Terraform + K8s** = nền tảng portable cho multi/hybrid cloud.

**Phase kế tiếp** → [Phase 27 — Bài 1: Docker deep-dive](../phase-27-docker/01-docker-deep.md)
