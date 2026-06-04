# Bài 10: Deployments — Rolling update + rollback

## Vì sao có Deployment khi đã có ReplicaSet?

ReplicaSet đảm bảo số Pod luôn = N. Nhưng production cần thêm:

```text
1. ROLLING UPDATE: Đổi version app v1 → v2 mà không downtime
   - Từng Pod được replace, không phải tất cả cùng lúc
   - Health check để đảm bảo Pod mới OK trước khi xoá Pod cũ

2. ROLLBACK: v2 lỗi → undo về v1 ngay lập tức
   - Không cần redeploy
   - Lịch sử các version được lưu

3. PAUSE / RESUME: Sửa nhiều thứ cùng lúc, áp dụng 1 lần
   - Đổi image + tăng replicas + sửa env trong 1 transaction
   - Không từng thay đổi trigger rollout riêng

4. SCALE: Tăng/giảm replicas

5. HISTORY: Xem các revision đã qua
```

ReplicaSet **không có** các tính năng này. Đó là việc của **Deployment**.

## Quan hệ Pod → ReplicaSet → Deployment

```text
┌──────────────────────────────────────────────────────┐
│  Deployment "nginx-deploy"                            │
│                                                      │
│  ┌────────────────────────────────────────────┐     │
│  │  ReplicaSet "nginx-deploy-abc12"           │     │
│  │  (revision 1)                              │     │
│  │  template: image nginx:1.25                │     │
│  │                                            │     │
│  │  ┌──────┐  ┌──────┐  ┌──────┐             │     │
│  │  │ Pod  │  │ Pod  │  │ Pod  │             │     │
│  │  │ v1.25│  │ v1.25│  │ v1.25│             │     │
│  │  └──────┘  └──────┘  └──────┘             │     │
│  └────────────────────────────────────────────┘     │
│                                                      │
│  Khi update image → tạo ReplicaSet mới:              │
│  ┌────────────────────────────────────────────┐     │
│  │  ReplicaSet "nginx-deploy-def34"           │     │
│  │  (revision 2)                              │     │
│  │  template: image nginx:1.26                │     │
│  │                                            │     │
│  │  ┌──────┐  ┌──────┐  ┌──────┐             │     │
│  │  │ Pod  │  │ Pod  │  │ Pod  │             │     │
│  │  │ v1.26│  │ v1.26│  │ v1.26│             │     │
│  │  └──────┘  └──────┘  └──────┘             │     │
│  └────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────┘

ReplicaSet revision 1 vẫn còn (scale=0) → có thể rollback về sau
```

→ Deployment "ghép" nhiều ReplicaSet — mỗi version 1 RS riêng.

## YAML Deployment

Hoàn toàn giống ReplicaSet, **chỉ đổi `kind`**:

```yaml
apiVersion: apps/v1
kind: Deployment           # ← đổi từ ReplicaSet → Deployment
metadata:
  name: nginx-deploy
  labels:
    app: nginx
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:1.25
          ports:
            - containerPort: 80
```

→ **Khác biệt với ReplicaSet**: thêm tính năng rollout/rollback (sẽ thấy ở dưới). Cùng spec mà sức mạnh khác hẳn.

## Tạo Deployment

```bash
kubectl apply -f deploy.yaml
# deployment.apps/nginx-deploy created

# Xem tất cả layer object
kubectl get all
# NAME                                READY   STATUS    RESTARTS   AGE
# pod/nginx-deploy-abc12-x1y2z         1/1     Running   0          30s
# pod/nginx-deploy-abc12-w3v4u         1/1     Running   0          30s
# pod/nginx-deploy-abc12-t5s6r         1/1     Running   0          30s
#
# NAME                              DESIRED   CURRENT   READY   AGE
# replicaset.apps/nginx-deploy-abc12   3         3         3       30s
#
# NAME                          READY   UP-TO-DATE   AVAILABLE   AGE
# deployment.apps/nginx-deploy   3/3     3            3           30s
```

3 layer: Deployment → ReplicaSet → Pod. Pod name = `<deploy>-<rs-hash>-<pod-hash>`.

## Rolling Update — Tính năng đỉnh cao

Đổi version image:

```bash
kubectl set image deployment/nginx-deploy nginx=nginx:1.26
# Hoặc sửa file YAML rồi apply
```

Theo dõi rollout:

```bash
kubectl rollout status deployment/nginx-deploy
# Waiting for deployment "nginx-deploy" rollout to finish: 1 out of 3 new replicas have been updated...
# Waiting for deployment "nginx-deploy" rollout to finish: 1 out of 3 new replicas have been updated...
# Waiting for deployment "nginx-deploy" rollout to finish: 2 out of 3 new replicas have been updated...
# Waiting for deployment "nginx-deploy" rollout to finish: 1 old replicas are pending termination...
# deployment "nginx-deploy" successfully rolled out
```

Trong quá trình rollout:

```bash
kubectl get pods
# NAME                                READY   STATUS
# nginx-deploy-abc12-x1y2z   1/1     Running           ← Pod cũ (v1.25)
# nginx-deploy-abc12-w3v4u   1/1     Running           ← Pod cũ (v1.25)
# nginx-deploy-def34-aaa11   1/1     Running           ← Pod mới (v1.26)
# nginx-deploy-def34-bbb22   0/1     ContainerCreating ← Pod mới đang tạo
```

→ K8s **không kill tất cả Pod cũ cùng lúc**. Tạo Pod mới trước, đợi ready, rồi mới kill Pod cũ.

## Rolling Update Strategy

Default strategy là `RollingUpdate`:

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 25%        # tối đa Pod mới được tạo thêm (vượt replicas)
      maxUnavailable: 25%  # tối đa Pod bị unavailable cùng lúc
```

Ví dụ với `replicas=4`, `maxSurge=25%`, `maxUnavailable=25%`:
- Tối đa **5 Pod** tổng cùng lúc (4 + 25% = 5).
- Tối thiểu **3 Pod** sẵn sàng (4 - 25% = 3).

→ Quá trình:
```text
Start: 4 cũ
Tạo 1 mới (5 Pod total, 4 ready)
Kill 1 cũ khi mới ready → 3 cũ, 1 mới (4 total)
Tạo 1 mới → 3 cũ, 2 mới (5 total)
... lặp ...
End: 0 cũ, 4 mới
```

### Strategy: Recreate

Alternative — kill tất cả Pod cũ rồi tạo mới:

```yaml
spec:
  strategy:
    type: Recreate
```

→ Có **downtime**. Chỉ dùng khi app không support 2 version cùng chạy (vd database schema migration).

## Update bằng `kubectl edit` hoặc `kubectl apply`

3 cách trigger rollout:

```bash
# Cách 1: set image (nhanh, common)
kubectl set image deployment/nginx-deploy nginx=nginx:1.26

# Cách 2: edit live
kubectl edit deployment/nginx-deploy
# Sửa image trong vim, save

# Cách 3: sửa YAML + apply
vim deploy.yaml
kubectl apply -f deploy.yaml
```

Tất cả đều trigger rollout. Cách 3 reproducible (Git track).

## Rollback — Undo phiên bản

```bash
# Xem lịch sử
kubectl rollout history deployment/nginx-deploy
# REVISION  CHANGE-CAUSE
# 1         <none>
# 2         kubectl set image deployment/nginx-deploy nginx=nginx:1.26

# Rollback về revision trước
kubectl rollout undo deployment/nginx-deploy
# Hoặc rollback về revision cụ thể
kubectl rollout undo deployment/nginx-deploy --to-revision=1

# Theo dõi
kubectl rollout status deployment/nginx-deploy
```

Cơ chế: K8s vẫn giữ **ReplicaSet cũ** (với replicas=0). Khi rollback, scale ReplicaSet cũ lên, scale ReplicaSet mới xuống.

### Annotation CHANGE-CAUSE

Để biết ai đã làm gì ở mỗi revision, thêm annotation:

```bash
kubectl annotate deployment/nginx-deploy \
  kubernetes.io/change-cause="Update nginx to 1.26 for CVE fix"

kubectl rollout history deployment/nginx-deploy
# REVISION  CHANGE-CAUSE
# 1         <none>
# 2         Update nginx to 1.26 for CVE fix
```

Best practice: luôn annotate sau mỗi rollout.

## Pause + Resume

Khi cần thay đổi nhiều thứ cùng lúc, không muốn từng thay đổi trigger rollout:

```bash
# Pause
kubectl rollout pause deployment/nginx-deploy

# Thay đổi nhiều thứ
kubectl set image deployment/nginx-deploy nginx=nginx:1.26
kubectl set resources deployment/nginx-deploy -c=nginx --requests=cpu=500m,memory=512Mi
kubectl scale deployment/nginx-deploy --replicas=5

# Resume → tất cả thay đổi rollout 1 lần
kubectl rollout resume deployment/nginx-deploy
```

→ Tránh trigger 3 rollout liên tiếp.

## Restart Pod mà không đổi spec

Đôi khi cần restart Pod (vd refresh config secret) mà không đổi image:

```bash
kubectl rollout restart deployment/nginx-deploy
```

K8s sẽ rolling restart — Pod cũ bị thay bởi Pod mới (cùng spec). Trick: thêm annotation `kubectl.kubernetes.io/restartedAt` vào Pod template → trigger rollout.

## Scale Deployment

```bash
kubectl scale deployment/nginx-deploy --replicas=5

# Hoặc sửa file YAML rồi apply (reproducible)
```

Khác `kubectl scale rs` — scale Deployment làm đúng cách.

## Tạo Deployment YAML nhanh

```bash
# Imperative
kubectl create deployment nginx --image=nginx --replicas=3

# Generate YAML mẫu
kubectl create deployment nginx --image=nginx --replicas=3 --dry-run=client -o yaml > deploy.yaml
```

→ Nhớ cho exam.

## Xem thông tin Deployment

```bash
# List
kubectl get deployments
# Aliases: deploy, deployment, deployments
kubectl get deploy

# Chi tiết
kubectl describe deployment nginx-deploy
# Name:           nginx-deploy
# Replicas:       3 desired | 3 updated | 3 total | 3 available | 0 unavailable
# StrategyType:   RollingUpdate
# RollingUpdateStrategy:  25% max unavailable, 25% max surge
# Pod Template:
#   Containers:
#     nginx:
#       Image:  nginx:1.26
# Conditions:
#   Type           Status
#   Progressing    True       (rollout đang hoặc đã thành công)
#   Available      True       (đủ Pod available)
# OldReplicaSets:  nginx-deploy-abc12 (0/0 replicas)
# NewReplicaSet:   nginx-deploy-def34 (3/3 replicas)
# Events:
#   Type    Reason             Message
#   ----    ------             -------
#   Normal  ScalingReplicaSet  Scaled up replica set nginx-deploy-def34 to 1
#   Normal  ScalingReplicaSet  Scaled down replica set nginx-deploy-abc12 to 2
```

## Khi nào Deployment thất bại?

Rollout có thể fail. K8s sẽ stuck:

```bash
kubectl rollout status deployment/nginx-deploy
# Waiting for deployment "nginx-deploy" rollout to finish: 1 of 3 updated replicas are available...
# error: deployment "nginx-deploy" exceeded its progress deadline
```

Lý do:
- Image mới không pull được (typo, registry down).
- Liveness/readiness probe fail.
- Insufficient CPU/RAM cluster.
- Pod fail bind volume.

Debug:
```bash
kubectl get pods
# Xem Pod mới (trong RS mới) ở trạng thái gì
kubectl describe pod <new-pod>
# Đọc Events
kubectl logs <new-pod>
# Đọc log container
```

Sau khi fix, rollout tự tiếp tục. Nếu muốn cancel:
```bash
kubectl rollout undo deployment/nginx-deploy
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Update image bằng `kubectl set image` không sửa YAML | Drift Git ↔ cluster | Sửa YAML + `apply`, không dùng `set` cho production |
| Quên Annotate change-cause | History trống, khó debug | `kubectl annotate ... change-cause=...` |
| RollingUpdate cho app không support 2 version cùng chạy | Lỗi data corruption | Dùng `Recreate` strategy |
| `maxSurge=0, maxUnavailable=0` | Rollout stuck mãi | Một trong 2 phải > 0 |
| Quá nhiều ReplicaSet cũ tích lũy | etcd phình | `revisionHistoryLimit: 10` (default) — không cần đổi |
| Xoá Deployment mà muốn giữ Pod | Pod bị xoá theo | `--cascade=orphan` (hiếm dùng) |
| Tưởng `kubectl rollout undo` xoá history | Vẫn còn, chỉ revert active | History vẫn giữ |

## Tóm tắt bài 10

- **Deployment** = ReplicaSet + rolling update + rollback + pause/resume + history.
- Hierarchy: **Deployment → ReplicaSet → Pod**.
- Update image → tạo ReplicaSet mới, scale dần, scale ReplicaSet cũ xuống.
- **RollingUpdate** (default): zero downtime, control bằng `maxSurge` + `maxUnavailable`.
- **Recreate**: có downtime, chỉ dùng khi cần.
- `kubectl rollout`: `status`, `history`, `undo`, `pause`, `resume`, `restart`.
- Generate YAML: `kubectl create deployment ... --dry-run=client -o yaml`.
- **Mọi workload production phải là Deployment**, không phải Pod đơn hay ReplicaSet đơn.

**Bài kế tiếp** → [Bài 11: Services — Stable network endpoint cho Pod](11-services.md)
