# Bài 5: HPA, VPA, In-Place Resize (2025 updates)

## Phân loại scaling

```text
                  SCALING TYPES
                       │
        ┌──────────────┴──────────────┐
        │                             │
   WORKLOAD                       CLUSTER (infra)
   (Pod/Replica)                  (Node)
        │                             │
   ┌────┴────┐                  ┌────┴────┐
   │         │                  │         │
HORIZONTAL  VERTICAL       HORIZONTAL  VERTICAL
(+ replicas)(+ CPU/RAM)    (+ nodes)   (resize node)
   │         │                  │
  HPA       VPA            Cluster Autoscaler / Karpenter
```

Phân biệt rõ:
- **Workload horizontal** = thêm Pod → **HPA**.
- **Workload vertical** = tăng CPU/RAM Pod → **VPA**.
- **Cluster horizontal** = thêm node → **Cluster Autoscaler / Karpenter**.

CKA focus: HPA + VPA. Cluster Autoscaler không deep (chỉ overview).

## Phần 1: Horizontal Pod Autoscaler (HPA)

### Manual scaling (recap)

```bash
# Quan sát resource
kubectl top pod -l app=nginx

# Khi CPU vượt ngưỡng, scale
kubectl scale deployment nginx --replicas=5
```

**Hạn chế**: Phải ngồi watch, react chậm với traffic spike.

### HPA tự động hoá

```text
HPA controller (chạy mỗi 15s):
1. Đọc metric (CPU/RAM/custom) từ Metrics Server
2. So với target threshold
3. Tính desired replicas:
   desired = ceil(current_replicas × current_utilization / target_utilization)
4. Patch Deployment/StatefulSet/ReplicaSet: replicas = desired
```

### Tạo HPA — Imperative

```bash
kubectl autoscale deployment nginx \
  --cpu-percent=50 \
  --min=1 --max=10
```

→ Tạo HPA với target CPU 50%, min 1 max 10 Pod.

```bash
kubectl get hpa
# NAME    REFERENCE          TARGETS   MINPODS   MAXPODS   REPLICAS   AGE
# nginx   Deployment/nginx   30%/50%   1         10        3          5m
                            ─────────
                            Current/Target
```

### Tạo HPA — Declarative

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: nginx-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: nginx
  minReplicas: 1
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

→ Có thể track **nhiều metric** cùng lúc. HPA chọn cái cần scale max.

### Yêu cầu của HPA

1. **Metrics Server** đang chạy.
2. Pod **phải có resource.requests** (HPA tính % dựa trên request).
3. Workload là Deployment, StatefulSet, hoặc ReplicaSet.

```yaml
# Pod template trong Deployment
spec:
  containers:
    - name: app
      resources:
        requests:
          cpu: 100m       # ← bắt buộc cho HPA CPU
          memory: 128Mi   # ← bắt buộc cho HPA memory
```

→ Nếu Pod không có `requests`, HPA không hoạt động — `TARGETS: <unknown>/50%`.

### Behavior — Scale up/down cooldown

```yaml
spec:
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60      # đợi 60s metric stable trước scale up
      policies:
        - type: Percent
          value: 100                       # max +100% mỗi lần
          periodSeconds: 60
        - type: Pods
          value: 4                          # hoặc +4 Pod/min
          periodSeconds: 60
      selectPolicy: Max                    # chọn policy cho phép scale nhiều nhất
    scaleDown:
      stabilizationWindowSeconds: 300     # 5 phút đợi
      policies:
        - type: Percent
          value: 50                        # max -50%/period
          periodSeconds: 60
```

→ Tránh oscillation (scale up rồi down liên tục).

### Custom + External metrics

Ngoài CPU/RAM (Resource metric), HPA hỗ trợ:

```yaml
metrics:
  # Pod metric (vd: request/sec/pod)
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: 1000

  # Object metric (vd: queue length)
  - type: Object
    object:
      describedObject:
        apiVersion: networking.k8s.io/v1
        kind: Ingress
        name: my-ingress
      metric:
        name: requests_per_second
      target:
        type: Value
        value: 10k

  # External metric (vd: cloud queue length)
  - type: External
    external:
      metric:
        name: queue_length
        selector:
          matchLabels:
            queue: orders
      target:
        type: AverageValue
        averageValue: 30
```

Cần **custom metrics adapter** (Prometheus Adapter, KEDA).

### Xem HPA hoạt động

```bash
# Status
kubectl get hpa

# Chi tiết + Events
kubectl describe hpa nginx-hpa
# Events:
#   Type    Reason            Message
#   Normal  SuccessfulRescale  New size: 5; reason: cpu resource utilization above target

# Watch realtime
kubectl get hpa nginx-hpa -w
```

### Hạn chế HPA

- Phản ứng **chậm** với spike (cần Metrics Server collect → tính → patch → Pod start ~1-2 phút).
- Phụ thuộc resource.requests đúng.
- Không phù hợp với app cần startup chậm (5-10 phút).

## Phần 2: Vertical Pod Autoscaler (VPA)

### Khác HPA

```text
HPA: thêm Pod (3 → 5 → 10)
VPA: thay đổi resource Pod (500m → 1000m → 2000m)
```

### VPA components

Không built-in K8s — phải cài thêm. Cài qua:

```bash
git clone https://github.com/kubernetes/autoscaler.git
cd autoscaler/vertical-pod-autoscaler
./hack/vpa-up.sh
```

3 component:

```text
[VPA Recommender]
- Đọc metric Pod từ Metrics API
- Phân tích historical + current usage
- Đưa ra recommendation (CPU/RAM tối ưu)
        │
        ▼
[VPA Updater]
- Nếu Pod resource lệch nhiều với recommendation
- → EVICT Pod (kill)
- (Deployment tự tạo Pod mới)
        │
        ▼
[VPA Admission Controller]
- Intercept Pod create request
- Mutate spec: thay request/limit theo recommendation
- Pod mới start với resource đúng
```

### YAML VPA

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: nginx-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: nginx
  updatePolicy:
    updateMode: Auto                  # off | initial | recreate | auto
  resourcePolicy:
    containerPolicies:
      - containerName: nginx
        minAllowed:
          cpu: 100m
          memory: 128Mi
        maxAllowed:
          cpu: 2
          memory: 2Gi
        controlledResources: ["cpu", "memory"]
```

### Update Mode

| Mode | Hành vi |
|---|---|
| `Off` | Chỉ recommend, không action |
| `Initial` | Apply recommendation **lúc Pod tạo** (không evict Pod đang chạy) |
| `Recreate` | Evict Pod đang chạy nếu cần update (giống "Auto" hiện tại) |
| `Auto` | Mặc định = Recreate. Tương lai sẽ dùng in-place resize |

### Xem recommendation

```bash
kubectl describe vpa nginx-vpa
# Status:
#   Recommendation:
#     Container Recommendations:
#       Container Name:  nginx
#       Lower Bound:
#         Cpu:     200m
#         Memory:  256Mi
#       Target:
#         Cpu:     500m
#         Memory:  768Mi
#       Upper Bound:
#         Cpu:     1
#         Memory:  1Gi
```

→ VPA suggest tăng CPU 500m, RAM 768Mi.

### Hạn chế VPA

- **Restart Pod** để apply → downtime.
- Không phù hợp stateful workload nhạy cảm.
- Không kết hợp tốt với HPA trên cùng resource (xung đột).

### HPA vs VPA — Khi nào dùng cái nào?

| | HPA | VPA |
|---|---|---|
| Scale | Pods (horizontal) | Resource/Pod (vertical) |
| Downtime | Không (Pod cũ vẫn chạy) | Có (Pod bị evict) |
| Spike response | **Nhanh** | Chậm |
| Best for | Web/microservice stateless | DB, JVM, batch heavy |
| Combo OK | + Cluster Autoscaler | + In-place Resize |
| Combo XẤU | + VPA trên cùng resource | + HPA trên CPU/RAM |

## Phần 3: In-Place Pod Resize (2025 feature)

### Vấn đề

Mặc định: thay đổi `resource` trong Pod spec → K8s **kill + recreate Pod**. Downtime.

In-place resize cho phép **đổi CPU/RAM Pod đang chạy** mà không restart.

### Trạng thái feature (1.32 alpha → beta tương lai)

```bash
# Bật feature gate trên apiserver, kubelet, controller-manager:
--feature-gates=InPlacePodVerticalScaling=true
```

### Resize Policy trong Pod

```yaml
spec:
  containers:
    - name: app
      image: nginx
      resources:
        requests: { cpu: 250m, memory: 256Mi }
        limits: { cpu: 500m, memory: 512Mi }
      resizePolicy:                          # ← thêm
        - resourceName: cpu
          restartPolicy: NotRequired         # resize CPU không cần restart
        - resourceName: memory
          restartPolicy: RestartContainer    # resize memory cần restart container
```

### Sử dụng

```bash
# Sau khi enable feature, sửa Pod
kubectl patch pod my-pod --subresource resize \
  --patch '{"spec":{"containers":[{"name":"app","resources":{"requests":{"cpu":"1"}}}]}}'

# Pod chạy tiếp với CPU mới — không restart
```

### Hạn chế

- Chỉ CPU + Memory.
- QoS class **không đổi được** sau khi Pod tạo.
- Init container không resize được.
- Resource request **không xoá được** sau khi set.
- Memory limit **không giảm dưới usage hiện tại** (sẽ stuck "InProgress").
- Windows Pod không support.

## Cluster Autoscaler (overview)

**Bonus**: Cluster horizontal scaling.

Khi node hết resource → CA tự gọi cloud API để **provision node mới**:

```text
[Pod Pending: insufficient CPU]
        │
        ▼
[Cluster Autoscaler] (cài như Pod trong cluster)
        │
        ▼
[Cloud API: create EC2/VM]
        │
        ▼
[Node mới join cluster]
        │
        ▼
[Pending Pod schedule lên node mới]
```

Khi node idle quá lâu → CA terminate node.

Cloud-specific: AWS (Cluster Autoscaler), GCP (built-in), Azure (built-in). Hoặc **Karpenter** (AWS, faster, smarter).

CKA không test deep.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| HPA nhưng Pod không có resource.requests | HPA `<unknown>/50%`, không scale | Set requests cho Pod |
| HPA + VPA cùng CPU/RAM | Conflict scaling | Chỉ dùng 1 trong 2 trên cùng resource |
| `maxReplicas` quá thấp | Spike không scale đủ | Đặt max cao hơn expected peak |
| VPA mode Auto trên DB | Restart liên tục | Mode `Off` hoặc `Initial` cho stateful |
| Metrics Server chưa cài | HPA không có metric | Cài Metrics Server trước |
| Tính sai threshold (vd CPU=10% cho HPA target 50%) | Scale up khi không cần | Test load thực tế |
| In-place resize trên cluster không có feature gate | Thay đổi không có hiệu lực | Enable `InPlacePodVerticalScaling` |

## Tóm tắt bài 5

- **HPA**: thêm/bớt Pod theo metric (CPU/RAM/custom). Built-in K8s 1.23+.
- HPA cần **Metrics Server** + Pod có **resource.requests**.
- Behavior: cooldown để tránh oscillation (`stabilizationWindowSeconds`).
- **VPA**: thay đổi resource Pod. 3 component: Recommender + Updater + Admission Controller.
- VPA 4 mode: `Off` (recommend), `Initial`, `Recreate`, `Auto`.
- **In-Place Resize** (alpha 1.32): resize CPU/RAM Pod không restart. Bật feature gate.
- HPA vs VPA: HPA cho web stateless, VPA cho DB/stateful CPU/RAM heavy.
- **KHÔNG** dùng HPA + VPA cùng resource. **CÓ THỂ** HPA + Cluster Autoscaler.

Phase 5 hoàn thành! Bạn đã master rollout, command/args, env/ConfigMap, Secret + encryption, multi-container, autoscaling.

**Bài kế tiếp** → [Phase 6 - Bài 1: OS Upgrade & Cluster Maintenance](../phase-6-cluster-maintenance/01-os-upgrade-cluster-maintenance.md)
