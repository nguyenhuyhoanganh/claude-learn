# Bài 2: Kubernetes Objects — Pod, Deployment, Service

## Kubernetes Hoạt Động Bằng Objects

```text
Kubernetes nhận Objects → Làm điều gì đó

Ví dụ:
  Object: "Tạo Pod với container này"
  → Kubernetes tạo Pod, chạy container

  Object: "Tôi muốn 3 Pods luôn chạy"
  → Kubernetes tạo/xóa/restart để giữ đúng 3
```

**2 cách tạo Objects:**
- **Imperative** (lệnh trực tiếp): `kubectl create deployment ...`
- **Declarative** (file YAML): `kubectl apply -f config.yaml`

---

## Pod Object

```text
Pod = Đơn vị nhỏ nhất của Kubernetes
    = Shell bọc quanh container(s)

┌─────────────────┐
│      Pod        │
│  ┌───────────┐  │
│  │ Container │  │
│  └───────────┘  │
│  [Volumes]      │  ← Optional shared resources
└─────────────────┘

Tương đương: docker run <image>
```

**Đặc điểm quan trọng của Pod:**
- **Ephemeral**: Data mất khi Pod bị xóa (trừ khi dùng Volume)
- **Cluster internal IP**: Chỉ accessible bên trong cluster
- Nếu nhiều containers trong 1 Pod → giao tiếp qua `localhost`
- **Thường không tạo Pod trực tiếp** → dùng Deployment thay

---

## Deployment Object

```text
Deployment = Controller quản lý Pods

Bạn nói: "Tôi muốn 3 Pods với container X"
Kubernetes sẽ:
  ✓ Tạo 3 Pods trên Worker Nodes phù hợp
  ✓ Monitor chúng
  ✓ Restart nếu crash
  ✓ Scale up/down theo lệnh
  ✓ Rolling updates khi deploy version mới
  ✓ Rollback nếu update thất bại
```

**So sánh với EC2/ECS:**
```text
EC2 (manual): Bạn tự restart container khi crash
ECS Task:     AWS tự restart container khi crash
K8s Deployment: Kubernetes tự restart Pod khi crash
               + Scale + Rolling updates + Rollbacks
```

---

## Service Object

```text
Vấn đề với Pod IP:
  1. Pod bị restart → IP thay đổi
  2. Internal cluster only → Không accessible từ ngoài
  3. Nếu scale → Nhiều Pods, biết gọi Pod nào?

Service = Giải pháp:
  ✓ IP cố định, không đổi khi Pods restart
  ✓ Expose Pods ra ngoài cluster
  ✓ Load balance traffic giữa nhiều Pods
```

### 3 Loại Service

```text
ClusterIP (mặc định):
  → Chỉ accessible trong cluster
  → Dùng cho pod-to-pod communication
  → ClusterIP: 10.96.x.x

NodePort:
  → Accessible qua IP của Worker Node
  → Port range: 30000-32767
  → Ít dùng trong production

LoadBalancer:
  → Tạo external Load Balancer (cần cloud provider support)
  → External IP → users trên internet access được
  → Phổ biến nhất cho public-facing apps
  → minikube cũng support loại này
```

---

## Mối Quan Hệ Giữa Các Objects

```text
Deployment
  ├── Tạo và quản lý → Pods
  └── Pods được expose bởi → Service

Service
  └── Chọn Pods theo Label Selector
      → Forward traffic đến Pods
      → Load balance nếu nhiều Pods
```

---

## Vì sao Pod tồn tại — thay vì Kubernetes quản container trực tiếp

Câu hỏi hợp lý: nếu 95% Pod chỉ có một container, sao không bỏ luôn khái niệm Pod?

Ba lý do, và lý do thứ nhất là quan trọng nhất:

**1. Có những container phải nằm chung mạng và ổ đĩa.**

```text
   ┌────────────── POD ──────────────┐
   │  Container "app"                 │
   │  Container "log-collector"       │
   │                                  │
   │  DÙNG CHUNG:                     │
   │  ├─ một địa chỉ IP               │
   │  ├─ một không gian cổng          │
   │  │   → app gọi log-collector qua │
   │  │     localhost:9000            │
   │  └─ volume (emptyDir)            │
   │      → app ghi file, collector   │
   │        đọc cùng file đó          │
   └──────────────────────────────────┘
```

Đây gọi là mẫu **sidecar**, và nó là lý do gốc để Pod tồn tại. Ví dụ hay gặp: thu thập log, proxy mạng (Istio, Linkerd), đồng bộ cấu hình, nạp bí mật.

**2. Cả nhóm được xếp lên CÙNG một node và cùng sống cùng chết.**

Nếu `app` và `log-collector` là hai đối tượng riêng, Kubernetes có thể xếp chúng lên hai máy khác nhau — và mẫu sidecar sẽ vô nghĩa.

**3. Đơn vị scale rõ ràng.** Khi scale, bạn nhân bản cả Pod, không phải chọn từng container.

> **Quan trọng cần nhớ**: bạn **hiếm khi tạo Pod trực tiếp**. Pod tạo tay không tự khởi động lại khi node chết, không có bản sao dự phòng, không cập nhật luân phiên được. Gần như luôn dùng **Deployment** để nó quản Pod giúp bạn.

### Ba tầng và vì sao có tầng giữa

```text
   Deployment  ──quản──►  ReplicaSet  ──quản──►  Pod
       │                       │
       │                       └─ đảm bảo đúng N Pod đang chạy
       │
       └─ giữ LỊCH SỬ các ReplicaSet → đó là thứ cho phép QUAY LUI
```

```bash
kubectl get replicaset
```

```text
NAME                DESIRED   CURRENT   READY   AGE
myapp-7d4b9c8f6d    3         3         3       10m    ← phiên bản hiện tại
myapp-5c8f7d9b4a    0         0         0       2h     ← bản cũ, giữ để quay lui
```

Khi bạn `kubectl rollout undo`, Deployment chỉ đơn giản **tăng `replicas` của ReplicaSet cũ lên và hạ cái mới xuống 0**. Không có gì huyền bí — và biết điều này thì lệnh quay lui không còn là hộp đen.

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| Tạo Pod trực tiếp bằng YAML | Node chết là **Pod biến mất vĩnh viễn**, không ai tạo lại | Dùng Deployment |
| Nhét nhiều ứng dụng **không liên quan** vào một Pod | Chúng phải scale cùng nhau, chết cùng nhau | Mỗi ứng dụng một Deployment; sidecar chỉ cho tiến trình **phục vụ trực tiếp** ứng dụng chính |
| Tưởng Pod có địa chỉ IP cố định | IP **đổi mỗi lần Pod tạo lại** | Luôn gọi qua **Service** |
| Sửa Pod do Deployment tạo ra | Deployment ghi đè lại ngay | Sửa Deployment, không sửa Pod |
| Xoá Pod để "khởi động lại ứng dụng" | Deployment tạo Pod mới ngay — nhưng đây là cách **đúng** để buộc khởi động lại | Hoặc dùng `kubectl rollout restart deployment/<tên>` cho gọn |
| Tạo ReplicaSet trực tiếp | Mất khả năng quay lui và cập nhật luân phiên | ReplicaSet là **chi tiết cài đặt** của Deployment |
| Quên rằng Service chọn Pod bằng **nhãn** | Service không trỏ tới Pod nào, trả 503 | Nhãn ở `selector` phải khớp nhãn của Pod |

Dòng cuối là nguyên nhân phổ biến nhất khi Service "không hoạt động" — và cách kiểm tra chỉ mất mười giây:

```bash
kubectl get endpoints <ten-service>
```

```text
NAME      ENDPOINTS                        AGE
backend   <none>                           5m
                ▲
        RỖNG → selector không khớp nhãn Pod nào, hoặc Pod chưa Ready
```

---

## Tóm tắt bài 2

- Kubernetes làm việc bằng **object** khai báo trạng thái mong muốn; nó tự lo đưa thực tế về khớp trạng thái đó.
- **Pod là đơn vị nhỏ nhất**, không phải container. Pod tồn tại vì có những container cần **chung IP, chung cổng, chung volume** — mẫu **sidecar**.
- **Hiếm khi tạo Pod trực tiếp.** Pod tạo tay không tự phục hồi. Dùng **Deployment**.
- Ba tầng: **Deployment → ReplicaSet → Pod**. Deployment giữ **lịch sử ReplicaSet**, và đó chính là cơ chế của `rollout undo`.
- **Service** kết nối tới Pod bằng **nhãn**, không phải bằng tên hay IP. `kubectl get endpoints` rỗng là dấu hiệu nhãn không khớp hoặc Pod chưa Ready.
- **IP của Pod đổi liên tục** — luôn gọi qua Service.

---

**Bài kế tiếp** → [Bài 3: Imperative Approach — kubectl Commands](03-imperative-approach.md)
