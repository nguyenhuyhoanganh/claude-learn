# Bài 6: Multiple Schedulers & Scheduling Profiles

## Vì sao cần custom scheduler?

Scheduler mặc định K8s rất tốt cho 99% case. Nhưng có workload đặc biệt:

```text
- ML training jobs: cần GPU + RDMA, thuật toán placement riêng
- HPC (high-performance computing): cần node topology aware
- Batch jobs: muốn gang scheduling (chạy tất cả Pod cùng lúc hoặc không)
- Multi-tenant: mỗi tenant 1 scheduler với policy riêng
```

K8s cho phép:
1. **Custom Scheduler**: viết scheduler riêng (binary mới).
2. **Scheduling Profile** (1.18+): cùng 1 binary, nhiều profile khác nhau.

## Phần 1: Cách scheduler hoạt động (recap chi tiết)

Khi Pod tạo ra, scheduler chạy qua **4 phase** với **extension point**:

```text
┌────────────────────────────────────────┐
│ 1. SCHEDULING QUEUE                    │
│    Plugin: PrioritySort                │
│    → Sort Pod theo priority class      │
└──────────────┬─────────────────────────┘
               │
               ▼
┌────────────────────────────────────────┐
│ 2. FILTERING                           │
│    Plugin: NodeResourcesFit            │
│             NodeName                    │
│             NodeUnschedulable           │
│             TaintToleration             │
│             ...                         │
│    → Loại bỏ node không phù hợp        │
└──────────────┬─────────────────────────┘
               │
               ▼
┌────────────────────────────────────────┐
│ 3. SCORING                             │
│    Plugin: NodeResourcesFit            │
│             ImageLocality               │
│             NodeAffinity                │
│             ...                         │
│    → Chấm điểm node còn lại            │
└──────────────┬─────────────────────────┘
               │
               ▼
┌────────────────────────────────────────┐
│ 4. BINDING                             │
│    Plugin: DefaultBinder               │
│    → Gán Pod → Node (set nodeName)     │
└────────────────────────────────────────┘
```

### Extension points (mở rộng được)

K8s cho phép plugin tại nhiều điểm:

```text
QueueSort → PreFilter → Filter → PostFilter → PreScore → Score
        → Reserve → Permit → PreBind → Bind → PostBind
```

→ Có thể viết plugin custom plug vào bất kỳ phase nào.

### Built-in plugins (1 số ví dụ)

| Plugin | Extension point | Mục đích |
|---|---|---|
| `PrioritySort` | QueueSort | Sort theo priority |
| `NodeResourcesFit` | Filter + Score | Đủ CPU/RAM? |
| `NodeName` | Filter | Match `spec.nodeName`? |
| `NodeUnschedulable` | Filter | Node có cordon? |
| `TaintToleration` | Filter + Score | Toleration match taint? |
| `NodeAffinity` | Filter + Score | Match affinity rule? |
| `ImageLocality` | Score | Node có sẵn image? |
| `DefaultBinder` | Bind | Gán Pod → Node |

→ Vô hiệu hoá hoặc thêm plugin = thay đổi behavior scheduler.

## Phần 2: Multiple Schedulers — Cách cũ

### Cách 1: Multiple Binary

Trước K8s 1.18, custom scheduler = chạy **binary riêng**:

```text
[Cluster]
├── kube-scheduler (default — binary 1)
├── my-scheduler-1 (custom — binary 2)
└── my-scheduler-2 (custom — binary 3)

Mỗi scheduler:
- Process riêng (Pod riêng)
- Config file riêng
- Tên scheduler riêng
```

Pod chỉ định scheduler nào lo:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
spec:
  schedulerName: my-scheduler-1     # ← chọn scheduler
  containers:
    - name: app
      image: nginx
```

Pod không khai `schedulerName` → default scheduler.

### Vấn đề của multiple binary

- Maintain nhiều process.
- **Race condition**: 2 scheduler có thể schedule 2 Pod vào cùng node cùng lúc — node hết resource cho cả 2.
- Tốn tài nguyên (mỗi binary tốn memory).

## Phần 3: Scheduling Profiles — Cách mới (1.18+)

### Cùng 1 binary, nhiều "profile"

```text
[Cluster]
└── kube-scheduler (1 binary)
    ├── Profile: default-scheduler
    ├── Profile: my-scheduler
    └── Profile: gpu-scheduler

Mỗi profile:
- Có scheduler name riêng
- Có plugin config riêng
- Share lock chung → no race condition
```

### Config file

```yaml
apiVersion: kubescheduler.config.k8s.io/v1
kind: KubeSchedulerConfiguration

profiles:
  - schedulerName: default-scheduler
    # plugins default

  - schedulerName: my-scheduler
    plugins:
      score:
        disabled:
          - name: TaintToleration         # disable plugin này
        enabled:
          - name: MyCustomPlugin           # enable plugin custom

  - schedulerName: gpu-scheduler
    plugins:
      preScore:
        disabled:
          - name: '*'                      # disable mọi prescore plugin
      score:
        disabled:
          - name: '*'
```

→ 1 binary chạy 3 profile như 3 scheduler.

### Pod sử dụng

```yaml
spec:
  schedulerName: gpu-scheduler
```

## Phần 4: Cấu hình scheduler config

### Trong cluster kubeadm

Config nằm trong static Pod `/etc/kubernetes/manifests/kube-scheduler.yaml`:

```yaml
spec:
  containers:
  - command:
    - kube-scheduler
    - --kubeconfig=/etc/kubernetes/scheduler.conf
    - --config=/etc/kubernetes/scheduler-config.yaml       # ← config file
    - --leader-elect=true
```

`/etc/kubernetes/scheduler-config.yaml`:
```yaml
apiVersion: kubescheduler.config.k8s.io/v1
kind: KubeSchedulerConfiguration
clientConnection:
  kubeconfig: /etc/kubernetes/scheduler.conf
leaderElection:
  leaderElect: true
profiles:
  - schedulerName: default-scheduler
```

Sau khi sửa, kubelet tự restart Pod.

### Trong cluster scratch

systemd service:
```bash
systemctl restart kube-scheduler
```

## Phần 5: Deploy custom scheduler như Pod

Cách phổ biến: tạo Deployment scheduler riêng trong cluster:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-scheduler
  namespace: kube-system
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: my-scheduler-as-kube-scheduler
subjects:
- kind: ServiceAccount
  name: my-scheduler
  namespace: kube-system
roleRef:
  kind: ClusterRole
  name: system:kube-scheduler           # quyền giống kube-scheduler default
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-scheduler-config
  namespace: kube-system
data:
  my-scheduler-config.yaml: |
    apiVersion: kubescheduler.config.k8s.io/v1
    kind: KubeSchedulerConfiguration
    profiles:
      - schedulerName: my-scheduler
    leaderElection:
      leaderElect: false           # nếu chỉ 1 replica
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-scheduler
  namespace: kube-system
spec:
  replicas: 1
  selector:
    matchLabels:
      component: my-scheduler
  template:
    metadata:
      labels:
        component: my-scheduler
    spec:
      serviceAccountName: my-scheduler
      containers:
        - name: kube-scheduler
          image: registry.k8s.io/kube-scheduler:v1.30.0
          command:
            - kube-scheduler
            - --config=/etc/kubernetes/my-scheduler-config.yaml
          volumeMounts:
            - name: config-volume
              mountPath: /etc/kubernetes
      volumes:
        - name: config-volume
          configMap:
            name: my-scheduler-config
```

Apply → custom scheduler chạy trong cluster, không can thiệp default scheduler.

## Sử dụng custom scheduler

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
spec:
  schedulerName: my-scheduler         # ← gán cho custom scheduler
  containers:
    - name: nginx
      image: nginx
```

Nếu `my-scheduler` không chạy → Pod stuck `Pending` (default scheduler không nhận).

## Verify scheduler nào lo Pod

```bash
# Check events
kubectl get events
# LAST SEEN   TYPE     REASON       OBJECT       MESSAGE
# 2m          Normal   Scheduled    pod/my-pod   Successfully assigned default/my-pod to worker-2 by my-scheduler

# Hoặc dùng -o wide
kubectl get events -o wide

# Hoặc check Pod events
kubectl describe pod my-pod
# Events:
#   Normal  Scheduled  ... successfully assigned ... by my-scheduler
```

→ Trường `by my-scheduler` cho biết scheduler nào schedule.

## Leader Election cho HA

Nếu chạy nhiều replica scheduler:

```yaml
leaderElection:
  leaderElect: true
  resourceLock: leases
  resourceName: my-scheduler
  resourceNamespace: kube-system
```

Mỗi replica tranh **lease** trong K8s API. Chỉ 1 active. Khác `resourceName` cho mỗi scheduler để không conflict.

## Debug khi custom scheduler không hoạt động

```bash
# 1. Scheduler Pod chạy không?
kubectl get pods -n kube-system | grep my-scheduler

# 2. Log
kubectl logs -n kube-system <my-scheduler-pod>

# 3. RBAC đủ quyền không?
kubectl auth can-i create pods --as=system:serviceaccount:kube-system:my-scheduler

# 4. Pod có pending mãi không?
kubectl describe pod my-pod
# Events: scheduler không có message → scheduler không bind Pod
```

Lỗi phổ biến:
- ServiceAccount thiếu RBAC.
- Pod khai `schedulerName` sai (typo).
- Multiple scheduler conflict (cùng dùng tên).

## So sánh các cách

| | Multiple Binary | Scheduling Profiles | Custom Plugin |
|---|---|---|---|
| Cách | Run nhiều binary | 1 binary, nhiều profile | Code Go plugin |
| Complex | Cao | Trung | Cao (cần code) |
| Race condition | Có thể | Không | Không |
| Use case | Legacy | **Modern, recommend** | Custom logic phức tạp |

→ **Scheduling Profile** là cách K8s khuyến nghị hiện tại.

## Use case thực tế

### 1. GPU workload — custom scheduling

```yaml
profiles:
  - schedulerName: gpu-scheduler
    plugins:
      filter:
        enabled:
          - name: NodeResourcesFit
          - name: GPUTopologyFilter        # custom plugin
      score:
        enabled:
          - name: GPUAffinityScore         # custom plugin
```

### 2. Batch jobs — gang scheduling

```yaml
profiles:
  - schedulerName: batch-scheduler
    plugins:
      queueSort:
        enabled:
          - name: PrioritySort
      filter:
        enabled:
          - name: NodeResourcesFit
      preFilter:
        enabled:
          - name: GangScheduling           # đảm bảo group Pod schedule cùng
```

### 3. Bin packing — gom Pod để optimize

```yaml
profiles:
  - schedulerName: bin-packer
    plugins:
      score:
        enabled:
          - name: NodeResourcesMostAllocated  # ưu tiên node đang busy
        disabled:
          - name: NodeResourcesLeastAllocated # tắt spread
```

→ Pod gom vào ít node để spare node cho scale down.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Custom scheduler nhưng quên ServiceAccount | RBAC denied | Tạo SA + ClusterRoleBinding |
| `schedulerName` sai typo | Pod stuck Pending | Verify name khớp config |
| Nhiều scheduler chung lock name | Race | `resourceName` riêng mỗi scheduler |
| Disable plugin quan trọng | Behavior break | Test kỹ trước production |
| Multiple binary không có leader election | Race condition | Dùng Scheduling Profiles |
| Dùng image old kube-scheduler | Plugin mới không có | Match version cluster |

## Quick reference

```bash
# Xem default scheduler config (trong cluster kubeadm)
sudo cat /etc/kubernetes/manifests/kube-scheduler.yaml

# Custom scheduler ConfigMap
kubectl get cm -n kube-system | grep scheduler

# Log scheduler
kubectl logs -n kube-system kube-scheduler-master
kubectl logs -n kube-system my-scheduler-xxx

# Events scheduler
kubectl get events -o wide --sort-by='.lastTimestamp'
```

## Tóm tắt bài 6

- Scheduler có 4 phase: **Queue → Filter → Score → Bind**.
- Mỗi phase có **plugin** + **extension point** để tuỳ chỉnh.
- **Multiple Schedulers** (cách cũ): nhiều binary, có race.
- **Scheduling Profiles** (1.18+, recommend): 1 binary, nhiều profile, no race.
- Pod chọn scheduler qua `spec.schedulerName`.
- Custom scheduler chạy như Deployment trong cluster, cần ServiceAccount + RBAC.
- Plugin built-in: PrioritySort, NodeResourcesFit, TaintToleration, ImageLocality, ...
- Use case: GPU, batch, bin packing — cần policy đặc biệt.
- Debug: log scheduler, events Pod, RBAC.

**Bài kế tiếp** → [Bài 7: Admission Controllers — Validate/mutate request trước khi vào etcd](07-admission-controllers.md)
