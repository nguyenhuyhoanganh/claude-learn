# Bài 1: Troubleshoot Pod & Application

## Vì sao Troubleshooting là 30% điểm CKA?

Exam cho cluster đang **lỗi** → bạn fix. Không phải "hãy tạo X" mà "X không hoạt động, sửa".

Pattern troubleshoot:
1. Identify what's broken.
2. Hypothesis (Pod issue? Node issue? Network?).
3. Verify với `kubectl describe`, `logs`, `events`.
4. Fix root cause.
5. Verify fix worked.

Phase 14 chia troubleshoot làm 3 mảng:
- **App / Pod** (bài này).
- **Cluster / Node** (bài 2).
- **Networking** (bài 3).

## Pod Lifecycle States

```text
Pending → Running → Succeeded/Failed
   │
   ├── Pending: chưa schedule hoặc đang pull image
   ├── ContainerCreating: tạo container
   ├── Running: đang chạy
   ├── Succeeded: exit 0 (Job)
   ├── Failed: exit non-zero
   ├── CrashLoopBackOff: container crash liên tục
   ├── ImagePullBackOff: pull image fail
   ├── ErrImagePull: pull image fail
   ├── ContainerCreating: stuck (cgroup, volume, network)
   ├── Terminating: đang xoá (stuck nếu Pod không respond)
   └── Unknown: kubelet không liên lạc được
```

## Workflow troubleshoot Pod

```text
[1. List + identify]
   kubectl get pods -A
   kubectl get pods -A | grep -v Running

[2. Describe — đọc Events]
   kubectl describe pod <pod>
   
[3. Logs]
   kubectl logs <pod>
   kubectl logs <pod> --previous
   kubectl logs <pod> -c <container>

[4. Exec vào Pod]
   kubectl exec -it <pod> -- sh

[5. Debug network/DNS]
   kubectl exec <pod> -- nslookup <service>
   kubectl exec <pod> -- curl <endpoint>

[6. Check events cluster-wide]
   kubectl get events --sort-by='.lastTimestamp' -A
```

## Case study: Pending Pod

```bash
kubectl get pods
# NAME       READY   STATUS    AGE
# my-pod     0/1     Pending   5m
```

Pending → chưa schedule hoặc chưa start container.

```bash
kubectl describe pod my-pod
# Events:
#   Type     Reason            Message
#   ----     ------            -------
#   Warning  FailedScheduling  0/3 nodes are available: 3 Insufficient cpu.
```

→ Không node nào đủ CPU. Fix:
- Giảm `resources.requests.cpu`.
- Add node.
- Evict Pod khác.

Hoặc Event khác:
```text
Warning  FailedScheduling  0/3 nodes are available:
                            2 node(s) had taint {dedicated: gpu}
                            1 node(s) didn't match nodeSelector
```

→ Taint/affinity issue. Fix:
- Add toleration cho taint.
- Đổi nodeSelector.

Hoặc:
```text
Warning  FailedScheduling  0/3 nodes are available:
                            3 pod has unbound immediate PersistentVolumeClaims
```

→ PVC chưa bind. Check:
```bash
kubectl get pvc
# my-pvc   Pending   ...

kubectl describe pvc my-pvc
# Events: no persistent volumes available
```

Fix: tạo PV match hoặc check StorageClass.

## Case study: ImagePullBackOff

```bash
kubectl get pods
# my-pod   0/1   ImagePullBackOff   2m

kubectl describe pod my-pod
# Events:
#   Warning  Failed       Failed to pull image "nginx:nosuchtag":
#                         manifest unknown
```

Causes:
- Tag không tồn tại.
- Registry private → no `imagePullSecrets`.
- Network không reach registry.

Fix:
```bash
# Verify image trên registry
docker pull nginx:nosuchtag        # local test

# Update Pod
kubectl edit pod my-pod            # sửa image tag
# Hoặc với Deployment
kubectl set image deployment/X X=correct-image:tag
```

## Case study: CrashLoopBackOff

```bash
kubectl get pods
# my-pod   0/1   CrashLoopBackOff   3   2m
                                    ▲
                                    Restart count

kubectl describe pod my-pod
# State:          Waiting
#   Reason:       CrashLoopBackOff
# Last State:     Terminated
#   Reason:       Error
#   Exit Code:    1
#   Started:      ...
#   Finished:     ...
```

→ Container chạy nhưng exit non-zero. Loop.

Check logs **trước khi crash**:
```bash
kubectl logs my-pod --previous
# Application error: cannot connect to database
```

Hoặc liveness probe fail:
```bash
kubectl describe pod my-pod
# Events:
#   Warning  Unhealthy  Liveness probe failed: HTTP probe failed with statuscode: 500
#   Normal   Killing    Container app failed liveness probe, will be restarted
```

Fix:
- Sửa app code.
- Tăng `initialDelaySeconds` cho probe (app start chậm).
- Tăng `failureThreshold`.

## Case study: Container Creating stuck

```bash
kubectl describe pod my-pod
# Events:
#   Warning  FailedMount  Unable to attach or mount volumes:
#                         persistent volume "X" not found
```

PVC issue:
```bash
kubectl get pvc
# my-pvc   Lost   ...
```

→ PV bị xoá. Recreate PV.

Hoặc:
```text
Warning  FailedCreatePodSandBox  Failed to create pod sandbox:
                                 rpc error: ... no IP available
```

→ CNI plugin issue. Bài 3 sẽ chi tiết.

## Case study: OOMKilled

```bash
kubectl describe pod my-pod
# Last State:     Terminated
#   Reason:       OOMKilled
#   Exit Code:    137
```

→ Container vượt memory limit. Kernel kill.

Fix:
- Tăng `limits.memory`.
- Check app memory leak.
- Tune JVM/Node.js heap size.

```bash
# Xem usage thực tế
kubectl top pod my-pod
# my-pod   100m   600Mi      ← limit 500Mi → OOM
```

## Case study: Service không reach Pod

```bash
# Test
kubectl exec client-pod -- curl http://my-svc
# Connection refused

kubectl get svc my-svc
# CLUSTER-IP   ...

kubectl get endpoints my-svc
# ENDPOINTS
# <none>                     ← rỗng — selector không match Pod
```

→ Pod label không match Service selector.

```bash
kubectl get svc my-svc -o yaml | grep -A 3 selector
# selector:
#   app: nginx

kubectl get pods --show-labels
# my-pod   app=nginx-app          ← label sai
```

Fix:
- Update Pod label, hoặc.
- Update Service selector.

## Init container fail

```bash
kubectl get pod
# my-pod   0/1   Init:0/2   2m
                  ─────────
                  Đang chạy init 0/2, chưa xong

kubectl describe pod my-pod
# Init Containers:
#   wait-for-db:
#     State: Waiting
#     Reason: PodInitializing

kubectl logs my-pod -c wait-for-db
# Connecting to db:5432... fail (connection refused)
```

→ Init container đợi DB nhưng DB không có.

Fix: tạo DB Service, hoặc skip init container nếu không cần.

## Debug container — `kubectl debug`

K8s 1.18+: tạo Pod debug copy của Pod gốc, có shell:

```bash
kubectl debug -it my-pod --image=busybox --target=app
# Tạo ephemeral container trong Pod, share network namespace
```

→ Hữu ích khi Pod gốc dùng distroless image (không có shell).

## Resource & limit issues

### Pod evict do memory pressure

```bash
kubectl describe pod my-pod
# Status: Failed
# Reason: Evicted
# Message: The node was low on resource: memory
```

→ Node hết memory → kubelet evict Pod. Fix:
- Set memory limit.
- Scale node.

### CPU throttle

```bash
kubectl top pod my-pod
# 800m       ← gần limit 1000m
```

→ App chậm vì throttle. Tăng limit.

## App logs verbose

Sometimes app log không đủ. Tăng log level:

```yaml
# Pod env
env:
  - { name: LOG_LEVEL, value: debug }
```

Restart Pod để load env mới.

## Common error patterns

| Error | Possible cause |
|---|---|
| `Pending` + `FailedScheduling` | Resource / taint / affinity |
| `ImagePullBackOff` | Image tag sai, no `imagePullSecrets`, registry down |
| `CrashLoopBackOff` | App exit error, probe fail, missing config/secret |
| `OOMKilled` | Memory limit thấp, leak |
| `Error` + exit 137 | OOMKilled (signal 9) |
| `Error` + exit 143 | SIGTERM (graceful shutdown) |
| `Init:0/N` | Init container chưa xong |
| `ContainerCreating` stuck | Volume mount fail, CNI fail |
| `Evicted` | Node resource pressure |
| Pod chạy nhưng Service timeout | Selector mismatch, no endpoint |
| Pod chạy nhưng probe fail | Endpoint không respond đúng |

## Debug tools

```bash
# Tạo Pod debug nhanh
kubectl run debug --image=busybox --rm -it -- sh
kubectl run debug --image=nicolaka/netshoot --rm -it -- bash    # tool network

# Inside debug Pod:
nslookup my-svc
curl http://my-svc:80
ping <pod-ip>
traceroute <pod-ip>
netstat -tlnp
ss -tlnp

# Exec vào existing Pod
kubectl exec -it my-pod -- sh
kubectl exec -it my-pod -c container-name -- sh

# Copy file vào/ra Pod
kubectl cp my-pod:/var/log/app.log ./app.log
kubectl cp ./fix.sh my-pod:/tmp/fix.sh

# Port-forward để test locally
kubectl port-forward pod/my-pod 8080:80
curl http://localhost:8080
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Chỉ check `kubectl logs`, không `--previous` | Miss log lúc crash | `--previous` cho CrashLoopBackOff |
| Sửa Pod tay, Deployment rebuild | Mất sửa | Sửa Deployment, không Pod |
| Quên check Events | Miss root cause | `describe` xem Events |
| Restart Pod mong fix | Tạm thời che vấn đề | Fix root cause |
| Bật log debug không tắt | Disk full, performance kém | Tắt sau debug |
| `kubectl exec` nhưng image distroless | "exec format error" | Dùng `kubectl debug` |

## Quick reference

```bash
# Tổng quan
kubectl get pods -A
kubectl get pods -A | grep -v Running

# Detail
kubectl describe pod <pod> -n <ns>
kubectl logs <pod>
kubectl logs <pod> --previous
kubectl logs <pod> -c <container>
kubectl logs -l app=X -n <ns>

# Events
kubectl get events --sort-by='.lastTimestamp' -A

# Resource
kubectl top pod <pod>
kubectl top pod -A --sort-by=memory

# Debug
kubectl exec -it <pod> -- sh
kubectl debug <pod> --image=busybox
kubectl port-forward <pod> 8080:80
kubectl cp <pod>:/path local-path

# Patch fix
kubectl edit deployment X
kubectl set image deployment/X X=image:tag
kubectl rollout restart deployment/X
```

## Tóm tắt bài 1

- Pod states: Pending, Running, ContainerCreating, CrashLoopBackOff, OOMKilled, ImagePullBackOff, Terminating.
- Workflow: `get pods` → `describe` (Events) → `logs` (--previous nếu crash) → fix root cause.
- Common issues:
  - **Pending + Insufficient cpu**: resource issue.
  - **ImagePullBackOff**: image/secret/registry.
  - **CrashLoopBackOff**: app exit, probe fail.
  - **OOMKilled**: memory limit.
  - **ContainerCreating stuck**: volume/CNI.
- `kubectl logs --previous` cho crashed container.
- `kubectl debug` tạo ephemeral container debug.
- Service không reach Pod → check `endpoints` (label mismatch).

**Bài kế tiếp** → [Bài 2: Troubleshoot Control Plane & Worker Node](02-troubleshoot-cluster.md)
