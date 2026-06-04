# Bài 2: GCP services deep — Compute Engine, GKE, Cloud SQL, IAM

Bài 1 đã overview GCP. Bài này **đào sâu từng service** với hands-on chuẩn production.

## Compute Engine — VM

### Machine types (Các loại máy)

```text
Predefined (có sẵn):
- E2 (cheap general):     e2-micro, e2-small, e2-medium, e2-standard-*
- N2 (Intel general):     n2-standard-*, n2-highmem-*, n2-highcpu-*
- N2D (AMD):              n2d-*
- C2 (compute-optimized): c2-standard-*
- M2/M3 (memory):         m2-megamem-*
- A2 (GPU):               a2-highgpu-*

Custom (tự tuỳ chỉnh):
- custom-CPU-MEM_MB
  vd: custom-4-8192 = 4 vCPU, 8 GB RAM
```

### Tạo VM

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

`--preemptible` = giống AWS Spot, tiết kiệm 80% nhưng có thể bị terminate sau 24 giờ.

### Sustained use discount (Giảm giá khi dùng liên tục)

GCP tự discount khi VM chạy > 25% tháng. Không cần commit trước. Có thể tiết kiệm tới 30%.

### Committed use discount (Cam kết sử dụng)

Giống AWS Reserved Instance — cam kết dùng trong 1-3 năm:

```bash
gcloud compute commitments create vprofile-commit \
    --region us-central1 \
    --resources type=memory,amount=64 type=vcpu,amount=16 \
    --plan twelve-month \
    --type general-purpose
```

Tiết kiệm 20-57% tuỳ plan.

### Instance template + MIG (Managed Instance Group)

```bash
# Tạo template
gcloud compute instance-templates create vprofile-template \
    --machine-type e2-medium \
    --image-family ubuntu-2204-lts \
    --image-project ubuntu-os-cloud \
    --metadata-from-file startup-script=startup.sh

# Tạo Managed Instance Group
gcloud compute instance-groups managed create vprofile-mig \
    --base-instance-name vprofile \
    --size 3 \
    --template vprofile-template \
    --zone us-central1-a

# Bật autoscaling
gcloud compute instance-groups managed set-autoscaling vprofile-mig \
    --zone us-central1-a \
    --max-num-replicas 10 \
    --min-num-replicas 2 \
    --target-cpu-utilization 0.7 \
    --cool-down-period 60
```

MIG tương đương Auto Scaling Group bên AWS.

## GKE — Google Kubernetes Engine

K8s tốt nhất trên các cloud (vì Google đã phát minh ra Kubernetes).

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

`--workload-pool` = bật Workload Identity (mapping K8s SA ↔ GCP IAM, tương đương IRSA bên EKS).

### Autopilot — Serverless K8s

```bash
gcloud container clusters create-auto vprofile-auto \
    --region us-central1 \
    --workload-pool=PROJECT.svc.id.goog
```

GCP quản hoàn toàn node hộ. Trả phí theo resource thực tế pod dùng. Không phải quản node.

Ưu điểm: zero ops, auto-scale gần như vô hạn.
Nhược điểm: cấu hình giới hạn, hơi đắt hơn Standard tương đương.

### Các add-on của GKE

- **HTTP Load Balancer** = Google Cloud Load Balancer (anycast toàn cầu).
- **Network Policy** dùng Calico/Cilium.
- **Vertical Pod Autoscaler** (VPA).
- **Cluster Autoscaler** built-in.
- **Workload Identity**.
- **Backup for GKE**.
- **Multi-Cluster Services**.

### Workload Identity

Bind K8s ServiceAccount với GCP ServiceAccount:

```bash
# Tạo GCP SA
gcloud iam service-accounts create vprofile-app

# Cấp quyền cho GCP SA
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

Pod gắn K8s SA `vprofile-app` → tự động lấy được GCP credential → truy cập Cloud Storage mà không cần lưu key.

## Cloud Run — Serverless container

Container giống Lambda nhưng chạy full HTTP server (linh hoạt hơn).

```bash
# Deploy từ source code (Cloud Run tự build)
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

# Hoặc deploy từ image đã build sẵn
gcloud run deploy vprofile \
    --image gcr.io/PROJECT/vprofile:v1.0 \
    --region us-central1
```

URL nhận được: `https://vprofile-xxx-uc.a.run.app`.

Tính năng:
- **Scale to zero** (không có request → không tính phí).
- Auto-scale theo số request / instance.
- HTTPS tự động.
- Tích hợp sẵn connector cho Cloud SQL.
- VPC connector để access resource private.
- Custom domain + cert được manage hộ.

### Cloud Run Jobs (Task chạy hữu hạn)

Chạy task đến khi hoàn thành (không phải HTTP server):

```bash
gcloud run jobs create vprofile-backup \
    --image gcr.io/PROJECT/backup:v1 \
    --region us-central1 \
    --tasks 1 \
    --task-timeout 3600 \
    --max-retries 3 \
    --schedule "0 2 * * *"     # Hàng ngày 2h sáng
```

Thay thế cho combo Lambda + EventBridge schedule bên AWS.

## Cloud SQL — Managed RDS

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

# Tạo database
gcloud sql databases create accounts --instance vprofile-db

# Tạo user
gcloud sql users create admin \
    --instance vprofile-db \
    --password 'AppPass123!' \
    --host '%'
```

### Cloud SQL Proxy

App kết nối Cloud SQL qua proxy → không cần expose public IP:

```bash
# Sidecar container trong K8s
- name: cloud-sql-proxy
  image: gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.8.0
  args:
    - "--port=3306"
    - "PROJECT:us-central1:vprofile-db"
```

App connect tới `localhost:3306`. Proxy lo IAM auth + TLS hộ.

### IAM authentication (Đăng nhập DB qua IAM)

```bash
# Enable
gcloud sql instances patch vprofile-db \
    --database-flags cloudsql.iam_authentication=on

# Thêm IAM user (không cần password)
gcloud sql users create alice@acme.com \
    --instance vprofile-db \
    --type cloud_iam_user
```

App auth bằng GCP credential — không lưu password tĩnh ở đâu cả.

## Cloud Storage — tương đương S3

```bash
# Tạo bucket
gsutil mb -l us-central1 -c standard gs://vprofile-static-2026

# Upload
gsutil cp file.txt gs://vprofile-static-2026/

# Sync folder
gsutil rsync -r local/ gs://vprofile-static-2026/

# Lifecycle policy
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

Storage class: Standard, Nearline (30 ngày), Coldline (90 ngày), Archive (1 năm).

### Signed URL (URL có chữ ký, có thời hạn)

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

## BigQuery — Data warehouse

```sql
-- Query thẳng file parquet trên Cloud Storage (external table)
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

Free tier: 1 TB query/tháng. Sau đó: $5 / TB scanned.

Pattern phổ biến: stream log → Cloud Storage → BigQuery query → Grafana visualize.

## Pub/Sub — Managed messaging

```bash
# Tạo topic
gcloud pubsub topics create order-events

# Tạo subscription
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

Push subscription (Pub/Sub tự POST message lên HTTP endpoint):

```bash
gcloud pubsub subscriptions create order-webhook \
    --topic order-events \
    --push-endpoint https://api.vprofile.acme.com/webhook \
    --push-auth-service-account vprofile-pubsub@PROJECT.iam.gserviceaccount.com
```

Pub/Sub tự POST event đến URL của bạn — không cần polling.

## Cloud Build — CI/CD native

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

Tương đương AWS Secrets Manager.

```bash
# Tạo secret
gcloud secrets create db-password --replication-policy automatic
echo -n "MySecret123!" | gcloud secrets versions add db-password --data-file=-

# Đọc secret
gcloud secrets versions access latest --secret db-password

# Dùng trong Cloud Run
gcloud run deploy vprofile \
    --set-secrets DB_PASSWORD=db-password:latest \
    ...
```

## Cost monitoring

```bash
# Budget alert (cảnh báo chi phí)
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

VPC native — GCP không có default VPC như AWS, phải tự tạo:

```bash
# Tạo custom VPC
gcloud compute networks create vprofile-vpc --subnet-mode custom

# Tạo subnet
gcloud compute networks subnets create vprofile-public \
    --network vprofile-vpc \
    --range 10.0.1.0/24 \
    --region us-central1

# Firewall rule — GCP không có khái niệm security group, firewall áp dụng cấp VPC
gcloud compute firewall-rules create allow-http \
    --network vprofile-vpc \
    --allow tcp:80,tcp:443 \
    --target-tags http-server \
    --source-ranges 0.0.0.0/0
```

VM có tag → firewall rule match theo tag.

### Cloud Load Balancer

Global anycast IP (1 IP duy nhất phục vụ toàn cầu):

```bash
# Tạo backend service
gcloud compute backend-services create vprofile-backend \
    --global \
    --protocol HTTP \
    --load-balancing-scheme EXTERNAL_MANAGED

# Health check
gcloud compute health-checks create http vprofile-hc \
    --port 80 \
    --request-path /health

# Gắn backend + health check
gcloud compute backend-services add-backend vprofile-backend \
    --global \
    --instance-group vprofile-mig \
    --instance-group-zone us-central1-a
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Default network quá mở | Rủi ro bảo mật | Luôn dùng custom VPC |
| Cloud SQL public IP | Bị expose ra Internet | Private IP + VPC peering |
| GKE Standard không auto-upgrade | EOL (hết hỗ trợ) | Bật autoupgrade + release channel |
| BigQuery query không có LIMIT | Tốn nhiều tiền | Luôn LIMIT khi exploration query |
| Preemptible VM cho workload critical | Bị down ngẫu nhiên | Chỉ dùng cho workload fault-tolerant |
| Cloud Run không có min instances | Cold start chậm | Set min-instances 1 cho service nhạy latency |

## Tóm tắt bài 2

- **Compute Engine** VM với sustained / committed use discount.
- **GKE Autopilot** = serverless K8s; **GKE Standard** = linh hoạt kiểm soát.
- **Workload Identity** = K8s SA ↔ GCP SA binding (tương đương IRSA bên AWS).
- **Cloud Run** = serverless container HTTP server, scale to zero.
- **Cloud SQL** + **Cloud SQL Proxy** + IAM authentication.
- **BigQuery** data warehouse rẻ, dùng được với external table.
- **Pub/Sub** push/pull subscription, có dead-letter queue.
- **Cloud Build** native CI/CD trigger từ GitHub.
- **Global Load Balancer** anycast IP phục vụ toàn cầu.

**Phase kế tiếp** → [Phase 27 — Docker deep](../phase-27-docker/01-docker-deep.md)
