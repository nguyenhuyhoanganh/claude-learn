# Bài 1: Manual Scheduling & Labels/Selectors

## Vì sao Phase 3 quan trọng cho CKA?

**Scheduling** chiếm phần lớn trong **Workloads & Scheduling** (15% điểm CKA) và xuất hiện gián tiếp trong **Troubleshooting** (30%). Pod stuck `Pending`? → Scheduling issue. Pod chạy sai node? → Scheduling issue.

Phase này deep-dive 6 cơ chế chính:
1. Manual scheduling (bài này) — bypass scheduler.
2. Labels + Selectors (bài này) — nền tảng cho mọi cơ chế khác.
3. Taints + Tolerations — node "đẩy" Pod.
4. Node Selectors + Node Affinity — Pod "chọn" node.
5. Resource Requirements + Limits — Pod yêu cầu CPU/RAM.
6. DaemonSets, Static Pods, Priority Classes, Multiple Schedulers.

## Phần 1: Manual Scheduling

### Cách scheduler hoạt động (recap)

Pod tạo ra → `spec.nodeName = ""` (chưa được assign):

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx
spec:
  # nodeName: <empty>   ← scheduler sẽ điền
  containers:
  - name: nginx
    image: nginx
```

Scheduler watch apiserver:
- Thấy Pod chưa có `nodeName` → đem vào "queue chờ schedule".
- Chạy thuật toán → chọn node.
- **PATCH** apiserver: set `nodeName=worker-2`.

Kubelet trên worker-2 watch apiserver, thấy Pod được assign cho mình → chạy.

### Khi nào cần manual schedule?

3 trường hợp thực tế:

```text
1. Cluster KHÔNG có scheduler (rất hiếm — vd debug, test)
2. Cần force Pod chạy 1 node cụ thể bỏ qua mọi rule
3. Migrate Pod từ scheduler khác sang
```

→ Production gần như **không bao giờ** dùng manual scheduling. Học để hiểu cơ chế.

### Cách 1: Set `nodeName` lúc tạo Pod

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx
spec:
  nodeName: worker-2          # ← gán cứng
  containers:
  - name: nginx
    image: nginx
```

Pod tạo ra → đi thẳng tới worker-2, không qua scheduler. Kubelet trên worker-2 chạy ngay.

**Cảnh báo**: Nếu worker-2 không tồn tại hoặc không đủ resource → Pod stuck **mà không có error** (không có scheduler để báo). Phải `kubectl describe` xem.

### Cách 2: Tạo Binding object cho Pod đã tồn tại

`nodeName` là **immutable** sau khi Pod tạo. Đã tạo Pod chưa schedule → không sửa được:

```bash
kubectl edit pod nginx
# Sửa nodeName → fail "cannot change nodeName"
```

→ Phải tạo **Binding** object:

```yaml
apiVersion: v1
kind: Binding
metadata:
  name: nginx                  # tên Pod
target:
  apiVersion: v1
  kind: Node
  name: worker-2
```

POST tới apiserver:
```bash
curl --header "Content-Type:application/json" \
  --request POST \
  --data '{"apiVersion":"v1","kind":"Binding","metadata":{"name":"nginx"},"target":{"apiVersion":"v1","kind":"Node","name":"worker-2"}}' \
  http://$SERVER/api/v1/namespaces/default/pods/$PODNAME/binding/
```

→ Đây chính xác là cái scheduler làm. Manually mô phỏng.

→ Hiếm khi dùng. Trong exam, dùng `nodeName` lúc tạo Pod.

## Phần 2: Labels và Selectors

### Vấn đề: Cluster có hàng nghìn object

Production cluster: 5000+ Pod, 100+ Deployment, 200+ Service. Làm sao filter "tất cả Pod của app order-service ở environment production"?

→ **Labels** + **Selectors**.

### Labels là gì?

> **Label** = cặp **key-value** gắn vào object để group + filter.

```yaml
metadata:
  name: nginx
  labels:
    app: ecommerce
    tier: frontend
    environment: production
    version: "1.2.3"
```

Quy tắc label:
- Key: max 63 ký tự, alphanumeric + `-` + `_` + `.`.
- Value: max 63 ký tự, hoặc empty.
- Bao nhiêu label tùy bạn — không giới hạn.

### Add label cho object

```bash
# Lúc tạo (trong YAML)
metadata:
  labels:
    app: nginx
    tier: frontend

# Sau khi tạo (CLI)
kubectl label pod nginx env=production

# Overwrite label cũ
kubectl label pod nginx env=staging --overwrite

# Xoá label (thêm "-")
kubectl label pod nginx env-
```

### Xem labels

```bash
# Show labels
kubectl get pods --show-labels
# NAME    READY   STATUS    AGE     LABELS
# nginx   1/1     Running   5m      app=nginx,tier=frontend,env=prod

# Show specific label as column
kubectl get pods -L app,tier
# NAME    READY   STATUS    APP     TIER
# nginx   1/1     Running   nginx   frontend
```

### Selectors — Filter qua label

#### Equality-based

```bash
# Pod có label app=nginx
kubectl get pods -l app=nginx

# Pod KHÔNG có label env=prod
kubectl get pods -l env!=prod

# AND nhiều điều kiện
kubectl get pods -l app=nginx,tier=frontend

# Pod có 2 label cùng lúc:
# (app=nginx) AND (env=prod)
kubectl get pods -l app=nginx,env=prod
```

#### Set-based

```bash
# IN
kubectl get pods -l 'env in (prod, staging)'

# NOT IN
kubectl get pods -l 'env notin (dev)'

# EXISTS
kubectl get pods -l 'env'                 # Pod có label env (giá trị nào cũng được)

# DOES NOT EXIST
kubectl get pods -l '!env'                # Pod KHÔNG có label env
```

### Selector trong YAML (ReplicaSet, Service, Deployment)

3 nơi quan trọng:

#### 1. ReplicaSet/Deployment selector

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deploy
  labels:                       # Label của Deployment object (ít quan trọng)
    app: nginx
spec:
  selector:
    matchLabels:                # Selector để Deployment biết Pod nào của mình
      app: nginx
      tier: frontend
  template:
    metadata:
      labels:                   # Label của Pod template (PHẢI match selector)
        app: nginx
        tier: frontend
    spec:
      containers:
      - name: nginx
        image: nginx
```

**3 label section** dễ confuse:
- `metadata.labels`: của Deployment object (nếu Service muốn tìm Deployment thì dùng).
- `spec.selector.matchLabels`: filter Pod nào thuộc Deployment.
- `spec.template.metadata.labels`: label gắn vào mỗi Pod tạo ra.

**Quy tắc**: `selector.matchLabels` **⊆** `template.metadata.labels` (selector phải là subset).

#### 2. Service selector

```yaml
apiVersion: v1
kind: Service
metadata:
  name: nginx-svc
spec:
  selector:                     # Service link Pod qua selector này
    app: nginx
    tier: frontend
  ports:
  - port: 80
    targetPort: 8080
```

Service forward traffic đến **Pod match selector**. Nếu selector sai → endpoint trống.

#### 3. NetworkPolicy selector (Phase 9)

Sẽ học sau.

### matchLabels vs matchExpressions

`matchLabels` đơn giản:

```yaml
selector:
  matchLabels:
    app: nginx
    env: prod
```

`matchExpressions` linh hoạt (set-based):

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
      operator: Exists
    - key: legacy
      operator: DoesNotExist
```

Cả 2 đều validate ở selector. Nếu khai báo cả 2 → AND.

→ `matchLabels` cho 95% case. `matchExpressions` cho filter phức tạp.

### Annotations vs Labels

| | Labels | Annotations |
|---|---|---|
| Mục đích | **Group + filter** | **Metadata thông tin** |
| Selector | ✓ | ✗ (không filter được) |
| Size | Max 63 ký tự value | Bất kỳ |
| Use case | `app=nginx`, `env=prod` | Build info, contact email, tool config |

```yaml
metadata:
  name: nginx
  labels:
    app: nginx
    env: prod
  annotations:
    build-version: "1.2.3-abc123def"
    contact: "devops@example.com"
    documentation: "https://wiki.example.com/nginx"
    last-deployed-by: "alice@example.com"
    kubectl.kubernetes.io/last-applied-configuration: "..."
```

→ Annotation **không filter** nhưng giữ thông tin quan trọng.

## Use case thực tế

### 1. Group resource theo app

```yaml
# Mọi resource của app order-service:
metadata:
  labels:
    app.kubernetes.io/name: order-service
    app.kubernetes.io/instance: order-service-prod
    app.kubernetes.io/version: "1.2.3"
    app.kubernetes.io/component: backend
    app.kubernetes.io/part-of: ecommerce
    app.kubernetes.io/managed-by: helm
```

→ K8s recommend **prefix `app.kubernetes.io/`** cho metadata chuẩn.

```bash
# Xem mọi resource của order-service
kubectl get all -l app.kubernetes.io/name=order-service
```

### 2. Service link Pod multi-version

```yaml
# Pod v1
metadata:
  labels:
    app: api
    version: v1

# Pod v2 (canary)
metadata:
  labels:
    app: api
    version: v2

# Service catch cả 2 (cho A/B test)
apiVersion: v1
kind: Service
metadata:
  name: api
spec:
  selector:
    app: api          # bỏ version → match cả v1 và v2
  ports:
  - port: 80
```

→ Traffic split tự nhiên (50/50 nếu mỗi version 1 Pod).

### 3. Selector cho HPA (Horizontal Pod Autoscaler)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-deploy
```

HPA tìm Deployment qua name (không phải selector). Nhưng metrics-server filter Pod qua label.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| `nodeName` set sai (node không tồn tại) | Pod stuck mà không error rõ | `kubectl describe pod` xem |
| Selector không match Pod label | Endpoint trống, Service không hoạt động | Verify với `kubectl get pods -l <selector>` |
| Sửa Pod label đang được ReplicaSet quản | Pod orphan, RS tạo Pod mới → quá số | Hiểu hệ quả trước khi edit label |
| Trong Deployment, selector ≠ template label | Apply fail "selector does not match template labels" | Đảm bảo selector ⊆ template labels |
| Quên `matchLabels` trong selector | YAML invalid | Selector bắt buộc trong RS/Deployment |
| Dùng annotation để filter | Không hoạt động (annotation không filter được) | Dùng label cho filter, annotation cho info |
| Label key có space hoặc ký tự lạ | Apply fail | alphanumeric + `-_./` |

## Quick reference

```bash
# Label
kubectl label pod nginx env=prod                    # add
kubectl label pod nginx env=staging --overwrite     # overwrite
kubectl label pod nginx env-                         # remove

# Filter
kubectl get pods -l app=nginx
kubectl get pods -l 'env in (prod, staging)'
kubectl get pods -l '!env'

# Show
kubectl get pods --show-labels
kubectl get pods -L app,tier

# Manual schedule
kubectl run nginx --image=nginx --overrides='{"spec":{"nodeName":"worker-2"}}'
# Hoặc tạo từ YAML có nodeName
```

## Tóm tắt bài 1

- **Manual scheduling**: set `nodeName` lúc tạo Pod (immutable). Hiếm dùng production.
- **Binding object**: POST tới apiserver để assign Pod đã tồn tại — mô phỏng scheduler.
- **Labels** = key-value để group/filter. Không giới hạn số label.
- **Selectors** = filter dùng label. Equality (`=`, `!=`) hoặc Set-based (`in`, `notin`, `exists`).
- 3 nơi dùng selector: ReplicaSet/Deployment, Service, NetworkPolicy.
- **Annotation** = metadata info, **không** filter được.
- Prefix chuẩn: `app.kubernetes.io/name`, `app.kubernetes.io/version`, ...
- **selector phải là subset của template labels** trong Deployment/RS.

**Bài kế tiếp** → [Bài 2: Taints & Tolerations — Node "đẩy" Pod](02-taints-tolerations.md)
