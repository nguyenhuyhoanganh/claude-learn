# Bài 4: Deploy Kubernetes Config lên EKS

## Điểm Mạnh Lớn Nhất của Kubernetes

**Cùng một YAML file, dùng được ở mọi nơi:**

```bash
# Trên minikube (local)
kubectl apply -f users.yaml

# Trên AWS EKS (production)
kubectl apply -f users.yaml   # ← Y CHANG! Không cần thay đổi gì!
```

Đây chính là lý do dùng Kubernetes thay vì ECS.

---

## Chuẩn Bị Trước Khi Deploy

### 1. Push Images lên Docker Hub

```bash
# Build và push users API
cd users-api
docker build -t USERNAME/kub-dep-users .
docker push USERNAME/kub-dep-users

# Build và push auth API
cd ../auth-api
docker build -t USERNAME/kub-dep-auth .
docker push USERNAME/kub-dep-auth
```

### 2. Update Image Names trong YAML

```yaml
# users.yaml
spec:
  containers:
    - name: users
      image: USERNAME/kub-dep-users   # Thay USERNAME thật
```

---

## Deploy lên EKS

```bash
# Đảm bảo kubectl đang trỏ vào EKS (không phải minikube)
kubectl config current-context
# → arn:aws:eks:us-east-2:xxxxx:cluster/kub-dep-demo

# Apply configs
kubectl apply -f kubernetes/auth.yaml
kubectl apply -f kubernetes/users.yaml

# Kiểm tra
kubectl get deployments
kubectl get pods
kubectl get services
```

---

## External IP Thật (Khác với minikube!)

Trên minikube:
```bash
kubectl get services
# NAME          TYPE          CLUSTER-IP    EXTERNAL-IP
# users-service LoadBalancer  10.96.x.x     <pending>  ← Pending!

minikube service users-service  # Cần lệnh này để truy cập
```

Trên EKS:
```bash
kubectl get services
# NAME          TYPE          CLUSTER-IP    EXTERNAL-IP
# users-service LoadBalancer  10.96.x.x     abc123.us-east-2.elb.amazonaws.com ← URL thật!
```

**Dùng URL đó trực tiếp:**
```bash
curl http://abc123.us-east-2.elb.amazonaws.com/signup \
  -d '{"email":"test@test.com","password":"tester1"}' \
  -H "Content-Type: application/json"
```

---

## AWS Tự Động Tạo Load Balancer

```
EC2 Console → Load Balancers
→ Thấy 1 Load Balancer được tạo tự động bởi EKS
→ URL này = EXTERNAL-IP trong kubectl get services
```

Khi bạn `kubectl delete service users-service`:
- EKS tự xóa Load Balancer trên AWS

---

## Scaling vẫn Hoạt Động Bình Thường

```bash
# Thay đổi replicas
# Edit users.yaml: replicas: 3

kubectl apply -f kubernetes/users.yaml

kubectl get pods
# Kubernetes phân phối 3 pods vào 2 nodes tự động
```

---

## ClusterIP và CoreDNS vẫn Hoạt Động

```yaml
# auth.yaml - service type ClusterIP
spec:
  type: ClusterIP
  selector:
    app: auth
```

```yaml
# users.yaml - gọi auth qua CoreDNS domain
env:
  - name: AUTH_API_ADDRESS
    value: auth-service.default  # ← Không đổi gì!
```

```bash
# Verify: users API gọi được auth API
# Send signup request → thấy users-created response
# Proves internal communication works on EKS too
```

---

## Tóm Tắt: minikube vs EKS

| | minikube | EKS |
|---|---|---|
| **Môi trường** | Local VM | AWS Cloud |
| **YAML files** | Dùng y chang | Dùng y chang |
| **kubectl** | Dùng y chang | Dùng y chang |
| **External IP** | `<pending>` | URL thật |
| **Access** | `minikube service` | URL trực tiếp |
| **Nodes** | 1 VM node | EC2 instances |
| **Load Balancer** | Không có thật | AWS LB tự tạo |
| **Chi phí** | Miễn phí | Có phí |

---

**Tiếp theo:** EFS Volumes trên EKS →
