# Bài 6: Kube-Scheduler — Quyết định Pod chạy ở đâu

## Vai trò CHÍNH XÁC của Scheduler

Tên "scheduler" gây hiểu nhầm. Scheduler **không thực sự chạy Pod**. Nó chỉ **chọn node** cho Pod và update apiserver.

```text
[Workflow tạo Pod]
1. User: kubectl create pod nginx
        ▼
2. apiserver: lưu Pod object với nodeName="" (rỗng)
        ▼
3. Scheduler watch apiserver:
   - Thấy Pod mới, nodeName=""
   - Chọn node phù hợp (vd: worker-2)
   - PATCH apiserver: set nodeName="worker-2"
        ▼
4. Kubelet trên worker-2 watch apiserver:
   - Thấy Pod được assign cho mình
   - Chạy Pod (pull image, start container)
        ▼
5. Pod Running
```

→ Scheduler **chỉ chịu trách nhiệm cho bước 3**. Kubelet mới chạy Pod thật.

→ Nếu scheduler chết, Pod mới tạo sẽ **stuck Pending** (không có node assign). Pod đang chạy vẫn chạy bình thường.

## Vì sao K8s cần scheduler?

Cluster có nhiều node + nhiều Pod khác nhau:

```text
Cluster:
- Node A: 8 CPU, 16 GB RAM, label "ssd=true"
- Node B: 4 CPU, 8 GB RAM, label "gpu=true"
- Node C: 8 CPU, 32 GB RAM
- Node D: 4 CPU, 8 GB RAM, taint "production=true:NoSchedule"

Pods cần schedule:
- Pod 1: yêu cầu 2 CPU, 4 GB → nhiều node có thể nhận
- Pod 2: yêu cầu 6 CPU, GPU → chỉ B đủ GPU nhưng B chỉ có 4 CPU → fail
- Pod 3: yêu cầu SSD storage → A có ssd label
- Pod 4: yêu cầu production node → có toleration cho taint D
```

Scheduler giải quyết bài toán **matching constraint** này tự động. Bạn không phải gõ "Pod 1 chạy node C" — scheduler tự quyết.

## Thuật toán scheduling

Scheduler chạy mỗi Pod qua **2 giai đoạn**:

```text
┌──────────────────────────────────────────────────────┐
│  Tất cả nodes trong cluster (vd 10 node)             │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼
        ┌────────────────────┐
        │  GIAI ĐOẠN 1:      │  Loại bỏ node không phù hợp
        │  FILTERING         │  (vd: node thiếu CPU/RAM,
        │                    │   node có taint không match,
        │                    │   không match nodeSelector)
        └──────────┬─────────┘
                   │
                   ▼
        Còn lại 3 node feasible
                   │
                   ▼
        ┌────────────────────┐
        │  GIAI ĐOẠN 2:      │  Tính điểm 0-10 cho mỗi node
        │  SCORING           │  dựa trên các tiêu chí
        │                    │
        └──────────┬─────────┘
                   │
                   ▼
        Chọn node điểm cao nhất → assign Pod
```

### Giai đoạn 1: Filtering (lọc)

Scheduler check **predicate** trên mỗi node:

| Predicate | Logic |
|---|---|
| `PodFitsResources` | Node có đủ CPU + RAM cho Pod request? |
| `PodFitsHostPorts` | Pod yêu cầu host port → check port có sẵn |
| `MatchNodeSelector` | Pod có `nodeSelector` → check node match label |
| `MatchNodeAffinity` | Pod có nodeAffinity → check rules |
| `PodToleratesNodeTaints` | Pod có toleration cho mọi taint của node? |
| `CheckVolumeBinding` | PVC bind được vào volume node có không? |
| `CheckNodeMemoryPressure` | Node có MemoryPressure → reject (nếu Pod BestEffort) |
| `CheckNodeDiskPressure` | Node disk gần đầy → reject |
| ... |  |

Node fail bất kỳ predicate nào → **loại**.

### Giai đoạn 2: Scoring (chấm điểm)

Trong các node còn lại, scheduler **chấm điểm 0-10** mỗi node:

| Priority | Logic chấm điểm |
|---|---|
| `LeastRequestedPriority` | Node còn nhiều free CPU/RAM → điểm cao |
| `BalancedResourceAllocation` | Node có ratio CPU/RAM cân đối → điểm cao |
| `NodeAffinityPriority` | Match preferred (soft) affinity rule → điểm cộng |
| `InterPodAffinityPriority` | Có Pod cùng app gần → điểm cao (gom lại) hoặc thấp (spread) |
| `ImageLocalityPriority` | Node đã có image trong cache → điểm cao (pull nhanh) |
| `TaintTolerationPriority` | Match preferred taint → điểm cộng |
| ... |  |

Node điểm cao nhất → thắng. Nếu tie → random.

## Ví dụ minh hoạ

Pod cần `2 CPU, 4 GB RAM`:

```text
Cluster có 4 node:
- Node A: 1 CPU free, 8 GB free  → FILTER OUT (CPU < 2)
- Node B: 4 CPU free, 8 GB free  → Pass filter
- Node C: 6 CPU free, 4 GB free  → FILTER OUT (RAM < 4)
- Node D: 8 CPU free, 16 GB free → Pass filter

Scoring (LeastRequestedPriority):
- Node B sau khi đặt Pod: còn 2 CPU, 4 GB → score 5
- Node D sau khi đặt Pod: còn 6 CPU, 12 GB → score 9

Node D thắng → Pod assign Node D
```

→ Scheduler **không chỉ pick node đủ resource**, mà chọn node **tối ưu** theo điểm.

## Khi scheduler không chọn được node

Pod stuck `Pending`. Check Event:

```bash
kubectl describe pod my-pod
# ...
# Events:
#   Type     Reason            Message
#   ----     ------            -------
#   Warning  FailedScheduling  0/4 nodes are available:
#                              2 Insufficient cpu, 1 node(s) had taint
#                              {dedicated: production}, that the pod didn't
#                              tolerate, 1 node(s) didn't match Pod's
#                              node affinity/selector.
```

→ Message này chỉ rõ vì sao mỗi node bị reject.

Cách fix:
- Pod yêu cầu quá nhiều resource → giảm request hoặc add node.
- Taint mismatch → add toleration.
- nodeAffinity strict → đổi sang preferred (soft).

## Custom Scheduler

Bạn có thể chạy **scheduler riêng** song song với default scheduler:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
spec:
  schedulerName: my-custom-scheduler   # chỉ định scheduler nào lo Pod này
  containers:
  - name: nginx
    image: nginx
```

→ Pod này sẽ được `my-custom-scheduler` xử lý, không phải default scheduler.

Use case:
- Custom algorithm cho workload đặc biệt (ML, batch).
- Test scheduler mới trước khi rollout.
- Multi-tenant: scheduler riêng cho từng team.

Phase 3 sẽ có bài chi tiết về **Multiple Schedulers**.

## Scheduling Profile

K8s 1.18+ hỗ trợ **scheduler có nhiều profile**:

```yaml
apiVersion: kubescheduler.config.k8s.io/v1
kind: KubeSchedulerConfiguration
profiles:
  - schedulerName: default-scheduler
    plugins:
      score:
        disabled:
          - name: PodTopologySpread
        enabled:
          - name: MyCustomPriorityPlugin
  - schedulerName: high-priority-scheduler
    plugins:
      filter:
        enabled:
          - name: NodeUnschedulable
```

→ 1 scheduler binary, nhiều profile khác nhau. Phase 3 sẽ chi tiết.

## Cấu hình kube-scheduler

### Trong cluster kubeadm

Static Pod:
```bash
sudo cat /etc/kubernetes/manifests/kube-scheduler.yaml
```

```yaml
spec:
  containers:
  - command:
    - kube-scheduler
    - --authentication-kubeconfig=/etc/kubernetes/scheduler.conf
    - --authorization-kubeconfig=/etc/kubernetes/scheduler.conf
    - --bind-address=127.0.0.1
    - --kubeconfig=/etc/kubernetes/scheduler.conf
    - --leader-elect=true
```

Đơn giản hơn controller-manager — vì scheduler chỉ làm 1 việc.

### Trong cluster scratch

```bash
systemctl status kube-scheduler
cat /etc/systemd/system/kube-scheduler.service
```

## High Availability scheduler

Giống controller-manager: 3 master → 3 scheduler instance, **leader election** đảm bảo chỉ 1 active.

```bash
kubectl get lease -n kube-system kube-scheduler
# NAME             HOLDER      AGE
# kube-scheduler   master-1    5d
```

## Một số use case scheduling phổ biến

### 1. Sticky workload (Pod luôn chạy node có SSD)

```yaml
spec:
  nodeSelector:
    disktype: ssd
```

### 2. Spread Pod khắp các zone (avoid downtime)

```yaml
spec:
  topologySpreadConstraints:
    - maxSkew: 1
      topologyKey: topology.kubernetes.io/zone
      whenUnsatisfiable: ScheduleAnyway
      labelSelector:
        matchLabels:
          app: nginx
```

### 3. Co-locate 2 service cùng node (vd app + cache)

```yaml
spec:
  affinity:
    podAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        - labelSelector:
            matchLabels:
              app: redis
          topologyKey: kubernetes.io/hostname
```

### 4. Anti-affinity (Pod cùng app KHÔNG cùng node)

```yaml
spec:
  affinity:
    podAntiAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        - labelSelector:
            matchLabels:
              app: nginx
          topologyKey: kubernetes.io/hostname
```

Phase 3 sẽ deep-dive từng pattern.

## Pod không qua scheduler? Có nhé.

Có **2 loại Pod bypass scheduler**:

### 1. Static Pod

Pod tạo bởi **kubelet trực tiếp** từ file manifest local, không qua apiserver:

```bash
# Trên node, đặt file vào staticPodPath
cp my-pod.yaml /etc/kubernetes/manifests/
```

Kubelet đọc → tạo Pod ngay → không qua scheduler. Pod chỉ chạy trên node đó.

Use case: kube-apiserver, etcd... (control plane components cần chạy trước scheduler có sẵn).

### 2. Pod với `spec.nodeName` set trước

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
spec:
  nodeName: worker-2    # gán cứng
  containers:
  - name: nginx
    image: nginx
```

Scheduler thấy `nodeName` đã có → bỏ qua, không assign lại. Pod chạy thẳng node đó.

Use case: hiếm — chỉ khi test hoặc workload đặc biệt.

## Troubleshoot scheduler

| Triệu chứng | Component nghi vấn |
|---|---|
| Pod stuck `Pending` mọi lúc | Scheduler chết hoặc fail predicate |
| Pod schedule chậm (vài phút) | Scheduler overload, leader chuyển nhiều |
| Pod schedule không như mong | Logic predicate/priority không như tưởng |

Debug:
```bash
# 1. Scheduler có chạy không?
kubectl get pods -n kube-system | grep scheduler

# 2. Log scheduler
kubectl logs -n kube-system kube-scheduler-master | tail -100

# 3. Event của Pod (rất quan trọng)
kubectl describe pod <stuck-pod>
# Đọc kỹ phần Events
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Đặt nodeAffinity quá strict | Pod không bao giờ schedule | Dùng preferred thay required |
| Quên toleration cho master node | Pod không chạy được trên master | Add toleration cho `NoSchedule` taint |
| Resource request thấp nhưng usage cao | Node overloaded → noisy neighbor | Set request gần với actual usage |
| Quá nhiều custom scheduler | Lẫn lộn, khó debug | Chỉ tạo custom scheduler khi cần thật |
| Disable default scheduler | Pod thường không schedule | Đừng disable, dùng schedulerName cho Pod đặc biệt |

## Tóm tắt bài 6

- **Scheduler** = chỉ chọn node cho Pod chưa assigned. Không chạy container.
- **2 giai đoạn**: Filtering (loại node fail predicate) → Scoring (chọn node điểm cao nhất).
- Pod stuck `Pending` → `kubectl describe pod` → đọc Events để biết vì sao.
- **Custom Scheduler** + **Scheduling Profile**: cho workload đặc biệt.
- Pod **bypass scheduler**: Static Pod, Pod với `nodeName` set sẵn.
- HA: leader election như controller-manager.
- Config: `/etc/kubernetes/manifests/kube-scheduler.yaml` (kubeadm) hoặc systemd (scratch).

**Bài kế tiếp** → [Bài 7: Kubelet & Kube-Proxy — Agent trên mỗi worker node](07-kubelet-kube-proxy.md)
