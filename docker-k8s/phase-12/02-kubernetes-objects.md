# Bài 2: Kubernetes Objects — Pod, Deployment, Service

## Kubernetes Hoạt Động Bằng Objects

```
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

```
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

```
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
```
EC2 (manual): Bạn tự restart container khi crash
ECS Task:     AWS tự restart container khi crash
K8s Deployment: Kubernetes tự restart Pod khi crash
               + Scale + Rolling updates + Rollbacks
```

---

## Service Object

```
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

```
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

```
Deployment
  ├── Tạo và quản lý → Pods
  └── Pods được expose bởi → Service

Service
  └── Chọn Pods theo Label Selector
      → Forward traffic đến Pods
      → Load balance nếu nhiều Pods
```

---

**Tiếp theo:** Imperative Approach — kubectl Commands →
