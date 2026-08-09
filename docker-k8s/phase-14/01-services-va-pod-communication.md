# Bài 1: Services & Giao Tiếp Pod

## Recap: Tại Sao Cần Service?

```text
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

```text
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

```text
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

```text
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

```text
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

```text
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

## Vì sao Service tồn tại — bài toán nó giải

Nghe "Service để gọi Pod" thì thấy hiển nhiên. Nhưng hãy thử **không có** Service xem sao:

```bash
kubectl get pods -o wide
```

```text
NAME             READY   STATUS    IP           NODE
backend-x7k2p    1/1     Running   10.244.1.5   worker-1
backend-m9q4t    1/1     Running   10.244.2.7   worker-2
backend-b2n8w    1/1     Running   10.244.3.9   worker-3
```

Gọi thẳng `10.244.1.5` được — cho tới khi:

```text
   1. Pod đó bị xoá và tạo lại  →  IP MỚI HOÀN TOÀN
   2. Bạn scale lên 10 Pod      →  ai cho bạn biết 7 IP mới?
   3. Pod đó chết               →  bạn vẫn gửi request vào đó → lỗi
   4. Deploy phiên bản mới      →  toàn bộ 3 IP đổi cùng lúc
```

Service giải cả bốn bằng một ý tưởng: **một địa chỉ ổn định đứng trước một tập Pod luôn thay đổi.**

```text
   ┌──────────────────────────────────────────────────┐
   │  Service "backend"                                │
   │  ClusterIP: 10.96.45.12   ← KHÔNG BAO GIỜ ĐỔI    │
   │  tên DNS:   backend        ← KHÔNG BAO GIỜ ĐỔI    │
   └───────────────────┬──────────────────────────────┘
                       │  chọn theo NHÃN app=backend
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   10.244.1.5    10.244.2.7    10.244.3.9
    (đổi liên tục, Service tự cập nhật danh sách)
```

Điểm mấu chốt: Service **không trỏ tới Pod theo tên hay IP**, nó **chọn theo nhãn**. Pod nào mang nhãn khớp thì tự động vào danh sách; Pod chết thì tự động ra.

### Ba thứ Service làm cùng lúc

| Việc | Chi tiết |
|---|---|
| **Địa chỉ ổn định** | ClusterIP và tên DNS không đổi suốt vòng đời Service |
| **Khám phá dịch vụ** | Không cần sổ đăng ký riêng — nhãn là cơ chế duy nhất |
| **Cân tải** | Mặc định chia đều ngẫu nhiên tới các Pod đang **Ready** |

Từ khoá ở dòng cuối là **Ready**: Pod chưa qua `readinessProbe` sẽ **không** có trong danh sách nhận traffic. Đây là lý do readiness quan trọng đến vậy ([Phase 12 bài 5](../phase-12/05-configuration-advanced.md)).

### Xem danh sách thật mà Service đang trỏ tới

```bash
kubectl get endpoints backend
```

```text
NAME      ENDPOINTS                                      AGE
backend   10.244.1.5:8080,10.244.2.7:8080,10.244.3.9:8080  2d
```

Đây là **lệnh chẩn đoán quan trọng nhất** khi Service không hoạt động. Danh sách rỗng chỉ có hai nguyên nhân:

```text
   ENDPOINTS: <none>
        │
        ├─ 1. selector của Service KHÔNG KHỚP nhãn Pod nào
        │      kubectl get svc backend -o jsonpath='{.spec.selector}'
        │      kubectl get pods --show-labels
        │
        └─ 2. Pod có nhãn đúng nhưng CHƯA READY
               kubectl get pods -l app=backend      (cột READY)
```

---

## Bẫy thường gặp

| Bẫy | Triệu chứng | Cách xử lý |
|---|---|---|
| Gọi Pod bằng IP | Hỏng sau mỗi lần Pod tạo lại | Luôn gọi qua Service |
| `selector` của Service lệch nhãn Pod | Service trả 503, `endpoints` rỗng | So `spec.selector` với nhãn Pod thật |
| Pod chưa Ready mà mong nhận traffic | `endpoints` rỗng dù Pod `Running` | Kiểm tra `readinessProbe` |
| Nhầm `port` với `targetPort` | Kết nối bị từ chối | `port` = cổng của Service; `targetPort` = cổng trong container |
| Dùng `NodePort` ở production | Cổng 30000–32767 khó nhớ, không có TLS, phải biết IP node | `LoadBalancer` hoặc `Ingress` |
| Tạo `LoadBalancer` trên cụm local | Kẹt `<pending>` mãi vì không có nhà cung cấp | Dùng `minikube tunnel`, hoặc `NodePort` |
| Quên xoá Service `LoadBalancer` trên cloud | **Vẫn tính tiền** dù cụm đã xoá | `kubectl delete svc --all` trước khi xoá cụm |
| Tưởng Service là một tiến trình chạy đâu đó | Nó là **quy tắc iptables/IPVS** trên mọi node, không phải Pod | Không có gì để "khởi động lại" |

Dòng cuối đáng làm rõ vì nó gây bối rối:

```text
   Service KHÔNG PHẢI một chương trình đang chạy.
   Nó là một BẢN GHI trong etcd, được kube-proxy dịch thành
   quy tắc iptables/IPVS trên MỌI node.

   → Không có Pod nào tên "service"
   → Không có log để đọc
   → Traffic đi THẲNG từ Pod nguồn tới Pod đích,
     chỉ là địa chỉ bị viết lại ở tầng nhân hệ điều hành
```

---

## Tóm tắt bài 1

- **IP của Pod đổi liên tục** — mỗi lần tạo lại, mỗi lần scale, mỗi lần deploy. Service giải bài toán đó bằng **một địa chỉ ổn định đứng trước một tập Pod luôn thay đổi**.
- Service **chọn Pod theo nhãn**, không theo tên hay IP. Pod mang nhãn khớp thì tự vào danh sách, chết thì tự ra.
- Service làm ba việc: **địa chỉ ổn định**, **khám phá dịch vụ**, **cân tải** — nhưng chỉ tới các Pod **đã Ready**.
- **`kubectl get endpoints <service>` là lệnh chẩn đoán quan trọng nhất.** Rỗng chỉ có hai nguyên nhân: **selector lệch nhãn** hoặc **Pod chưa Ready**.
- Phân biệt **`port`** (cổng của Service) với **`targetPort`** (cổng trong container).
- **Service không phải một tiến trình** — nó là quy tắc iptables/IPVS trên mọi node. Không có log để đọc, không có gì để khởi động lại.
- Trên cloud, **nhớ xoá Service `LoadBalancer`** trước khi xoá cụm, nếu không nó ở lại và vẫn tính tiền.

---

**Bài kế tiếp** → [Bài 2: Giao Tiếp Bên Trong Pod (Pod-internal)](02-pod-internal-communication.md)
