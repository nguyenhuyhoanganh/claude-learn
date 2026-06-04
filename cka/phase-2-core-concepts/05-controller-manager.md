# Bài 5: Controller Manager — Người gác quy luật của cluster

## Vì sao K8s "declarative" hoạt động được?

Bạn khai báo `replicas: 3` trong Deployment → K8s đảm bảo **luôn có 3 Pod chạy**. Một Pod chết → cái mới được tạo ngay. Node die → Pod migrate sang node khác.

Ai làm việc đó? Không phải apiserver (apiserver chỉ lưu state). Không phải kubelet (kubelet chỉ chạy Pod được assign). Không phải scheduler (scheduler chỉ chọn node).

→ Đó là **controller-manager** — gồm hàng chục controller, mỗi cái lo 1 quy luật.

## Controller là gì?

> **Controller** = process chạy vòng lặp `reconciliation loop`, **liên tục so sánh** desired state với current state, và **thực hiện hành động** đưa current về desired.

```text
while True:
    desired_state = đọc từ apiserver       (vd: "replicas: 3")
    current_state = đọc từ apiserver       (vd: "đang có 2 pod")
    
    if desired_state != current_state:
        thực hiện hành động đưa current về desired
        (vd: tạo thêm 1 pod)
    
    sleep(N giây hoặc đợi event)
```

Đây là **pattern cốt lõi của K8s** — gọi là **declarative model** (khai báo) đối ngược với **imperative model** (ra lệnh).

## So sánh declarative vs imperative

| | Imperative | Declarative (K8s) |
|---|---|---|
| Cách nghĩ | "Tạo cho tôi 3 Pod" → ra lệnh từng bước | "Tôi muốn có 3 Pod" → khai báo state |
| Khi Pod chết | Bạn phải gõ lệnh tạo lại | Controller tự tạo lại |
| Khi node mất | Bạn phải migrate tay | Controller tự migrate |
| Phù hợp với | Script Bash, manual ops | **Cloud-native, K8s** |

→ Đây là vì sao K8s mạnh: bạn chỉ cần khai báo "muốn gì" — controller tự lo "làm thế nào".

## Hàng chục controller trong K8s

Mỗi resource type có **controller riêng** đảm bảo quy luật của nó:

| Controller | Quy luật đảm bảo |
|---|---|
| **Node Controller** | Track health node, evict Pod khi node die |
| **Replication Controller / ReplicaSet Controller** | Đảm bảo `replicas` của ReplicaSet luôn đúng |
| **Deployment Controller** | Manage rollout/rollback, tạo/xoá ReplicaSet |
| **DaemonSet Controller** | Đảm bảo mỗi node có 1 Pod (cho log collector, ...) |
| **StatefulSet Controller** | Manage StatefulSet (DB, message queue cần ordered) |
| **Job Controller** | Đảm bảo Job chạy đến hoàn thành |
| **CronJob Controller** | Tạo Job theo lịch cron |
| **Endpoint Controller** | Update Endpoints khi Pod thay đổi (cho Service routing) |
| **EndpointSlice Controller** | Quản lý EndpointSlice (thay thế Endpoints cho lớn) |
| **Service Account Controller** | Tạo SA mặc định cho namespace mới |
| **Token Controller** | Tạo + manage token cho ServiceAccount |
| **Namespace Controller** | Cleanup resource khi xoá namespace |
| **PV Controller / PVC Controller** | Bind PV ↔ PVC, manage volume lifecycle |
| **Horizontal Pod Autoscaler** | Scale ReplicaSet theo CPU/memory metric |
| **Garbage Collector** | Xoá orphan resource (vd: ReplicaSet xoá → Pod cũng xoá) |
| ... (30+ controller khác) | ... |

Tất cả gói trong **1 binary** = `kube-controller-manager`.

## Node Controller — Ví dụ chi tiết

Node Controller là controller phức tạp nhất. Cách hoạt động:

```text
[Mỗi 5 giây]
└── Đọc heartbeat từ mọi node (kubelet ping apiserver mỗi 10s)
        │
        ├── Node có heartbeat → status: Ready
        │
        └── Node không có heartbeat:
              │
              ├── Sau 40 giây không heartbeat:
              │     └── Mark node "NotReady" (Unreachable)
              │
              └── Sau 5 phút (300s) vẫn NotReady:
                    └── Evict các Pod trên node đó
                          → Controller khác (vd ReplicaSet) tạo Pod
                            mới trên node healthy
```

Các tham số quan trọng (cấu hình qua flag controller-manager):

```text
--node-monitor-period=5s         (period check heartbeat)
--node-monitor-grace-period=40s  (đợi 40s mới mark NotReady)
--pod-eviction-timeout=5m        (5 phút mới evict)
```

→ Nếu cluster của bạn **mất node 5 phút** mới migrate Pod → đó là **theo thiết kế**. Có thể tune nhỏ hơn cho recovery nhanh hơn, nhưng phải cân nhắc false positive (network glitch).

## Replication Controller — Pattern điển hình

```text
ReplicaSet spec: replicas=3

Controller loop:
1. Đếm số Pod đang chạy với label match selector
2. Nếu < 3: tạo thêm Pod (tới 3)
3. Nếu > 3: xoá Pod (xuống 3)
4. Lặp lại

Khi 1 Pod chết:
- Pod chết → kubelet báo lên apiserver "Pod gone"
- ReplicaSet controller WATCH event này → thấy số Pod = 2
- Tạo Pod mới (template từ ReplicaSet) → apiserver
- Scheduler chọn node → apiserver
- Kubelet chạy → status Running
- Trở về 3 Pod
```

Mỗi bước qua **apiserver**. Controller không can thiệp trực tiếp vào etcd hay node.

## Tại sao gói tất cả vào 1 binary?

Lúc đầu K8s có **mỗi controller 1 binary** — phức tạp, khó deploy. Sau hợp nhất vào `kube-controller-manager`. Benefit:

- 1 process, 1 service, 1 log file → dễ vận hành.
- Share connection đến apiserver → giảm overhead.
- HA: 3 master → 3 controller-manager. **Chỉ 1 active** (leader election) — 2 còn lại standby.

## Leader Election — Đảm bảo chỉ 1 active

Nếu chạy 3 controller-manager trên 3 master → 3 cái cùng tạo Pod mới → có thể tạo 6 Pod thay vì 3 (race condition).

Giải pháp: **leader election**. Mỗi controller-manager tranh nhau **lock** trong etcd:

```text
Master 1: try acquire lock "controller-manager-leader"
Master 2: try acquire lock "controller-manager-leader"
Master 3: try acquire lock "controller-manager-leader"

Chỉ 1 thắng (vd Master 1) → trở thành leader → chạy mọi controller
Master 2, 3: standby (vẫn process nhưng không action)

Mỗi 15s: leader phải renew lock
Nếu leader chết → lock expire sau 15s → master 2/3 tranh lại
```

→ Failover trong **15-30 giây** nếu leader die.

Check leader hiện tại:
```bash
kubectl get lease -n kube-system kube-controller-manager
# NAME                       HOLDER       AGE
# kube-controller-manager    master-1     5d
```

## Cấu hình controller-manager

### Trong cluster kubeadm

Static Pod:
```bash
sudo cat /etc/kubernetes/manifests/kube-controller-manager.yaml
```

Flag quan trọng:

```yaml
spec:
  containers:
  - command:
    - kube-controller-manager
    
    # === Kết nối apiserver ===
    - --kubeconfig=/etc/kubernetes/controller-manager.conf
    
    # === Service account signing key ===
    - --service-account-private-key-file=/etc/kubernetes/pki/sa.key
    - --root-ca-file=/etc/kubernetes/pki/ca.crt
    
    # === Cluster signing (cho certificate request) ===
    - --cluster-signing-cert-file=/etc/kubernetes/pki/ca.crt
    - --cluster-signing-key-file=/etc/kubernetes/pki/ca.key
    
    # === CIDR cho Pod ===
    - --cluster-cidr=10.244.0.0/16
    - --service-cluster-ip-range=10.96.0.0/12
    - --allocate-node-cidrs=true
    
    # === Controllers enabled ===
    - --controllers=*,bootstrapsigner,tokencleaner
    
    # === Leader election ===
    - --leader-elect=true
    
    # === Node controller tuning ===
    - --node-monitor-period=5s
    - --node-monitor-grace-period=40s
    - --pod-eviction-timeout=5m
```

### Trong cluster scratch

systemd service:
```bash
systemctl status kube-controller-manager
journalctl -u kube-controller-manager -f
cat /etc/systemd/system/kube-controller-manager.service
```

## `--controllers` flag — Bật/tắt controller cụ thể

```text
--controllers=*                        (mặc định, bật tất cả)
--controllers=*,-deployment            (bật tất, trừ deployment)
--controllers=replicationcontroller,deployment   (chỉ bật 2 cái)
```

Use case hiếm: disable certain controller khi debug hoặc tạo custom controller thay thế.

## Troubleshoot khi controller không hoạt động

Triệu chứng phổ biến:

| Triệu chứng | Component nghi vấn |
|---|---|
| Deployment tạo nhưng Pod không có | Deployment controller hoặc ReplicaSet controller |
| Node die nhưng Pod không migrate | Node controller |
| Service tạo nhưng không có endpoint | Endpoint controller |
| Namespace xoá nhưng resource bên trong còn | Namespace controller |
| Job chạy hoài không xong | Job controller |
| PVC stuck `Pending` | PV Controller |

→ Check controller-manager log:
```bash
kubectl logs -n kube-system kube-controller-manager-master | tail -100
# Hoặc:
sudo crictl logs <controller-manager-container-id>
```

Tìm error trong log. Thường thấy:
- Connection refused → apiserver có vấn đề.
- RBAC denied → quyền chưa đủ (hiếm với controller).
- TLS error → cert hết hạn.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Tweak `--pod-eviction-timeout` quá thấp (vd 30s) | Pod evict khi network glitch tạm | Để default 5m hoặc test kỹ |
| Disable controller nào đó cho "performance" | Resource sẽ không reconcile | Đừng disable trừ khi biết hậu quả |
| HA với 3 controller-manager nhưng không enable leader-elect | Race condition, action trùng | `--leader-elect=true` (mặc định) |
| Sửa manifest controller-manager không backup | Khó rollback khi sai | `cp file file.bak` trước |
| Quên restart sau update config | Config mới không có hiệu lực | Kubelet auto-restart static Pod khi manifest đổi (kubeadm) |

## Tóm tắt bài 5

- **Controller-manager** = bundle hàng chục controller, mỗi cái lo 1 quy luật resource.
- **Reconciliation loop**: liên tục so sánh desired vs current, action để cân bằng.
- **Declarative model**: bạn khai báo desired, controller tự lo cách thực hiện.
- **Node controller**: 40s grace + 5 phút eviction timeout (default).
- **Leader election** qua lease trong etcd — chỉ 1 controller-manager active dù chạy 3.
- Config: `/etc/kubernetes/manifests/kube-controller-manager.yaml` (kubeadm) hoặc systemd (scratch).
- Khi resource không reconcile như mong đợi → check log controller-manager.

**Bài kế tiếp** → [Bài 6: Scheduler — Quyết định Pod chạy ở đâu](06-scheduler.md)
