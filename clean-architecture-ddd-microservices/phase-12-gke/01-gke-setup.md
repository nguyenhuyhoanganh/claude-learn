# Bài 49: Google Cloud + Tạo GKE Cluster

> Local K8s tốt cho dev. Production cần managed K8s. Bài này dùng **Google Kubernetes Engine (GKE)** — managed cluster của Google. Có thể chạy 90 ngày free $300 credit, đủ học.

## Vì sao GKE (không AWS EKS, Azure AKS)?

3 cloud managed K8s đều mạnh. Khoá chọn GKE vì:
- Free $300 credit 90 ngày — không tính tiền nếu trong budget.
- gcloud CLI gọn, doc tốt.
- GKE Autopilot mode tự manage node.
- Kubernetes do Google sinh ra → GKE thường có feature mới nhất.

AWS EKS / Azure AKS pattern tương tự. Khái niệm phổ quát.

## Tạo Google Cloud account

1. Đến <https://console.cloud.google.com/>.
2. Sign in Google account → "Get started for free".
3. Verify thẻ credit card (KHÔNG bị charge nếu trong free trial).
4. Get $300 credit + 90 days.

Tạo project:
```text
Project ID: food-ordering-system-001
Project Name: Food Ordering System
```

## Cài gcloud CLI

```text
# macOS
$ brew install --cask google-cloud-sdk

# Linux
$ curl https://sdk.cloud.google.com | bash

# Windows
# Tải installer từ cloud.google.com/sdk/docs/install
```

```text
$ gcloud version
Google Cloud SDK 462.0.1
core 2024.01.05
gke-gcloud-auth-plugin 0.5.7

$ gcloud auth login
$ gcloud config set project food-ordering-system-001
```

## Enable required APIs

```text
$ gcloud services enable container.googleapis.com         # GKE
$ gcloud services enable compute.googleapis.com           # Compute
$ gcloud services enable artifactregistry.googleapis.com  # Container Registry
```

## Tạo GKE cluster

### Option A: Standard cluster (nhiều control)

```text
$ gcloud container clusters create food-ordering-cluster \
    --zone us-central1-a \
    --num-nodes 3 \
    --machine-type e2-medium \
    --disk-size 30GB \
    --enable-autoscaling --min-nodes 1 --max-nodes 5 \
    --enable-autorepair \
    --enable-autoupgrade

Creating cluster food-ordering-cluster in us-central1-a... 
NAME                     LOCATION         MASTER_VERSION   STATUS
food-ordering-cluster   us-central1-a    1.29.0          RUNNING
```

3 node `e2-medium` = 2 vCPU + 4 GB RAM mỗi node = 12 GB total. Auto-scale 1-5 nodes theo tải.

### Option B: Autopilot (Google manage)

```text
$ gcloud container clusters create-auto food-ordering-cluster \
    --region us-central1
```

Autopilot: Google chọn machine type tự động, charge theo pod tiêu thụ thực. Đơn giản hơn nhưng đắt hơn (cho production có traffic ổn định).

Khoá học dùng Standard.

## Configure kubectl

```text
$ gcloud container clusters get-credentials food-ordering-cluster --zone us-central1-a

$ kubectl get nodes
NAME                                                STATUS   ROLES    AGE   VERSION
gke-food-ordering-cluster-default-pool-abc-1        Ready    <none>   2m    v1.29.0
gke-food-ordering-cluster-default-pool-abc-2        Ready    <none>   2m    v1.29.0
gke-food-ordering-cluster-default-pool-abc-3        Ready    <none>   2m    v1.29.0
```

Cluster ready, kubectl đã pointed đến GKE.

## Resource pricing — biết để tính

| Resource | Pricing (Iowa, USD) |
|---|---|
| e2-medium VM | $0.0335/h ≈ $24/month/node |
| Persistent Disk (SSD) | $0.17/GB/month |
| External IP (LoadBalancer) | $7.20/month |
| Egress traffic | $0.12/GB |

3 nodes e2-medium chạy 24/7 ≈ $72/month. Khoá học chỉ chạy vài giờ → $1-2.

**Quan trọng**: SHUTDOWN cluster khi không dùng:
```text
$ gcloud container clusters delete food-ordering-cluster --zone us-central1-a
```

## GKE features khác local

| Feature | Local minikube | GKE |
|---|---|---|
| Persistent storage | Single node hostPath | GCS PD (Persistent Disk) |
| LoadBalancer Service | Không (NodePort thay) | Google Cloud Load Balancer (1-2 phút tạo) |
| External IP | minikube ip | Auto từ pool |
| Auto-scaling node | Không | Cluster Autoscaler |
| Logging | kubectl logs | Cloud Logging tích hợp |
| Monitoring | Manual | Cloud Monitoring + Prometheus |
| TLS termination | Manual | GCE Ingress + Managed Certificate |
| Backup | Manual | Backup for GKE |

## Networking trong GKE

```text
                           Internet
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Google Cloud LB      │  ← LoadBalancer service / Ingress
                    └─────────┬───────────┘
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
       ┌────────────┐ ┌────────────┐ ┌────────────┐
       │   Node 1    │ │   Node 2    │ │   Node 3    │
       │            │ │            │ │            │
       │ Pod (svc)   │ │ Pod (svc)   │ │ Pod (svc)   │
       └────────────┘ └────────────┘ └────────────┘
                              │
                              ▼
                       ┌──────────────┐
                       │ Cloud SQL    │  ← optional, replace Postgres in-cluster
                       │ Cloud Storage│
                       │ Cloud Pub/Sub│
                       └──────────────┘
```

GKE pod nhận private IP từ VPC. External traffic qua GCLB.

## VPC + Subnet

GKE tự tạo VPC default. Bạn có thể dùng VPC riêng cho production:

```text
$ gcloud compute networks create food-ordering-vpc --subnet-mode=custom

$ gcloud compute networks subnets create food-ordering-subnet \
    --network=food-ordering-vpc \
    --range=10.0.0.0/20 \
    --region=us-central1
```

Sau đó GKE cluster với `--network food-ordering-vpc --subnet food-ordering-subnet`.

## IAM cho gcloud + kubectl

GKE tích hợp IAM. User được role:
- `roles/container.admin` — full GKE.
- `roles/container.developer` — deploy + view, không tạo cluster.
- `roles/container.viewer` — chỉ xem.

```text
$ gcloud projects add-iam-policy-binding food-ordering-system-001 \
    --member="user:teammate@example.com" \
    --role="roles/container.developer"
```

## Cleanup checklist

Sau khi học xong:
```text
$ gcloud container clusters delete food-ordering-cluster --zone us-central1-a
$ gcloud artifacts repositories delete food-ordering-repo --location=us-central1
$ gcloud projects delete food-ordering-system-001         # xoá project hoàn toàn
```

## Bẫy thường gặp

| Triệu chứng | Sửa |
|---|---|
| `Quota exceeded` khi tạo cluster | Region đang full. Đổi zone khác. |
| Cluster create báo "billing not enabled" | Enable billing trong console. |
| `gcloud auth login` mở browser cứ load | Dùng `--no-launch-browser` flag, copy paste URL. |
| `kubectl get nodes` không response | Cluster chưa ready. Đợi 5 phút sau khi create. |
| `imagePullBackOff` | Image chưa push lên Artifact Registry (bài 50). |
| Cost gấp đôi expected | Có LoadBalancer service active = $7/tháng/cái. |
| `Insufficient regional quota` | Yêu cầu tăng quota qua console, mất 1-2 ngày. |
| Cluster master version cũ | `gcloud container clusters upgrade --master` |

## Tóm tắt bài 49

- GKE = managed Kubernetes của Google, tích hợp Cloud LB + Storage + Logging.
- Tạo cluster Standard với 3 node e2-medium, auto-scale 1-5 — $24/node/month.
- gcloud CLI + kubectl: `get-credentials` để pointer kubectl về GKE.
- $300 free credit 90 ngày đủ học vài chục giờ.
- Cleanup quan trọng: delete cluster + LB + storage khi không dùng để tránh charge.
- Pattern tương tự cho AWS EKS, Azure AKS — kiến thức cluster portable.

**Bài kế tiếp** → [Bài 50: Push Docker image lên Artifact Registry](02-push-images-artifact-registry.md)
