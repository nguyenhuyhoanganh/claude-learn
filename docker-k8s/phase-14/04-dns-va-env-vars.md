# Bài 4: CoreDNS và Auto-generated Environment Variables

## CoreDNS — DNS Built-in của Kubernetes

Kubernetes clusters hiện đại đi kèm với **CoreDNS** — một DNS service tự động tạo domain names cho tất cả Services trong cluster.

```
CoreDNS chạy như 1 Service trong namespace kube-system:
  kubectl get pods -n kube-system
  → coredns-xxx-yyy    1/1   Running

CoreDNS tự động:
  → Đăng ký domain cho mỗi Service mới được tạo
  → Domain chỉ accessible từ bên trong cluster
  → Không cần config thêm gì cả
```

---

## Domain Pattern của CoreDNS

```
{service-name}.{namespace}

Ví dụ:
  auth-service  (trong namespace default)
  → Domain: auth-service.default

  tasks-service (trong namespace default)
  → Domain: tasks-service.default

  users-service (trong namespace production)
  → Domain: users-service.production
```

### Dùng trong Code

```javascript
// Node.js - gọi auth-service từ users-api
const AUTH_ADDRESS = process.env.AUTH_ADDRESS;

// Giá trị: 'auth-service.default'
axios.get(`http://${AUTH_ADDRESS}/verify`);

// Nếu service expose port khác 80:
axios.get(`http://${AUTH_ADDRESS}:8080/verify`);
```

### Config trong Deployment YAML

```yaml
containers:
  - name: users
    image: users-image
    env:
      - name: AUTH_ADDRESS
        value: auth-service.default   # CoreDNS domain
```

---

## Auto-generated Environment Variables

Kubernetes **tự động** inject env vars vào mọi container với thông tin về các Services đang chạy.

### Pattern

```
{SERVICE_NAME_UPPERCASE}_SERVICE_HOST
{SERVICE_NAME_UPPERCASE}_SERVICE_PORT

Dấu "-" trong service name → thay bằng "_"

Ví dụ:
  auth-service → AUTH_SERVICE_SERVICE_HOST
  auth-service → AUTH_SERVICE_SERVICE_PORT

  tasks-service → TASKS_SERVICE_SERVICE_HOST
  users-service → USERS_SERVICE_SERVICE_HOST
```

### Dùng trong Code

```javascript
// Kubernetes tự inject giá trị này
const AUTH_ADDRESS = process.env.AUTH_SERVICE_SERVICE_HOST;
// = IP address của auth-service (ví dụ: 10.96.100.5)

axios.get(`http://${AUTH_ADDRESS}/verify`);
```

### Không cần config thêm gì

```yaml
# Không cần thêm gì vào deployment YAML
# Kubernetes tự tạo env vars này cho tất cả containers
containers:
  - name: users
    image: users-image
    # AUTH_SERVICE_SERVICE_HOST được tự inject!
```

**Lưu ý quan trọng:** Service phải được tạo **TRƯỚC** khi Pod start mới có env var. Nếu Service tạo sau → Pod không có env var đó.

---

## So Sánh CoreDNS vs Auto Env Vars

| | CoreDNS Domain | Auto Env Var |
|---|---|---|
| **Cú pháp** | `auth-service.default` | `AUTH_SERVICE_SERVICE_HOST` |
| **Dễ đọc** | Rất rõ ràng | Dài, khó nhớ |
| **Phụ thuộc thứ tự** | Không | Có (Service phải trước Pod) |
| **Cần config** | Không | Không |
| **Khuyến khích** | ✓ | Backup option |

**CoreDNS được khuyến khích hơn** vì rõ ràng, không phụ thuộc thứ tự tạo.

---

## Thực Tế: Docker Compose vs Kubernetes

```javascript
// Code của bạn (flexible):
const AUTH_ADDRESS = process.env.AUTH_ADDRESS;
axios.get(`http://${AUTH_ADDRESS}/verify`);
```

```yaml
# docker-compose.yml
services:
  users:
    environment:
      AUTH_ADDRESS: auth  # Service name trong docker-compose
  auth:
    ...

# Kubernetes deployment.yaml
containers:
  - name: users
    env:
      - name: AUTH_ADDRESS
        value: auth-service.default  # CoreDNS domain
```

→ Chỉ cần đổi **env var value**, code không cần thay đổi.

---

## Namespace và Full Domain

```bash
# Xem namespaces
kubectl get namespaces

# Namespace mặc định: "default"
# Tất cả resources không chỉ định namespace → đi vào "default"

# Full domain name:
service-name.namespace.svc.cluster.local
# Thường dùng short form:
service-name.namespace  # Cũng work!
```

---

**Tiếp theo:** Frontend và Reverse Proxy →
