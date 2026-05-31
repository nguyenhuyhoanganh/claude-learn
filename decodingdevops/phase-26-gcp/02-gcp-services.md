# Bài 2: GCP services deep — Compute Engine, GKE, Cloud SQL, IAM

Bài 1 overview. Bài này **đào sâu từng GCP service** với hands-on chuẩn production.

## Compute Engine — VM

### Machine types

```text
Predefined:
- E2 (cheap general):     e2-micro, e2-small, e2-medium, e2-standard-*
- N2 (Intel general):     n2-standard-*, n2-highmem-*, n2-highcpu-*
- N2D (AMD):              n2d-*
- C2 (compute-optimized): c2-standard-*
- M2/M3 (memory):         m2-megamem-*
- A2 (GPU):               a2-highgpu-*

Custom:
- custom-CPU-MEM_MB
  vd: custom-4-8192 = 4 vCPU, 8 GB RAM
```

### Create VM

```bash
gcloud compute instances create web01 \
    --zone us-central1-a \
    --machine-type e2-medium \
    --image-family ubuntu-2204-lts \
    --image-project ubuntu-os-cloud \
    --boot-disk-size 50GB \
    --boot-disk-type pd-balanced \
    --network vprofile-vpc \
    --subnet vprofile-public \
    --tags http-server,ssh-server \
    --metadata-from-file startup-script=startup.sh \
    --service-account vprofile-vm@PROJECT.iam.gserviceaccount.com \
    --scopes cloud-platform \
    --labels env=production,project=vprofile \
    --preemptible
```

`--preemptible` = like AWS Spot, save 80% nhưng có thể bị terminate 24h.

### Sustained use discount

Auto-discount khi VM chạy > 25% tháng. No commit. Cumulative up to 30% off.

### Committed use discount

Like AWS Reserved Instance:

```bash
gcloud compute commitments create vprofile-commit \
    --region us-central1 \
    --resources type=memory,amount=64 type=vcpu,amount=16 \
    --plan twelve-month \
    --type general-purpose
```

20-57% discount tùy plan.

### Instance template + MIG

```bash
# Template
gcloud compute instance-templates create vprofile-template \
    --machine-type e2-medium \
    --image-family ubuntu-2204-lts \
    --image-project ubuntu-os-cloud \
    --metadata-from-file startup-script=startup.sh

# Managed Instance Group
gcloud compute instance-groups managed create vprofile-mig \
    --base-instance-name vprofile \
    --size 3 \
    --template vprofile-template \
    --zone us-central1-a

# Autoscaling
gcloud compute instance-groups managed set-autoscaling vprofile-mig \
    --zone us-central1-a \
    --max-num-replicas 10 \
    --min-num-replicas 2 \
    --target-cpu-utilization 0.7 \
    --cool-down-period 60
```

Like AWS ASG.

## GKE — Google Kubernetes Engine

Best-in-class K8s (Google invented K8s).

### Standard cluster

```bash
gcloud container clusters create vprofile-prod \
    --zone us-central1-a \
    --num-nodes 3 \
    --machine-type e2-standard-4 \
    --release-channel regular \
    --enable-autoupgrade \
    --enable-autorepair \
    --enable-autoscaling --min-nodes 3 --max-nodes 10 \
    --enable-ip-alias \
    --enable-private-nodes \
    --master-ipv4-cidr 172.16.0.0/28 \
    --network vprofile-vpc \
    --subnetwork vprofile-gke \
    --enable-network-policy \
    --enable-shielded-nodes \
    --workload-pool=PROJECT.svc.id.goog \
    --enable-cloud-logging \
    --enable-cloud-monitoring
```

`--workload-pool` = Workload Identity (K8s SA ↔ GCP IAM mapping, like IRSA on EKS).

### Autopilot — serverless K8s

```bash
gcloud container clusters create-auto vprofile-auto \
    --region us-central1 \
    --workload-pool=PROJECT.svc.id.goog
```

GCP manage node entirely. Pay per pod resource usage. No node management.

Pros: zero ops, auto-scale infinite.
Cons: limited config, slightly more expensive than equivalent Standard.

### GKE add-ons

- **HTTP Load Balancer** = Google Cloud Load Balancer (anycast global).
- **Network Policy** Calico/Cilium.
- **Vertical Pod Autoscaler** (VPA).
- **Cluster Autoscaler** built-in.
- **Workload Identity**.
- **Backup for GKE**.
- **Multi-Cluster Services**.

### Workload Identity

Bind K8s ServiceAccount → GCP ServiceAccount:

```bash
# Create GCP SA
gcloud iam service-accounts create vprofile-app

# Grant permission
gcloud projects add-iam-policy-binding PROJECT \
    --member "serviceAccount:vprofile-app@PROJECT.iam.gserviceaccount.com" \
    --role "roles/storage.objectViewer"

# Bind K8s SA → GCP SA
gcloud iam service-accounts add-iam-policy-binding \
    vprofile-app@PROJECT.iam.gserviceaccount.com \
    --role roles/iam.workloadIdentityUser \
    --member "serviceAccount:PROJECT.svc.id.goog[default/vprofile-app]"

# Annotate K8s SA
kubectl annotate serviceaccount vprofile-app \
    iam.gke.io/gcp-service-account=vprofile-app@PROJECT.iam.gserviceaccount.com
```

Pod with K8s SA `vprofile-app` → auto get GCP credentials → access Cloud Storage.

## Cloud Run — serverless container

Container như Lambda nhưng full HTTP server.

```bash
# Deploy from source (auto-build)
gcloud run deploy vprofile \
    --source . \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated \
    --min-instances 1 \
    --max-instances 100 \
    --cpu 1 \
    --memory 512Mi \
    --concurrency 80 \
    --timeout 60 \
    --set-env-vars ENV=production \
    --set-secrets DB_PASSWORD=db-password:latest

# Or from pre-built image
gcloud run deploy vprofile \
    --image gcr.io/PROJECT/vprofile:v1.0 \
    --region us-central1
```

URL: `https://vprofile-xxx-uc.a.run.app`.

Features:
- Scale to zero (no req → no cost).
- Auto-scale based on req/instance.
- HTTPS automatic.
- Cloud SQL connector built-in.
- VPC connector for private resource.
- Custom domain + cert managed.

### Cloud Run Jobs

Run task to completion (not HTTP):

```bash
gcloud run jobs create vprofile-backup \
    --image gcr.io/PROJECT/backup:v1 \
    --region us-central1 \
    --tasks 1 \
    --task-timeout 3600 \
    --max-retries 3 \
    --schedule "0 2 * * *"     # Daily 2am
```

Replace Lambda + EventBridge schedule.

## Cloud SQL — managed RDS

```bash
gcloud sql instances create vprofile-db \
    --database-version MYSQL_8_0 \
    --tier db-n1-standard-2 \
    --region us-central1 \
    --availability-type REGIONAL \
    --enable-bin-log \
    --backup \
    --backup-start-time 03:00 \
    --retained-backups-count 7 \
    --network projects/PROJECT/global/networks/vprofile-vpc \
    --no-assign-ip \
    --enable-google-private-path

# Set root password
gcloud sql users set-password root \
    --instance vprofile-db \
    --password 'StrongPass123!'

# Create DB
gcloud sql databases create accounts --instance vprofile-db

# Create user
gcloud sql users create admin \
    --instance vprofile-db \
    --password 'AppPass123!' \
    --host '%'
```

### Cloud SQL Proxy

App connect tới Cloud SQL via proxy → no public IP needed:

```bash
# Sidecar in K8s
- name: cloud-sql-proxy
  image: gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.8.0
  args:
    - "--port=3306"
    - "PROJECT:us-central1:vprofile-db"
```

App connect localhost:3306. Proxy handle IAM auth + TLS.

### IAM authentication

```bash
# Enable
gcloud sql instances patch vprofile-db \
    --database-flags cloudsql.iam_authentication=on

# Add IAM user (no password)
gcloud sql users create alice@acme.com \
    --instance vprofile-db \
    --type cloud_iam_user
```

App auth with GCP credentials, no static password.

## Cloud Storage — S3 equivalent

```bash
# Create bucket
gsutil mb -l us-central1 -c standard gs://vprofile-static-2026

# Upload
gsutil cp file.txt gs://vprofile-static-2026/

# Sync
gsutil rsync -r local/ gs://vprofile-static-2026/

# Lifecycle
cat > lifecycle.json <<EOF
{
  "lifecycle": {
    "rule": [
      {"action": {"type": "SetStorageClass", "storageClass": "NEARLINE"},
       "condition": {"age": 30}},
      {"action": {"type": "SetStorageClass", "storageClass": "COLDLINE"},
       "condition": {"age": 90}},
      {"action": {"type": "Delete"},
       "condition": {"age": 365}}
    ]
  }
}
EOF
gsutil lifecycle set lifecycle.json gs://vprofile-static-2026
```

Storage classes: Standard, Nearline (30d access), Coldline (90d), Archive (1y).

### Signed URL

```python
from google.cloud import storage
from datetime import datetime, timedelta

bucket = storage.Client().bucket("vprofile-static-2026")
blob = bucket.blob("private/video.mp4")

url = blob.generate_signed_url(
    expiration=datetime.utcnow() + timedelta(hours=1),
    method="GET"
)
```

## BigQuery — data warehouse

```sql
-- Query Cloud Storage parquet directly (external table)
CREATE EXTERNAL TABLE accounts.events
OPTIONS (
    format = 'PARQUET',
    uris = ['gs://vprofile-data/events/*.parquet']
);

-- Query
SELECT
    user_id,
    DATE(timestamp) as day,
    COUNT(*) as event_count
FROM accounts.events
WHERE DATE(timestamp) BETWEEN '2026-05-01' AND '2026-05-31'
GROUP BY user_id, day
ORDER BY event_count DESC
LIMIT 100;
```

Free tier: 1 TB query/month. After: $5/TB scanned.

Pattern: stream log → Cloud Storage → BigQuery query → Grafana visualize.

## Pub/Sub — managed messaging

```bash
# Topic
gcloud pubsub topics create order-events

# Subscription
gcloud pubsub subscriptions create order-events-sub \
    --topic order-events \
    --ack-deadline 60 \
    --max-delivery-attempts 5 \
    --dead-letter-topic order-events-dlq

# Publish
gcloud pubsub topics publish order-events \
    --message='{"order_id":"123","amount":100}'

# Pull
gcloud pubsub subscriptions pull order-events-sub --auto-ack --limit 10
```

Push subscription (HTTP):

```bash
gcloud pubsub subscriptions create order-webhook \
    --topic order-events \
    --push-endpoint https://api.vprofile.acme.com/webhook \
    --push-auth-service-account vprofile-pubsub@PROJECT.iam.gserviceaccount.com
```

Pub/Sub POST event to URL.

## Cloud Build — CI/CD

`cloudbuild.yaml`:

```yaml
steps:
  - name: 'gcr.io/cloud-builders/mvn'
    args: ['test']

  - name: 'gcr.io/cloud-builders/mvn'
    args: ['package', '-DskipTests']

  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'gcr.io/$PROJECT_ID/vprofile:$SHORT_SHA'
      - '.'

  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/vprofile:$SHORT_SHA']

  - name: 'gcr.io/cloud-builders/kubectl'
    args:
      - 'set'
      - 'image'
      - 'deployment/vprofile'
      - 'vprofile=gcr.io/$PROJECT_ID/vprofile:$SHORT_SHA'
    env:
      - 'CLOUDSDK_COMPUTE_REGION=us-central1'
      - 'CLOUDSDK_CONTAINER_CLUSTER=vprofile-prod'

substitutions:
  _ENV: production

options:
  machineType: 'N1_HIGHCPU_8'
  logging: CLOUD_LOGGING_ONLY

timeout: 1200s
```

Trigger từ GitHub:

```bash
gcloud builds triggers create github \
    --name vprofile-cicd \
    --repo-name vprofile \
    --repo-owner acme \
    --branch-pattern '^main$' \
    --build-config cloudbuild.yaml
```

## Secret Manager

Like AWS Secrets Manager.

```bash
# Create
gcloud secrets create db-password --replication-policy automatic
echo -n "MySecret123!" | gcloud secrets versions add db-password --data-file=-

# Access
gcloud secrets versions access latest --secret db-password

# Access in Cloud Run
gcloud run deploy vprofile \
    --set-secrets DB_PASSWORD=db-password:latest \
    ...
```

## Cost monitoring

```bash
# Budget alert
gcloud billing budgets create \
    --billing-account ACCOUNT_ID \
    --display-name "vprofile-monthly" \
    --budget-amount 500USD \
    --threshold-rule percent=0.5,basis=current-spend \
    --threshold-rule percent=0.9,basis=current-spend \
    --threshold-rule percent=1.0,basis=current-spend \
    --notifications-rule-pubsub-topic projects/PROJECT/topics/billing-alerts
```

## Networking

VPC native, no default VPC like AWS:

```bash
# Create custom VPC
gcloud compute networks create vprofile-vpc --subnet-mode custom

# Subnet
gcloud compute networks subnets create vprofile-public \
    --network vprofile-vpc \
    --range 10.0.1.0/24 \
    --region us-central1

# Firewall rule (no security group concept, firewall rule applies VPC-wide)
gcloud compute firewall-rules create allow-http \
    --network vprofile-vpc \
    --allow tcp:80,tcp:443 \
    --target-tags http-server \
    --source-ranges 0.0.0.0/0
```

Tags trên VM → firewall rule match.

### Cloud Load Balancer

Global anycast IP (1 IP serves world):

```bash
# Backend
gcloud compute backend-services create vprofile-backend \
    --global \
    --protocol HTTP \
    --load-balancing-scheme EXTERNAL_MANAGED

# Health check
gcloud compute health-checks create http vprofile-hc \
    --port 80 \
    --request-path /health

# Backend + Health
gcloud compute backend-services add-backend vprofile-backend \
    --global \
    --instance-group vprofile-mig \
    --instance-group-zone us-central1-a
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Default network too open | Security risk | Custom VPC always |
| Cloud SQL public IP | Exposed | Private IP + VPC peering |
| GKE Standard not auto-upgrade | EOL | Enable autoupgrade + release channel |
| BigQuery query no LIMIT | $$$ | Always LIMIT exploration query |
| Preemptible VM critical | Down random | Use only for fault-tolerant |
| Cloud Run not min instances | Cold start | Set min-instances 1 for latency |

## Tóm tắt bài 2

- **Compute Engine** VM với sustained/committed use discount.
- **GKE Autopilot** = serverless K8s; **Standard** = control flexibility.
- **Workload Identity** = K8s SA ↔ GCP SA bind (like IRSA).
- **Cloud Run** = serverless container HTTP server, scale to zero.
- **Cloud SQL** + **Cloud SQL Proxy** + IAM auth.
- **BigQuery** data warehouse cheap với external tables.
- **Pub/Sub** push/pull subscriptions, dead-letter.
- **Cloud Build** native CI/CD trigger từ GitHub.
- **Global Load Balancer** anycast IP serves world.

**Phase kế tiếp** → [Phase 27 — Docker deep](../phase-27-docker/01-docker-deep.md)
