# Bài 3: Kiến Trúc Kubernetes

## Big Picture

```text
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

```text
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

```text
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

```text
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

```text
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

```text
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

```text
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

## Đi từng bước: chuyện gì xảy ra khi bạn gõ một lệnh

Sơ đồ kiến trúc ở trên liệt kê các thành phần. Phần này cho thấy chúng **phối hợp với nhau ra sao** — và sau khi đọc, bạn sẽ chẩn đoán sự cố nhanh hơn nhiều vì biết hỏi đúng chỗ.

```bash
kubectl create deployment web --image=nginx --replicas=3
```

```text
   BƯỚC 1 — kubectl gửi request tới API SERVER
   ─────────────────────────────────────────────────────────
   kubectl đọc ~/.kube/config để biết địa chỉ và chứng chỉ
   → gửi HTTP POST /apis/apps/v1/namespaces/default/deployments

   API server: XÁC THỰC (anh là ai?) → PHÂN QUYỀN (anh được làm không?)
               → kiểm tra hợp lệ → GHI VÀO ETCD
   → trả về "deployment.apps/web created"

   ⚠ Tới đây CHƯA CÓ POD NÀO CẢ. Mới chỉ ghi "ý muốn" vào cơ sở dữ liệu.


   BƯỚC 2 — DEPLOYMENT CONTROLLER phát hiện
   ─────────────────────────────────────────────────────────
   Nó theo dõi API server, thấy có Deployment mới
   → tạo một ReplicaSet
   → ghi vào etcd (qua API server)


   BƯỚC 3 — REPLICASET CONTROLLER phát hiện
   ─────────────────────────────────────────────────────────
   Thấy ReplicaSet muốn 3 Pod, thực tế có 0
   → tạo 3 đối tượng Pod
   → nhưng CHƯA GÁN NODE NÀO (trường nodeName còn rỗng)

   Lúc này: kubectl get pods → thấy 3 Pod ở trạng thái Pending


   BƯỚC 4 — SCHEDULER phát hiện
   ─────────────────────────────────────────────────────────
   Thấy 3 Pod chưa có node
   → LỌC:  node nào đủ CPU/RAM? có taint không? khớp affinity không?
   → CHẤM ĐIỂM: node nào còn nhiều chỗ nhất, trải đều nhất?
   → ghi nodeName vào từng Pod

   ⚠ Scheduler CHỈ QUYẾT ĐỊNH, KHÔNG tự chạy container.


   BƯỚC 5 — KUBELET trên node được chọn phát hiện
   ─────────────────────────────────────────────────────────
   Mỗi kubelet theo dõi "có Pod nào gán cho node của tôi không?"
   → thấy có → gọi containerd để kéo image và chạy container
   → báo trạng thái ngược lại cho API server

   Lúc này: kubectl get pods → Running


   BƯỚC 6 — KUBE-PROXY cập nhật quy tắc mạng
   ─────────────────────────────────────────────────────────
   Khi có Service trỏ tới các Pod này
   → kube-proxy trên MỌI node cập nhật iptables/IPVS
   → traffic gửi tới IP của Service được chuyển tới IP Pod thật
```

### Hai điều rút ra, và cả hai đều dùng khi gỡ lỗi

**Một — không thành phần nào nói chuyện trực tiếp với nhau.** Tất cả đều đọc/ghi qua **API server**, và API server là cái duy nhất chạm vào etcd.

```text
   ✗ SAI:  scheduler ──► kubelet
   ✓ ĐÚNG: scheduler ──► API server ◄── kubelet
```

Kiến trúc này gọi là **trung tâm và nan hoa**. Nó cho phép thêm controller mới (Operator, autoscaler, service mesh) mà **không phải sửa gì trong lõi Kubernetes** — chúng chỉ cần biết nói chuyện với API server.

**Hai — mỗi trạng thái Pod chỉ về đúng một thành phần.** Đây là bảng tra dùng được ngay:

| Pod kẹt ở | Thành phần chưa xong việc | Xem gì |
|---|---|---|
| Không có Pod nào xuất hiện | Deployment/ReplicaSet controller | `kubectl describe deployment` |
| **`Pending`** | **Scheduler** không tìm được node | `kubectl describe pod` → mục Events |
| **`ContainerCreating`** | **Kubelet** đang kéo image hoặc gắn volume | `kubectl describe pod`, log kubelet |
| `Running` nhưng không nhận traffic | **kube-proxy** hoặc Service | `kubectl get endpoints` |

Biết bảng này thì khi Pod `Pending`, bạn đi thẳng tới scheduler thay vì đọc log ứng dụng — thứ chắc chắn rỗng vì container còn chưa được tạo.

---

## Bẫy thường gặp

| Bẫy | Sự thật |
|---|---|
| Đọc log ứng dụng khi Pod `Pending` | Container **chưa được tạo** — log luôn rỗng. Đọc Events trong `describe` |
| Nghĩ scheduler chạy container | Nó **chỉ chọn node**. Kubelet mới chạy container |
| Nghĩ kubelet chạy trên control plane | Kubelet chạy trên **mọi node**, kể cả control plane |
| Tưởng có thể nói chuyện thẳng với etcd | **Không bao giờ** thao tác etcd trực tiếp — chỉ API server được phép |
| Nghĩ mất control plane là ứng dụng chết | Pod **vẫn chạy tiếp**. Chỉ mất khả năng **thay đổi** (tạo Pod mới, scale, failover) |
| Tưởng một node là một Pod | Một node chạy **hàng chục tới hàng trăm** Pod |

Dòng thứ năm đáng nhấn vì nó ngược trực giác nhưng rất quan trọng:

```text
   Control plane chết lúc 2 giờ sáng
   → Ứng dụng đang chạy VẪN PHỤC VỤ bình thường
   → Người dùng KHÔNG bị ảnh hưởng
   → Nhưng: Pod chết thì không ai tạo lại, không scale được,
     không deploy được, không failover được

   → Nghiêm trọng, nhưng KHÔNG phải sự cố ngừng dịch vụ ngay lập tức
```

Đây là lý do control plane thường chạy 3 bản sao, và là lý do cụm quản lý sẵn (EKS/GKE/AKS) đáng tiền — nhà cung cấp lo phần này.

---

## Tóm tắt bài 3

- **Control plane** ra quyết định, **worker node** chạy việc. Mỗi node có **kubelet** (chạy container) và **kube-proxy** (định tuyến mạng).
- Một lệnh `kubectl` đi qua **sáu bước**: API server ghi vào etcd → Deployment controller → ReplicaSet controller tạo Pod **chưa có node** → **scheduler** gán node → **kubelet** chạy container → **kube-proxy** cập nhật mạng.
- **Không thành phần nào nói chuyện trực tiếp với nhau** — tất cả qua API server. Nhờ vậy thêm được controller mới mà không sửa lõi Kubernetes.
- Mỗi trạng thái Pod chỉ về đúng một thành phần: **`Pending` → scheduler**, **`ContainerCreating` → kubelet**, **`Running` mà không có traffic → kube-proxy/Service**. Biết bảng này thì gỡ lỗi nhanh hơn nhiều.
- **Đọc log ứng dụng khi Pod `Pending` là vô ích** — container chưa được tạo.
- **Mất control plane không làm ứng dụng chết**; nó chỉ mất khả năng **thay đổi** (tạo Pod, scale, failover). Nghiêm trọng nhưng không phải ngừng dịch vụ ngay.

---

**Bài kế tiếp** → [Bài 4: Thuật Ngữ Quan Trọng & Tổng Kết Phase 11](04-thuat-ngu-va-tong-ket.md)
