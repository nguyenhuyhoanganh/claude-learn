# Tổng Kết Phase 14 — Kubernetes Networking

## Những Gì Đã Học

### 1. Service Types và Use Cases

```text
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

```text
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

```text
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

```text
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

```text
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

```text
{service-name}.{namespace}

Ví dụ:
  auth-service.default
  tasks-service.default
  users-service.production
```

### Auto Env Var Pattern

```text
{SERVICE_NAME_UPPERCASE}_SERVICE_HOST
{SERVICE_NAME_UPPERCASE}_SERVICE_PORT

Ví dụ (service: auth-service):
  AUTH_SERVICE_SERVICE_HOST = 10.96.100.5
  AUTH_SERVICE_SERVICE_PORT = 80
```

---

## Key Takeaways

```text
1. ClusterIP = internal services (auth, DB không expose ra ngoài)
2. LoadBalancer = public services (gần nhất với production usage)
3. Cùng Pod → localhost; khác Pod → service name
4. CoreDNS tự generate: auth-service.default
5. Auto env vars: AUTH_SERVICE_SERVICE_HOST
6. Reverse proxy = pattern đúng cho frontend trong K8s
7. nginx proxy_pass dùng cluster-internal domains (chạy trong cluster)
```

---

---

## Tự kiểm tra

**1. Vì sao không gọi Pod bằng IP mà phải qua Service?**

<details><summary>Đáp án</summary>

IP của Pod **đổi mỗi lần Pod tạo lại** — mỗi lần deploy, mỗi lần scale, mỗi lần node chết. Service cho **một địa chỉ ổn định đứng trước một tập Pod luôn thay đổi**, và nó chọn Pod **theo nhãn** nên tự cập nhật danh sách. Chi tiết: [bài 1](01-services-va-pod-communication.md).
</details>

**2. Hai container trong cùng Pod cùng nghe cổng 8080. Chuyện gì xảy ra?**

<details><summary>Đáp án</summary>

Container thứ hai **không khởi động được** — `bind: address already in use`. Vì các container trong một Pod **chung không gian mạng**: cùng IP, cùng dải cổng, giống hệt hai tiến trình trên một máy. Chi tiết: [bài 2](02-pod-internal-communication.md).
</details>

**3. Container A trong Pod muốn đọc file container B ghi ra. Làm sao?**

<details><summary>Đáp án</summary>

Qua **volume chung** (thường là `emptyDir`), vì **hệ thống file gốc không chung** — mỗi container có image riêng. Lưu ý `mountPath` ở hai container có thể khác nhau, chỉ volume mới là thứ chung.
</details>

**4. Service trả 503. Lệnh đầu tiên và hai nguyên nhân có thể?**

<details><summary>Đáp án</summary>

`kubectl get endpoints <ten-service>`. Rỗng thì chỉ có hai lý do: **selector của Service lệch nhãn Pod**, hoặc **Pod chưa Ready** (readinessProbe thất bại).
</details>

**5. Dịch vụ của bạn gọi `https://api.github.com` rất nhiều và CoreDNS quá tải. Vì sao?**

<details><summary>Đáp án</summary>

Do **`ndots:5`** trong `/etc/resolv.conf`. Tên có dưới 5 dấu chấm sẽ được **thử ghép hậu tố cụm trước** — nên mỗi lời gọi tốn **4 lượt truy vấn DNS** thay vì một. Chữa bằng **dấu chấm cuối** (`api.github.com.`) hoặc chỉnh `dnsConfig`. Chi tiết: [bài 4](04-dns-va-env-vars.md).
</details>

**6. Vì sao nên dùng DNS thay vì biến môi trường tự sinh của Service?**

<details><summary>Đáp án</summary>

Biến môi trường **chỉ tồn tại nếu Service được tạo TRƯỚC Pod**. Tạo Service sau thì Pod đang chạy không bao giờ thấy biến đó. DNS thì phân giải **lúc chạy**, không phụ thuộc thứ tự tạo.
</details>

**7. `localhost` trong container Kubernetes trỏ tới đâu?**

<details><summary>Đáp án</summary>

Tới **chính Pod đó** (chung cả mạng với các container cùng Pod). Muốn gọi Pod khác thì phải qua **Service**.
</details>

---

**Phase kế tiếp** → [Bài 1: AWS EKS vs AWS ECS — Chọn Gì?](../phase-15/01-eks-vs-ecs.md)
