# Bài 4: Resource Requirements & Limits

## Vì sao bài này quan trọng?

Production K8s **không có** request/limit → 1 Pod malicious có thể chiếm hết CPU/RAM node → các Pod khác bị starve. "Noisy neighbor" — vấn đề phổ biến nhất khi vận hành K8s mới.

CKA test rất kỹ phần này — `Pod stuck Pending` thường do thiếu resource trên cluster, hoặc `Pod OOMKilled` do limit thấp.

## Khái niệm cơ bản

```text
Node có resource tổng:
- Node-1: 8 CPU, 16 GB RAM
- Node-2: 8 CPU, 16 GB RAM
- Node-3: 4 CPU, 8 GB RAM

Mỗi Pod yêu cầu resource:
- Pod A: 2 CPU, 4 GB
- Pod B: 1 CPU, 2 GB

Scheduler:
- Tìm node có ĐỦ resource còn lại
- Place Pod lên đó
- Resource "reserved" cho Pod (dù chưa dùng)
```

Nếu không node nào đủ resource → Pod **stuck Pending**:

```bash
kubectl describe pod my-pod
# Events:
#   Warning  FailedScheduling  0/3 nodes are available: 3 Insufficient cpu.
```

## Resource Request vs Limit

| | Request | Limit |
|---|---|---|
| Định nghĩa | Min resource **đảm bảo** cho container | Max resource container được dùng |
| Scheduler dùng | ✓ (để chọn node) | ✗ |
| Container có thể vượt? | Có (nếu node còn dư) | Không |
| Nếu vượt CPU | (không có request) | **Throttle** (giảm tốc) |
| Nếu vượt Memory | (không có request) | **OOMKilled** (giết Pod) |

→ Request = "tôi cần ít nhất X". Limit = "tôi không bao giờ vượt Y".

## YAML

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
spec:
  containers:
    - name: app
      image: nginx
      resources:
        requests:
          cpu: 100m              # 0.1 CPU
          memory: 256Mi          # 256 MiB
        limits:
          cpu: 500m              # 0.5 CPU
          memory: 1Gi            # 1 GiB
```

## Đơn vị CPU

```text
1 CPU = 1 vCPU (AWS) = 1 core (GCP) = 1 hyperthread (bare-metal)

Có thể chia nhỏ:
1.0  = 1 CPU
0.5  = 500m (millicpu)
0.1  = 100m
0.001 = 1m (smallest)

NOT phổ biến (dùng fraction)
```

→ Production thường viết dạng `m` (milli) — clearer.

## Đơn vị Memory

```text
Byte-based (1024):           Decimal-based (1000):
Ki = 1024 byte               K  = 1000 byte
Mi = 1024 × 1024 byte        M  = 1000 × 1000 byte
Gi = 1024 × 1024 × 1024      G  = 1000 × 1000 × 1000
Ti = ...                     T  = ...

Khuyến nghị: dùng -i suffix (Mi, Gi) để chính xác
```

Lưu ý:
- `1 Mi` = 1,048,576 byte
- `1 M` = 1,000,000 byte

→ Khác biệt 4.86%. Production nên dùng `Mi`, `Gi`.

## CPU vượt limit → Throttle

Container yêu cầu 1 CPU, limit 1 CPU. Code thread chạy 100% CPU:

```text
CPU usage:
███████████████████████  Limit 100%
███████████████████████  Container muốn dùng 200% (2 thread)
                         ↓
                         Kernel throttle về 100%
                         Container không bị kill, chỉ slow

→ App bị chậm, nhưng vẫn chạy
```

## Memory vượt limit → OOMKilled

Khác CPU, **memory không throttle được** — đã cấp byte rồi không thu lại được:

```text
Memory limit: 1 GiB
Container allocate: 1.2 GiB
                    ↓
            OS Out-Of-Memory Killer (OOMKiller)
                    ↓
            Container nhận SIGKILL → chết

Pod status:
NAME      READY   STATUS      RESTARTS   AGE
my-pod    0/1     OOMKilled   3          10m
                              ↑
                  Kubelet restart Pod → loop
```

Kiểm tra:
```bash
kubectl describe pod my-pod
# Last State: Terminated
#   Reason: OOMKilled
#   Exit Code: 137                ← signal 9 (SIGKILL)
```

→ App phải lo memory leak hoặc tăng limit.

## 4 chiến lược request/limit

### 1. Không set gì (DEFAULT — XẤU)

```yaml
spec:
  containers:
    - name: app
      image: nginx
      # không có resources
```

Hậu quả: Pod **không bị giới hạn**. 1 Pod consume hết node → các Pod khác starve.

→ **TRÁNH ở production**. Đây là default sai lầm.

### 2. Limit nhưng không Request

```yaml
resources:
  limits:
    cpu: 1
    memory: 1Gi
```

K8s tự set Request = Limit. Pod được guarantee đúng đó:
- CPU 1 (request) → guarantee 1 CPU, limit 1 CPU (không thể vượt).
- Memory 1Gi (request) → guarantee 1 GiB.

### 3. Request + Limit (cùng giá trị) — Guaranteed

```yaml
resources:
  requests:
    cpu: 1
    memory: 1Gi
  limits:
    cpu: 1
    memory: 1Gi
```

**Guaranteed QoS** — Pod cao priority nhất, không bị evict đầu tiên khi node hết resource.

→ Production critical app dùng pattern này.

### 4. Request + Limit (giá trị khác) — Burstable

```yaml
resources:
  requests:
    cpu: 100m         # guarantee 100m
    memory: 128Mi
  limits:
    cpu: 1            # có thể burst lên 1 CPU
    memory: 512Mi
```

Pod được **guarantee Request**, có thể **burst lên Limit** khi node còn dư.

→ Balance giữa guarantee và linh hoạt. Recommend cho đa số app.

### Pattern 5: Chỉ Request (không Limit) — Best Effort CPU

```yaml
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  # không có limits
```

Pod được guarantee Request. Không có limit → có thể dùng tài nguyên còn dư của node.

→ **Cho CPU thì OK** (vì throttling tự nhiên khi node bận).
→ **Cho memory thì NGUY HIỂM** (có thể chiếm hết memory node → ảnh hưởng node).

## QoS Classes

K8s gán **Quality of Service class** dựa trên request/limit:

| QoS class | Khi nào |
|---|---|
| **Guaranteed** | Cả container đều có `requests = limits` cho cả CPU + Memory |
| **Burstable** | Có ít nhất 1 request hoặc limit (không Guaranteed) |
| **BestEffort** | Không có request hoặc limit nào |

Eviction order khi node hết resource:
1. **BestEffort** (evict đầu tiên).
2. **Burstable** (vượt request).
3. **Guaranteed** (last — chỉ evict nếu node thực sự critical).

→ Critical app phải là **Guaranteed** để an toàn.

```bash
kubectl get pod my-pod -o yaml | grep -i qos
# qosClass: Guaranteed
```

## LimitRange — Set default cho namespace

Không muốn dev nào cũng phải nhớ set request/limit → setup `LimitRange` ở namespace:

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-resources
  namespace: dev
spec:
  limits:
    - type: Container
      default:                # default LIMIT nếu container không khai
        cpu: 500m
        memory: 256Mi
      defaultRequest:         # default REQUEST nếu container không khai
        cpu: 100m
        memory: 128Mi
      max:                    # max limit container có thể set
        cpu: 2
        memory: 2Gi
      min:                    # min request container phải set
        cpu: 50m
        memory: 64Mi
```

Apply:
```bash
kubectl apply -f limit-range.yaml -n dev
```

Sau khi apply:
- Pod mới không có resource → tự set theo `default` + `defaultRequest`.
- Pod set vượt `max` → reject.
- Pod set thấp hơn `min` → reject.

**Quan trọng**: LimitRange **chỉ áp dụng cho Pod tạo SAU**. Pod đã chạy không bị ảnh hưởng.

## ResourceQuota — Giới hạn tổng namespace

LimitRange cho **mỗi Pod**. ResourceQuota cho **tổng namespace**:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-a-quota
  namespace: team-a
spec:
  hard:
    requests.cpu: "10"            # tổng CPU request không quá 10
    requests.memory: 20Gi
    limits.cpu: "20"
    limits.memory: 40Gi
    pods: "50"                    # max 50 Pod
    services: "10"
    persistentvolumeclaims: "20"
    services.loadbalancers: "2"
```

Vượt quota → tạo resource fail:
```bash
kubectl apply -f pod.yaml
# Error: pods "x" is forbidden: exceeded quota: team-a-quota,
# requested: requests.cpu=2, used: requests.cpu=9, limited: requests.cpu=10
```

Check usage:
```bash
kubectl describe quota team-a-quota -n team-a
# Resource           Used   Hard
# requests.cpu       9      10
# requests.memory    18Gi   20Gi
# pods               45     50
```

## Best practice production

```text
✓ Set request + limit cho mọi container
✓ Critical app: Guaranteed (request = limit)
✓ Non-critical app: Burstable (limit > request)
✓ Memory limit luôn set (tránh OOM lan)
✓ CPU limit có thể skip nếu trust app (cho phép burst)
✓ ResourceQuota + LimitRange ở mọi namespace user
✓ Monitor actual usage qua metrics-server / Prometheus
✗ KHÔNG để Pod không có resource gì
✗ KHÔNG set limit thấp hơn actual usage (OOM hoặc throttle nặng)
✗ KHÔNG set request quá cao (lãng phí node)
```

## Right-sizing — Tính resource đúng

Workflow:
1. Set request/limit ban đầu **dựa trên load test**.
2. Deploy + monitor 1-2 tuần (Prometheus/Grafana).
3. Xem 95-99 percentile usage.
4. Tinh chỉnh:
   - **Request** ≈ usage trung bình (75-90 percentile).
   - **Limit** ≈ 1.5x request (cho phép burst).

Tool support: **Vertical Pod Autoscaler (VPA)** — tự đề xuất right-size.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Quên set limit memory | OOM ảnh hưởng node | Luôn set memory limit |
| Set CPU limit quá thấp | Throttle nặng, app slow | Test load trước |
| Set memory request = limit cho mọi app | Lãng phí, ít flex | Burstable (Request < Limit) |
| Tạo Pod trong namespace có quota nhưng không khai resource | Reject (nếu LimitRange chưa setup) | Setup LimitRange default |
| `kubectl describe node` quên check Allocatable | Tưởng node đủ, scheduler không thấy | Node có resource reserved cho system |
| Pod yêu cầu 5 CPU nhưng node có 4 | Stuck Pending mãi | Giảm request hoặc tăng node |

## Debug Pod resource issue

```bash
# Pod stuck Pending
kubectl describe pod my-pod
# Events: FailedScheduling: Insufficient cpu/memory

# Pod OOMKilled
kubectl describe pod my-pod
# State: Terminated
#   Reason: OOMKilled

# Xem usage thực tế (cần metrics-server)
kubectl top pod my-pod
kubectl top node

# Xem allocatable trên node
kubectl describe node node-1 | grep -A 8 Allocatable
# Allocatable:
#   cpu:                4
#   memory:             7905720Ki
#   pods:               110
```

## Quick reference

```yaml
# Pod với request + limit
spec:
  containers:
    - name: app
      image: nginx
      resources:
        requests:
          cpu: 100m
          memory: 128Mi
        limits:
          cpu: 500m
          memory: 256Mi

# LimitRange (set default cho namespace)
apiVersion: v1
kind: LimitRange
metadata:
  name: defaults
spec:
  limits:
    - type: Container
      default: { cpu: 500m, memory: 256Mi }
      defaultRequest: { cpu: 100m, memory: 128Mi }
      max: { cpu: 2, memory: 1Gi }
      min: { cpu: 50m, memory: 64Mi }

# ResourceQuota (tổng namespace)
apiVersion: v1
kind: ResourceQuota
metadata:
  name: quota
spec:
  hard:
    requests.cpu: "10"
    limits.cpu: "20"
    requests.memory: 20Gi
    pods: "50"
```

## Tóm tắt bài 4

- **Request**: min resource đảm bảo. Scheduler dùng để chọn node.
- **Limit**: max resource. CPU vượt → throttle. Memory vượt → **OOMKilled**.
- Đơn vị CPU: `1`, `0.5`, `500m` (millicpu).
- Đơn vị Memory: `Mi` (1024-base), `M` (1000-base). Dùng `Mi`.
- **QoS classes**: Guaranteed (req=limit) → Burstable → BestEffort. Eviction theo thứ tự ngược.
- **LimitRange** = default cho namespace (per-Pod).
- **ResourceQuota** = tổng giới hạn namespace.
- Best practice: luôn set memory limit, CPU limit tuỳ workload.
- Right-size dựa trên monitoring thực tế, không guess.

**Bài kế tiếp** → [Bài 5: DaemonSets, Static Pods, Priority Classes](05-daemonsets-static-pods-priority.md)
