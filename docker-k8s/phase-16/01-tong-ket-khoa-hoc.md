# Phase 16 — Tổng Kết Khóa Học Docker & Kubernetes

## Toàn Bộ Hành Trình

```text
Phase 1–3:   Docker cơ bản — Images, Containers, Volumes, Networks
Phase 4–5:   Docker Compose — Multi-container local development
Phase 6–8:   Deployment thủ công lên AWS EC2
Phase 9–11:  AWS ECS — Managed container service
Phase 12–13: Kubernetes cơ bản — Pods, Deployments, Volumes
Phase 14:    Kubernetes Networking — Services, CoreDNS
Phase 15:    Kubernetes trên AWS EKS — Production deployment
```

---

## Tổng Kết Những Gì Đã Học

### Docker Cơ Bản

```text
✓ Docker là gì và tại sao cần dùng
✓ Image vs Container
✓ Dockerfile — cách build image
✓ docker run, docker build, docker push
✓ Volumes — data persistence
✓ Networks — container communication
✓ .dockerignore — tối ưu build
```

### Docker Compose

```text
✓ docker-compose.yml — cấu hình multi-container
✓ services, volumes, networks trong compose file
✓ docker compose up / down / build
✓ Environment variables trong compose
✓ Bind mounts cho local development
```

### Deployment

```text
✓ Manual deployment — SSH vào EC2, chạy Docker trực tiếp
✓ AWS ECS — managed service, không cần quản lý servers
✓ Task Definitions, Services, Clusters trên ECS
✓ ECR — AWS private Docker registry
✓ Load Balancer + Auto Scaling trên ECS
```

### Kubernetes

```text
✓ Pods — đơn vị nhỏ nhất, chứa containers
✓ Deployments — quản lý Pods, rolling updates
✓ Services — ClusterIP, LoadBalancer, NodePort
✓ Volumes — emptyDir, hostPath, PersistentVolume
✓ PersistentVolumeClaim — Pod yêu cầu storage
✓ ConfigMaps — externalize config
✓ Namespaces — logical grouping
✓ CoreDNS — service discovery tự động
✓ Liveness Probes — health checks
```

### AWS EKS

```text
✓ EKS = Kubernetes thật, không phải ECS
✓ IAM Roles cho Cluster và Node Groups
✓ CloudFormation VPC setup
✓ Worker Nodes — EC2 instances
✓ Same YAML files → works on EKS
✓ AWS EFS CSI Driver — shared persistent storage
✓ ReadWriteMany — multi-node file access
```

---

## So Sánh Cuối Cùng: Các Công Cụ

| Công cụ | Dùng khi nào |
|---|---|
| **Docker** | Luôn luôn — base của mọi thứ |
| **Docker Compose** | Local development, multi-container setup |
| **AWS ECS** | Deploy lên AWS, không muốn học Kubernetes |
| **Kubernetes (minikube)** | Học K8s, test local |
| **AWS EKS** | Deploy K8s lên production trên AWS |

---

## Những Gì Không Có Trong Khóa Này

### 1. CI/CD Pipelines

```text
CI/CD = Continuous Integration / Continuous Delivery

Không có trong khóa vì:
  → Có hàng nghìn CI/CD providers: Travis CI, GitHub Actions,
    GitLab CI, AWS CodePipeline, CircleCI, Jenkins...
  → Mỗi provider có syntax riêng → không cover hết được
  → Docker knowledge = đã đủ dùng trong CI/CD pipeline

Cách học tiếp:
  → Chọn provider cụ thể (ví dụ: GitHub Actions)
  → Đọc docs của provider đó
  → Docker commands vẫn y chang — chỉ học cú pháp workflow file
```

**Ví dụ GitHub Actions với Docker:**
```yaml
# .github/workflows/deploy.yml
jobs:
  build:
    steps:
      - name: Build Docker image
        run: docker build -t myapp .

      - name: Push to Docker Hub
        run: docker push myapp

      - name: Deploy to EKS
        run: kubectl apply -f k8s/
```

### 2. Các Cloud Provider Khác

```text
Khóa này dùng AWS làm ví dụ.

Các provider khác:
  → Microsoft Azure → AKS (Azure Kubernetes Service)
  → Google Cloud Platform → GKE (Google Kubernetes Engine)
  → DigitalOcean → DOKS
  → Render, Railway, Fly.io (simpler alternatives)

Concepts đã học vẫn áp dụng:
  → Kubernetes YAML files = y chang trên mọi provider
  → Chỉ cần học cách tạo cluster ở provider đó
  → Đọc docs của provider để biết specifics
```

### 3. Cluster Administration

```text
Khóa này = developer perspective (không phải admin)

Admin topics (không có trong khóa):
  → Advanced Kubernetes scheduling
  → RBAC (Role-Based Access Control) chi tiết
  → Network policies
  → Cluster monitoring với Prometheus/Grafana
  → Kubernetes upgrade management
  → Backup và disaster recovery

Thực tế:
  → Developer không cần biết hết admin topics
  → Managed services (EKS, GKE, AKS) giải quyết hầu hết
  → Admin là job riêng (DevOps/Platform engineer)
```

> **Cập nhật**: bốn phase bổ sung (17–20) đã lấp phần lớn danh sách trên. Bảng dưới đây cho biết tìm ở đâu:
>
> | Chủ đề ở danh sách trên | Giờ nằm ở |
> |---|---|
> | RBAC chi tiết | [Phase 19 bài 2](../phase-19/02-rbac-va-serviceaccount.md) |
> | Network Policies | [Phase 19 bài 4](../phase-19/04-networkpolicy-va-tong-ket.md) |
> | Giám sát cụm với Prometheus/Grafana | [Phase 20 bài 3](../phase-20/03-chi-so-giam-sat-va-so-tay.md) |
> | Lập lịch nâng cao (taint, toleration, affinity) | [Phase 17 bài 2](../phase-17/02-daemonset.md), [Phase 18 bài 4](../phase-18/04-cluster-autoscaler-va-tong-ket.md) |
> | Quản lý bí mật | [Phase 19 bài 3](../phase-19/03-secret-that-su-an-toan.md) |
>
> Phần **vẫn chưa có**: nâng cấp phiên bản cụm, sao lưu và khôi phục thảm hoạ, vận hành etcd. Đó thật sự là việc của đội nền tảng, và với cụm quản lý sẵn (EKS/GKE/AKS) thì nhà cung cấp lo phần lớn.

### 4. Ngôn Ngữ Lập Trình Khác

```text
Khóa dùng: Node.js, Python, PHP/Laravel

Docker hoạt động y chang với mọi ngôn ngữ:
  → Java/Spring Boot → chỉ Dockerfile khác
  → Go → chỉ Dockerfile khác
  → Ruby on Rails → chỉ Dockerfile khác
  → .NET → chỉ Dockerfile khác

Concept = 100% giống nhau
```

---

## Bước Tiếp Theo

### 1. Practice, Practice, Practice

```text
Cách tốt nhất để giỏi:
  → Dockerize một project bạn đã có
  → Thêm Docker Compose cho local dev
  → Deploy lên cloud (bắt đầu với ECS hoặc EKS)
  → Gặp vấn đề → Google → Stack Overflow → giải quyết
  → Lặp lại
```

### 2. Tài Liệu Chính Thức

```text
Docker:
  → docs.docker.com
  → Dockerfile reference
  → Docker Compose reference

Kubernetes:
  → kubernetes.io/docs
  → kubectl cheat sheet
  → K8s concepts guide

AWS:
  → docs.aws.amazon.com/eks
  → docs.aws.amazon.com/ecs
  → docs.aws.amazon.com/efs
```

### 3. VS Code Docker Extension

```text
VS Code có Docker extension cực kỳ hữu ích:
  → Tự generate Dockerfile cho project
  → Quản lý containers/images trong sidebar
  → Xem logs, exec vào container
  → Right-click menu cho mọi Docker operations

Cài đặt:
  VS Code → Extensions → search "Docker" → Install (Microsoft)
```

### 4. Chủ Đề Nên Khám Phá Tiếp

```text
Beginner tiếp theo:
  □ GitHub Actions CI/CD pipeline với Docker
  □ Docker với ngôn ngữ bạn đang dùng (Java, Go, etc.)

Intermediate:
  □ Helm Charts — package manager cho Kubernetes
  □ Kubernetes Ingress — advanced routing
  □ Secrets management (Kubernetes Secrets, AWS Secrets Manager)

Advanced:
  □ Service Mesh (Istio, Linkerd)
  □ Kubernetes operators
  □ GitOps với ArgoCD hoặc Flux
```

### Lộ trình đọc bốn phase bổ sung

Bốn phase 17–20 không nằm trong transcript gốc. Chúng được viết thêm vì đó là những thứ bạn **chắc chắn gặp** khi đưa hệ thống lên production, mà khoá gốc dừng lại ở mức "triển khai được lên EKS".

```text
   Nếu bạn sắp đưa hệ thống lên production, đọc theo thứ tự này:

   1. Phase 18 — Tài nguyên và autoscaling
      Vì sao Pod bị OOMKilled, đặt requests/limits bao nhiêu,
      vì sao livenessProbe có thể làm cụm tự giết chính mình.
      → Đây là phase cứu bạn khỏi nhiều đêm mất ngủ nhất.

   2. Phase 19 — Bảo mật
      Quét lỗ hổng image, non-root, RBAC, Secret, NetworkPolicy.
      → Làm sớm rẻ hơn sửa sau rất nhiều.

   3. Phase 20 — Quan sát và gỡ lỗi
      Log, Event, kubectl debug, và SỔ TAY CHẨN ĐOÁN
      tra từ triệu chứng ra nguyên nhân.
      → Đọc trước khi có sự cố, không phải lúc đang có sự cố.

   4. Phase 17 — Workload đầy đủ
      StatefulSet, DaemonSet, Job, CronJob.
      → Đọc khi thật sự cần chạy database, agent, hoặc tác vụ theo lịch.
```

Điểm khởi đầu nhanh nhất khi có sự cố: [sổ tay chẩn đoán ở Phase 20 bài 3](../phase-20/03-chi-so-giam-sat-va-so-tay.md) — bảng 18 dòng tra từ triệu chứng sang nguyên nhân và bài giải thích.

---

## Cheat Sheet Tổng Hợp

### Docker Commands

```bash
# Images
docker build -t name:tag .
docker pull name:tag
docker push name:tag
docker images
docker rmi IMAGE_ID

# Containers
docker run -d -p 3000:80 --name myapp IMAGE
docker run -v /host/path:/container/path IMAGE
docker ps
docker ps -a
docker stop CONTAINER
docker rm CONTAINER
docker logs CONTAINER
docker exec -it CONTAINER sh

# Cleanup
docker system prune
```

### Docker Compose Commands

```bash
docker compose up
docker compose up --build
docker compose up -d
docker compose down
docker compose down -v          # Xóa volumes
docker compose logs SERVICE
docker compose exec SERVICE sh
```

### Kubernetes Commands

```bash
# Apply config
kubectl apply -f FILE.yaml
kubectl apply -f FOLDER/

# Xem resources
kubectl get pods
kubectl get deployments
kubectl get services
kubectl get pv
kubectl get pvc
kubectl get configmaps
kubectl get namespaces

# Debug
kubectl describe pod POD_NAME
kubectl logs POD_NAME
kubectl logs POD_NAME -c CONTAINER_NAME
kubectl exec -it POD_NAME -- sh

# Scale
kubectl scale deployment/NAME --replicas=3

# Xóa
kubectl delete -f FILE.yaml
kubectl delete deployment NAME
kubectl delete service NAME
kubectl delete pod POD_NAME

# Context (switch giữa minikube và EKS)
kubectl config current-context
kubectl config use-context CONTEXT_NAME
```

### AWS EKS Commands

```bash
# Kết nối kubectl với EKS
aws configure
aws eks --region REGION update-kubeconfig --name CLUSTER-NAME

# Verify
kubectl get nodes
```

---

## Mindmap: Docker & Kubernetes Ecosystem

```text
                    Container Ecosystem
                          │
           ┌──────────────┼──────────────┐
           │              │              │
        Docker         Compose      Kubernetes
           │              │              │
    ┌──────┤      ┌───────┤      ┌───────┤
    │      │      │       │      │       │
  Image  Container Services Volumes  Pods  Services
    │      │      │       │      │       │
  Build  Run  Multi-container  PV/PVC  Deploy
  Push   Stop Scale          ConfigMap Rolling update
  Pull   Logs               Namespaces Health checks
    │
  Registry
  ├─ Docker Hub
  ├─ AWS ECR
  └─ Private Registry

Deployment Options:
  ├─ Manual (SSH + docker run)
  ├─ AWS ECS (managed, no K8s)
  └─ Kubernetes
       ├─ minikube (local)
       ├─ AWS EKS
       ├─ GKE (Google)
       └─ AKS (Azure)
```

---

## Lời Kết

```text
Bạn đã hoàn thành một khóa học dài và chắc chắn.

Những gì bạn có thể làm ngay bây giờ:
  ✓ Dockerize bất kỳ application nào
  ✓ Setup môi trường dev với Docker Compose
  ✓ Deploy containers lên AWS (ECS hoặc EKS)
  ✓ Orchestrate multi-container apps với Kubernetes
  ✓ Setup persistent storage với PV/PVC
  ✓ Configure inter-service communication

Docker và Kubernetes là kỹ năng cốt lõi của backend developer
hiện đại. Cứ áp dụng vào project thật — đó là cách tốt nhất
để thực sự làm chủ công nghệ.
```

---

*Hoàn thành khóa Docker & Kubernetes — The Practical Guide*

**Phase kế tiếp** → [Bài 1: StatefulSet — khi Pod không thể thay thế lẫn nhau](../phase-17/01-statefulset.md)

**Quay lại** → [Mục lục khoá Docker & Kubernetes](../README.md)
