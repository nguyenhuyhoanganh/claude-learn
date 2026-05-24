# Bài 1: ECS tổng quan và launch modes

Phase 5 deploy **static file** lên S3. Hiện đại hơn: hầu hết app là **Docker container**. Phase 6 deploy container lên **AWS ECS** (Elastic Container Service) — cách enterprise chạy app production trên AWS.

## Vì sao deploy container chứ không file?

Modern app khác static website:

- **Node.js/Python/Java backend** — cần process chạy liên tục, không phải file static.
- **Microservices** — mỗi service 1 container, deploy riêng.
- **Dependencies isolation** — mỗi container có runtime riêng.
- **Portable** — image chạy được mọi nơi (local, AWS, GCP, on-prem).

→ Pattern: **đóng gói app vào Docker container → đẩy lên cloud → service quản lý chạy container**.

```text
Source code → Dockerfile → Image → Registry → Container orchestrator
                                                    │
                                               Run + scale + restart
```

→ Phase 6 thực hiện toàn bộ chain trên với AWS:

- **ECR** (Elastic Container Registry) — chỗ lưu image.
- **ECS** (Elastic Container Service) — chỗ chạy container.

## ECS là gì?

**ECS** = managed container service của AWS. Định nghĩa container → AWS chạy + monitor + restart khi crash + scale khi cần.

So với manual:

| Manual (EC2 + Docker)      | ECS                                |
|----------------------------|------------------------------------|
| Provision EC2 instance     | AWS tự lo (Fargate)                |
| `docker run` thủ công      | ECS auto-run từ task definition    |
| Manually restart khi crash | ECS tự restart                     |
| Scale = thêm `docker run`  | Đổi `desiredCount` = N            |
| Update version = stop + run mới | Rolling update tự động       |
| Monitor self-host          | CloudWatch tích hợp               |

→ ECS giảm operational work đáng kể.

## ECS competitors

| Service                       | Mô tả                                  |
|-------------------------------|----------------------------------------|
| **ECS** (AWS)                 | Container orchestration AWS-native     |
| **EKS** (AWS)                 | Managed **Kubernetes** trên AWS        |
| **Google Cloud Run / GKE**    | GCP equivalent                          |
| **Azure Container Apps / AKS** | Azure equivalent                       |
| **Kubernetes** (self-hosted)  | Open-source, cài bất kỳ đâu            |
| **Docker Swarm**              | Đơn giản hơn k8s, ít dùng              |

**ECS vs EKS** (cả 2 đều AWS):

- **ECS** — đơn giản, AWS-proprietary, deeply integrated với AWS service.
- **EKS** — Kubernetes chuẩn industry, portable nhưng phức tạp.

→ Khoá học chọn **ECS** vì dễ học hơn k8s. Sau Phase 6 muốn deep, học EKS/Kubernetes riêng.

## Khái niệm cốt lõi ECS

```text
┌─ Cluster ────────────────────────────────────────────┐
│  "learn-jenkins-app-cluster-prod"                     │
│                                                        │
│  ┌─ Service ────────────────────────────────────────┐│
│  │ "learn-jenkins-app-service-prod"                  ││
│  │ desiredCount: 1                                   ││
│  │                                                    ││
│  │  ┌─ Task ─────────────────────────────────────┐ ││
│  │  │ Running task definition revision 5          │ ││
│  │  │                                              │ ││
│  │  │  ┌─ Container ──────────────────────────┐  │ ││
│  │  │  │ Image: my-app:1.0.42                  │  │ ││
│  │  │  │ Port: 80                              │  │ ││
│  │  │  │ CPU: 256, Memory: 512                 │  │ ││
│  │  │  └──────────────────────────────────────┘  │ ││
│  │  └────────────────────────────────────────────┘ ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

4 cấp:

### 1. Cluster

Nhóm máy ảo (logical container). Như "team of servers" sẵn sàng nhận task.

Best practice: 1 cluster per environment (`prod`, `staging`, `dev`).

### 2. Task Definition

**JSON blueprint** mô tả container chạy gì:

- Image (`my-app:1.0.42`).
- CPU + Memory.
- Port mapping.
- Environment variables.
- IAM role.
- ...

→ Versioned: revision 1, 2, 3, ... Mỗi update tạo revision mới.

### 3. Service

Đảm bảo **N task** luôn chạy. Crash → restart. Update version → rolling update.

```text
Service: desiredCount=3
         currentCount=3 (all healthy)
```

### 4. Task

**Instance** thực sự chạy từ task definition. 1 task = 1 hoặc nhiều container.

## Launch modes: EC2 vs Fargate

ECS có 2 cách chạy task:

### EC2 launch type

- Bạn tự provision EC2 instance vào cluster.
- ECS chỉ schedule container lên EC2 đó.
- **Pros**: control hardware, dùng spot instance rẻ, GPU support.
- **Cons**: bạn maintain OS, patch, capacity planning.

### Fargate launch type (serverless)

- AWS tự manage compute. Bạn **không thấy** EC2.
- Chỉ define container + resources → AWS tự run.
- **Pros**: zero infra management.
- **Cons**: đắt hơn EC2 ~20-30%, ít control.

```text
EC2 mode:
  You: tạo EC2 instances → ECS chạy container lên đó
       ↑
  Phải maintain server

Fargate mode:
  You: define container resources → AWS tự chạy
       ↑
  Không thấy server, không maintain
```

→ Khoá học chọn **Fargate** vì:
- Beginner-friendly hơn.
- Không tốn thời gian config EC2.
- Pricing predict-able.

**Cost Fargate** (1 task: 0.25 vCPU + 0.5 GB RAM + 20 GB storage):
- ~$0.38/tháng nếu chạy 1 giờ/tháng.
- ~$8/tháng nếu chạy 24/7.

→ **Không trong free tier**. Cẩn thận terminate sau khi học.

## Tổng quan Phase 6

```text
Bài 1: ECS overview + launch modes        ← bài này
Bài 2: ECR + AWS CLI custom image
Bài 3: Cluster + Task Definition + Service (manual)
Bài 4: Pipeline update task def + service qua AWS CLI
Bài 5: Wait command + tổng kết + cleanup
```

→ Cuối Phase 6, pipeline đầy đủ: build app → build Docker image → push ECR → update ECS task → deploy.

## Cảnh báo cost

ECS **không free tier**. Cẩn thận:

- Mỗi cluster có service đang chạy → tốn ~$8/tháng/task.
- ECR storage: $0.10/GB/tháng (free 500 MB).
- **Set Billing Alert** ngay từ đầu (Phase 5 bài 1).
- **Cleanup**: bài 5 sẽ dạy xoá cluster, service, ECR.

→ Học xong, **terminate ngay**. Đừng để zombie service chạy.

## Demo trước: deploy nginx

Bài 3 sẽ deploy `nginx` (image public) lên ECS làm warm-up. Đơn giản hơn vì:
- Image có sẵn trên Docker Hub.
- Không cần build, không cần ECR.
- Tập trung học flow ECS.

Sau khi quen flow → chuyển sang custom image của project (bài 4+).

## So sánh deploy: S3 vs ECS

| Aspect              | S3 (Phase 5)                | ECS (Phase 6)                  |
|---------------------|------------------------------|--------------------------------|
| Loại app             | Static file                  | Container (any runtime)        |
| Build artifact      | HTML/CSS/JS                  | Docker image                   |
| Registry            | S3 bucket                    | ECR (private)                  |
| Runtime             | CDN serve files              | Container chạy app             |
| Scaling             | Auto via CloudFront          | ECS service desiredCount       |
| Cost                | $0.023/GB/tháng              | ~$8/tháng/task (Fargate)       |
| Complexity          | Đơn giản                     | Phức tạp hơn                   |

→ Static site: S3 đủ. App dynamic / API: ECS (hoặc Lambda).

## Tóm tắt

- Modern app deploy dạng **Docker container**, không file static.
- **ECS** = managed container orchestration của AWS. Đỡ work hơn manual.
- 4 cấp: **Cluster → Service → Task → Container**.
- **Task Definition** = JSON blueprint, versioned.
- **Service** = ensure N task chạy, auto-restart.
- 2 launch mode: **EC2** (manage server) vs **Fargate** (serverless). Khoá dùng Fargate.
- ECS **không free tier** → cẩn thận cost, set Billing Alert, cleanup sau học.

---

→ [Bài tiếp theo: ECR + AWS CLI custom image](02-ecr-container-registry.md)
