# Bài 1: Kiến trúc cluster Kubernetes

## Vì sao phải hiểu kiến trúc trước khi gõ kubectl?

Trong kỳ thi CKA, có 30% điểm là **troubleshooting** — tức là cluster đang lỗi, bạn phải sửa. Không hiểu kiến trúc → không biết bắt đầu từ đâu khi `kubectl get nodes` báo `NotReady`. Không biết đâu là controller, đâu là kubelet → không biết check log component nào.

Bài này build mô hình tinh thần (mental model) về cluster K8s. Đây là **nền tảng cho mọi bài sau** — đầu tư hiểu kỹ ở đây tiết kiệm hàng giờ debug sau này.

## Mục đích của Kubernetes là gì?

> **Kubernetes** = nền tảng (platform) host application dưới dạng **container** một cách **tự động** — deploy, scale, restart, route traffic.

Hình dung: bạn có 100 microservice, mỗi cái cần chạy 5 instance trên 50 server. Manual mà:
- Server nào chạy service nào?
- Server chết → app phải tự move sang server khác.
- Deploy version mới → cần rolling update không downtime.
- Traffic phải tự load balance.

K8s tự lo hết. Việc của bạn: **khai báo** "tôi muốn 5 instance nginx" — K8s lo phần còn lại.

## Hình ảnh ẩn dụ: Cảng container và đội tàu

Mumshad (tác giả khoá) dùng analogy này xuyên suốt course — đáng học thuộc:

```text
        Control Ships (tàu chỉ huy)              Cargo Ships (tàu hàng)
        ─────────────────────────                ──────────────────────
        Không chở container.                     Chở container thực.
        Quản lý toàn bộ đội tàu:                Mỗi tàu có Captain
        - Văn phòng điều phối                    (kubelet) chịu trách
        - Cẩu chuyển container                   nhiệm load container.
        - Sổ ghi chép (database)                 Báo cáo lên control ship.
        - Bộ phận sửa chữa
                  │
                  ▼
        Trong K8s:                              Trong K8s:
        = Master Node                           = Worker Node
        = Control Plane                         = Data Plane
```

Trong K8s thật, cũng có **2 loại node**:
- **Master Node** (control plane): điều phối, không chạy app user.
- **Worker Node**: chạy app user (container).

## Sơ đồ kiến trúc tổng quan

```text
┌──────────────────────────────────────────────────────────────┐
│                     MASTER NODE (Control Plane)              │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌──────────┐│
│  │  etcd    │  │  kube-   │  │ kube-        │  │  kube-   ││
│  │ (DB)     │  │ apiserver│  │ controller-  │  │scheduler ││
│  │          │  │          │  │ manager      │  │          ││
│  └──────────┘  └──────────┘  └──────────────┘  └──────────┘│
│                      ▲                                       │
│                      │ tất cả component khác nói chuyện      │
│                      │ qua API server                        │
└──────────────────────┼───────────────────────────────────────┘
                       │
                       │ HTTPS (port 6443)
        ┌──────────────┼──────────────┐
        │              │              │
┌───────▼──────┐ ┌────▼──────┐ ┌────▼──────┐
│ WORKER NODE 1│ │ WORKER 2  │ │ WORKER 3  │
│              │ │           │ │           │
│ ┌──────────┐ │ │ ┌───────┐ │ │ ┌───────┐ │
│ │ kubelet  │ │ │ │kubelet│ │ │ │kubelet│ │
│ ├──────────┤ │ │ ├───────┤ │ │ ├───────┤ │
│ │kube-proxy│ │ │ │k-proxy│ │ │ │k-proxy│ │
│ ├──────────┤ │ │ ├───────┤ │ │ ├───────┤ │
│ │container │ │ │ │runtime│ │ │ │runtime│ │
│ │ runtime  │ │ │ │       │ │ │ │       │ │
│ │(containerd)│ │ │       │ │ │ │       │ │
│ └──────────┘ │ │ └───────┘ │ │ └───────┘ │
│              │ │           │ │           │
│  Pod  Pod    │ │  Pod  Pod │ │  Pod      │
│  ▢▢   ▢▢    │ │  ▢▢   ▢▢ │ │  ▢▢       │
└──────────────┘ └───────────┘ └───────────┘
```

Mọi component ở control plane đều **giao tiếp qua kube-apiserver**. Đây là điểm trung tâm — sửa apiserver = sửa được toàn bộ cluster, apiserver chết = cluster bất động.

## Control Plane Components (chi tiết)

### 1. etcd — Cơ sở dữ liệu của cluster

```text
etcd = distributed key-value store, lưu MỌI state của cluster
```

Mọi thứ bạn tạo (Pod, Service, ConfigMap, Secret, Node info, ...) đều được lưu vào etcd. Ví dụ:

```text
Key: /registry/pods/default/nginx-7c5b...
Value: {pod spec đầy đủ, status, IP, node được schedule...}
```

**Đặc điểm**:
- **Distributed** — chạy nhiều node để HA (3 hoặc 5 node).
- **Strongly consistent** — dùng Raft consensus.
- **Port 2379** (client), **2380** (peer).

**Tại sao quan trọng**: etcd corrupt = mất toàn bộ state cluster. Mọi backup chính sách phải bao gồm backup etcd. Bài sau sẽ chi tiết.

### 2. kube-apiserver — Cổng giao tiếp duy nhất

```text
kube-apiserver = RESTful API server, là entry point cho mọi tương tác
```

Khi bạn gõ `kubectl get pods`:

```text
kubectl → HTTPS request → kube-apiserver:6443
                              │
                              ▼
                         Authenticate user
                              │
                              ▼
                         Authorize (RBAC)
                              │
                              ▼
                         Validate request
                              │
                              ▼
                         Read/write etcd
                              │
                              ▼
                         Response về kubectl
```

Mọi component khác (scheduler, controller-manager, kubelet) **không đọc etcd trực tiếp** — đều qua apiserver. Pattern: API server là **single source of truth**.

**Port**: 6443 (HTTPS).

### 3. kube-scheduler — Quyết định Pod chạy ở đâu

```text
Scheduler = thuật toán chọn worker node phù hợp để chạy Pod mới
```

Khi tạo Pod chưa được assign node, scheduler quan sát:
- Node nào còn đủ CPU + RAM?
- Pod yêu cầu taint/toleration nào?
- Có nodeAffinity / nodeSelector không?
- Có Pod khác cùng app cần spread không (anti-affinity)?

Sau đó **chọn 1 node phù hợp nhất** và update Pod object với `nodeName`. Kubelet trên node đó sẽ pull Pod và chạy.

**Điều quan trọng**: Scheduler **không tự chạy container**. Nó chỉ **gán Pod → Node**. Kubelet trên node mới thực sự chạy.

### 4. kube-controller-manager — Người gác quy luật

```text
Controller-manager = chạy nhiều controller cùng lúc, mỗi controller đảm bảo 1 quy luật
```

Các controller chính:

| Controller | Quy luật đảm bảo |
|---|---|
| **Node Controller** | Theo dõi node, mark NotReady nếu node mất kết nối 40s |
| **Replication Controller** | Đảm bảo số replica của ReplicaSet luôn = desired |
| **Endpoint Controller** | Cập nhật Endpoints object khi Pod thay đổi |
| **Service Account Controller** | Tạo ServiceAccount mặc định cho namespace mới |
| **Deployment Controller** | Manage Deployment, tạo/xoá ReplicaSet khi rollout |
| **Job/CronJob Controller** | Manage Job và CronJob |
| ... | (hàng chục controller khác) |

**Cách hoạt động**: Mỗi controller chạy vòng lặp **reconciliation**:

```text
while True:
    desired_state = đọc từ apiserver
    current_state = đọc từ apiserver
    if desired_state != current_state:
        thực hiện hành động đưa current về desired
    sleep(N giây)
```

Đây là **trái tim của K8s** — declarative model. Bạn declare desired state, controller tự lo đưa cluster về state đó.

## Worker Node Components

### 1. kubelet — Agent trên mỗi node

```text
kubelet = "Captain" trên node, agent giao tiếp với apiserver, manage container
```

Chức năng:
- **Đăng ký** node với cluster khi start.
- **Watch** apiserver xem có Pod nào được assign cho node này không.
- **Pull image** + tạo container qua container runtime.
- **Báo cáo status** Pod/Node lên apiserver.
- **Chạy probes** (liveness/readiness) để check Pod health.

Một số fact quan trọng:
- Kubelet **không chạy trong container**. Nó là **systemd service** trên host OS.
- Kubelet chỉ manage **Pod** — không quản lý ReplicaSet/Deployment trực tiếp (đó là việc của controller).

### 2. kube-proxy — Network rules cho Service

```text
kube-proxy = thiết lập iptables/IPVS rules để Pod giao tiếp qua Service
```

Khi tạo Service ClusterIP `10.96.0.5:80` → traffic vào IP đó phải được route đến đúng Pod backend. Kube-proxy:

- Watch apiserver cho mọi Service + Endpoint thay đổi.
- Cập nhật **iptables rules** (mặc định) hoặc **IPVS** trên node.
- Khi packet đến `10.96.0.5:80` → iptables DNAT về IP Pod thật.

**Không phải load balancer thực**. Chỉ là network rules. Load balancing thực tế do iptables/IPVS random chọn Pod.

### 3. Container Runtime — Chạy container thật

```text
Container Runtime = software thực sự pull image + chạy container
```

K8s không tự chạy container — uỷ thác cho **container runtime**:

| Runtime | Trạng thái 2025 |
|---|---|
| **containerd** | **Mặc định**, phổ biến nhất |
| **CRI-O** | Phổ biến cho OpenShift |
| **Docker** | **Deprecated** từ K8s 1.24 (bài kế tiếp sẽ giải thích) |
| Mirantis (dockershim) | Alternative cho Docker, ít dùng |

Mọi runtime đều phải tuân thủ **CRI** (Container Runtime Interface) — chuẩn API mà kubelet gọi.

## Master + Worker có thể cùng trên 1 host không?

Có. Trong môi trường lab/dev (Minikube, kind):

```text
Single-node cluster:
┌────────────────────────────────┐
│       1 host duy nhất          │
│  ┌──────────────────────────┐  │
│  │ Control plane components │  │
│  └──────────────────────────┘  │
│  ┌──────────────────────────┐  │
│  │ Worker components        │  │
│  │ + chạy Pod user          │  │
│  └──────────────────────────┘  │
└────────────────────────────────┘
```

Trong production, **luôn tách**:
- 1-3 master node (HA).
- N worker node (scale theo workload).

Tại sao tách? Tránh app user chiếm hết CPU/RAM của master → control plane chậm → cluster bất ổn.

## Mapping: Component nào ở node nào?

| Component | Master | Worker |
|---|---|---|
| etcd | ✓ (thường master hoặc cluster riêng) | ✗ |
| kube-apiserver | ✓ | ✗ |
| kube-scheduler | ✓ | ✗ |
| kube-controller-manager | ✓ | ✗ |
| kubelet | ✓ (nếu master chạy Pod) | **✓ (luôn có)** |
| kube-proxy | ✓ (nếu master chạy Pod) | **✓ (luôn có)** |
| container runtime | ✓ (cần để chạy control plane Pod) | **✓ (luôn có)** |

**Lưu ý**: Trong kubeadm-installed cluster, **control plane component cũng chạy dưới dạng Pod** (static Pod) → master cũng có kubelet để manage những Pod đó. Bài về kubeadm phase 11 sẽ giải thích.

## Cách verify cluster của bạn

Sau khi cluster setup, các lệnh đầu tiên để verify:

```bash
# Liệt kê node
kubectl get nodes
# NAME         STATUS   ROLES           AGE   VERSION
# master       Ready    control-plane   1d    v1.30.0
# worker-1     Ready    <none>          1d    v1.30.0
# worker-2     Ready    <none>          1d    v1.30.0

# Chi tiết node (xem version kubelet, runtime, OS, ...)
kubectl describe node worker-1

# Liệt kê control plane Pod (chạy trong namespace kube-system)
kubectl get pods -n kube-system
# NAME                             READY   STATUS    AGE
# etcd-master                      1/1     Running   1d
# kube-apiserver-master            1/1     Running   1d
# kube-controller-manager-master   1/1     Running   1d
# kube-scheduler-master            1/1     Running   1d
# kube-proxy-xxxxx                 1/1     Running   1d  (DaemonSet)
# kube-proxy-yyyyy                 1/1     Running   1d  (DaemonSet)
```

Trong exam CKA, bạn sẽ được hỏi: "How many nodes are in the cluster?", "What's the kubelet version on worker-2?", "Which container runtime is being used?" — đáp án đều qua các lệnh trên.

## Khi nào kiến trúc này hỏng

| Triệu chứng | Component nghi vấn | Cách check |
|---|---|---|
| `kubectl` báo `connection refused` | apiserver chết | SSH master, `systemctl status kubelet`, check log apiserver |
| Node `NotReady` | Kubelet trên node đó chết | SSH node, `systemctl status kubelet`, `journalctl -u kubelet` |
| Pod tạo nhưng không schedule | Scheduler chết hoặc no node fit | `kubectl describe pod` xem Events |
| Pod chạy nhưng không reach qua Service | kube-proxy lỗi hoặc CNI lỗi | Check `iptables -L`, kube-proxy log |
| Deploy xong nhưng replica không tăng | controller-manager chết | Check log controller-manager Pod |
| Cluster đột nhiên không nhớ resource | etcd hỏng/data lost | Check etcd Pod log + backup |

Pattern troubleshoot: **Hiểu component nào lo việc gì** → biết check ở đâu. Đây là kỹ năng được test nặng trong CKA.

## Tóm tắt bài 1

- Cluster K8s = **Control Plane** (master) + **Data Plane** (worker).
- Control Plane: **etcd** (DB), **kube-apiserver** (cổng vào), **kube-scheduler** (chọn node), **kube-controller-manager** (đảm bảo state).
- Worker: **kubelet** (agent), **kube-proxy** (network), **container runtime** (chạy container thật).
- Mọi component khác **chỉ giao tiếp qua apiserver** — apiserver là single source of truth.
- Controller chạy **reconciliation loop** — declarative model là cốt lõi K8s.
- Hiểu component nào lo việc gì → debug được khi cluster hỏng.

**Bài kế tiếp** → [Bài 2: Docker vs ContainerD — vì sao Docker bị deprecated](02-container-runtime-docker-containerd.md)
