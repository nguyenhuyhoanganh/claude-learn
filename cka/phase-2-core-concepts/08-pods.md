# Bài 8: Pods — Đơn vị nhỏ nhất của K8s

## Vì sao K8s không deploy container trực tiếp?

Bạn nghĩ K8s = orchestrate Docker container. Nhưng thực ra K8s **không deploy container thẳng**. Mọi container đều được gói trong **Pod**.

Vì sao thêm 1 layer abstraction? Pod giải quyết các vấn đề thực tế khi vận hành container ở scale:

```text
Bạn vận hành 50 microservice trong production, mỗi service có:
- 1 container main (web server / api)
- 1 helper container (log shipper / sidecar proxy)

Vấn đề khi chỉ có container:
- Helper container die → ai biết để tạo lại?
- Main container scale 3 → 5, helper cũng phải scale theo?
- Main + helper phải share network (localhost)
- Main + helper phải share volume
- Manual quản lý mapping main ↔ helper trong code → spaghetti
```

K8s giải quyết bằng cách: **gói nhóm container quan hệ chặt → 1 Pod**. Pod tự lo cluster lifecycle, network, storage.

## Định nghĩa Pod

> **Pod** = đơn vị deploy nhỏ nhất trong K8s. Bao gồm **1 hoặc nhiều container** chia sẻ:
> - **Network namespace** (cùng IP, cùng localhost)
> - **Volume** (mount chung)
> - **Lifecycle** (cùng tạo, cùng chết)

```text
              Pod = "container của các container"
              ────────────────────────────────────
              ┌──────────────────────────────┐
              │  Pod (IP: 10.244.1.5)         │
              │                              │
              │  ┌──────────┐  ┌──────────┐  │
              │  │container1│  │container2│  │  ← share localhost
              │  │ (nginx)  │  │ (sidecar)│  │     localhost:80
              │  │  :80     │  │  :9000   │  │     localhost:9000
              │  └──────────┘  └──────────┘  │
              │       │            │         │
              │       └────┬───────┘         │
              │            ▼                 │
              │       /shared (volume)       │  ← share storage
              └──────────────────────────────┘
```

## Quy tắc số 1: Scale = thêm Pod, KHÔNG phải thêm container

```text
❌ Sai: Scale 1 Pod từ 1 container nginx → 3 container nginx
✅ Đúng: Scale từ 1 Pod (1 container nginx) → 3 Pod (mỗi Pod 1 container nginx)
```

Vì sao? Pod = đơn vị scaling. Mỗi Pod được schedule lên node riêng, có IP riêng. Load balancer phân tải giữa các Pod, không phân tải giữa container trong cùng Pod.

```text
[Cluster với 2 node]

Trước scale:
Node-1: [Pod-A (nginx)]   ← 1 instance

Sau scale lên 3:
Node-1: [Pod-A (nginx)] [Pod-B (nginx)]
Node-2: [Pod-C (nginx)]
                 ▲
                 3 Pod, 3 IP, traffic load balance giữa 3 Pod
```

## Multi-container Pod — Khi nào dùng?

**Đa số Pod chỉ có 1 container**. Multi-container chỉ dùng khi 2 container **buộc phải sống chung**.

3 pattern multi-container phổ biến:

### 1. Sidecar — Helper bên cạnh main app

```text
Pod
├── container 1: web app (vd nginx)
└── container 2: log shipper (vd fluentd)
    └── Đọc log file của nginx, ship lên ELK
```

Nginx ghi log vào `/var/log/nginx/`. Fluentd mount cùng volume → đọc + ship. **2 container phải share volume + lifecycle**.

### 2. Ambassador — Proxy network bên ngoài

```text
Pod
├── container 1: app (chỉ biết connect localhost:6379)
└── container 2: ambassador (proxy đến Redis cluster phức tạp)
    └── App nghĩ Redis local, ambassador lo routing/auth/retry
```

App đơn giản. Ambassador lo logic phức tạp.

### 3. Adapter — Convert format

```text
Pod
├── container 1: legacy app (output log format cũ)
└── container 2: adapter (convert log → format mới cho Prometheus)
```

→ Nếu **không thuộc 3 case trên** → đa số nên dùng 1 Pod = 1 container.

## Tạo Pod đơn giản

### Cách 1: Imperative (1 dòng lệnh)

```bash
kubectl run nginx --image=nginx

# Pod đã tạo
kubectl get pods
# NAME    READY   STATUS    RESTARTS   AGE
# nginx   1/1     Running   0          10s

# Chi tiết
kubectl describe pod nginx
# Name:    nginx
# Node:    worker-2/192.168.1.20
# IP:      10.244.1.5
# Status:  Running
# Containers:
#   nginx:
#     Image: nginx
#     State: Running
# Events:
#   Type    Reason     Message
#   ----    ------     -------
#   Normal  Scheduled  Successfully assigned default/nginx to worker-2
#   Normal  Pulling    Pulling image "nginx"
#   Normal  Pulled     Successfully pulled image "nginx"
#   Normal  Created    Created container nginx
#   Normal  Started    Started container nginx
```

→ Đơn giản, nhanh. Phù hợp dev/test. Không reproducible.

### Cách 2: Declarative (YAML file)

Tạo file `pod.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx
  labels:
    app: nginx
    tier: frontend
spec:
  containers:
    - name: nginx
      image: nginx:1.25
      ports:
        - containerPort: 80
```

Apply:
```bash
kubectl create -f pod.yaml
# Hoặc:
kubectl apply -f pod.yaml
```

→ **Production luôn dùng declarative**. File commit vào Git → reproducible, có version control.

## Anatomy của YAML file Kubernetes

Mọi K8s object YAML có **4 field bắt buộc**:

```yaml
apiVersion: v1               # ← Phiên bản API
kind: Pod                    # ← Loại object
metadata:                    # ← Thông tin nhận diện
  name: nginx
  labels:
    app: nginx
spec:                        # ← Spec của object (khác nhau cho mỗi kind)
  containers:
    - name: nginx
      image: nginx:1.25
```

### Field 1: `apiVersion`

Phiên bản API K8s cho resource này:

| apiVersion | Cho object |
|---|---|
| `v1` | Pod, Service, ConfigMap, Secret, Namespace, ... (core) |
| `apps/v1` | Deployment, ReplicaSet, StatefulSet, DaemonSet |
| `batch/v1` | Job, CronJob |
| `networking.k8s.io/v1` | Ingress, NetworkPolicy |
| `rbac.authorization.k8s.io/v1` | Role, RoleBinding, ClusterRole, ClusterRoleBinding |
| `storage.k8s.io/v1` | StorageClass |

Nhớ: **Pod là core → `v1`**. Deployment là apps group → `apps/v1`.

### Field 2: `kind`

Loại object: `Pod`, `Deployment`, `Service`, `ConfigMap`, ...

### Field 3: `metadata`

Là **dictionary** chứa thông tin nhận diện:

```yaml
metadata:
  name: nginx               # tên (bắt buộc)
  namespace: default        # namespace (mặc định default)
  labels:                   # nhãn để filter
    app: nginx
    tier: frontend
  annotations:              # metadata bổ sung (không filter được)
    description: "Frontend web server"
```

**Quy tắc YAML**: `name`, `namespace`, `labels`, `annotations` đều là **child của metadata** → indent vào trong.

Indent quan trọng:

```yaml
# ❌ SAI - labels indent quá sâu, thành child của name
metadata:
  name: nginx
    labels:
      app: nginx

# ❌ SAI - labels indent ngang metadata, không phải child
metadata:
name: nginx
labels:
  app: nginx

# ✅ ĐÚNG
metadata:
  name: nginx
  labels:
    app: nginx
```

### Field 4: `spec`

Specification — phần này **khác nhau cho mỗi kind**.

Cho Pod, spec quan trọng nhất:

```yaml
spec:
  containers:                # list (mảng) các container
    - name: nginx           # tên container trong Pod (unique trong Pod)
      image: nginx:1.25     # image registry/repo:tag
      ports:                # ports container expose (chỉ documentary)
        - containerPort: 80
      env:                  # env variable
        - name: ENV
          value: production
      volumeMounts:         # mount volume vào container
        - name: data
          mountPath: /usr/share/nginx/html
      resources:            # CPU/RAM request + limit
        requests:
          cpu: 100m
          memory: 128Mi
        limits:
          cpu: 500m
          memory: 256Mi
  volumes:                  # định nghĩa volume cho Pod
    - name: data
      configMap:
        name: html-content
```

`containers` là **list** (có `-` trước item). Multi-container thì có nhiều `-`:

```yaml
spec:
  containers:
    - name: nginx
      image: nginx
    - name: log-shipper
      image: fluent/fluentd
```

## Các trạng thái Pod

Pod có nhiều phase trong lifecycle:

| Status | Ý nghĩa |
|---|---|
| `Pending` | Pod đã tạo nhưng chưa Running (đang pull image, hoặc chờ scheduler) |
| `Running` | Pod đang chạy, ít nhất 1 container Running |
| `Succeeded` | Tất cả container exit code 0 (Job/CronJob) |
| `Failed` | Tất cả container exit, ít nhất 1 fail (exit != 0) |
| `Unknown` | Kubelet không liên lạc được với master |
| `CrashLoopBackOff` | Container crash liên tục, kubelet restart với exponential backoff |
| `ImagePullBackOff` | Pull image fail (image không tồn tại hoặc credential sai) |
| `ContainerCreating` | Đang khởi tạo container |

```bash
# Xem status nhanh
kubectl get pods
# NAME    READY   STATUS              RESTARTS   AGE
# nginx   0/1     ImagePullBackOff    0          2m

# Xem chi tiết để biết vì sao
kubectl describe pod nginx
# Events:
#   Warning  Failed  Failed to pull image "nginx:nosuchtag":
#                   manifest unknown
```

## Lệnh kubectl cho Pod (cheat sheet)

```bash
# CREATE
kubectl run nginx --image=nginx                    # imperative
kubectl create -f pod.yaml                         # declarative (fail nếu đã tồn tại)
kubectl apply -f pod.yaml                          # declarative (create or update)

# LIST
kubectl get pods                                    # default namespace
kubectl get pods -n kube-system                    # namespace khác
kubectl get pods -A                                # mọi namespace
kubectl get pods -o wide                           # thêm IP + Node
kubectl get pods --show-labels                     # show labels
kubectl get pods -l app=nginx                      # filter theo label
kubectl get pods -o yaml                           # xuất YAML đầy đủ

# DESCRIBE (xem chi tiết + Events)
kubectl describe pod nginx

# LOGS
kubectl logs nginx                                 # log của Pod 1 container
kubectl logs nginx -c container-name               # multi-container Pod
kubectl logs nginx -f                              # follow (tail -f)
kubectl logs nginx --previous                      # log của lần chạy trước (sau crash)
kubectl logs nginx --since 10m                     # 10 phút qua

# EXEC (chạy lệnh trong container)
kubectl exec -it nginx -- bash                     # shell
kubectl exec nginx -- ls /tmp                      # 1 command
kubectl exec -it nginx -c container-name -- sh     # specific container

# DELETE
kubectl delete pod nginx                           # xoá
kubectl delete -f pod.yaml                         # xoá theo file
kubectl delete pods --all                          # xoá toàn bộ trong namespace
kubectl delete pods -l app=nginx                   # xoá theo label

# EDIT (sửa Pod đang chạy — hạn chế)
kubectl edit pod nginx                             # mở vim, sửa, save → apply
# Nhưng Pod có nhiều field immutable → không phải gì sửa cũng được
```

## Imperative tạo YAML nhanh (kỹ năng cho CKA)

Trong exam, bạn không có thời gian gõ YAML từ đầu. Dùng imperative + `--dry-run` để **generate YAML mẫu**:

```bash
# Tạo Pod YAML mẫu (không tạo thật)
kubectl run nginx --image=nginx --dry-run=client -o yaml
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  creationTimestamp: null
  labels:
    run: nginx
  name: nginx
spec:
  containers:
  - image: nginx
    name: nginx
    resources: {}
  dnsPolicy: ClusterFirst
  restartPolicy: Always
status: {}
```

Lưu ra file để sửa:
```bash
kubectl run nginx --image=nginx --dry-run=client -o yaml > pod.yaml
vim pod.yaml
# Sửa, thêm volume, env, ...
kubectl apply -f pod.yaml
```

→ Đây là **kỹ năng cốt lõi cho CKA**. Không gõ YAML từ đầu, generate + sửa.

## Bẫy thường gặp với Pod

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Tạo Pod trực tiếp (không qua Deployment) | Pod chết → không tự tạo lại | Dùng Deployment cho mọi workload production |
| Indent YAML sai 1 space | Apply fail hoặc behavior sai | `kubectl apply --dry-run=client` để validate trước |
| Image không có tag | Pull `latest` → unpredictable | Luôn pin tag cụ thể (`nginx:1.25` không `nginx`) |
| Container name trùng trong Pod | Apply fail | Mỗi container có name unique |
| Quên `containerPort` | Pod chạy nhưng documentation kém | Luôn declare port để clarity |
| `restartPolicy: Never` cho web | Pod fail → không restart | Default `Always` cho service, `OnFailure` cho Job |
| Mount 2 volume cùng mountPath | Behavior unpredictable | Mỗi mountPath chỉ 1 volume |
| Hardcode IP trong env | Pod restart → IP đổi → app lỗi | Dùng Service name thay IP |

## Tóm tắt bài 8

- **Pod** = đơn vị nhỏ nhất, gói 1+ container share network + storage + lifecycle.
- **Đa số Pod = 1 container**. Multi-container cho sidecar / ambassador / adapter pattern.
- **Scale = thêm Pod**, không phải thêm container trong Pod.
- YAML có **4 field bắt buộc**: `apiVersion`, `kind`, `metadata`, `spec`.
- `apiVersion: v1` cho Pod (core group). `apps/v1` cho Deployment.
- Imperative `kubectl run` nhanh nhưng không reproducible. Declarative YAML cho production.
- **Generate YAML mẫu**: `kubectl run xxx --image=yyy --dry-run=client -o yaml > file.yaml` — kỹ năng cốt lõi cho CKA.
- Pod chết không tự tạo lại — đó là việc của **ReplicaSet/Deployment** (bài sau).

**Bài kế tiếp** → [Bài 9: ReplicaSets — Đảm bảo số Pod luôn đúng](09-replicasets.md)
