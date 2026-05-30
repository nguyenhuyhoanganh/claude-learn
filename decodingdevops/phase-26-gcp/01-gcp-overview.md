# Bài 1: GCP overview và multi-cloud strategy

AWS 32% market, GCP 11%, Azure 23%. DevOps engineer phải biết **ít nhất 2** cloud. Bài này GCP + multi-cloud.

## Vì sao GCP?

- **GKE** (Google Kubernetes Engine) = best-in-class K8s (Google invented K8s).
- **BigQuery** = data warehouse cực mạnh + cheap.
- **Spanner** = globally distributed SQL.
- **Vertex AI** = mature ML platform.
- **Pricing** thường rẻ hơn AWS cho compute.
- Cleaner UX hơn AWS.

Cons:
- Service count ít hơn AWS (100 vs 200+).
- Enterprise feature ít hơn Azure.
- Market share thấp hơn → ít job hơn.

## Service mapping AWS ↔ GCP ↔ Azure

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

DevOps **chuyển AWS → GCP** trong 2-4 tuần nếu hiểu concept.

## Setup GCP

### Account

1. Vào **console.cloud.google.com** → Sign up.
2. **Free trial $300 credit** trong 90 ngày.
3. Tạo Project (như AWS account isolation).

### gcloud CLI

```bash
# Install
curl https://sdk.cloud.google.com | bash
# Hoặc:
brew install --cask google-cloud-sdk

# Init
gcloud init
# Login + select project + region

# Verify
gcloud auth list
gcloud config list
```

## GCP structure

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

- **Organization**: top-level (company).
- **Folder**: nested grouping.
- **Project**: isolation boundary (AWS account equivalent).

## Compute Engine — VM

```bash
# Create VM
gcloud compute instances create web01 \
    --zone us-central1-a \
    --machine-type e2-micro \
    --image-family ubuntu-2204-lts \
    --image-project ubuntu-os-cloud \
    --tags http-server,https-server

# List
gcloud compute instances list

# SSH (gcloud handles key)
gcloud compute ssh web01 --zone us-central1-a

# Delete
gcloud compute instances delete web01 --zone us-central1-a
```

GCP machine types: `e2-micro` (free tier), `e2-small`, `n2-standard-4`, ...

## GKE — Google Kubernetes Engine

Best-in-class K8s:

```bash
# Create cluster
gcloud container clusters create vprofile \
    --zone us-central1-a \
    --num-nodes 3 \
    --machine-type e2-medium

# Get credentials (kubeconfig)
gcloud container clusters get-credentials vprofile --zone us-central1-a

kubectl get nodes
```

GKE Autopilot mode: serverless K8s (only pay for pod):

```bash
gcloud container clusters create-auto vprofile-auto --region us-central1
```

## Cloud Storage — equiv S3

```bash
# Create bucket
gsutil mb gs://my-app-bucket

# Upload
gsutil cp file.txt gs://my-app-bucket/

# Sync
gsutil rsync -r local-folder/ gs://my-app-bucket/folder/

# Make public
gsutil iam ch allUsers:objectViewer gs://my-app-bucket
```

## Cloud SQL — equiv RDS

```bash
gcloud sql instances create vprofile-db \
    --tier db-f1-micro \
    --database-version MYSQL_8_0 \
    --region us-central1 \
    --root-password StrongPass123!

# Connect via proxy
cloud_sql_proxy -instances=PROJECT:us-central1:vprofile-db=tcp:3306
```

## Cloud Run — serverless container

Container = HTTP server, GCP serve:

```bash
# Build + deploy 1 step
gcloud run deploy vprofile \
    --source . \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated
```

URL: `https://vprofile-xxx-uc.a.run.app`.

Pay per request + CPU/memory. Scale to 0 khi không request.

So với Lambda:
- **Lambda**: function (zip code).
- **Cloud Run**: full container, port 8080. More flexible.

## BigQuery — data warehouse

```sql
-- Query 1TB data trong giây
SELECT
    user_id,
    COUNT(*) AS event_count
FROM `acme.events.web_events`
WHERE date BETWEEN '2026-05-01' AND '2026-05-31'
GROUP BY user_id
ORDER BY event_count DESC
LIMIT 100;
```

Pricing: $5/TB scanned. Free tier 1TB/month.

Use case: log aggregation, user behavior, ML training data.

## Pub/Sub — equiv SQS+SNS+Kinesis

```bash
# Topic
gcloud pubsub topics create events

# Subscription
gcloud pubsub subscriptions create events-sub --topic=events

# Publish
gcloud pubsub topics publish events --message='{"user":"alice","action":"login"}'

# Pull
gcloud pubsub subscriptions pull events-sub --auto-ack
```

Pub/Sub:
- Pull-based hoặc push-based.
- Scale infinite.
- 1 publisher → N subscriber.
- Used for streaming, async tasks.

## IAM

GCP IAM khác AWS — **resource-based**:

```bash
# Grant role
gcloud projects add-iam-policy-binding PROJECT_ID \
    --member="user:alice@acme.com" \
    --role="roles/storage.objectViewer"

# Service account (equiv IAM role)
gcloud iam service-accounts create my-app \
    --display-name="My App"

# Generate key (avoid if possible)
gcloud iam service-accounts keys create key.json \
    --iam-account my-app@PROJECT.iam.gserviceaccount.com
```

GCP role types:
- **Primitive**: Owner, Editor, Viewer (broad — avoid prod).
- **Predefined**: `roles/storage.admin`, `roles/compute.networkAdmin` (recommend).
- **Custom**: tự define permission.

## Cloud Build — CI/CD

`cloudbuild.yaml`:

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

Trigger từ GitHub/GitLab push.

## Multi-cloud strategy

### Vì sao multi-cloud?

- **Avoid vendor lock-in**.
- **Cost optimization** — use cheapest cloud per workload.
- **Compliance** — region availability.
- **Disaster recovery** — provider failure resilience.
- **Best-of-breed** — BigQuery for analytics, S3 for storage.

### Vì sao KHÔNG multi-cloud?

- **Complexity 2-3x** — networking, IAM, billing.
- **Egress cost** — $0.08-0.12/GB transfer cross-cloud.
- **Skill team** spread thin.
- **Lock-in** vẫn xảy ra ở app level.

> **Reality**: 80% công ty stick với 1 cloud chính + dùng SaaS thứ ba (Datadog, MongoDB Atlas).

### Multi-cloud done right

**Active-active**:
- Each cloud full deploy.
- DNS load balance.
- Data sync challenge.

**Active-passive (DR)**:
- Primary cloud A, DR in cloud B.
- Periodic sync.
- Failover khi A down.

**Workload split**:
- Compute on AWS, BigQuery on GCP.
- Common.

### Tool agnostic

| Tool | Multi-cloud? |
|---|---|
| Terraform | ✓ — providers cho mọi cloud |
| Kubernetes | ✓ — universal |
| Crossplane | ✓ — K8s-native cloud control plane |
| Pulumi | ✓ — code thật |
| HashiCorp Vault | ✓ — secret management |
| Datadog / New Relic | ✓ — monitoring SaaS |

## Hybrid cloud

On-prem + cloud:
- **Anthos** (GCP) — K8s on-prem managed.
- **AWS Outposts** — AWS hardware on-prem.
- **Azure Arc** — Azure manage non-Azure resources.
- **OpenShift** — Red Hat K8s anywhere.

Use case: data sensitive on-prem, compute spike → cloud.

## Cost comparison rough

For same workload (3 VM, RDS, ALB, S3-equivalent):

| Cloud | Monthly cost |
|---|---|
| AWS | $300 |
| GCP | $250 |
| Azure | $280 |

GCP thường cheap nhất compute + storage. AWS overhead pricing nhưng best dev experience.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Multi-cloud egress cost | $0.08/GB transfer | Architecture minimize cross-cloud |
| IAM model khác nhau | Permission confusion | Map carefully, use Terraform |
| Tool lock-in (Lambda) | Hard to move | Use Cloud Run / serverless container portable |
| Team spread thin | Quality giảm | Pick primary + secondary |
| Compliance per region | Data sovereignty | Verify regulations |

## Tóm tắt bài 1

- **GCP**: 11% market, mạnh K8s + BigQuery + ML + dev UX.
- **Compute Engine** EC2-equivalent, **GKE** best K8s, **Cloud Run** serverless container.
- **BigQuery** data warehouse cheap + fast.
- **Pub/Sub** unified messaging (SQS+SNS+Kinesis combine).
- IAM resource-based với role predefined (use, không primitive).
- **Cloud Build** CI/CD native.
- Multi-cloud: tradeoff complexity vs flexibility — đa số stick 1 cloud chính.
- **Terraform + K8s** = portable foundation cho multi/hybrid.

**Phase kế tiếp** → [Phase 27 — Bài 1: Docker deep-dive](../phase-27-docker/01-docker-deep.md)
