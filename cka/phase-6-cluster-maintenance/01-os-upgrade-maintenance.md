# Bài 1: OS Upgrade & Cluster Maintenance

## Vì sao bài này quan trọng?

CKA test rất nhiều phần cluster maintenance:
- Node cần OS patch → tạm down → đảm bảo app không sập.
- Cluster cần upgrade K8s version → workflow đúng quy trình.
- Backup etcd để restore khi disaster.

Bài này dạy `drain`, `cordon`, `uncordon` — kỹ năng cốt lõi cho task maintenance.

## Khi node down — Điều gì xảy ra?

```text
[Cluster: 3 node, mỗi node có Pod]

Node-1 đột nhiên down:
        │
        ▼ apiserver thấy mất heartbeat (qua kubelet)
        │
        │ Đợi 40s — vẫn không heartbeat → mark NotReady
        │
        │ Đợi 5 phút thêm (tolerationSeconds default 300s)
        │
        ▼
   Pod trên node-1 bị mark "đẩy" (NoExecute taint áp dụng)
        │
        ▼
   - Pod trong ReplicaSet/Deployment → tạo lại trên node khác
   - Pod đơn (standalone) → BIẾN MẤT (không có gì tạo lại)
```

→ Tổng thời gian: **~5 phút 40 giây** mới migrate.

## Workflow modern (modern K8s)

K8s hiện tại dùng **taint-based eviction**:

```text
Node NotReady → áp taint node.kubernetes.io/not-ready:NoExecute
Pod không tolerate → bị evict sau tolerationSeconds (default 300s)
```

Pod được set toleration tự động:
```yaml
tolerations:
  - key: node.kubernetes.io/not-ready
    operator: Exists
    effect: NoExecute
    tolerationSeconds: 300         # 5 phút
  - key: node.kubernetes.io/unreachable
    operator: Exists
    effect: NoExecute
    tolerationSeconds: 300
```

→ Đó là tại sao 5 phút mới migrate.

## Vấn đề: Nếu node không bao giờ lên lại?

Standalone Pod (không trong ReplicaSet) → **mất luôn**. Không ai tạo lại.

→ Luôn dùng **Deployment / ReplicaSet** cho workload critical.

## Cordon — Mark node unschedulable

```bash
kubectl cordon worker-1
# node/worker-1 cordoned
```

Hiệu ứng:
- Pod **đang chạy** trên node → vẫn chạy.
- Pod **mới** không được schedule lên node này.

```bash
kubectl get nodes
# NAME       STATUS                     ROLES   AGE   VERSION
# master     Ready                      ...
# worker-1   Ready,SchedulingDisabled   ...     ← cordoned
# worker-2   Ready                      ...
```

→ Use case: muốn drain dần, hoặc bảo trì sắp tới — không cho Pod mới vào.

## Drain — Evict tất cả Pod khỏi node

```bash
kubectl drain worker-1
# node/worker-1 cordoned
# evicting pod default/nginx-abc12
# evicting pod default/redis-def34
# ...
```

Hiệu ứng:
- Node bị **cordon** (như `kubectl cordon`).
- Pod trên node bị **gracefully terminate** (signal SIGTERM, đợi terminationGracePeriodSeconds).
- Pod được **tạo lại trên node khác** (nếu trong Deployment/ReplicaSet).

→ Use case: trước khi shutdown/upgrade node.

### Flag thường dùng

```bash
# Ignore DaemonSet (default fail nếu có DS)
kubectl drain worker-1 --ignore-daemonsets

# Force xoá Pod standalone (không trong RS/Deploy)
kubectl drain worker-1 --force

# Delete Pod có emptyDir volume
kubectl drain worker-1 --delete-emptydir-data

# Combo full
kubectl drain worker-1 \
  --ignore-daemonsets \
  --delete-emptydir-data \
  --force
```

### Tại sao `--ignore-daemonsets` cần?

DaemonSet có Pod chạy mỗi node. Drain → DaemonSet controller sẽ tạo lại ngay → conflict. → Default drain fail.

`--ignore-daemonsets` bỏ qua DaemonSet Pod khi drain.

## Uncordon — Cho phép schedule lại

Sau khi xong maintenance:

```bash
kubectl uncordon worker-1
# node/worker-1 uncordoned
```

→ Node trở lại schedulable. Pod mới có thể vào.

**Lưu ý**: Pod đã migrate sang node khác **không tự về**. Scheduler chỉ chọn node này khi:
- Có Pod mới tạo.
- Pod cũ bị xoá → recreate có thể chọn node này.

## Workflow OS upgrade chuẩn

```text
[Step 1] Drain node sắp upgrade
   kubectl drain worker-1 --ignore-daemonsets

[Step 2] SSH vào node, làm maintenance
   ssh worker-1
   sudo apt update && sudo apt upgrade -y
   sudo reboot

[Step 3] Đợi node up + Ready
   kubectl get nodes -w

[Step 4] Uncordon
   kubectl uncordon worker-1

[Step 5] Verify Pod schedule lên node (kiểm tra DaemonSet, ...)
```

→ Lặp cho mỗi node. **Tránh drain tất cả cùng lúc** (cluster sẽ thiếu capacity).

## Pod Disruption Budget (PDB)

Drain có thể bị block nếu vi phạm **PodDisruptionBudget**:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: nginx-pdb
spec:
  minAvailable: 2              # luôn phải có >= 2 Pod
  # hoặc: maxUnavailable: 1
  selector:
    matchLabels:
      app: nginx
```

Khi drain:
- Nếu drain làm số Pod nginx < 2 → drain **block**.
- Bạn phải đợi Pod mới ready trên node khác trước khi drain tiếp.

→ Protect availability lúc maintenance. Mọi critical app nên có PDB.

## Kubernetes Releases

### Versioning

```text
Kubernetes version: MAJOR.MINOR.PATCH
                    1     .32   .0
                    │      │     │
                    │      │     └── Bug fix (mỗi vài tuần)
                    │      └────── New feature (mỗi 4 tháng)
                    └────────────  Major (chưa có Major 2)
```

| Stage | Đặc điểm |
|---|---|
| **Alpha** | Tag `vX.Y.0-alpha.N`. Buggy, off by default, có thể remove |
| **Beta** | Tag `vX.Y.0-beta.N`. Stable hơn, on by default |
| **Stable** | `vX.Y.0`. Production-ready |

K8s release cadence:
- **Minor release** (1.31, 1.32, 1.33): mỗi ~4 tháng.
- **Patch release**: mỗi 2-4 tuần.

K8s **support 3 minor version gần nhất**. Vd: 2025-04 release 1.33 → support 1.31, 1.32, 1.33.

### Quy tắc version skew

Components không phải cùng version. Skew cho phép:

```text
                                    Max higher                   Max lower
                                    than apiserver               than apiserver
                                    
kube-apiserver        (Y)             —                           —
controller-manager    (Y or Y-1)      0                           1 minor
scheduler             (Y or Y-1)      0                           1 minor
kubelet               (Y, Y-1, Y-2)   0                           2 minor
kube-proxy            (= kubelet)     0                           2 minor
kubectl               (Y+1, Y, Y-1)   1 minor                     1 minor
```

→ Quy tắc:
- **Không component nào > apiserver**.
- Controller-manager, scheduler: 1 minor lower.
- Kubelet, kube-proxy: 2 minor lower.
- kubectl: linh hoạt nhất (±1 minor).

→ Cho phép **rolling upgrade** thay vì stop tất cả.

## Cluster Upgrade Process

### Khi nào upgrade?

Khi cluster ở version cũ hơn **3 minor trước version mới nhất**:
- 1.33 ra → 1.30 hết support → cần upgrade.

→ Lý tưởng upgrade trước khi version cũ hết support.

### Upgrade từng minor một

```text
1.30 → 1.33

Sai: 1.30 → 1.33 (skip 1.31, 1.32)
Đúng: 1.30 → 1.31 → 1.32 → 1.33
```

Mỗi step: full process apiserver + controller + scheduler + kubelet + kube-proxy.

### Tổng quan workflow

```text
[Step 1] Upgrade Master (control plane) node
   apiserver, scheduler, controller-manager
   ↓ (briefly down)
   - Pod đang chạy trên worker vẫn chạy
   - kubectl không dùng được
   - Không deploy/modify Pod mới được
   - Pod fail không được recreate (vì controller down)

[Step 2] Upgrade Worker nodes
   Strategy:
   A) All at once → downtime
   B) One at a time → rolling (preferred)
   C) Add new nodes, drain old → blue/green (cloud)
```

### Strategy B: Rolling upgrade

```text
3 worker nodes (cũ: 1.30):
worker-1, worker-2, worker-3

Drain worker-1 → Pod đi worker-2 + worker-3
Upgrade worker-1 → restart kubelet 1.31
Uncordon worker-1

Drain worker-2 → Pod đi worker-1 (đã 1.31) + worker-3
Upgrade worker-2
Uncordon worker-2

Drain worker-3 → Pod đi worker-1 + worker-2 (đã 1.31)
Upgrade worker-3
Uncordon worker-3

Done — cluster ở 1.31
```

→ **Zero downtime** nếu PDB OK và đủ capacity.

## kubeadm upgrade (lệnh cụ thể)

### Step 0: Upgrade kubeadm trên master

```bash
# Cài version mới của kubeadm (vd 1.31)
sudo apt-mark unhold kubeadm
sudo apt update
sudo apt install -y kubeadm=1.31.0-00
sudo apt-mark hold kubeadm

kubeadm version
# version.Info{Major:"1", Minor:"31", ...}
```

### Step 1: Plan upgrade

```bash
sudo kubeadm upgrade plan
# Output:
# Upgrade to the latest stable version:
# COMPONENT                 CURRENT   TARGET
# kube-apiserver            v1.30.0   v1.31.0
# kube-controller-manager   v1.30.0   v1.31.0
# kube-scheduler            v1.30.0   v1.31.0
# kube-proxy                v1.30.0   v1.31.0
# CoreDNS                   v1.11.1   v1.11.3
# etcd                      3.5.12    3.5.15
#
# You can now apply the upgrade by executing:
#         kubeadm upgrade apply v1.31.0
```

### Step 2: Apply upgrade master

```bash
sudo kubeadm upgrade apply v1.31.0
# [upgrade/...] Pre-upgrade checks...
# [upgrade/version] Upgrading to v1.31.0
# ...
# SUCCESS! Your cluster was upgraded to "v1.31.0".
```

→ Updates: apiserver, controller-manager, scheduler, kube-proxy (DaemonSet), CoreDNS. **Không** update kubelet.

### Step 3: Upgrade kubelet trên master

```bash
# Drain master (nếu master chạy workload)
kubectl drain master --ignore-daemonsets

# Upgrade kubelet + kubectl
sudo apt-mark unhold kubelet kubectl
sudo apt install -y kubelet=1.31.0-00 kubectl=1.31.0-00
sudo apt-mark hold kubelet kubectl

# Restart kubelet
sudo systemctl daemon-reload
sudo systemctl restart kubelet

# Uncordon
kubectl uncordon master
```

### Step 4: Upgrade worker nodes (lặp cho mỗi worker)

```bash
# Trên master, drain worker-1
kubectl drain worker-1 --ignore-daemonsets --delete-emptydir-data

# SSH vào worker-1
ssh worker-1

# Upgrade kubeadm
sudo apt-mark unhold kubeadm
sudo apt install -y kubeadm=1.31.0-00
sudo apt-mark hold kubeadm

# Upgrade node config (worker không có control plane)
sudo kubeadm upgrade node

# Upgrade kubelet + kubectl
sudo apt-mark unhold kubelet kubectl
sudo apt install -y kubelet=1.31.0-00 kubectl=1.31.0-00
sudo apt-mark hold kubelet kubectl

sudo systemctl daemon-reload
sudo systemctl restart kubelet

# Back to master, uncordon
kubectl uncordon worker-1

# Lặp cho worker-2, worker-3
```

### Verify

```bash
kubectl get nodes
# NAME       STATUS   ROLES           AGE   VERSION
# master     Ready    control-plane   30d   v1.31.0
# worker-1   Ready    <none>          30d   v1.31.0
# worker-2   Ready    <none>          30d   v1.31.0
# worker-3   Ready    <none>          30d   v1.31.0
```

→ Mọi node ở 1.31.0. Sẵn sàng next upgrade (1.32 → 1.33).

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Drain mà không `--ignore-daemonsets` | Fail | Add flag |
| Drain master mà master cũng chạy workload | Stuck | `--force --ignore-daemonsets` |
| Quên uncordon sau drain | Node mãi không nhận Pod | `kubectl uncordon` |
| Skip minor version (1.30 → 1.33) | kubeadm refuse | Upgrade từng minor 1 lần |
| Upgrade kubelet trước control plane | Version skew vi phạm | Control plane trước |
| Pod standalone bị evict mất luôn | Workload biến mất | Luôn dùng Deployment |
| Không có PDB → drain killed quá nhiều Pod | Downtime app | Set PDB cho critical app |
| Drain Pod có local data (emptyDir) | Mất data | Backup trước, dùng PV thay |

## Quick reference

```bash
# Maintenance
kubectl cordon <node>                              # mark unschedulable
kubectl drain <node> --ignore-daemonsets           # evict Pods + cordon
kubectl drain <node> --ignore-daemonsets --delete-emptydir-data --force
kubectl uncordon <node>                            # cho phép schedule lại

# Status node
kubectl get nodes
kubectl describe node <node>

# Version
kubectl version --short
kubectl get nodes -o wide

# Upgrade kubeadm
sudo kubeadm upgrade plan
sudo kubeadm upgrade apply v1.31.0
sudo kubeadm upgrade node                          # cho worker

# PDB
apiVersion: policy/v1
kind: PodDisruptionBudget
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: nginx
```

## Tóm tắt bài 1

- Node down → Pod migrate sau **5 phút 40s** (default).
- Pod standalone (không RS/Deploy) **mất luôn** khi node die.
- **cordon** = unschedulable. **drain** = cordon + evict Pod. **uncordon** = enable lại.
- Drain cần `--ignore-daemonsets` (DS tự tạo lại Pod).
- **PDB** protect availability lúc drain — bắt buộc cho critical app.
- K8s release: **3 minor version** được support cùng lúc.
- Version skew: kubelet/proxy tối đa **2 minor below** apiserver.
- Upgrade: từng minor 1, theo thứ tự master trước, worker sau.
- `kubeadm upgrade plan` + `kubeadm upgrade apply` cho control plane. Kubelet upgrade riêng.

**Bài kế tiếp** → [Bài 2: Backup & Restore ETCD](02-backup-restore-etcd.md)
