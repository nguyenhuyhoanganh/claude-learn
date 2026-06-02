# Bài 1: Rolling Updates & Rollbacks (deep dive)

## Recap nhanh

Phase 2 đã giới thiệu Deployment + rolling update. Bài này deep-dive **mỗi config + tình huống** thực tế cho exam.

## Khi nào có rollout?

```text
[Trigger rollout]
1. Tạo Deployment mới
2. Thay đổi gì trong spec.template:
   - Image: nginx:1.25 → nginx:1.26
   - Env variable
   - Resource request/limit
   - Probes
   - Annotation Pod template
3. Scale replicas (KHÔNG trigger — chỉ scale, không recreate Pod)
4. Đổi label selector (cấm — replicas immutable)
```

→ Đổi `spec.template` = rollout. Đổi `spec.replicas` = scale.

## Revision History

Mỗi rollout = 1 **revision**:

```bash
kubectl rollout history deployment/nginx
# REVISION  CHANGE-CAUSE
# 1         <none>
# 2         kubectl set image deployment/nginx nginx=nginx:1.26
# 3         kubectl set image deployment/nginx nginx=nginx:1.27
```

Mỗi revision lưu cái gì?
- **ReplicaSet mới** (với template mới).
- ReplicaSet cũ scale xuống 0 nhưng **không xoá** — để rollback nhanh.

```bash
kubectl get rs
# NAME              DESIRED   CURRENT   READY   AGE
# nginx-abc12-rs    0         0         0       30d    ← revision 1
# nginx-def34-rs    0         0         0       15d    ← revision 2
# nginx-ghi56-rs    3         3         3       1h     ← revision 3 (active)
```

## revisionHistoryLimit

Mặc định K8s lưu **10 revision** gần nhất:

```yaml
spec:
  revisionHistoryLimit: 10        # default
```

Quá 10 → xoá revision cũ nhất. Có thể tăng/giảm:

```yaml
spec:
  revisionHistoryLimit: 30        # giữ 30 revision (etcd phình)
  # hoặc:
  revisionHistoryLimit: 0         # không giữ → không rollback được
```

→ Production thường giữ default (10).

## Strategy

```yaml
spec:
  strategy:
    type: RollingUpdate           # default
    rollingUpdate:
      maxSurge: 25%
      maxUnavailable: 25%
```

### RollingUpdate (default)

```text
[replicas=4, maxSurge=25%, maxUnavailable=25%]
- maxSurge=1: cho phép +1 Pod tạm (5 Pod tổng lúc rollout)
- maxUnavailable=1: cho phép -1 Pod (3 Pod ready tối thiểu)

Quá trình:
Start: 4 Pod cũ
- Tạo 1 Pod mới → 4 cũ + 1 mới = 5
- Wait Pod mới Ready → kill 1 cũ → 3 cũ + 1 mới = 4
- Tạo Pod mới → 3 cũ + 2 mới = 5
- ... lặp ...
End: 0 cũ + 4 mới = 4
```

### Tinh chỉnh maxSurge / maxUnavailable

```yaml
# Strict zero-downtime, slow
rollingUpdate:
  maxSurge: 1
  maxUnavailable: 0
# → Tạo 1 Pod mới trước, kill 1 cũ sau. 0 Pod unavailable lúc nào.

# Fast nhưng có downtime nhỏ
rollingUpdate:
  maxSurge: 50%
  maxUnavailable: 50%
# → 1/2 Pod mới song song, 1/2 Pod cũ bị kill cùng lúc

# All at once
rollingUpdate:
  maxSurge: 100%
  maxUnavailable: 0
# → 100% Pod mới tạo cùng lúc, đợi ready hết rồi kill 100% cũ
```

### Recreate

```yaml
spec:
  strategy:
    type: Recreate
```

→ Kill tất cả Pod cũ → đợi terminate → tạo tất cả Pod mới.

**Có downtime**. Chỉ dùng khi:
- App không hỗ trợ 2 version cùng chạy.
- Database schema migration cần stop full.
- Volume `ReadWriteOnce` cần ưu tiên Pod cũ release.

## Trigger update — 4 cách

### 1. `kubectl set image` (nhanh, không reproducible)

```bash
kubectl set image deployment/nginx nginx=nginx:1.26
# deployment.apps/nginx image updated
```

→ Nhanh trong exam.

### 2. `kubectl edit` (live edit)

```bash
kubectl edit deployment/nginx
# Mở vim, sửa image, save
```

→ Drift với file local.

### 3. `kubectl apply` (declarative)

```bash
vim deployment.yaml
# Sửa image
kubectl apply -f deployment.yaml
```

→ Production preferred.

### 4. `kubectl patch`

```bash
kubectl patch deployment nginx -p '{"spec":{"template":{"spec":{"containers":[{"name":"nginx","image":"nginx:1.26"}]}}}}'
```

→ Hữu ích trong script, ít dùng tay.

## Theo dõi rollout

```bash
# Status (block đến hoàn thành)
kubectl rollout status deployment/nginx
# Waiting for deployment "nginx" rollout to finish: 1 of 3 updated replicas...
# Waiting for deployment "nginx" rollout to finish: 2 of 3 updated replicas...
# deployment "nginx" successfully rolled out

# History
kubectl rollout history deployment/nginx

# Chi tiết 1 revision
kubectl rollout history deployment/nginx --revision=2
```

## CHANGE-CAUSE

Mặc định CHANGE-CAUSE = `<none>`. Để biết ai/gì gây ra revision, dùng **annotation**:

```bash
kubectl annotate deployment/nginx \
  kubernetes.io/change-cause="Update to nginx 1.26 for CVE-2024-XXXX fix"
```

```bash
kubectl rollout history deployment/nginx
# REVISION  CHANGE-CAUSE
# 1         <none>
# 2         Update to nginx 1.26 for CVE-2024-XXXX fix
```

Hoặc khi tạo:
```bash
kubectl create deployment nginx --image=nginx \
  --save-config        # save annotation last-applied
```

Best practice: luôn annotate sau update.

## Rollback

### Undo về revision trước

```bash
kubectl rollout undo deployment/nginx
# deployment.apps/nginx rolled back
```

K8s sẽ:
- Scale ReplicaSet cũ (revision trước) lên N.
- Scale ReplicaSet hiện tại xuống 0.
- Theo `RollingUpdate` strategy.

### Undo về revision cụ thể

```bash
kubectl rollout undo deployment/nginx --to-revision=2
```

### Check sau rollback

```bash
kubectl rollout history deployment/nginx
# REVISION  CHANGE-CAUSE
# 2         Update to nginx 1.26
# 4         <none>           ← revision 4 = rollback của revision 3 về 2
```

→ Rollback **tạo revision mới**, không xoá history.

## Pause + Resume

Khi cần update nhiều thứ cùng lúc:

```bash
# Pause
kubectl rollout pause deployment/nginx

# Thay đổi (KHÔNG trigger rollout)
kubectl set image deployment/nginx nginx=nginx:1.27
kubectl set resources deployment/nginx -c=nginx --requests=cpu=200m,memory=256Mi
kubectl set env deployment/nginx ENV=prod

# Resume → rollout 1 lần với tất cả thay đổi
kubectl rollout resume deployment/nginx
```

→ Tránh trigger 3 rollout liên tiếp.

## Restart Pod (không đổi spec)

```bash
kubectl rollout restart deployment/nginx
```

K8s tự thêm annotation `kubectl.kubernetes.io/restartedAt` vào Pod template → trigger rollout.

Use case: refresh ConfigMap/Secret đã mount (Pod mới đọc lại).

## Rollout stuck

```bash
kubectl rollout status deployment/nginx
# error: deployment "nginx" exceeded its progress deadline
```

Lý do:
- Image không pull được.
- Liveness/readiness probe fail.
- Insufficient resource.
- Pod fail bind volume.

Debug:
```bash
# Pod nào fail?
kubectl get pods -l app=nginx
# nginx-new-pod-abc12   0/1   ImagePullBackOff   0   2m

# Chi tiết
kubectl describe pod nginx-new-pod-abc12
# Events: Failed to pull image "nginx:nosuchtag"
```

Sau khi fix:
- Fix image tag → rollout tiếp tục.
- Hoặc `kubectl rollout undo` để cancel.

## progressDeadlineSeconds

Mặc định 600s (10 phút). Nếu rollout không tiến triển trong 10 phút → mark fail.

```yaml
spec:
  progressDeadlineSeconds: 600
```

Đổi 0 = vô hạn (không khuyến nghị).

## Blue/Green và Canary với Deployment

K8s Deployment **không có** Blue/Green hay Canary built-in. Workaround:

### Blue/Green với 2 Deployment

```yaml
# Blue (current)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-blue
spec:
  template:
    metadata:
      labels:
        app: myapp
        version: blue

# Green (new)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-green
spec:
  template:
    metadata:
      labels:
        app: myapp
        version: green
```

Service trỏ tới blue:
```yaml
spec:
  selector:
    app: myapp
    version: blue
```

Cutover: đổi selector → green. Rollback: đổi về blue.

### Canary (manual)

Deploy 2 ReplicaSet với labels khác:
- Replicaset A: image cũ, 9 Pod.
- Replicaset B: image mới, 1 Pod (canary).
- Service match cả 2 → 90/10 traffic split.

→ Production thường dùng **Istio**, **Argo Rollouts**, **Flagger** thay vì tay.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| `Recreate` cho prod | Downtime | Dùng RollingUpdate trừ khi bắt buộc |
| `maxUnavailable=100%` | 100% Pod down lúc rollout | Set 0 hoặc 25% |
| Không set CHANGE-CAUSE | History trống | Annotate sau mỗi update |
| Rollout stuck quên `pause` | Mất giờ | `kubectl rollout undo` |
| `revisionHistoryLimit=0` | Không rollback được | Giữ >= 5 |
| Mix `set image` và `apply` | Drift Git vs cluster | Chọn 1 cách, stick |
| Probes fail → rollout stuck | Pod mới never Ready | Test probes trước rollout |

## Quick reference

```bash
# Trigger update
kubectl set image deployment/nginx nginx=nginx:1.26
kubectl edit deployment/nginx
kubectl apply -f deployment.yaml
kubectl patch deployment nginx -p '...'

# Track
kubectl rollout status deployment/nginx
kubectl rollout history deployment/nginx
kubectl rollout history deployment/nginx --revision=2

# Undo
kubectl rollout undo deployment/nginx
kubectl rollout undo deployment/nginx --to-revision=2

# Pause/resume
kubectl rollout pause deployment/nginx
kubectl rollout resume deployment/nginx

# Restart (không đổi spec)
kubectl rollout restart deployment/nginx

# Annotate
kubectl annotate deployment/nginx \
  kubernetes.io/change-cause="..."
```

## Tóm tắt bài 1

- Mỗi rollout = revision mới + ReplicaSet mới. Cũ giữ scale=0.
- **RollingUpdate** (default): zero downtime, control bằng `maxSurge` + `maxUnavailable`.
- **Recreate**: có downtime, chỉ dùng khi app không hỗ trợ 2 version cùng chạy.
- **CHANGE-CAUSE** qua annotation `kubernetes.io/change-cause`.
- `rollout undo` rollback về revision trước hoặc cụ thể. Tạo revision mới.
- `pause/resume` để combine nhiều thay đổi thành 1 rollout.
- `rollout restart` refresh Pod (không đổi spec).
- Rollout stuck → check Pod events → fix root cause hoặc undo.
- Blue/Green, Canary cần workaround (2 Deployment + Service switch) hoặc dùng Istio/Argo.

**Bài kế tiếp** → [Bài 2: Commands & Arguments — Override container entrypoint](02-commands-arguments.md)
