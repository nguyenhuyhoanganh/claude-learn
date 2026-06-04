# Bài 13: Imperative vs Declarative — Kỹ năng cốt lõi cho CKA

## Vì sao bài này quan trọng nhất Phase 2?

Trong CKA exam, bạn có **120 phút** cho 15-20 task. Trung bình **6-8 phút/task**. Nếu mỗi Pod gõ YAML từ đầu → **không thể đủ giờ**.

→ Phải biết khi nào dùng imperative (gõ lệnh nhanh) và khi nào dùng declarative (file YAML). Bài này là **chiến thuật**.

## Analogy: Taxi vs Uber

Xưa đi taxi → bạn chỉ đường từng bước: "Rẽ trái, đi 200m, rẽ phải, ...". Đây là **imperative** — chỉ "cách làm".

Hôm nay đi Uber → bạn chỉ nói địa chỉ đích: "Tới nhà bạn ở 123 Lê Lợi". Đây là **declarative** — chỉ "muốn gì". Hệ thống tự tính route.

```text
Imperative:                    Declarative:
"Làm A, rồi B, rồi C"          "Tôi muốn kết quả X"
                                 → Hệ thống tự tính cách
```

Trong K8s:

```text
Imperative:
$ kubectl run nginx --image=nginx
$ kubectl expose pod nginx --port=80
$ kubectl set image pod/nginx nginx=nginx:1.26

Declarative:
$ cat pod.yaml
  apiVersion: v1
  kind: Pod
  metadata: { name: nginx }
  spec: { containers: [{ name: nginx, image: nginx:1.26 }] }
$ kubectl apply -f pod.yaml
```

## 3 cấp độ thao tác K8s

```text
┌─────────────────────────────────────────────────────────┐
│  1. IMPERATIVE COMMAND                                  │
│     kubectl run, create, expose, edit, scale, set       │
│     ─────────────────────────────────────               │
│     Ưu: Cực nhanh, 1 dòng                              │
│     Nhược: Không reproducible, không Git                │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  2. IMPERATIVE OBJECT CONFIG                            │
│     kubectl create -f file.yaml                         │
│     kubectl replace -f file.yaml                        │
│     kubectl delete -f file.yaml                         │
│     ─────────────────────────────                       │
│     Ưu: Có file để track, version Git                  │
│     Nhược: Phải biết object đã tồn tại chưa            │
│             (create fail nếu có, replace fail nếu không) │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  3. DECLARATIVE                                         │
│     kubectl apply -f file.yaml                          │
│     kubectl apply -f folder/                            │
│     ─────────────────────────────                       │
│     Ưu: Idempotent (chạy lại không lỗi)                 │
│         apply tự create hoặc update                     │
│     Tối ưu cho production + GitOps                      │
└─────────────────────────────────────────────────────────┘
```

## So sánh chi tiết

| | Imperative Command | Imperative Config | Declarative |
|---|---|---|---|
| Cú pháp | `kubectl run nginx` | `kubectl create -f` | `kubectl apply -f` |
| Tạo lần đầu | ✓ | ✓ | ✓ |
| Update khi có | `edit`, `set`, `scale` | `replace -f` (fail nếu chưa có) | ✓ (auto create or update) |
| Idempotent | ✗ | ✗ | ✓ |
| Git-tracked | ✗ | ✓ | ✓ |
| Reproducible | ✗ | ✓ | ✓ |
| Track who-what | ✗ (lệnh trong shell history) | ✓ (Git diff) | ✓ (Git diff) |
| Phù hợp | Quick test, exam | Đơn giản | **Production** |

## Khi nào dùng cái nào?

### Dùng IMPERATIVE COMMAND khi:

✓ **Đang exam CKA** — nhanh nhất.
✓ Dev/test, quick prototype.
✓ Generate YAML mẫu (`--dry-run -o yaml`).
✓ One-off task (vd: scale nhanh, restart deployment).
✓ Debug, exploration.

### Dùng DECLARATIVE khi:

✓ **Production**.
✓ Có nhiều người làm cùng (review qua PR).
✓ Git workflow / GitOps.
✓ Multi-resource (apply cả folder).
✓ Stateful infrastructure.

→ Reality: dev/test imperative, production declarative.

## Imperative Commands tốc độ cho CKA

### Tạo nhanh

```bash
# Pod
kubectl run nginx --image=nginx
kubectl run nginx --image=nginx --port=80
kubectl run nginx --image=nginx --env="ENV=prod" --labels="app=nginx"

# Pod với command
kubectl run debugger --image=busybox --rm -it -- sh

# Deployment
kubectl create deployment nginx --image=nginx --replicas=3
kubectl create deployment nginx --image=nginx --port=80

# Service
kubectl expose deployment nginx --port=80 --target-port=8080 --type=ClusterIP
kubectl expose pod nginx --port=80 --type=NodePort

# Namespace
kubectl create namespace dev

# ConfigMap
kubectl create configmap app-config --from-literal=DB_HOST=localhost
kubectl create configmap app-config --from-file=config.properties

# Secret
kubectl create secret generic app-secret --from-literal=DB_PASS=admin

# Job
kubectl create job hello --image=busybox -- echo "hello"
kubectl create cronjob backup --image=busybox --schedule="0 2 * * *" -- /backup.sh
```

### Update nhanh

```bash
# Scale
kubectl scale deployment nginx --replicas=5

# Set image
kubectl set image deployment/nginx nginx=nginx:1.26

# Set resource
kubectl set resources deployment nginx --requests=cpu=200m,memory=256Mi

# Edit live (mở vim)
kubectl edit deployment nginx

# Rollout
kubectl rollout restart deployment nginx
kubectl rollout undo deployment nginx
```

### Delete nhanh

```bash
kubectl delete pod nginx
kubectl delete deployment nginx
kubectl delete service nginx
kubectl delete all --all -n dev      # Pod + Service + Deployment + ... trong dev
```

## `--dry-run -o yaml` — Kỹ năng VÀNG cho CKA

Khi cần YAML phức tạp nhưng không nhớ schema:

```bash
# Generate YAML mẫu cho Pod
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

Lưu file → sửa thêm field phức tạp:

```bash
kubectl run nginx --image=nginx --dry-run=client -o yaml > pod.yaml
vim pod.yaml
# Thêm volume, resources, probes...
kubectl apply -f pod.yaml
```

→ **Phải nhớ** flag `--dry-run=client -o yaml`. Tiết kiệm 5-10 phút mỗi YAML phức tạp.

### Các ví dụ generate

```bash
# Deployment
kubectl create deployment app --image=nginx --replicas=3 --dry-run=client -o yaml > deploy.yaml

# Service
kubectl expose deployment app --port=80 --dry-run=client -o yaml > svc.yaml

# ConfigMap
kubectl create configmap config --from-literal=KEY=value --dry-run=client -o yaml > cm.yaml

# Secret
kubectl create secret generic creds --from-literal=PASS=admin --dry-run=client -o yaml > secret.yaml

# CronJob
kubectl create cronjob backup --image=busybox --schedule="*/5 * * * *" \
  --dry-run=client -o yaml > cj.yaml
```

## `kubectl explain` — Tra cứu schema

Không nhớ field nào tồn tại? Không cần mở doc web:

```bash
# Top-level fields của Pod
kubectl explain pod

# KIND:     Pod
# VERSION:  v1
# FIELDS:
#   apiVersion   <string>
#   kind         <string>
#   metadata     <Object>
#   spec         <Object>
#   status       <Object>

# Sâu hơn — spec
kubectl explain pod.spec
# FIELDS:
#   activeDeadlineSeconds   <integer>
#   affinity                <Object>
#   automountServiceAccountToken   <boolean>
#   containers              <[]Object> -required-
#   ...

# Sâu nữa — containers
kubectl explain pod.spec.containers
# FIELDS:
#   args                    <[]string>
#   command                 <[]string>
#   env                     <[]Object>
#   image                   <string>
#   livenessProbe           <Object>
#   ports                   <[]Object>
#   ...

# Toàn bộ recursive
kubectl explain pod --recursive | less
```

→ Tự document mọi field. **Không cần Google trong exam**.

## `kubectl apply` — Cơ chế bên trong

Cách K8s biết "cần thay đổi gì" khi `apply`:

```text
3 phiên bản được so sánh:

1. LOCAL CONFIG (file YAML của bạn)
                    │
                    │ kubectl apply -f file.yaml
                    ▼
2. LAST APPLIED CONFIG (lưu trong annotation 
                         kubectl.kubernetes.io/last-applied-configuration)
                    │
                    │ K8s compare
                    ▼
3. LIVE CONFIG (object trong etcd)
                    │
                    ▼
        Diff được tính → apply changes
```

### Workflow apply

```text
[Lần 1: apply file mới]
- LIVE: chưa có object
- LOCAL: pod.yaml { image: nginx:1.25 }
- LAST-APPLIED: chưa có

Action: Tạo object mới
Set last-applied = JSON(pod.yaml)

[Lần 2: sửa image trong file rồi apply]
- LIVE: { image: nginx:1.25, status: {...} }
- LOCAL: pod.yaml { image: nginx:1.26 }
- LAST-APPLIED: { image: nginx:1.25 }

Diff: image thay đổi → patch live config với image: nginx:1.26
Update last-applied

[Lần 3: xóa field "labels" trong file rồi apply]
- LIVE: { image: nginx:1.26, labels: {...} }
- LOCAL: pod.yaml { image: nginx:1.26 }  (không có labels)
- LAST-APPLIED: { image: nginx:1.26, labels: {...} }

Diff: labels có trong last-applied nhưng không có trong local
     → xoá labels từ live config
```

→ **Last-applied** là cơ chế K8s biết user **chủ động xoá** field nào.

Xem last-applied:
```bash
kubectl get pod nginx -o yaml | grep -A 20 last-applied-configuration
```

## Đừng mix imperative + declarative

```text
[Lần 1] kubectl apply -f deploy.yaml  (replicas=3)
        → cluster có 3 Pod
        → last-applied: replicas=3

[Lần 2] kubectl scale deployment app --replicas=5  (imperative)
        → cluster có 5 Pod
        → last-applied: vẫn là 3 (apply không chạy)

[Lần 3] kubectl apply -f deploy.yaml  (replicas=3 vẫn trong file)
        → K8s nghĩ replicas=3 (theo file)
        → Scale xuống 3 Pod!
        → Mất 2 Pod vừa scale lên
```

→ **Bài học**: Sau khi bắt đầu dùng `apply`, **đừng dùng** `scale`, `edit`, `set` cho cùng object → drift.

## Production workflow (GitOps)

```text
[Developer]
    │
    │ Sửa pod.yaml
    │ git commit + push
    ▼
[Pull Request]
    │
    │ Review + Approve
    ▼
[Git merge to main]
    │
    │ CI/CD pipeline: kubectl apply -f .
    │ HOẶC: ArgoCD/FluxCD watch Git, auto apply
    ▼
[Cluster updated]
```

→ Cluster state luôn match Git. Rollback = revert commit.

## Exam tips — Chiến thuật CKA

### 1. Setup alias

```bash
alias k=kubectl
source <(kubectl completion bash)
complete -F __start_kubectl k
```

### 2. Dùng `--help` để nhớ flag

```bash
kubectl run --help
kubectl create deployment --help
kubectl expose --help
```

### 3. Generate YAML mẫu thay vì gõ từ đầu

```bash
# Dùng nhiều
k run X --image=Y --dry-run=client -o yaml > x.yaml
k create deployment X --image=Y --dry-run=client -o yaml > x.yaml
k expose deployment X --port=80 --dry-run=client -o yaml > svc.yaml
```

### 4. Imperative cho task đơn giản

```bash
# Đề: tạo Pod nginx
k run nginx --image=nginx          # ← đúng, nhanh nhất

# Đừng làm: viết YAML 10 dòng
```

### 5. YAML cho task phức tạp

```bash
# Đề: Pod với volume, init container, probes...
# → Generate mẫu → sửa
k run app --image=nginx --dry-run=client -o yaml > pod.yaml
vim pod.yaml   # thêm các field phức tạp
k apply -f pod.yaml
```

### 6. `vim` quick reference (cần thuộc)

```text
:set paste     → paste không lỗi indent
:set nu        → hiện số dòng
dd             → xoá dòng
yy             → copy dòng
p              → paste dòng
/keyword       → search
:wq            → save + quit
:q!            → quit không save
i              → insert mode
Esc            → normal mode
u              → undo
```

### 7. `:set paste` cực kỳ quan trọng

Khi paste YAML từ docs vào vim, **không có** `:set paste` → vim auto-indent → format vỡ. Luôn:

```vim
:set paste
(paste content)
:set nopaste
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Gõ YAML từ đầu trong exam | Mất 5 phút/Pod, không kịp giờ | Dùng `--dry-run -o yaml` |
| Mix `apply` và `scale` | Cluster state drift | Chọn 1 cách, stick |
| Quên `--dry-run=client` (dùng `server`) | Tạo thật trên cluster | Luôn `client` để generate |
| `kubectl create` lần 2 cho object đã có | Báo lỗi "already exists" | Dùng `apply` thay |
| `kubectl replace` cho object chưa có | Báo lỗi "not found" | Dùng `apply` thay |
| Sửa file local nhưng `kubectl edit` thay đổi cluster | File local outdated | Dùng `apply` + sửa file |
| Không backup file trước khi `edit` | Lỡ sai khó undo | `kubectl get X -o yaml > X.bak` trước |

## Tóm tắt bài 13

- **Imperative**: nói "cách làm". Nhanh, không reproducible.
- **Declarative** (`apply`): nói "muốn gì". Idempotent, Git-friendly, **chuẩn production**.
- **3 cấp**: imperative command → imperative config → declarative.
- **`--dry-run=client -o yaml`**: kỹ năng cốt lõi cho CKA, generate YAML mẫu nhanh.
- **`kubectl explain`**: tra cứu schema trong terminal, không cần web.
- **`apply` cơ chế**: so sánh local + last-applied + live → tính diff.
- **Đừng mix**: imperative + declarative trên cùng object → drift.
- Exam: imperative cho task nhỏ, declarative cho task phức tạp, alias `k=kubectl`, generate YAML.

Đã xong Phase 2! Đã đi qua **mọi core concept** của K8s: kiến trúc cluster, ETCD/API server/scheduler/controller-manager, kubelet/kube-proxy, container runtime, Pod, ReplicaSet, Deployment, Service, Namespace, và workflow imperative/declarative.

**Phase 3** sẽ deep-dive vào **Scheduling** — phần điểm cao trong exam.

**Bài kế tiếp** → [Phase 3 - Bài 1: Manual Scheduling & Labels/Selectors](../phase-3-scheduling/01-manual-scheduling-labels.md)
