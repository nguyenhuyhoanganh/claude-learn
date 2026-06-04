# Bài 9: ReplicaSets — Đảm bảo số Pod luôn đúng

## Vì sao đơn Pod không đủ cho production

Bạn deploy 1 Pod nginx — Pod chết → app down. Không ai tự tạo lại Pod.

```text
[Production cần]

1. Có >= N Pod chạy luôn:
   - Pod chết → tạo Pod mới ngay
   - User không bị mất kết nối

2. Có thể scale up/down:
   - Traffic tăng → thêm Pod
   - Traffic giảm → bớt Pod

3. Phân bố Pod giữa nhiều node:
   - 1 node die → các Pod ở node khác vẫn phục vụ
```

**Pod đơn không đáp ứng**. Cần một layer phía trên — **ReplicaSet**.

## ReplicaSet là gì?

> **ReplicaSet** = controller đảm bảo **số Pod chạy luôn = N** (replicas) tại mọi thời điểm.

```text
Spec: replicas=3, selector=app:nginx

ReplicaSet Controller (chạy trong controller-manager):
─────────────────────────────────────────────────────
while True:
    pods = đếm Pod có label app=nginx
    
    if len(pods) < 3:
        tạo Pod mới từ template
    
    if len(pods) > 3:
        xoá Pod thừa
    
    sleep(N)

Kết quả: số Pod luôn cân bằng về 3
```

## Replication Controller vs ReplicaSet

K8s có 2 loại "đảm bảo replica" — phải phân biệt vì hay xuất hiện trong exam:

| | Replication Controller (RC) | ReplicaSet (RS) |
|---|---|---|
| Cũ/mới | **Cũ** (deprecated, chuẩn bị bỏ) | **Mới** (recommended) |
| API version | `v1` | `apps/v1` |
| `selector` | Optional (mặc định = labels của Pod template) | **Bắt buộc** |
| Selector type | Equality-based (=, !=) | Equality + Set-based (in, notin, exists) |
| Use case | Legacy code | **Mọi thứ mới** |

→ **Học ReplicaSet**. RC chỉ ôn nếu gặp legacy.

## YAML ReplicaSet

```yaml
apiVersion: apps/v1            # khác Pod (chỉ v1) vì RS ở apps group
kind: ReplicaSet
metadata:
  name: nginx-rs
  labels:
    app: nginx
spec:
  replicas: 3                 # số Pod muốn có
  selector:                   # ← BẮT BUỘC ở RS
    matchLabels:
      app: nginx              # RS quản Pod có label này
  template:                   # template để tạo Pod khi cần thêm
    metadata:
      labels:
        app: nginx            # phải match selector
    spec:
      containers:
        - name: nginx
          image: nginx:1.25
          ports:
            - containerPort: 80
```

**3 phần quan trọng**:
1. `replicas`: bao nhiêu Pod cần.
2. `selector.matchLabels`: filter để RS biết Pod nào thuộc nó.
3. `template`: spec Pod (giống YAML Pod nhưng không cần apiVersion/kind).

## Workflow: Tạo ReplicaSet → Pod tự tạo

```bash
kubectl apply -f rs.yaml
# replicaset.apps/nginx-rs created

# Kiểm tra
kubectl get rs
# NAME       DESIRED   CURRENT   READY   AGE
# nginx-rs   3         3         3       10s

# Pod tự được tạo
kubectl get pods
# NAME             READY   STATUS    AGE
# nginx-rs-abc12   1/1     Running   10s
# nginx-rs-def34   1/1     Running   10s
# nginx-rs-ghi56   1/1     Running   10s
```

Tên Pod = `<rs-name>-<hash>`. Đây là cách biết Pod thuộc RS nào.

## Tự healing — Pod chết, RS tạo lại

```bash
# Xoá 1 Pod
kubectl delete pod nginx-rs-abc12

# Theo dõi
kubectl get pods --watch
# nginx-rs-abc12   1/1   Terminating       (Pod cũ đang xoá)
# nginx-rs-xyz99   0/1   Pending           (Pod mới đang được tạo)
# nginx-rs-xyz99   0/1   ContainerCreating
# nginx-rs-xyz99   1/1   Running           (Pod mới đã chạy)
```

→ **RS tự tạo Pod thay thế trong vài giây**. Đây là magic của K8s.

## Selector và Labels — Cơ chế cốt lõi

ReplicaSet **không link cứng với Pod**. Mà link qua **label matching**:

```text
ReplicaSet "nginx-rs" có selector: app=nginx

Pod A: label app=nginx           → thuộc RS ← được manage
Pod B: label app=nginx, tier=web → thuộc RS ← được manage (vẫn có app=nginx)
Pod C: label app=redis           → không thuộc RS
Pod D: no label                  → không thuộc RS
```

→ RS đếm số Pod có label match → so với `replicas` → action.

### Hệ quả 1: "Adopt" Pod có sẵn

```text
Cluster state:
- 2 Pod có label app=nginx đang chạy (tạo trước)

Bạn apply RS spec: replicas=3, selector=app:nginx

RS xử lý:
- Đếm Pod app=nginx → 2 (có sẵn)
- Cần 3 → tạo thêm 1 Pod từ template

Kết quả: 3 Pod, trong đó 2 là Pod cũ "adopt", 1 mới tạo
```

### Hệ quả 2: Pod thoát ly RS

```text
Pod nginx-rs-abc12 đang được RS quản

Bạn: kubectl label pod nginx-rs-abc12 app=other --overwrite

→ Pod đã đổi label, không còn match selector
→ RS đếm số Pod app=nginx: chỉ còn 2
→ RS tạo thêm 1 Pod nữa
→ Bây giờ có 4 Pod (3 trong RS + 1 orphan)
```

→ Edit label cẩn thận. Trong exam có lab kiểu này.

## Selector matchLabels vs matchExpressions

`matchLabels` đơn giản (equality):

```yaml
selector:
  matchLabels:
    app: nginx
    env: production
```

→ Pod phải có **cả 2 label**: `app=nginx` AND `env=production`.

`matchExpressions` mạnh hơn (set-based):

```yaml
selector:
  matchExpressions:
    - key: app
      operator: In
      values: [nginx, apache, haproxy]
    - key: env
      operator: NotIn
      values: [dev]
    - key: tier
      operator: Exists           # phải có label tier (giá trị nào cũng được)
    - key: legacy
      operator: DoesNotExist     # không được có label legacy
```

Use case `matchExpressions`: filter phức tạp. Đa số dùng `matchLabels`.

## Scale ReplicaSet

3 cách scale:

### Cách 1: Sửa file YAML + `apply`

```yaml
spec:
  replicas: 5    # đổi từ 3 lên 5
```

```bash
kubectl apply -f rs.yaml
# replicaset.apps/nginx-rs configured
```

→ Reproducible. **Cách production dùng**.

### Cách 2: `kubectl scale`

```bash
kubectl scale rs nginx-rs --replicas=5

# Hoặc với file
kubectl scale --replicas=5 -f rs.yaml
```

→ Nhanh, không reproducible. File YAML vẫn `replicas: 3` mà cluster có 5 → drift.

### Cách 3: `kubectl edit`

```bash
kubectl edit rs nginx-rs
# Mở vim, sửa `replicas`, save
```

→ Tương tự `scale`. Cluster có thay đổi nhưng file local không.

## Xem chi tiết ReplicaSet

```bash
# List
kubectl get rs

# Chi tiết
kubectl describe rs nginx-rs
# Name:         nginx-rs
# Selector:     app=nginx
# Labels:       app=nginx
# Replicas:     3 current / 3 desired
# Pods Status:  3 Running / 0 Waiting / 0 Succeeded / 0 Failed
# Pod Template:
#   ...
# Events:
#   Type    Reason            Message
#   ----    ------            -------
#   Normal  SuccessfulCreate  Created pod: nginx-rs-abc12

# Dạng YAML
kubectl get rs nginx-rs -o yaml
```

## Tự xoá ReplicaSet và Pod

```bash
# Xoá RS → Pod cũng bị xoá (cascading)
kubectl delete rs nginx-rs

# Hoặc xoá theo file
kubectl delete -f rs.yaml
```

Trong K8s, default delete = **cascading** (parent xoá → children xoá theo). Tránh xoá orphan resource.

Muốn giữ Pod (rare case):
```bash
kubectl delete rs nginx-rs --cascade=orphan
```

→ RS bị xoá, Pod vẫn còn. Sau đó cần manage Pod tay.

## Khi nào dùng ReplicaSet trực tiếp?

**Trả lời ngắn**: Hầu như không bao giờ. Dùng **Deployment** thay thế.

ReplicaSet là **đơn vị tầng dưới** mà **Deployment** quản. Deployment ép thêm rolling update, rollback, pause/resume. Bạn deploy app qua Deployment, K8s tự tạo ReplicaSet bên dưới.

→ ReplicaSet thuần chỉ dùng khi cần custom workflow rất hiếm. Trong CKA, bài tiếp theo về **Deployment** mới là chính.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Selector không match template label | Apply fail | Đảm bảo `selector.matchLabels` ⊆ `template.metadata.labels` |
| Đổi label Pod đang chạy | Pod "orphan", RS tạo thêm Pod mới → quá số | Hạn chế đổi label, hiểu hệ quả |
| Quên `selector` (như RC) | Apply RS fail | Selector bắt buộc với RS |
| `apiVersion: v1` thay vì `apps/v1` | "no match for kind ReplicaSet" | apps/v1 cho RS, Deployment, StatefulSet |
| Scale qua CLI nhưng file YAML không update | Drift giữa Git và cluster | Luôn sửa YAML + apply |
| 2 RS có selector overlap | Pod bị 2 RS tranh giành | Selector mỗi RS phải unique |
| Xoá RS mà muốn giữ Pod | Pod bị xoá (default cascading) | `--cascade=orphan` |

## Tóm tắt bài 9

- **ReplicaSet** = controller đảm bảo số Pod luôn = `replicas`.
- 3 phần quan trọng: `replicas`, `selector.matchLabels`, `template`.
- ReplicaSet link Pod qua **label matching**, không link cứng.
- Pod chết → RS tạo lại. Pod nhiều → RS xoá thừa.
- `selector` **bắt buộc** ở ReplicaSet (khác RC).
- Scale: sửa file + apply (reproducible) hoặc `kubectl scale` (nhanh nhưng drift).
- **Production: dùng Deployment, không dùng ReplicaSet trực tiếp**.

**Bài kế tiếp** → [Bài 10: Deployments — Rolling update + rollback](10-deployments.md)
