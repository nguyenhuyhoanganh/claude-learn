# Tổng Kết Phase 12 — Kubernetes Core Concepts

## Những Gì Đã Học

### 1. Setup Môi Trường
```
kubectl  → CLI giao tiếp với cluster
minikube → Cluster local trong VM (cho development)

minikube start --driver=virtualbox
kubectl version --client
minikube status
```

### 2. Kubernetes Objects

```
Pod        = Đơn vị nhỏ nhất, bọc container(s)
           → Ephemeral, cluster-internal IP
           → Không tạo trực tiếp

Deployment = Controller quản lý Pods
           → Auto-restart, scaling, rolling update, rollback

Service    = Expose Pods ra ngoài
           → IP cố định, load balancing
           → ClusterIP / NodePort / LoadBalancer
```

### 3. Imperative vs Declarative

```bash
# Imperative (lệnh)
kubectl create deployment NAME --image=IMAGE
kubectl expose deployment NAME --port=PORT --type=LoadBalancer
kubectl scale deployment/NAME --replicas=3
kubectl set image deployment/NAME CONTAINER=IMAGE:TAG
kubectl rollout undo deployment/NAME

# Declarative (file)
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl delete -f deployment.yaml
```

### 4. YAML Structure

```yaml
apiVersion: apps/v1        # Deployment
kind: Deployment
metadata:
  name: my-app
  labels:
    group: my-group
spec:
  replicas: 2
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: my-container
          image: USERNAME/my-app:v1
          imagePullPolicy: Always
          ports:
            - containerPort: 8080
          livenessProbe:
            httpGet:
              path: /
              port: 8080
            periodSeconds: 10
            initialDelaySeconds: 5
---
apiVersion: v1             # Service
kind: Service
metadata:
  name: my-service
spec:
  selector:
    app: my-app
  ports:
    - port: 80
      targetPort: 8080
  type: LoadBalancer
```

### 5. Labels & Selectors

```
Labels:    Metadata tags gắn vào objects (key: value)
Selectors: Cơ chế kết nối objects với nhau

Deployment → matchLabels → chọn Pods nào thuộc về mình
Service    → selector    → chọn Pods nào cần expose

matchExpressions: selector nâng cao với In/NotIn/Exists/DoesNotExist
```

### 6. Rolling Updates

```
Khi deploy version mới:
  Old Pod (v1) tiếp tục chạy
  ↓
  New Pod (v2) tạo + start
  ↓ (v2 healthy)
  Old Pod (v1) bị xóa

→ Zero downtime!
→ kubectl rollout undo để rollback
```

---

## Cheat Sheet

```bash
# CLUSTER
minikube start --driver=virtualbox
minikube status
minikube dashboard
minikube service SERVICE-NAME    # Truy cập service (local only)

# CREATE
kubectl apply -f FILE.yaml
kubectl create deployment NAME --image=IMAGE

# READ
kubectl get deployments
kubectl get pods
kubectl get services
kubectl describe pod POD-NAME

# UPDATE
kubectl apply -f FILE.yaml       # Re-apply sau khi edit
kubectl set image deployment/NAME CONTAINER=IMAGE:TAG
kubectl scale deployment/NAME --replicas=N
kubectl rollout undo deployment/NAME
kubectl rollout history deployment/NAME

# DELETE
kubectl delete -f FILE.yaml
kubectl delete deployment NAME
kubectl delete service NAME
kubectl delete deployments,services -l group=example

# ROLLOUT
kubectl rollout status deployment/NAME
kubectl rollout history deployment/NAME --revision=2
kubectl rollout undo deployment/NAME --to-revision=1
```

---

## Key Takeaways

```
1. Kubernetes works with Objects (Pod, Deployment, Service...)
2. Deployment manages Pods — tự restart, scale, rolling update
3. Service = stable endpoint cho Pods (LoadBalancer cho public access)
4. Labels + Selectors = cơ chế kết nối objects
5. Declarative (YAML) > Imperative (commands) cho production
6. imagePullPolicy: Always nếu dùng cùng tag
7. livenessProbe để tùy chỉnh health check
8. kubectl apply chỉ apply delta — không recreate từ đầu
```

---

**Tiếp theo:** Phase 13 — Volumes & Persistent Data →
