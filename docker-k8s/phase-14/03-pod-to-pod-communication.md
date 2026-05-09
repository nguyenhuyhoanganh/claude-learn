# Bài 3: Giao Tiếp Giữa Các Pods (Pod-to-Pod)

## Kiến Trúc Nhiều Deployments

Trong thực tế, mỗi service nên có Deployment riêng:

```
users-deployment   → Users API Pods
auth-deployment    → Auth API Pods
tasks-deployment   → Tasks API Pods

Mỗi Pod type có service riêng:
  users-service   → LoadBalancer (public)
  auth-service    → ClusterIP (internal)
  tasks-service   → LoadBalancer (public)
```

---

## Vấn Đề: Pod IP Không Ổn Định

```
Auth Pod IP: 10.96.0.15
  → Pod restart → IP mới: 10.96.0.23 (khác rồi!)
  → Scale up từ 1 → 3 pods → IP nào?

→ Không thể hard-code Pod IP trong code!
```

**Giải pháp: Service = Stable IP**

```
auth-service (ClusterIP): 10.96.100.5
  → Không đổi dù Pod restart
  → Load balance đến các Auth Pods
  → Đây là IP cần dùng
```

---

## Cách 1: Lookup IP thủ công (không khuyến khích)

```bash
kubectl get services
# NAME           TYPE        CLUSTER-IP    EXTERNAL-IP
# auth-service   ClusterIP   10.96.100.5   <none>
```

```yaml
# Dùng IP này trong deployment config
env:
  - name: AUTH_ADDRESS
    value: "10.96.100.5"   # Hard-code IP của service
```

**Vấn đề:** IP stable nhưng vẫn phải tra tay, không tự động.

---

## Cách 2: Auto-generated Environment Variables

Kubernetes **tự động** tạo env vars cho tất cả Services:

```
Pattern: SERVICE_NAME_SERVICE_HOST

Ví dụ:
  auth-service  →  AUTH_SERVICE_SERVICE_HOST
  users-service →  USERS_SERVICE_SERVICE_HOST
  tasks-service →  TASKS_SERVICE_SERVICE_HOST
```

```javascript
// Code trong Users API:
const AUTH_ADDRESS = process.env.AUTH_SERVICE_SERVICE_HOST;
// Kubernetes tự inject IP của auth-service vào đây
```

```yaml
# Không cần config gì thêm!
# Kubernetes tự tạo env var này cho mọi container trong cluster
```

**Lưu ý:** Kubernetes chỉ tạo env vars cho Services đã **tồn tại** trước khi Pod được tạo. Service phải apply trước Deployment.

---

## Cách 3: CoreDNS Domain Names (Khuyến khích)

Kubernetes có built-in **CoreDNS** service tự động tạo domain names cho tất cả Services.

**Pattern:**
```
service-name.namespace
```

**Ví dụ:**
```javascript
// Gọi auth-service ở default namespace:
const AUTH_ADDRESS = 'auth-service.default';

// Gọi đến port cụ thể:
axios.get(`http://auth-service.default:80/verify`);
```

```yaml
env:
  - name: AUTH_ADDRESS
    value: auth-service.default   # CoreDNS domain
```

---

## So Sánh 3 Cách

| Cách | Ví dụ | Ưu điểm | Nhược điểm |
|---|---|---|---|
| **Manual IP** | `10.96.100.5` | Đơn giản | Phải tra tay |
| **Auto env var** | `AUTH_SERVICE_SERVICE_HOST` | Tự động | Phụ thuộc thứ tự tạo |
| **CoreDNS** | `auth-service.default` | Tự động, rõ ràng | Cần biết namespace |

**CoreDNS là cách được khuyến khích nhất.**

---

## Namespaces

```bash
kubectl get namespaces
# default         → Namespace mặc định cho resources
# kube-system     → Kubernetes system components
# kube-public     → Public data
```

Nếu không chỉ định namespace trong YAML → tự động dùng `default`.

```
auth-service.default     → auth-service trong namespace "default"
auth-service.production  → nếu tạo namespace riêng cho prod
```

---

## Cấu Hình Users Deployment

```yaml
# auth-deployment.yaml (separate deployment)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-deployment
spec:
  replicas: 1
  selector:
    matchLabels:
      app: auth
  template:
    metadata:
      labels:
        app: auth
    spec:
      containers:
        - name: auth
          image: USERNAME/auth-image

---

apiVersion: v1
kind: Service
metadata:
  name: auth-service
spec:
  selector:
    app: auth
  type: ClusterIP          # Internal only
  ports:
    - port: 80
      targetPort: 80

---

# users-deployment.yaml
spec:
  containers:
    - name: users
      image: USERNAME/users-image
      env:
        - name: AUTH_ADDRESS
          value: auth-service.default  # CoreDNS domain
```

---

**Tiếp theo:** CoreDNS và Auto-generated Env Vars chi tiết →
