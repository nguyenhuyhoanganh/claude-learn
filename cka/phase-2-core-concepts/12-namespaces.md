# Bài 12: Namespaces — Cô lập resource trong cluster

## Vì sao cần Namespace?

Hình dung 2 cậu bé cùng tên **Mark** — Mark Smith và Mark Williams. Trong nhà Smith, mọi người gọi "Mark". Trong nhà Williams, mọi người cũng gọi "Mark". Không ai nhầm — vì họ ở **2 nhà khác nhau**.

Người ngoài muốn gọi chính xác → phải dùng đầy đủ: "Mark Smith" hay "Mark Williams".

```text
Trong K8s:
- Nhà Smith ↔ Namespace "production"
- Nhà Williams ↔ Namespace "staging"
- Cùng tên "nginx" (Pod) có thể tồn tại trong 2 namespace
- Pod trong namespace nói chuyện với nhau qua tên đơn giản
- Pod khác namespace dùng tên đầy đủ
```

→ Namespace = **mechanism cô lập** resource trong cùng cluster.

## Use case của Namespace

```text
1. Multi-tenant: nhiều team chia chung 1 cluster
   - Team A: namespace team-a
   - Team B: namespace team-b
   - Mỗi team không thấy/sửa resource của team khác (qua RBAC)

2. Multi-environment: 1 cluster cho dev/staging/prod
   - namespace dev, staging, prod
   - Cùng tên app nginx → 3 instance ở 3 namespace
   - Quota riêng cho mỗi env

3. Component separation:
   - kube-system: control plane component
   - monitoring: Prometheus, Grafana
   - logging: Elasticsearch, Fluentd
   - app namespace: ứng dụng business

4. Quản lý RBAC:
   - Permission granular per namespace
   - User team A chỉ có quyền namespace team-a
```

## Default namespaces có sẵn

Khi cluster mới tạo, K8s có sẵn:

| Namespace | Mục đích |
|---|---|
| `default` | Nơi resource user mặc định được tạo |
| `kube-system` | Control plane component (apiserver, etcd, scheduler, ...) |
| `kube-public` | Resource công khai cho mọi user (kể cả chưa auth) |
| `kube-node-lease` | Node heartbeat (tối ưu performance node check) |

```bash
kubectl get namespaces
# NAME              STATUS   AGE
# default           Active   30d
# kube-node-lease   Active   30d
# kube-public       Active   30d
# kube-system       Active   30d
```

## Mọi resource đều thuộc 1 namespace

**Trừ resource cluster-scoped** (Node, PersistentVolume, ClusterRole, ...).

```bash
# Xem resource nào namespaced/cluster-scoped
kubectl api-resources
# NAME        APIVERSION   NAMESPACED   KIND
# pods        v1           true         Pod          ← namespaced
# services    v1           true         Service      ← namespaced
# deployments apps/v1      true         Deployment   ← namespaced
# nodes       v1           false        Node         ← cluster-scoped
# pv          v1           false        PersistentVolume   ← cluster-scoped
# ...
```

Resource cluster-scoped không cần namespace, không thể đặt vào namespace.

## Default namespace mặc định

Khi bạn `kubectl get pods` không chỉ định namespace → mặc định **namespace `default`**:

```bash
kubectl get pods
# Tương đương:
kubectl get pods -n default
```

→ User mới làm K8s đa số chỉ dùng `default`. Production thường tách namespace riêng.

## Tạo namespace

### Cách 1: imperative

```bash
kubectl create namespace dev
# namespace/dev created

# Verify
kubectl get ns
# NAME              STATUS   AGE
# default           Active   30d
# dev               Active   5s
# kube-system       Active   30d
# ...
```

### Cách 2: YAML

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: dev
```

```bash
kubectl apply -f ns.yaml
```

## Tạo resource trong namespace

### Cách 1: Flag `-n`

```bash
kubectl run nginx --image=nginx -n dev
kubectl get pods -n dev
```

### Cách 2: Set namespace trong YAML

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx
  namespace: dev               # ← chỉ định trong file
spec:
  containers:
  - name: nginx
    image: nginx
```

```bash
kubectl apply -f pod.yaml
# Pod sẽ vào namespace "dev"
```

→ Production prefer cách 2 (declarative).

### Cách 3: Switch namespace mặc định

```bash
# Set namespace mặc định cho context hiện tại
kubectl config set-context --current --namespace=dev

# Bây giờ kubectl không cần -n
kubectl get pods           # tự động trong namespace dev
```

→ Tiết kiệm thời gian khi làm nhiều với 1 namespace. **CKA exam dùng nhiều**.

## Xem resource ở mọi namespace

```bash
kubectl get pods --all-namespaces
# hoặc shortcut:
kubectl get pods -A

# NAMESPACE     NAME                                READY   STATUS    AGE
# default       nginx                               1/1     Running   1d
# dev           nginx                               1/1     Running   1h
# kube-system   etcd-master                         1/1     Running   30d
# kube-system   kube-apiserver-master               1/1     Running   30d
# ...
```

## DNS cross-namespace

Service trong cùng namespace gọi bằng tên đơn giản:

```bash
# Pod trong namespace "default" gọi:
curl http://backend
# Resolve: backend.default.svc.cluster.local
```

Pod gọi Service **khác namespace**:

```bash
# Pod trong "default" gọi service "backend" trong namespace "dev":
curl http://backend.dev
# Hoặc đầy đủ:
curl http://backend.dev.svc.cluster.local
```

**Format chuẩn**: `<service-name>.<namespace>.svc.<cluster-domain>`
- `cluster-domain` mặc định = `cluster.local`.

## ResourceQuota — Giới hạn resource namespace

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: dev-quota
  namespace: dev
spec:
  hard:
    pods: "10"                      # max 10 Pod
    requests.cpu: "4"               # max 4 CPU cores
    requests.memory: 8Gi            # max 8 GB RAM
    limits.cpu: "8"
    limits.memory: 16Gi
    persistentvolumeclaims: "5"
    services.loadbalancers: "2"
```

```bash
kubectl apply -f quota.yaml -n dev

# Sau khi áp dụng, Pod thứ 11 sẽ bị reject
kubectl describe quota dev-quota -n dev
# Resource           Used   Hard
# pods               5      10
# requests.cpu       2      4
# requests.memory    3Gi    8Gi
```

→ Phase 3 + Phase 5 sẽ chi tiết thêm.

## LimitRange — Set default request/limit

Pod không khai báo request → có thể dùng quá nhiều resource. `LimitRange` set default:

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limit
  namespace: dev
spec:
  limits:
  - default:
      cpu: 500m
      memory: 256Mi
    defaultRequest:
      cpu: 100m
      memory: 128Mi
    type: Container
```

→ Mọi container mới trong namespace `dev` tự được set request/limit.

## Xoá namespace

```bash
kubectl delete namespace dev
```

**Cảnh báo**: Xoá namespace → **xoá MỌI resource trong đó** (Pod, Service, ConfigMap, Secret, ...). Không undo được.

```bash
# An toàn hơn: list resource trước
kubectl get all -n dev
# Nếu OK → delete
kubectl delete namespace dev
```

Khi xoá:
1. Namespace status → `Terminating`.
2. Namespace controller chạy finalizer: xoá tất cả resource bên trong.
3. Khi sạch → namespace bị xoá.

→ Quá trình có thể mất **vài phút** với nhiều resource.

## Stuck namespace ở `Terminating` mãi

Bug phổ biến: namespace stuck `Terminating` vì finalizer không clear:

```bash
kubectl get ns
# dev   Terminating   1h    ← stuck

# Debug
kubectl get ns dev -o yaml
# spec:
#   finalizers:
#   - kubernetes      ← cái này không clear
```

Workaround (cẩn thận):

```bash
kubectl get ns dev -o json | jq '.spec.finalizers = []' > /tmp/ns.json
kubectl replace --raw "/api/v1/namespaces/dev/finalize" -f /tmp/ns.json
```

→ Force remove finalizer. Namespace sẽ chính thức xoá.

**Đừng dùng trong production** trừ khi hiểu rõ. Phase 14 (Troubleshooting) sẽ chi tiết.

## Resource cluster-scoped và RBAC

Resource như **ClusterRole**, **PersistentVolume** không thuộc namespace nào.

```bash
kubectl get clusterrole          # không cần -n
kubectl get pv                   # không cần -n
```

RBAC khác giữa namespaced vs cluster-scoped:
- `Role` + `RoleBinding` → namespaced permission.
- `ClusterRole` + `ClusterRoleBinding` → cluster-wide permission.

Phase 7 (Security) sẽ deep-dive RBAC.

## Best practice với namespace

| Pattern | Use case |
|---|---|
| 1 namespace mỗi env (dev/staging/prod) | Multi-env trên cùng cluster |
| 1 namespace mỗi team | Multi-team |
| 1 namespace mỗi component (db, monitoring, app) | Architecture separation |
| Namespace `kube-system` cho control plane | K8s tự setup |
| Tránh để tất cả resource trong `default` | Khó manage scale lớn |
| ResourceQuota + LimitRange cho mọi namespace user | Tránh noisy neighbor |

## Tools hỗ trợ switch namespace

`kubens` (từ `kubectx` repo) — switch namespace cực nhanh:

```bash
# Cài đặt
brew install kubectx     # macOS
# hoặc git clone https://github.com/ahmetb/kubectx

# List namespaces
kubens

# Switch
kubens dev

# Bây giờ context default = dev
kubectl get pods       # trong namespace dev
```

→ Save cho CKA — tiết kiệm thời gian.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Tạo Pod không chỉ định namespace | Vào `default`, không phải nơi mong | Set namespace trong YAML hoặc default context |
| `kubectl get pods` không thấy | Pod ở namespace khác | Dùng `-A` hoặc `-n <ns>` |
| Pod gọi service "backend" nhưng service ở namespace khác | Connection refused | Dùng `backend.<ns>` DNS |
| Xoá namespace nhầm | Mất hết resource | Verify trước, không bao giờ `default` |
| Namespace stuck Terminating | UI/CLI khó chịu | Clear finalizer (cẩn thận) |
| Quota set quá thấp | Deploy fail "exceeded quota" | Tăng quota hoặc bớt resource |

## Tóm tắt bài 12

- **Namespace** = cô lập logical resource trong cluster. Cùng tên resource có thể tồn tại ở nhiều namespace.
- Default: `default`, `kube-system`, `kube-public`, `kube-node-lease`.
- Hầu hết resource là **namespaced**. Node, PV, ClusterRole là **cluster-scoped**.
- DNS cross-namespace: `<svc>.<ns>.svc.cluster.local`.
- Tạo: `kubectl create ns <name>` hoặc YAML.
- Switch: `kubectl config set-context --current --namespace=<ns>`.
- **ResourceQuota** + **LimitRange** cho quota + default resource.
- Xoá namespace = xoá mọi resource bên trong (cẩn thận).
- Best practice: tách namespace theo env hoặc team.

**Bài kế tiếp** → [Bài 13: Imperative vs Declarative — kỹ năng cốt lõi cho CKA](13-imperative-vs-declarative.md)
