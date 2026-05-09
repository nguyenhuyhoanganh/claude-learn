# Bài 4: Declarative Approach — YAML Config Files

## Imperative vs Declarative

```
Imperative (lệnh):
  kubectl create deployment ...
  kubectl expose deployment ...
  kubectl scale ...
  → Phải nhớ và gõ từng lệnh
  → Khó track thay đổi
  → Khó share với team

Declarative (file):
  kubectl apply -f deployment.yaml
  → Mọi thứ trong file YAML
  → Git-trackable
  → Dễ share, dễ review
  → Thay đổi chỉ cần edit file + re-apply
```

---

## Cấu Trúc File YAML

```yaml
apiVersion: apps/v1        # Version của API Kubernetes
kind: Deployment           # Loại object
metadata:
  name: my-app-deployment  # Tên object
spec:
  # ... cấu hình ...
```

**Cách tìm apiVersion:**
- Deployment: `apps/v1`
- Service: `v1`
- Tìm trong docs: kubernetes.io/docs → API Reference

---

## Deployment YAML

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-deployment
spec:
  replicas: 1                    # Số Pods muốn chạy
  selector:
    matchLabels:
      app: my-app                # Chọn Pods có label này
  template:                      # Blueprint cho Pods
    metadata:
      labels:
        app: my-app              # Label gán cho Pods
    spec:
      containers:
        - name: my-app-container
          image: USERNAME/my-app:v1
          ports:
            - containerPort: 80
```

**Apply:**
```bash
kubectl apply -f deployment.yaml
# → deployment.apps/my-app-deployment created

kubectl get deployments
kubectl get pods
```

---

## Service YAML

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app-service
spec:
  selector:
    app: my-app              # Chọn Pods có label app=my-app
  ports:
    - protocol: TCP
      port: 80               # Port expose ra ngoài
      targetPort: 80         # Port trong container
  type: LoadBalancer
```

**Apply:**
```bash
kubectl apply -f service.yaml
# → service/my-app-service created

minikube service my-app-service  # Truy cập
```

---

## Labels & Selectors — Cơ Chế Kết Nối

### Labels

```yaml
metadata:
  labels:
    app: my-app        # Key: Value, tự đặt
    tier: backend      # Có thể có nhiều labels
    version: "1.0"
```

Labels = Metadata tags gắn vào objects.

### Selectors

Dùng để một object "tìm" và "kiểm soát" objects khác.

```yaml
# Deployment selector (kiểu mới, dùng matchLabels):
spec:
  selector:
    matchLabels:
      app: my-app        # Deployment quản lý Pods có label này

# Service selector (kiểu cũ, đơn giản hơn):
spec:
  selector:
    app: my-app          # Service expose Pods có label này
```

**Vì sao cần selector?**
```
Deployment tạo Pods → Nhưng nếu scale, có Pods mới xuất hiện
  → Deployment cần biết Pods nào THUỘC về nó
  → Dựa vào label matching

Service cũng không biết Pods nào cần expose
  → Dựa vào label selector để tìm đúng Pods
```

### matchExpressions (selector nâng cao)

```yaml
spec:
  selector:
    matchExpressions:
      - key: app
        operator: In          # In, NotIn, Exists, DoesNotExist
        values:
          - my-app
          - other-app
```

---

## Cập Nhật Resource

```bash
# Thay đổi replicas trong file
# replicas: 3  (đổi từ 1 thành 3)

# Re-apply: chỉ apply phần đã thay đổi
kubectl apply -f deployment.yaml
# → deployment.apps/my-app-deployment configured
```

**Kubernetes chỉ apply delta (phần thay đổi)** — không recreate từ đầu.

---

## Xóa Resource

```bash
# Xóa theo tên (imperative)
kubectl delete deployment my-app-deployment
kubectl delete service my-app-service

# Xóa theo file (declarative)
kubectl delete -f deployment.yaml
kubectl delete -f deployment.yaml -f service.yaml

# Xóa theo label
kubectl delete deployments,services -l group=example
```

---

## Gộp Nhiều Resources Vào 1 File

```yaml
# master-deployment.yaml

apiVersion: v1
kind: Service              # Service trước (best practice)
metadata:
  name: my-app-service
spec:
  selector:
    app: my-app
  ports:
    - port: 80
      targetPort: 80
  type: LoadBalancer

---                        # ← 3 dashes phân cách resources

apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-deployment
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: my-app
          image: USERNAME/my-app:v1
```

```bash
kubectl apply -f master-deployment.yaml
# → Tạo cả Service lẫn Deployment cùng lúc
```

---

## Khi Nào Dùng Imperative vs Declarative?

```
Imperative:
  ✓ Học, thử nghiệm nhanh
  ✓ One-off commands (scale, rollback)
  ✓ Debug và investigate

Declarative:
  ✓ Production deployments
  ✓ Team collaboration
  ✓ GitOps (config in Git)
  ✓ Reproducible deployments
  ✓ CI/CD pipelines
```

---

**Tiếp theo:** Cấu Hình Nâng Cao — Liveness Probes, Image Pull Policy →
