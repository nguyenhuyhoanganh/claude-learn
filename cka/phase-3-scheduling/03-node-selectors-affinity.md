# Bài 3: Node Selectors & Node Affinity — Pod "chọn" node

## Vấn đề: Tại sao taint một mình không đủ?

Bài 2 đã học taint: node "đẩy" Pod ra. Nhưng taint **không ép** Pod đặc biệt vào node đó:

```text
[3 node, 3 Pod màu]
Node Blue:  taint color=blue
Node Red:   taint color=red
Node Green: taint color=green

Pod Blue:  toleration color=blue → có thể vào Node Blue
                                  HOẶC vào node nào không taint
Pod Red:   toleration color=red  → tương tự
Pod Green: toleration color=green→ tương tự

→ Pod Blue có thể vào node Red/Green nếu node đó không taint
   → KHÔNG ÉP được Pod Blue vào node Blue
```

→ Cần cơ chế ngược lại: **Pod "chọn" node**. Đó là **Node Selector** (đơn giản) và **Node Affinity** (mạnh hơn).

## Node Selector — Cách đơn giản

### Workflow

**Bước 1**: Label node:
```bash
kubectl label nodes node-1 size=large
kubectl label nodes node-2 size=medium
kubectl label nodes node-3 size=small
```

**Bước 2**: Pod khai báo `nodeSelector`:
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: data-processing
spec:
  nodeSelector:
    size: large                # ← Pod chỉ chạy trên node có label size=large
  containers:
    - name: app
      image: data-processor
```

→ Scheduler tự tìm node có label `size=large` → chỉ schedule vào đó.

### Xem label node

```bash
kubectl get nodes --show-labels
# NAME      STATUS   ROLES   LABELS
# node-1    Ready    <none>  size=large,kubernetes.io/hostname=node-1,...
# node-2    Ready    <none>  size=medium,kubernetes.io/hostname=node-2,...
# node-3    Ready    <none>  size=small,kubernetes.io/hostname=node-3,...

# Show label cụ thể
kubectl get nodes -L size
```

### Hạn chế Node Selector

`nodeSelector` chỉ check **equality** — không support:
- OR (`size=large OR size=medium`).
- NOT (`size != small`).
- IN list (`size in (large, medium)`).
- EXISTS (`label "size" tồn tại với giá trị bất kỳ`).

→ Để biểu thức phức tạp, dùng **Node Affinity**.

## Node Affinity — Cách mạnh hơn

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: data-processing
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: size
                operator: In
                values:
                  - large
                  - medium
  containers:
    - name: app
      image: data-processor
```

Phân tích:
- `affinity.nodeAffinity`: phần khai báo affinity với node.
- `requiredDuringSchedulingIgnoredDuringExecution`: type — sẽ giải thích sau.
- `nodeSelectorTerms`: list điều kiện (OR giữa các term).
- `matchExpressions`: list điều kiện (AND trong cùng term).

### Operators

| Operator | Ý nghĩa | Có cần `values`? |
|---|---|---|
| `In` | Label có value nằm trong list | Có |
| `NotIn` | Label không có value trong list | Có |
| `Exists` | Label tồn tại (value gì cũng được) | Không |
| `DoesNotExist` | Label không tồn tại | Không |
| `Gt` | Label value lớn hơn (cho integer) | Có (1 value) |
| `Lt` | Label value nhỏ hơn (cho integer) | Có (1 value) |

### Ví dụ phức tạp

```yaml
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          # Term 1: (size IN [large, medium]) AND (zone EXISTS)
          - matchExpressions:
              - key: size
                operator: In
                values: [large, medium]
              - key: zone
                operator: Exists
          # OR Term 2: (size NOT IN [small])
          - matchExpressions:
              - key: size
                operator: NotIn
                values: [small]
```

→ Pod vào node thoả Term 1 **HOẶC** Term 2.

## 2 Type của Node Affinity

```text
requiredDuringSchedulingIgnoredDuringExecution
                 ▲                  ▲
                 │                  │
       Phải match lúc        Đang chạy mà
       schedule              label node đổi
       (cứng)                → không evict
                             (ignore)
                             
preferredDuringSchedulingIgnoredDuringExecution
                 ▲                  ▲
                 │                  │
       Cố match lúc          Đang chạy mà
       schedule              label node đổi
       (mềm — best effort)   → không evict
```

### Required (cứng)

```yaml
requiredDuringSchedulingIgnoredDuringExecution:
  nodeSelectorTerms:
    - matchExpressions:
      - key: size
        operator: In
        values: [large]
```

**Pod bắt buộc** vào node match. Không có node nào match → **stuck Pending mãi**.

### Preferred (mềm)

```yaml
preferredDuringSchedulingIgnoredDuringExecution:
  - weight: 80
    preference:
      matchExpressions:
        - key: size
          operator: In
          values: [large]
  - weight: 20
    preference:
      matchExpressions:
        - key: size
          operator: In
          values: [medium]
```

Scheduler cộng điểm khi match — node match có điểm cao hơn. Nhưng **nếu không node nào match**, scheduler vẫn schedule lên node bất kỳ.

- `weight`: 1-100. Càng cao càng ưu tiên.
- Có thể có nhiều preferred — cộng điểm.

## So sánh Node Selector vs Node Affinity

| | Node Selector | Node Affinity |
|---|---|---|
| Cú pháp | Đơn giản (1 key=value) | Phức tạp (nhiều operator) |
| Operators | Chỉ Equality | In, NotIn, Exists, DoesNotExist, Gt, Lt |
| OR logic | ✗ | ✓ (qua `nodeSelectorTerms`) |
| Required vs Preferred | Required cứng | Cả 2 |
| Use case | Đơn giản | Phức tạp, production |

→ Khi không nhớ cú pháp đầy đủ, **dùng node selector** trong exam (nhanh hơn).

## Node Anti-Affinity

K8s không có "node anti-affinity" riêng — dùng `NotIn` hoặc `DoesNotExist`:

```yaml
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
        - matchExpressions:
            - key: size
              operator: NotIn
              values: [small]   # tránh node small
```

→ Pod tránh node có label `size=small`. Vẫn vào node khác.

## Future type: RequiredDuringExecution

Khi label node đổi sau khi Pod đã schedule:

```text
Hiện tại: IgnoredDuringExecution
   → Pod đang chạy, label node đổi → Pod tiếp tục, không bị evict

Future: RequiredDuringExecution
   → Pod đang chạy, label node đổi → KHÔNG còn match → Pod bị EVICT

Hiện K8s chưa support RequiredDuringExecution
(2025: vẫn chưa stable)
```

→ Câu hỏi exam có thể nhắc đến type này — biết rằng **chưa tồn tại stable**.

## Pod Affinity / Anti-Affinity (khác với Node Affinity)

Phân biệt 3 loại affinity trong K8s:

| Loại | Mục đích |
|---|---|
| **nodeAffinity** | Pod chọn node theo label node |
| **podAffinity** | Pod chọn node có Pod khác (gom Pod cùng app vào 1 node) |
| **podAntiAffinity** | Pod tránh node có Pod khác (spread Pod khắp cluster) |

Ví dụ podAntiAffinity (HA):

```yaml
spec:
  affinity:
    podAntiAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        - labelSelector:
            matchExpressions:
              - key: app
                operator: In
                values: [my-app]
          topologyKey: kubernetes.io/hostname
```

→ Mỗi Pod `app=my-app` ép vào **node khác nhau**. Để HA, nếu 1 node die không mất hết.

Phase 3 advanced (sau bài này) sẽ deep-dive thêm.

## Kết hợp Taint + Affinity — Pattern hoàn hảo

Đã học:
- **Taint**: node đẩy Pod.
- **Affinity**: Pod chọn node.

Kết hợp:

```text
[Mục tiêu]
Node Blue chỉ chạy Pod Blue. Pod Blue chỉ chạy Node Blue.

[Cách 1: Taint một mình]
Node Blue: taint color=blue
Pod Blue: toleration color=blue
→ Node Blue đẩy Pod khác. ✓
→ Nhưng Pod Blue có thể chạy node khác. ✗

[Cách 2: Affinity một mình]
Node Blue: label color=blue
Pod Blue: nodeAffinity color=blue
→ Pod Blue ép vào Node Blue. ✓
→ Nhưng Pod khác cũng có thể vào Node Blue. ✗

[Cách 3: KẾT HỢP]
Node Blue: taint color=blue + label color=blue
Pod Blue: toleration color=blue + nodeAffinity color=blue
→ Node Blue chỉ chấp nhận Pod Blue (taint). ✓
→ Pod Blue chỉ vào Node Blue (affinity). ✓
→ DEDICATE HOÀN TOÀN
```

Setup:
```bash
# Taint + label cho node
kubectl taint nodes node-blue color=blue:NoSchedule
kubectl label nodes node-blue color=blue
```

YAML Pod:
```yaml
spec:
  tolerations:
    - key: color
      operator: Equal
      value: blue
      effect: NoSchedule
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: color
                operator: In
                values: [blue]
```

## Use case thực tế

### 1. GPU dedicate (kết hợp đầy đủ)

```bash
# Setup node GPU
kubectl taint nodes gpu-node-1 dedicated=gpu:NoSchedule
kubectl label nodes gpu-node-1 hardware=gpu

# Pod ML
```

```yaml
spec:
  tolerations:
    - key: dedicated
      operator: Equal
      value: gpu
      effect: NoSchedule
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: hardware
                operator: In
                values: [gpu]
```

### 2. Tránh node small

```yaml
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: size
                operator: NotIn
                values: [small]
```

### 3. Prefer SSD nhưng không cứng

```yaml
spec:
  affinity:
    nodeAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          preference:
            matchExpressions:
              - key: disk
                operator: In
                values: [ssd]
```

→ Ưu tiên node có SSD. Không có SSD vẫn schedule node thường.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Quên label node trước khi tạo Pod | Pod stuck Pending | Label node trước, verify với `kubectl get nodes -L key` |
| Required affinity strict, không node match | Pod stuck mãi | Dùng preferred hoặc đảm bảo label đúng |
| Taint không có affinity → Pod Blue chạy node khác | Workload phân tán không như ý | Kết hợp taint + affinity |
| nodeSelector vs nodeAffinity dùng lẫn | YAML invalid (cùng spec) | Dùng nodeAffinity (mạnh hơn) cho production |
| Quên xoá label cũ khi đổi | Pod schedule sai node | `kubectl label nodes X key-` để xoá |
| `Gt`/`Lt` cho label string | Operator fail | Chỉ dùng cho integer label |

## Quick reference

```bash
# Label node
kubectl label nodes <node> key=value
kubectl label nodes <node> key=value --overwrite
kubectl label nodes <node> key-                     # remove

# Show labels
kubectl get nodes --show-labels
kubectl get nodes -L size,zone

# Pod với nodeSelector (đơn giản)
spec:
  nodeSelector:
    size: large

# Pod với nodeAffinity required
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: size
                operator: In
                values: [large, medium]

# Pod với nodeAffinity preferred
spec:
  affinity:
    nodeAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          preference:
            matchExpressions:
              - key: zone
                operator: In
                values: [us-east-1a]
```

## Tóm tắt bài 3

- **NodeSelector**: đơn giản, 1 cặp key=value, equality.
- **NodeAffinity**: mạnh hơn, hỗ trợ `In`, `NotIn`, `Exists`, `DoesNotExist`, `Gt`, `Lt`.
- 2 type: **Required** (cứng — stuck nếu không match) vs **Preferred** (mềm — best effort).
- **IgnoredDuringExecution**: label node đổi → Pod không evict.
- **RequiredDuringExecution**: chưa stable trong K8s.
- **Pod Affinity/AntiAffinity**: gom/tách Pod cùng app (khác node affinity).
- **Pattern hoàn hảo**: Taint + NodeAffinity → dedicate node.
- Kết hợp 2 cơ chế ngược chiều giải quyết bài toán "node chỉ cho Pod nào, Pod chỉ vào node nào".

**Bài kế tiếp** → [Bài 4: Resource Requirements & Limits](04-resource-requirements-limits.md)
