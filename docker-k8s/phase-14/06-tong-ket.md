# Tổng Kết Phase 14 — Kubernetes Networking

## Những Gì Đã Học

### 1. Service Types và Use Cases

```
LoadBalancer:
  → Public-facing services (frontend, public API)
  → Cần cloud provider (AWS, GCP, Azure)
  → External IP cho internet access

ClusterIP (mặc định):
  → Internal services (auth, database)
  → Chỉ accessible từ trong cluster
  → Có built-in load balancing

NodePort:
  → Development/testing
  → Accessible qua Node IP + port (30000-32767)
```

### 2. Pod-internal Communication

```
2 containers trong cùng 1 Pod → dùng localhost

users-container:
  AUTH_ADDRESS = "localhost"  # Gọi auth-container
  axios.get(`http://localhost/verify`)

Manifest:
  containers:
    - name: users
      env:
        - name: AUTH_ADDRESS
          value: localhost
    - name: auth
      # không expose port ra ngoài
```

### 3. Pod-to-Pod Communication (3 cách)

```
Cách 1: Manual IP lookup (không khuyến khích)
  kubectl get services → lấy CLUSTER-IP
  value: "10.96.100.5"

Cách 2: Auto-generated env vars (Kubernetes tự inject)
  process.env.AUTH_SERVICE_SERVICE_HOST
  Pattern: SERVICE_NAME_SERVICE_HOST

Cách 3: CoreDNS domain (khuyến khích nhất)
  value: auth-service.default
  Pattern: {service-name}.{namespace}
```

### 4. Reverse Proxy Pattern

```
Frontend (React) trong browser:
  fetch('/api/tasks')  ← gửi đến cùng server

nginx trong container (cluster):
  location /api/ {
    proxy_pass http://tasks-service.default:8000/;
  }
  ← forward đến cluster-internal domain

→ Browser không bao giờ biết cluster-internal domains
→ nginx biết vì nó chạy trong cluster
```

---

## Architecture Reference

```
Internet
  │
  ├── LoadBalancer (users-service, port 80)
  │     → Users API Pod
  │         → AUTH_ADDRESS=auth-service.default
  │         → auth-service (ClusterIP)
  │               → Auth API Pod
  │
  ├── LoadBalancer (tasks-service, port 80)
  │     → Tasks API Pod
  │
  └── LoadBalancer (frontend-service, port 80)
        → Frontend Pod (nginx)
            → /api/* proxy → tasks-service.default:8000
```

---

## Cheat Sheet

```bash
# Xem services và IPs
kubectl get services

# Xem namespaces
kubectl get namespaces

# Xem DNS có work không (exec vào pod)
kubectl exec -it POD-NAME -- nslookup auth-service.default

# Xem env vars trong pod
kubectl exec -it POD-NAME -- env | grep AUTH
```

### CoreDNS Domain Pattern

```
{service-name}.{namespace}

Ví dụ:
  auth-service.default
  tasks-service.default
  users-service.production
```

### Auto Env Var Pattern

```
{SERVICE_NAME_UPPERCASE}_SERVICE_HOST
{SERVICE_NAME_UPPERCASE}_SERVICE_PORT

Ví dụ (service: auth-service):
  AUTH_SERVICE_SERVICE_HOST = 10.96.100.5
  AUTH_SERVICE_SERVICE_PORT = 80
```

---

## Key Takeaways

```
1. ClusterIP = internal services (auth, DB không expose ra ngoài)
2. LoadBalancer = public services (gần nhất với production usage)
3. Cùng Pod → localhost; khác Pod → service name
4. CoreDNS tự generate: auth-service.default
5. Auto env vars: AUTH_SERVICE_SERVICE_HOST
6. Reverse proxy = pattern đúng cho frontend trong K8s
7. nginx proxy_pass dùng cluster-internal domains (chạy trong cluster)
```

---

**Tiếp theo:** Phase 15 — Deploy lên AWS EKS →
