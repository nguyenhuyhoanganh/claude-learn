# Bài 3: Kiến Trúc Kubernetes

## Big Picture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLUSTER                                  │
│                                                                  │
│  ┌─────────────────┐      ┌────────────┐  ┌────────────┐       │
│  │   MASTER NODE   │      │ WORKER     │  │ WORKER     │       │
│  │  (Control Plane)│─────▶│ NODE 1     │  │ NODE 2     │       │
│  │                 │      │            │  │            │       │
│  │  API Server     │      │ ┌────────┐ │  │ ┌────────┐ │       │
│  │  Scheduler      │      │ │ Pod    │ │  │ │ Pod    │ │       │
│  │  Controller Mgr │      │ │┌──────┐│ │  │ │┌──────┐│ │       │
│  │  Cloud Ctrl Mgr │      │ ││Cont. ││ │  │ ││Cont. ││ │       │
│  └─────────────────┘      │ │└──────┘│ │  │ │└──────┘│ │       │
│                            │ └────────┘ │  │ └────────┘ │       │
│                            │            │  │            │       │
│                            │ kubelet    │  │ kubelet    │       │
│                            │ kube-proxy │  │ kube-proxy │       │
│                            └────────────┘  └────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Pod — Đơn Vị Nhỏ Nhất

```
Pod = Shell bọc xung quanh container(s)
    = Đơn vị deployment nhỏ nhất trong Kubernetes

┌─────────────────────┐
│        Pod          │
│  ┌───────────────┐  │
│  │  Container A  │  │
│  └───────────────┘  │
│  ┌───────────────┐  │  ← (Optional) Multiple containers
│  │  Container B  │  │     nếu cần work closely together
│  └───────────────┘  │
│  ┌───────────────┐  │
│  │   Volumes     │  │  ← Shared resources
│  └───────────────┘  │
└─────────────────────┘
```

**Quan trọng:**
- Pod ≈ `docker run` cho một container
- Kubernetes tạo/xóa Pods (không phải bạn)
- Pod có thể chứa 1 hoặc nhiều containers
- Mỗi Pod có IP riêng trong cluster

---

## Worker Node — Máy Chạy Pods

```
Worker Node = Remote machine (EC2 instance, VM, v.v.)
           = Nơi các Pods được chạy

Bên trong Worker Node:
  ┌──────────────────────────────┐
  │         WORKER NODE          │
  │                              │
  │  Pod 1 (App Container)       │
  │  Pod 2 (App Container copy)  │  ← Multiple pods/node
  │  Pod 3 (Different Container) │
  │                              │
  │  Docker (required)           │  ← Chạy containers bên trong pods
  │  kubelet                     │  ← Communication với Master Node
  │  kube-proxy                  │  ← Quản lý network traffic
  └──────────────────────────────┘
```

**kubelet:** Service chạy trên Worker Node, nhận lệnh từ Master Node và execute.

**kube-proxy:** Quản lý network rules — ai được vào pod, pod gửi traffic đi đâu.

---

## Master Node — Bộ Não Điều Khiển

```
Master Node = Control Center
           = Điều phối toàn bộ cluster

Bên trong Master Node (Control Plane):
  ┌──────────────────────────────────────┐
  │            MASTER NODE               │
  │                                      │
  │  API Server                          │  ← Gateway cho mọi thứ
  │    └── Nhận lệnh từ kubectl          │
  │    └── Giao tiếp với kubelets        │
  │                                      │
  │  Scheduler                           │  ← Quyết định Pod chạy ở Node nào
  │    └── Chọn Worker Node cho Pods     │
  │    └── Dựa trên available resources  │
  │                                      │
  │  kube-controller-manager             │  ← Giám sát cluster health
  │    └── Đảm bảo đúng số Pods chạy    │
  │    └── Restart Pods nếu crash        │
  │                                      │
  │  cloud-controller-manager            │  ← Cloud provider specific
  │    └── Nói chuyện với AWS API        │
  │    └── Tạo EC2, Load Balancers...    │
  └──────────────────────────────────────┘
```

---

## Luồng Hoạt Động

```
1. Developer viết Kubernetes config (YAML)

2. kubectl apply -f config.yaml
   → Gửi đến API Server trên Master Node

3. API Server nhận → Scheduler quyết định
   "Pod này nên chạy trên Worker Node 2"

4. API Server → kubelet trên Worker Node 2
   "Chạy Pod này đi"

5. kubelet → Docker → Container chạy

6. kube-controller-manager monitor:
   "Pod crash? → Tạo Pod mới thay thế"
   "Traffic cao? → Tạo thêm Pods"
```

---

## Cluster

```
Cluster = Tổng hợp tất cả các Nodes

Cluster
  ├── Master Node (1 hoặc nhiều, để HA)
  ├── Worker Node 1
  ├── Worker Node 2
  └── Worker Node N

Trong cluster:
  - Tất cả Nodes kết nối với nhau trong 1 network
  - Master Node có thể gửi lệnh đến mọi Worker Node
  - Kubernetes manage toàn bộ cluster
```

---

## Điều Bạn Phải Làm vs Kubernetes Làm

```
BẠN phải:                    KUBERNETES sẽ:
  ✓ Tạo cluster (servers)      → Quản lý Pods
  ✓ Cài Docker trên nodes      → Create/Delete Pods
  ✓ Cài Kubernetes software    → Distribute Pods trên Nodes
  ✓ Cấu hình network           → Monitor và restart Pods
  ✓ Viết K8s config files      → Scale Pods up/down
                                → Load balance traffic
```

**Tuy nhiên:** AWS EKS, Azure AKS, Google GKE đều tự động setup cluster cho bạn!

---

**Tiếp theo:** Các Thuật Ngữ Quan Trọng trong Kubernetes →
