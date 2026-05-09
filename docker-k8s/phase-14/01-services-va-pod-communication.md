# Bài 1: Services & Giao Tiếp Pod

## Recap: Tại Sao Cần Service?

```
Pod có IP address, nhưng:
  → IP thay đổi mỗi khi Pod restart
  → Pod IP chỉ accessible bên trong cluster
  → Nhiều replicas = nhiều IPs

Service = Giải pháp:
  ✓ IP cố định (không đổi dù Pod restart)
  ✓ Expose Pods ra ngoài cluster
  ✓ Load balance traffic giữa nhiều Pods
```

---

## 3 Loại Service và Use Cases

### ClusterIP — Chỉ Internal

```yaml
spec:
  type: ClusterIP   # Mặc định nếu không chỉ định type
  selector:
    app: auth
  ports:
    - port: 80
      targetPort: 80
```

```
ClusterIP Service:
  → Chỉ accessible từ TRONG cluster
  → Các Pod khác trong cluster có thể gọi
  → Không accessible từ internet
  → Dùng cho: internal services (auth, database, backend-only)

Ví dụ: Auth service không nên expose ra ngoài
  → Chỉ Users API và Tasks API cần gọi Auth API
  → Users từ internet KHÔNG được gọi trực tiếp Auth API
```

### NodePort — Accessible qua Node IP

```yaml
spec:
  type: NodePort
  ports:
    - port: 80
      targetPort: 80
      nodePort: 30080   # Range: 30000-32767
```

```
NodePort:
  → Accessible qua IP của Worker Node
  → Phải biết IP của Node
  → Ít dùng trong production
```

### LoadBalancer — Public-facing

```yaml
spec:
  type: LoadBalancer
  selector:
    app: users
  ports:
    - port: 80
      targetPort: 8080
```

```
LoadBalancer:
  → Cần cloud provider support (AWS, GCP, Azure)
  → Tự động tạo External Load Balancer
  → Cấp External IP để truy cập từ internet
  → Dùng cho: public-facing services (API endpoints, frontend)

Trên minikube:
  → External IP = "pending" (không có cloud provider)
  → Dùng: minikube service SERVICE-NAME để truy cập
```

---

## Kiến Trúc Multi-Service

```
Internet
  │
  ▼
LoadBalancer Service (users-service, port 80)
  │
  ▼
Users API Pod
  │ (gọi internal)
  ▼
ClusterIP Service (auth-service, port 80)
  │
  ▼
Auth API Pod (không accessible từ internet)
```

### YAML Config Users Service (public)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: users-service
spec:
  selector:
    app: users
  type: LoadBalancer
  ports:
    - port: 80
      targetPort: 8080
```

### YAML Config Auth Service (internal only)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: auth-service
spec:
  selector:
    app: auth
  type: ClusterIP        # Internal only!
  ports:
    - port: 80
      targetPort: 80
```

---

## Khi Nào Dùng Loại Service Nào?

```
Public API / Frontend:
  → type: LoadBalancer

Service chỉ cần trong cluster:
  → type: ClusterIP
  → Ví dụ: Auth service, Database service

Development/testing:
  → type: NodePort (biết Node IP)
  → minikube service + LoadBalancer
```

---

**Tiếp theo:** Giao tiếp trong cùng 1 Pod →
