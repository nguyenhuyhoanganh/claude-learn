# Bài 4: CoreDNS và Auto-generated Environment Variables

## CoreDNS — DNS Built-in của Kubernetes

Kubernetes clusters hiện đại đi kèm với **CoreDNS** — một DNS service tự động tạo domain names cho tất cả Services trong cluster.

```text
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

```text
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

```text
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

## Vì sao tên rút gọn hoạt động — và khi nào nó phản tác dụng

Tên rút gọn chạy được nhờ file `/etc/resolv.conf` mà Kubernetes tự đặt vào mỗi Pod:

```bash
kubectl exec -it my-pod -- cat /etc/resolv.conf
```

```text
nameserver 10.96.0.10
search default.svc.cluster.local svc.cluster.local cluster.local
options ndots:5
```

Dòng `search` nghĩa là: khi bạn gọi `auth-service`, hệ thống **lần lượt thử** ghép từng hậu tố:

```text
   auth-service                              → không có
   auth-service.default.svc.cluster.local    → CÓ  ✓
```

Còn `ndots:5` là chi tiết gây ra một vấn đề hiệu năng thật:

```text
   ndots:5 nghĩa là: tên có DƯỚI 5 dấu chấm thì THỬ GHÉP HẬU TỐ TRƯỚC

   Gọi "api.github.com" (2 dấu chấm):
     1. api.github.com.default.svc.cluster.local   → không có
     2. api.github.com.svc.cluster.local           → không có
     3. api.github.com.cluster.local               → không có
     4. api.github.com                             → CÓ  ✓

   → BỐN lượt truy vấn DNS thay vì một, cho MỌI lời gọi ra ngoài
```

Với dịch vụ gọi API bên ngoài nhiều, đây là nguyên nhân thật của độ trễ tăng và tải nặng lên CoreDNS. Cách chữa: thêm **dấu chấm cuối** để báo "đây là tên tuyệt đối, đừng ghép gì nữa".

```javascript
fetch('https://api.github.com./users')     // chú ý dấu chấm sau "com"
```

Hoặc chỉnh riêng cho Pod đó:

```yaml
spec:
  dnsConfig:
    options:
      - name: ndots
        value: "1"
```

### Biến môi trường tự sinh — và bẫy thứ tự

Kubernetes tự tạo biến môi trường cho mọi Service **đã tồn tại trước** khi Pod khởi động:

```bash
kubectl exec my-pod -- env | grep AUTH
```

```text
AUTH_SERVICE_SERVICE_HOST=10.96.45.12
AUTH_SERVICE_SERVICE_PORT=80
```

> **Bẫy**: biến này **chỉ có nếu Service được tạo TRƯỚC Pod**. Tạo Service sau thì Pod đang chạy **không bao giờ** thấy biến đó — phải khởi động lại Pod. Đây là lý do **luôn nên dùng DNS thay vì biến môi trường tự sinh**: DNS phân giải lúc chạy, không phụ thuộc thứ tự tạo.

---

## Bẫy thường gặp

| Bẫy | Triệu chứng | Cách xử lý |
|---|---|---|
| Dùng biến môi trường tự sinh thay DNS | Biến không tồn tại nếu Service tạo sau Pod | Luôn dùng **tên DNS** |
| Gọi Service ở namespace khác bằng tên ngắn | `getaddrinfo ENOTFOUND` | Thêm namespace: `auth-service.production` |
| Gọi API ngoài mà không có dấu chấm cuối | **4 lượt truy vấn DNS** mỗi lần gọi, CoreDNS quá tải | Thêm dấu chấm cuối, hoặc chỉnh `ndots` |
| Dùng cổng đã publish thay vì cổng của Service | Không kết nối được | Dùng đúng `port` khai trong Service |
| Tưởng DNS trỏ tới Pod | Nó trỏ tới **Service** (một IP ảo cố định) | IP Pod đổi liên tục, IP Service thì không |
| Headless Service mà mong có cân tải | Nó trả **danh sách IP Pod**, không cân tải | Đó là hành vi đúng — xem [Phase 17 bài 1](../phase-17/01-statefulset.md) |
| CoreDNS quá tải mà không biết | Độ trễ tăng ngẫu nhiên toàn cụm | Theo dõi `coredns_dns_request_duration_seconds` |

---

## Tóm tắt bài 4

- Trong cụm, gọi nhau bằng **tên DNS của Service**: dạng đầy đủ `<service>.<namespace>.svc.cluster.local`, dạng rút gọn `<service>` (cùng namespace) hoặc `<service>.<namespace>`.
- Tên rút gọn chạy được nhờ dòng **`search`** trong `/etc/resolv.conf` mà Kubernetes tự đặt vào Pod.
- **`ndots:5` khiến mỗi lời gọi ra ngoài tốn 4 lượt truy vấn DNS.** Với dịch vụ gọi API ngoài nhiều, đây là nguyên nhân thật của độ trễ và tải nặng lên CoreDNS. Chữa bằng **dấu chấm cuối** hoặc `dnsConfig`.
- **Biến môi trường tự sinh chỉ có nếu Service được tạo TRƯỚC Pod** — nên luôn ưu tiên DNS, vì nó phân giải lúc chạy.
- DNS trỏ tới **Service** (IP ảo cố định), không trỏ tới Pod (IP đổi liên tục).

---

**Bài kế tiếp** → [Bài 5: Frontend & Reverse Proxy trong Kubernetes](05-frontend-va-reverse-proxy.md)
