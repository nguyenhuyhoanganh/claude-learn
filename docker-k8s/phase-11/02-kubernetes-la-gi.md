# Bài 2: Kubernetes Là Gì?

## Định Nghĩa Chính Thức

> "Kubernetes is an open-source system for automating deployment, scaling, and management of containerized applications."
> — kubernetes.io

Nhưng quan trọng hơn là **hiểu thực sự** nó làm gì.

---

## Kubernetes = Docker Compose cho Multi-Machine

```
Docker Compose:
  - Quản lý nhiều containers trên 1 máy (local)
  - Viết docker-compose.yml → docker compose up
  - Tự động networking giữa containers
  - Chủ yếu cho development

Kubernetes:
  - Quản lý nhiều containers trên NHIỀU máy (cloud)
  - Viết kubernetes config → kubectl apply
  - Tự động distribute containers trên nhiều servers
  - Thiết kế cho production deployment
  + Thêm: auto-restart, auto-scaling, load balancing
```

---

## Kubernetes Giải Quyết Vendor Lock-in

### Vấn đề với AWS ECS

```
Học ECS → Biết dùng ECS trên AWS
Chuyển sang Azure → Phải học lại từ đầu
Chuyển sang Google Cloud → Lại học từ đầu

Config cho ECS:
  Clusters, Tasks, Services, Fargate
  → Không portable

Config cho Azure ACI:
  Container Groups, Azure CLI...
  → Khác hoàn toàn
```

### Kubernetes: Chuẩn Thống Nhất

```
Học Kubernetes → Dùng được ở mọi nơi!

Kubernetes config (YAML):
  Deployments, Pods, Services
  → Hoạt động với AWS EKS, Azure AKS, Google GKE
  → Hoạt động với bất kỳ máy nào cài Kubernetes
```

**Ví dụ Kubernetes config:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 3        # Chạy 3 instances
  selector:
    matchLabels:
      app: my-app
  template:
    spec:
      containers:
        - name: my-app
          image: my-image:latest
```

Config này chạy được trên AWS, Azure, GCP, hoặc bất kỳ cluster nào.

---

## Kubernetes là gì và KHÔNG phải gì

| Kubernetes LÀ | Kubernetes KHÔNG PHẢI |
|---|---|
| Open-source project (miễn phí) | Cloud service provider |
| Cloud-agnostic standard | Alternative cho AWS/Azure |
| Container orchestration system | Chỉ hoạt động với 1 provider |
| Collection of concepts + tools | Phần mềm duy nhất |
| Hoạt động với Docker containers | Thay thế cho Docker |

---

## Kubernetes Làm Gì?

```
Bạn viết:  "Tôi muốn 3 instances của app X luôn chạy"
           "Nếu traffic cao, scale lên 10 instances"
           "Nếu container crash, tự restart"

Kubernetes thực hiện:
  → Tạo và quản lý containers/pods
  → Distribute chúng trên các machines
  → Monitor health, restart nếu cần
  → Scale up/down tự động
  → Load balance traffic
```

## Kubernetes KHÔNG Làm Gì?

```
Kubernetes KHÔNG:
  → Tạo remote servers/machines cho bạn
  → Cài Docker trên các servers
  → Setup network infrastructure
  → Quản lý cloud resources (EC2, VPC, v.v.)

→ BẠN phải setup cluster trước
→ Kubernetes sau đó sẽ SỬ DỤNG cluster đó
```

---

**Tiếp theo:** Kiến Trúc Kubernetes — Pods, Nodes, Cluster →
