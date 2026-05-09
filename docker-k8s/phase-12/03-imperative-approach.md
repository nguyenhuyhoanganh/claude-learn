# Bài 3: Imperative Approach — kubectl Commands

## Quy Trình Cơ Bản

```bash
# 1. Build image Docker như bình thường
docker build -t my-app .

# 2. Push lên Docker Hub (cluster cần pull từ registry)
docker tag my-app USERNAME/my-app:v1
docker push USERNAME/my-app:v1

# 3. Tạo Deployment (Kubernetes pulls image từ Docker Hub)
kubectl create deployment my-app --image=USERNAME/my-app:v1

# 4. Expose bằng Service
kubectl expose deployment my-app --port=80 --type=LoadBalancer

# 5. Truy cập (minikube specific)
minikube service my-app
```

**Lưu ý:** Kubernetes pull image từ registry, KHÔNG từ local machine.

---

## Deployment Commands

```bash
# Tạo deployment
kubectl create deployment <name> --image=<image>

# Xem deployments
kubectl get deployments

# Xem pods
kubectl get pods

# Xem chi tiết pod
kubectl describe pod <pod-name>

# Xóa deployment (và pods của nó)
kubectl delete deployment <name>
```

---

## Service Commands

```bash
# Expose deployment qua Service
kubectl expose deployment <name> \
  --port=<container-port> \
  --type=LoadBalancer

# Xem services
kubectl get services

# Xóa service
kubectl delete service <name>

# Truy cập service (minikube only)
minikube service <service-name>
```

---

## Scaling

```bash
# Scale lên 3 replicas
kubectl scale deployment/my-app --replicas=3

# Kiểm tra pods (sẽ thấy 3)
kubectl get pods

# Scale xuống 1
kubectl scale deployment/my-app --replicas=1
```

**Khi có multiple pods + LoadBalancer service:**
- Traffic tự động phân phối đều giữa các pods
- Nếu 1 pod crash, service tiếp tục forward đến pods còn lại

---

## Auto-Restart Containers

```
Scenario:
  Container crash (bug, OOM, etc.)
  → Pod phát hiện → Restart container
  → Thời gian chờ tăng dần để tránh infinite loop
  
kubectl get pods
  → RESTARTS: 2  ← Đã restart 2 lần

Đây là behavior tự động của Deployment!
  → Không cần làm gì thêm
  → Kubernetes lo hết
```

---

## Updating Deployments

```bash
# Build và push image mới với tag mới (QUAN TRỌNG: cần đổi tag)
docker build -t USERNAME/my-app:v2 .
docker push USERNAME/my-app:v2

# Update deployment dùng image mới
kubectl set image deployment/my-app \
  my-app=USERNAME/my-app:v2

# Theo dõi rollout progress
kubectl rollout status deployment/my-app
```

**Tại sao phải đổi tag?**
```
Kubernetes chỉ pull image mới nếu tag thay đổi
  :latest → :v1 = pull
  :v1 → :v1 = không pull (dùng cached)
  :v1 → :v2 = pull ← Đây là cách đúng
```

**Rolling Update Strategy (mặc định):**
```
Old Pod (v1) tiếp tục chạy
  ↓ (đồng thời)
New Pod (v2) được tạo và start
  ↓ (khi v2 healthy)
Old Pod (v1) bị xóa

→ Zero downtime deployment!
```

---

## Rollbacks & History

```bash
# Xem lịch sử rollouts
kubectl rollout history deployment/my-app

# Xem chi tiết revision
kubectl rollout history deployment/my-app --revision=2

# Rollback về phiên bản trước
kubectl rollout undo deployment/my-app

# Rollback về phiên bản cụ thể
kubectl rollout undo deployment/my-app --to-revision=1
```

**Scenario rollback:**
```
v2 deploy thất bại (image tag sai, code bug...)
  kubectl rollout undo → v1 được restore
  → Users vẫn thấy app v1, không bị gián đoạn
  
Fix bug → Push v3 → Update lại
```

---

## Cheat Sheet: Imperative Commands

```bash
# CREATE
kubectl create deployment NAME --image=IMAGE
kubectl expose deployment NAME --port=PORT --type=TYPE

# READ
kubectl get deployments
kubectl get pods
kubectl get services
kubectl describe pod POD-NAME

# UPDATE
kubectl set image deployment/NAME CONTAINER=IMAGE:TAG
kubectl scale deployment/NAME --replicas=N
kubectl rollout undo deployment/NAME

# DELETE
kubectl delete deployment NAME
kubectl delete service NAME

# DEBUG
kubectl rollout status deployment/NAME
kubectl rollout history deployment/NAME
minikube dashboard
```

---

**Tiếp theo:** Declarative Approach — YAML Config Files →
