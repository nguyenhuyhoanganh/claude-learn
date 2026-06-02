# Bài 5: DaemonSets, Static Pods, Priority Classes

## Phần 1: DaemonSet

### Vấn đề

Bạn muốn deploy **log shipper** (vd Fluentd) trên **mọi node** để collect log container. ReplicaSet/Deployment không phù hợp:
- ReplicaSet: chỉ replicas N, không đảm bảo 1 Pod/node.
- Node mới join cluster → bạn phải tay scale ReplicaSet để có Pod trên node mới.

→ Cần controller đảm bảo **1 Pod trên mỗi node**. Đó là **DaemonSet**.

### Định nghĩa

> **DaemonSet** = controller đảm bảo **1 instance Pod trên MỖI node** trong cluster.

```text
[Cluster 3 node]
Node-1: 1 DaemonSet Pod (Fluentd)
Node-2: 1 DaemonSet Pod (Fluentd)
Node-3: 1 DaemonSet Pod (Fluentd)

→ Thêm node-4: DaemonSet tự tạo Pod thứ 4 trên node-4
→ Xoá node-3: DaemonSet xoá Pod khỏi node-3
```

### Use cases

| Use case | Tool |
|---|---|
| **Log collector** | Fluentd, Fluent Bit, Promtail |
| **Monitoring agent** | Node Exporter, Datadog Agent |
| **Network plugin (CNI)** | Calico, Flannel, Cilium |
| **Storage plugin (CSI)** | Local Path Provisioner |
| **Security agent** | Falco |
| **Kube-proxy** | (kubeadm chạy kube-proxy như DaemonSet) |

→ Mọi thứ cần "running trên mỗi node".

### YAML DaemonSet

Giống Deployment, chỉ đổi `kind`:

```yaml
apiVersion: apps/v1
kind: DaemonSet                # ← khác Deployment
metadata:
  name: fluentd
  namespace: kube-system
spec:
  selector:
    matchLabels:
      app: fluentd
  template:
    metadata:
      labels:
        app: fluentd
    spec:
      containers:
        - name: fluentd
          image: fluentd:v1.16
          volumeMounts:
            - name: varlog
              mountPath: /var/log
      volumes:
        - name: varlog
          hostPath:              # mount log host vào Pod
            path: /var/log
```

→ **Không có `replicas`**. Số replica tự động = số node match.

### Tạo + xem

```bash
kubectl apply -f daemonset.yaml

kubectl get daemonset
# NAME      DESIRED   CURRENT   READY   UP-TO-DATE   AVAILABLE   NODE SELECTOR   AGE
# fluentd   3         3         3       3            3           <none>          5m

kubectl get pods -o wide
# NAME            READY   STATUS    NODE     IP
# fluentd-abc12   1/1     Running   node-1   10.244.0.5
# fluentd-def34   1/1     Running   node-2   10.244.1.7
# fluentd-ghi56   1/1     Running   node-3   10.244.2.3
```

→ Mỗi node có 1 Pod. Tự động.

### DaemonSet chạy trên subset node

Mặc định DaemonSet chạy mọi node. Nếu chỉ muốn subset:

```yaml
spec:
  template:
    spec:
      nodeSelector:
        disk: ssd               # chỉ node có label disk=ssd
```

Hoặc dùng `affinity`:

```yaml
spec:
  template:
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: gpu
                    operator: Exists
```

### DaemonSet không bypass scheduler

Trước K8s 1.12: DaemonSet **bypass scheduler** (set `nodeName` trực tiếp).

Từ K8s 1.12+: DaemonSet dùng **default scheduler** + Node Affinity. Lợi ích:
- Tôn trọng taint/toleration của node.
- Hỗ trợ priority class.
- Code controller đơn giản hơn.

### DaemonSet vs Master node

Master node có taint `node-role.kubernetes.io/control-plane:NoSchedule`. DaemonSet thông thường **không chạy** trên master.

Muốn DaemonSet chạy cả master (vd monitoring agent):
```yaml
spec:
  template:
    spec:
      tolerations:
        - key: node-role.kubernetes.io/control-plane
          operator: Exists
          effect: NoSchedule
```

→ Toleration cho master taint.

## Phần 2: Static Pods

### Vấn đề

Cluster K8s sống được nhờ Pod control-plane (apiserver, etcd, scheduler, controller-manager). Nhưng:

```text
Pod apiserver được tạo bởi ai?
   → Scheduler chọn node + Kubelet chạy
   → Scheduler là Pod, cần Kubelet chạy
   → Kubelet cần apiserver để biết Pod nào schedule cho mình

→ Gà và trứng. Ai chạy trước?
```

Giải pháp: **Static Pod** — kubelet tự tạo Pod từ file trên đĩa, không cần apiserver.

### Định nghĩa

> **Static Pod** = Pod tạo **trực tiếp bởi kubelet**, không qua apiserver. Đọc YAML từ folder local.

```text
[Folder /etc/kubernetes/manifests/]
├── etcd.yaml
├── kube-apiserver.yaml
├── kube-controller-manager.yaml
└── kube-scheduler.yaml

Kubelet watch folder này:
- Có file mới → tạo Pod
- File sửa → recreate Pod
- File xoá → xoá Pod
```

→ Đây chính là cơ chế kubeadm dùng để chạy control-plane.

### Cấu hình staticPodPath

Trong file config kubelet:

```bash
sudo cat /var/lib/kubelet/config.yaml | grep staticPodPath
# staticPodPath: /etc/kubernetes/manifests
```

Hoặc trong systemd file:
```bash
sudo cat /etc/systemd/system/kubelet.service.d/10-kubeadm.conf
# Environment="KUBELET_EXTRA_ARGS=--pod-manifest-path=/etc/kubernetes/manifests"
```

→ Path có thể tuỳ chỉnh, mặc định `/etc/kubernetes/manifests`.

### Tạo static Pod

```bash
# SSH vào node
sudo vim /etc/kubernetes/manifests/my-static.yaml
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-static
spec:
  containers:
    - name: nginx
      image: nginx
```

Kubelet **tự** tạo Pod trong vài giây. Verify:
```bash
sudo crictl ps | grep nginx
# Container chạy

# Trên master (nếu Pod được mirror)
kubectl get pods | grep my-static
# NAME                 READY   STATUS    AGE
# my-static-node-1     1/1     Running   30s
```

**Tên Pod**: được append với hostname → `my-static-<node-name>`.

### Cảnh báo: Không xoá static Pod bằng kubectl

```bash
kubectl delete pod my-static-node-1
# Pod biến mất... rồi quay lại sau vài giây
```

→ Vì kubelet **liên tục watch file**. Đã xoá Pod → kubelet thấy file vẫn còn → tạo lại.

**Cách xoá đúng**: Xoá file YAML khỏi folder.
```bash
sudo rm /etc/kubernetes/manifests/my-static.yaml
# Kubelet thấy file gone → xoá Pod
```

### Mirror Pod

Khi cluster đầy đủ (có apiserver), static Pod tạo bởi kubelet **được mirror** lên apiserver:

```text
[Node]                          [apiserver]
Kubelet đọc /manifests/x.yaml   ←──read──   Bạn: kubectl get pods
        │                                          │
        │ create Pod                               │ thấy "x" trong list
        │                                          │
        ▼                                          ▼
   Container chạy                          Mirror Pod (read-only)
        │
        │ kubelet đăng ký với
        │ apiserver: "Tôi đang chạy
        │ Pod tên này"
        ▼
        Mirror Pod xuất hiện
```

Mirror Pod **read-only** từ apiserver:
- Có thể `kubectl describe`, `kubectl logs`.
- Không thể `kubectl delete` (xoá ngay tạo lại).
- Không thể edit qua apiserver — phải sửa file.

### DaemonSet vs Static Pod

| | DaemonSet | Static Pod |
|---|---|---|
| Tạo bởi | DaemonSet controller (qua apiserver) | Kubelet trực tiếp |
| Cần apiserver? | ✓ | ✗ |
| Manage via kubectl? | ✓ | Mirror (read-only) |
| 1 instance/node | ✓ | ✓ (nếu file ở mọi node) |
| Use case | Log, monitoring agent | Bootstrap control-plane |

→ Static Pod **chỉ dùng cho control-plane**. App user dùng Deployment/DaemonSet.

## Phần 3: Priority Classes

### Vấn đề

Cluster đầy. Pod critical (database, payment) không schedule được vì các Pod batch job đã chiếm hết. Cần cơ chế "đẩy" Pod thấp priority ra để chỗ cho Pod cao priority.

→ **Priority Class** + **Preemption**.

### Priority Class

> **PriorityClass** = label gán priority cho Pod. Pod priority cao **schedule trước**, có thể **kick** Pod priority thấp.

### YAML

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: high-priority
value: 1000000
globalDefault: false
description: "High priority for critical workloads"
```

- `value`: số càng cao càng ưu tiên. Range:
  - **User app**: 0 đến 1,000,000,000 (1 tỷ).
  - **System critical**: 2,000,000,000 (2 tỷ).
- `globalDefault: true`: Pod không có priority class → dùng cái này. **Chỉ 1 class có thể là default**.
- Mặc định Pod không có class → priority = 0.

### Built-in priority classes

```bash
kubectl get priorityclasses
# NAME                      VALUE        GLOBAL-DEFAULT   AGE
# system-cluster-critical   2000000000   false            30d
# system-node-critical      2000001000   false            30d
```

- `system-node-critical`: cao nhất, không bao giờ evict (kube-proxy, kubelet add-on).
- `system-cluster-critical`: cho control-plane (apiserver, etcd).

### Áp dụng cho Pod

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: critical-app
spec:
  priorityClassName: high-priority
  containers:
    - name: app
      image: nginx
```

### Workflow Priority + Preemption

```text
[Cluster đầy]
Pod A (priority 5): chiếm 4 CPU
Pod B (priority 5): chiếm 4 CPU
                    Tổng: 8/8 CPU = full

[Pod C tới — priority 10, cần 2 CPU]
Scheduler:
- Check: có node nào có 2 CPU free? Không
- Find Pod priority < 10: A và B (priority 5)
- Evict Pod A (lower priority) → free 4 CPU
- Schedule Pod C (cần 2)
- Pod A vào pending → schedule lại sau

→ Higher priority preempt lower
```

### Preemption Policy

`PriorityClass` có field `preemptionPolicy`:

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: high-no-preempt
value: 1000000
preemptionPolicy: Never        # không evict Pod khác
```

| Policy | Hành vi |
|---|---|
| `PreemptLowerPriority` (default) | Evict Pod priority thấp hơn để schedule |
| `Never` | Không evict ai. Chờ cluster có chỗ tự nhiên |

→ Critical batch (vẫn quan trọng nhưng không cần evict): `Never`.

### Use case thực tế

```yaml
# Database production
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: db-critical
value: 1000000000
description: "Production database - never let starve"

# Frontend web
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: frontend-prod
value: 500000

# Batch job (low priority, no preempt)
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: batch-low
value: 100
preemptionPolicy: Never
```

→ Cluster bận: DB > Frontend > Batch. Batch chờ, không kick ai.

## So sánh 3 cơ chế

| | DaemonSet | Static Pod | Priority Class |
|---|---|---|---|
| Đảm bảo | 1 Pod/node | Pod tồn tại bất chấp apiserver | Pod được schedule trước |
| Tạo qua | DaemonSet controller | Kubelet đọc file | Gắn vào Pod spec |
| Use case | Agent (log, monitor) | Control-plane component | Critical workload |
| Scheduler liên quan? | Có (1.12+) | Không | Có (quyết định preempt) |

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Tạo Pod app như static Pod | Khó manage, không scale | Dùng Deployment |
| Sửa static Pod qua `kubectl edit` | Không lưu, kubelet revert | Sửa file YAML local |
| `kubectl delete static-pod` | Pod tạo lại ngay | Xoá file YAML |
| DaemonSet không có toleration master | Pod không chạy master | Add toleration cho `node-role.kubernetes.io/control-plane` |
| Set Priority value > 1 tỷ cho app user | Conflict với system pod | Stay < 1 tỷ |
| Quên `globalDefault` | Pod không class có priority 0 | Set 1 class là default hoặc OK với 0 |
| Preemption không như mong | Hiểu chính sách `preemptionPolicy` | `Never` cho non-preempting workload |

## Tóm tắt bài 5

- **DaemonSet**: 1 Pod trên mỗi node. Cho log/monitoring/CNI agent.
- DaemonSet không có `replicas` — auto match số node.
- **Static Pod**: kubelet tạo trực tiếp từ file `/etc/kubernetes/manifests/`, không qua apiserver.
- Static Pod được **mirror** lên apiserver (read-only).
- Xoá static Pod = xoá file, không `kubectl delete`.
- **Priority Class**: priority cao schedule trước, có thể preempt Pod priority thấp.
- `preemptionPolicy: Never` cho non-preempting (chờ chỗ trống thay vì kick).
- Built-in: `system-cluster-critical`, `system-node-critical` cho control-plane.

**Bài kế tiếp** → [Bài 6: Multiple Schedulers & Scheduling Profiles](06-multiple-schedulers.md)
