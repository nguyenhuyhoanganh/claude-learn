# Bài 2: Taints & Tolerations — Node "đẩy" Pod

## Vấn đề thực tế

Có 3 worker node trong cluster. Bạn muốn dedicate **node-1 chỉ cho ML workload** (vì có GPU). Pod thông thường **không được** schedule lên node-1.

```text
Cluster:
- node-1 (có GPU): chỉ ML Pod
- node-2: Pod thông thường
- node-3: Pod thông thường

Scheduler mặc định: cân bằng load đều → đặt Pod đâu cũng được
→ Pod thông thường sẽ vào node-1, chiếm chỗ ML Pod
```

→ Cần cơ chế **node tự "từ chối" Pod nào đó**. Đây là **Taints**.

## Analogy: Thuốc xịt côn trùng

Người bị xịt thuốc côn trùng (taint). Côn trùng nào không chịu được mùi → tránh xa. Côn trùng nào tolerant với mùi → vẫn đến gần.

```text
[Người] = Node
[Thuốc xịt] = Taint
[Côn trùng] = Pod
[Khả năng chịu mùi] = Toleration

Default: côn trùng không tolerant → bị đẩy đi
Special: côn trùng có toleration → vẫn được vào
```

## Định nghĩa

> **Taint** = "nhãn cấm" gắn lên Node. Mặc định Pod **không thể** schedule lên node có taint.

> **Toleration** = quyền "miễn nhiễm" gắn lên Pod. Pod có toleration **match taint** → vẫn schedule được.

```text
Node-1: taint blue=true:NoSchedule
                                ▲
                                │ Pod cần toleration cho taint này
                                ▼
Pod A: no toleration            → bị đẩy → không vào node-1
Pod B: toleration: blue=true    → match → vào được node-1
```

## Taint syntax

```bash
kubectl taint nodes <node-name> key=value:effect
```

Ví dụ:
```bash
kubectl taint nodes node-1 app=blue:NoSchedule
```

Phân tích:
- `node-1`: tên node bị taint.
- `app`: key.
- `blue`: value (có thể empty).
- `NoSchedule`: effect (3 loại — xem dưới).

Xoá taint (thêm `-`):
```bash
kubectl taint nodes node-1 app=blue:NoSchedule-
```

Xem taint trên node:
```bash
kubectl describe node node-1 | grep -i taint
# Taints:   app=blue:NoSchedule
```

## 3 loại Effect

| Effect | Áp dụng cho Pod mới | Áp dụng cho Pod đã chạy |
|---|---|---|
| **NoSchedule** | Không schedule (cấm tuyệt đối) | Không evict (Pod đã chạy vẫn chạy) |
| **PreferNoSchedule** | Soft — scheduler **cố tránh** nhưng không cấm | Không evict |
| **NoExecute** | Không schedule | **EVICT** Pod đã chạy không có toleration |

### NoSchedule (cứng)

```bash
kubectl taint nodes node-1 app=blue:NoSchedule
```

- Pod mới không có toleration → schedule **fail**, đi node khác.
- Pod đã chạy trên node-1 trước đó → **vẫn ở đó**, không bị đẩy.

### PreferNoSchedule (mềm)

```bash
kubectl taint nodes node-1 app=blue:PreferNoSchedule
```

- Pod mới: scheduler ưu tiên node khác, nhưng nếu **không node nào khả thi** → vẫn schedule lên node-1.
- Pod đã chạy: không evict.

→ Hữu ích khi muốn "ưu tiên" tránh node nhưng không cấm tuyệt đối.

### NoExecute (mạnh nhất)

```bash
kubectl taint nodes node-1 app=blue:NoExecute
```

- Pod mới không tolerant → không schedule.
- **Pod đã chạy không tolerant → bị EVICT (kill)**.

→ Nguy hiểm. Dùng khi cần "đuổi" Pod khỏi node ngay (vd: node sắp maintenance).

## Toleration trên Pod

YAML:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: ml-pod
spec:
  tolerations:
    - key: "app"
      operator: "Equal"
      value: "blue"
      effect: "NoSchedule"
  containers:
    - name: app
      image: nginx
```

→ Pod này tolerate taint `app=blue:NoSchedule` → schedule lên node-1 được (nếu scheduler chọn).

### Operator

| Operator | Ý nghĩa |
|---|---|
| `Equal` (default) | `key=value` phải khớp chính xác |
| `Exists` | Chỉ cần key tồn tại (bỏ value) |

```yaml
# Equal
tolerations:
  - key: app
    operator: Equal
    value: blue
    effect: NoSchedule

# Exists — tolerate mọi taint có key=app, value gì cũng được
tolerations:
  - key: app
    operator: Exists
    effect: NoSchedule

# Tolerate MỌI taint
tolerations:
  - operator: Exists
```

## Workflow đầy đủ

```text
[Cluster]
Node-1: taint app=blue:NoSchedule
Node-2: no taint
Node-3: no taint

[Tạo 4 Pod: A, B, C, D]
- Pod A, B, C: no toleration
- Pod D: toleration app=blue:NoSchedule

[Scheduler xử lý]
- Pod A → thử Node-1 → taint, không tolerate → đi Node-2 ✓
- Pod B → thử Node-1 → taint → đi Node-3 ✓
- Pod C → thử Node-1 → taint → đi Node-2 ✓
- Pod D → thử Node-1 → taint, NHƯNG tolerant → có thể schedule ở Node-1
         hoặc scheduler chọn node khác (taint không "ép" Pod vào node-1)

[Kết quả]
Node-1: có thể có Pod D (hoặc empty nếu scheduler chọn khác)
Node-2: Pod A, C
Node-3: Pod B
```

**Quan trọng**: Taint **không ép** Pod D vào node-1. Chỉ **cho phép**. Pod D có thể vẫn vào node-2/3.

→ Nếu muốn ép Pod vào node-1 → cần **Node Affinity** (bài kế tiếp).

## Pattern thực tế: Dedicate node + Force Pod

Để **dedicate** node + **ép** Pod đặc biệt vào:

```text
Taint node-1: app=blue:NoSchedule
→ Pod khác không vào được node-1

+ Toleration trên Pod-D: app=blue:NoSchedule
+ NodeSelector trên Pod-D: ml=true (label node-1 có)

→ Pod-D vào được node-1 (toleration) VÀ ép vào (nodeSelector)
→ Node-1 chỉ có Pod-D
```

→ Cần **kết hợp** taint + nodeSelector/affinity. Sẽ học ở bài kế tiếp.

## Master node bị taint mặc định

Cluster kubeadm — master node có taint sẵn:

```bash
kubectl describe node master | grep -i taint
# Taints:   node-role.kubernetes.io/control-plane:NoSchedule
```

→ Vì sao Pod thông thường không chạy trên master. Để tránh app làm tải master.

Nếu muốn cho phép Pod thường chạy trên master (single-node cluster):

```bash
# Xoá taint
kubectl taint nodes master node-role.kubernetes.io/control-plane:NoSchedule-
```

→ Đó là lý do Minikube/single-node hoạt động — không có taint.

## NoExecute với `tolerationSeconds`

Pod có thể tolerate `NoExecute` trong **thời gian giới hạn**:

```yaml
tolerations:
  - key: node.kubernetes.io/unreachable
    operator: Exists
    effect: NoExecute
    tolerationSeconds: 300        # tolerate 5 phút
```

→ Khi node thành Unreachable, Pod được giữ 5 phút trước khi evict. Default K8s set 300s này tự động cho Pod để tránh evict ngay khi network glitch.

## Built-in Taints

K8s tự động add taint khi node có vấn đề:

| Taint | Khi nào tự apply |
|---|---|
| `node.kubernetes.io/not-ready` | Node NotReady |
| `node.kubernetes.io/unreachable` | Node không heartbeat |
| `node.kubernetes.io/memory-pressure` | Node hết RAM |
| `node.kubernetes.io/disk-pressure` | Node hết disk |
| `node.kubernetes.io/pid-pressure` | Node hết PID |
| `node.kubernetes.io/network-unavailable` | Network chưa ready |
| `node.kubernetes.io/unschedulable` | Node bị cordon |

→ Hiểu các taint này khi debug `Pod stuck Pending`.

## Use case thực tế

### 1. Dedicate GPU node

```bash
# Taint
kubectl taint nodes gpu-node-1 gpu=nvidia:NoSchedule

# Pod ML có toleration
spec:
  tolerations:
    - key: gpu
      operator: Equal
      value: nvidia
      effect: NoSchedule
  nodeSelector:
    gpu: "true"        # ép vào node có label gpu
```

### 2. Maintenance node

```bash
# Mark node sắp bảo trì
kubectl taint nodes node-2 maintenance=true:NoExecute
# → Pod không tolerant bị evict ngay, di chuyển sang node khác

# Sau khi xong
kubectl taint nodes node-2 maintenance=true:NoExecute-
```

→ Phase 6 (Cluster Maintenance) có `kubectl drain` + `cordon` làm việc này clean hơn.

### 3. Region-specific workload

```bash
kubectl taint nodes us-east-1 region=us-east:NoSchedule

# Pod region=us-east có toleration
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Taint không có toleration cho master | Workload app không chạy trên master (kubeadm) | Đúng theo thiết kế |
| Set `NoExecute` không cẩn thận | Pod bị evict bất ngờ | Dùng `NoSchedule` cho dedicate |
| Tưởng taint = ép Pod vào node | Pod tolerant vẫn có thể vào node khác | Kết hợp với nodeSelector/affinity |
| Quên xoá taint sau test | Pod sau này không schedule được | `kubectl taint nodes X key=val:effect-` |
| Operator `Equal` thiếu value | Toleration không match | Set value hoặc dùng `Exists` |
| Taint syntax sai | `kubectl taint` fail | `key=value:effect` cứng |

## Quick reference

```bash
# Add taint
kubectl taint nodes node-1 app=blue:NoSchedule
kubectl taint nodes node-1 app=blue:PreferNoSchedule
kubectl taint nodes node-1 app=blue:NoExecute

# Remove taint
kubectl taint nodes node-1 app=blue:NoSchedule-

# View taints
kubectl describe node node-1 | grep -i taint
kubectl get nodes -o json | jq '.items[] | {name:.metadata.name, taints:.spec.taints}'

# Pod toleration (YAML)
spec:
  tolerations:
    - key: app
      operator: Equal
      value: blue
      effect: NoSchedule
```

## Tóm tắt bài 2

- **Taint** trên node, **Toleration** trên Pod. Pod tolerant → schedule được lên node tainted.
- 3 effect: `NoSchedule` (cứng), `PreferNoSchedule` (mềm), `NoExecute` (kill Pod cũ luôn).
- Operator: `Equal` (chính xác) hoặc `Exists` (chỉ cần key).
- **Master node** có taint `node-role.kubernetes.io/control-plane:NoSchedule` mặc định.
- Built-in taint khi node có vấn đề (NotReady, unreachable, memory-pressure, ...).
- `tolerationSeconds`: tolerate trong thời gian giới hạn (chỉ NoExecute).
- **Taint KHÔNG ép** Pod vào node — chỉ **cho phép**. Để ép, kết hợp với nodeSelector/affinity.

**Bài kế tiếp** → [Bài 3: Node Selectors & Node Affinity — Pod "chọn" node](03-node-selectors-affinity.md)
