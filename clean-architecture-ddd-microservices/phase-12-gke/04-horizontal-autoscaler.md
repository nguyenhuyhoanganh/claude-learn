# Bài 52: Horizontal Pod Autoscaler — scale service theo tải

> Replica cố định hoài lãng phí (idle) hoặc thiếu (peak). Bài này dùng **HPA** (Horizontal Pod Autoscaler) auto scale Order service theo CPU. Test bằng cách tăng tải, xem GKE tự thêm pod.

## HPA hoạt động ra sao

```text
   ┌────────────────────────────────────┐
   │  HPA controller (mỗi 15s)          │
   │  1. Query metrics-server cho pod    │
   │  2. Tính avg utilization            │
   │  3. So với target                   │
   │  4. Scale up/down replicas          │
   └────────────────────────────────────┘
                    │
                    ▼
   ┌────────────────────────────────────┐
   │  Deployment.replicas updated       │
   │  → Kubernetes spin up/down pods    │
   └────────────────────────────────────┘
```

Formula:
```text
desiredReplicas = ceil(currentReplicas * (currentMetric / targetMetric))
```

Ví dụ: 2 pod, avg CPU = 80%, target = 50%:
```text
desiredReplicas = ceil(2 * (80 / 50)) = ceil(3.2) = 4
```

HPA chuyển deployment lên 4 replicas.

## Setup metrics-server

GKE có metrics-server tự install. Verify:

```text
$ kubectl top pods -n food-ordering-system

NAME                                   CPU(cores)   MEMORY(bytes)
order-service-5d8b6f9c8d-xz9p7         145m         512Mi
order-service-5d8b6f9c8d-ab12c         132m         498Mi
```

Nếu lỗi "metrics not available", install:
```text
$ kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

## HPA YAML cho Order service

`infrastructure/k8s/order-service/hpa.yaml`:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: order-service-hpa
  namespace: food-ordering-system
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60                    # scale up khi > 60%
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 70
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300                # đợi 5 phút trước khi scale down
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 30                 # scale up nhanh
      policies:
        - type: Percent
          value: 100                                  # double pod nếu cần
          periodSeconds: 30
        - type: Pods
          value: 4
          periodSeconds: 30
      selectPolicy: Max
```

3 điểm quan trọng:

| Field | Ý nghĩa |
|---|---|
| `minReplicas: 2` | Không bao giờ xuống dưới 2 — chống AZ single-point failure |
| `maxReplicas: 10` | Cap để cost không bùng |
| `averageUtilization: 60` | Target CPU 60% — sweet spot không quá nhiều buffer |
| `stabilizationWindowSeconds scaleDown: 300` | 5 phút sau scaleDown decision mới thực sự scale down — chống flapping |
| `stabilizationWindowSeconds scaleUp: 30` | Scale up nhanh khi cần |
| `selectPolicy: Max` | Áp dụng policy aggressive nhất khi scale up |

## Resource request bắt buộc

HPA cần biết "100% utilization là bao nhiêu". Pod template phải có `resources.requests`:

```yaml
resources:
  requests:
    cpu: 250m                                  # 0.25 vCPU
    memory: 512Mi
  limits:
    cpu: 1000m
    memory: 1Gi
```

`averageUtilization=60` nghĩa là: avg CPU usage / requested CPU = 60%. Tức ~150m / 250m.

## Apply HPA

```text
$ kubectl apply -f infrastructure/k8s/order-service/hpa.yaml

$ kubectl get hpa -n food-ordering-system

NAME                REFERENCE                  TARGETS                       MINPODS   MAXPODS   REPLICAS
order-service-hpa   Deployment/order-service   45%/60%, 65%/70%               2         10        2
```

HPA đang track 2 metric. Cả 2 dưới target → không scale.

## Test load với hey hoặc wrk

Cài `hey`:
```text
$ brew install hey
```

Generate load:
```text
$ hey -n 5000 -c 50 -m POST -H 'Content-Type: application/json' \
    -d @order.json http://EXTERNAL-IP/orders

Summary:
  Total: 60.3214 secs
  Slowest: 2.4351 secs
  Fastest: 0.0521 secs
  Requests/sec: 82.93
```

Theo dõi HPA:
```text
$ kubectl get hpa -w

NAME                TARGETS                       MINPODS   MAXPODS   REPLICAS
order-service-hpa   45%/60%, 65%/70%              2         10        2
order-service-hpa   85%/60%, 78%/70%              2         10        2
order-service-hpa   85%/60%, 78%/70%              2         10        4         ← scaled up
order-service-hpa   72%/60%, 70%/70%              2         10        4
order-service-hpa   65%/60%, 65%/70%              2         10        6         ← scaled up
order-service-hpa   45%/60%, 58%/70%              2         10        6
```

Sau khi load dừng:
```text
$ kubectl get hpa -w

NAME                TARGETS                       REPLICAS
order-service-hpa   12%/60%, 35%/70%              6
... sau 5 phút ...
order-service-hpa   12%/60%, 30%/70%              3
... sau 5 phút nữa ...
order-service-hpa   8%/60%, 25%/70%               2
```

Scale down về `minReplicas=2`.

## Custom metric HPA

Spring Boot + Micrometer Prometheus → expose custom metric. HPA scale theo metric khác CPU (vd: request rate, queue size):

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  metrics:
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: 100             # scale khi > 100 RPS / pod
```

Cần Prometheus Adapter để translate metric:
```text
$ helm install prometheus-adapter prometheus-community/prometheus-adapter
```

Phức tạp setup nhưng powerful cho production.

## Vertical Pod Autoscaler (preview)

Khác HPA, VPA scale **resource per pod** (tăng CPU/memory request), không thêm pod.

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: order-service-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-service
  updatePolicy:
    updateMode: "Auto"
```

VPA observe pod CPU/memory thực tế, suggest hoặc auto adjust request/limit. Phù hợp khi workload thay đổi pattern.

GKE Autopilot tự bật VPA. Standard cluster phải install:
```text
$ git clone https://github.com/kubernetes/autoscaler.git
$ ./autoscaler/vertical-pod-autoscaler/hack/vpa-up.sh
```

## Cluster Autoscaler — scale node-pool

HPA scale pod. Cluster Autoscaler scale **node** (VM).

```text
$ gcloud container clusters update food-ordering-cluster \
    --enable-autoscaling --min-nodes 1 --max-nodes 5 \
    --zone us-central1-a
```

Khi HPA scale 10 pod nhưng node hết resource → CA tạo VM mới (1-2 phút). Khi pod giảm → CA tắt VM (sau 10 phút idle).

## Production HPA best practices

1. **`minReplicas >= 2`** — high availability.
2. **`maxReplicas` đặt cap** — chống cost runaway khi bị attack DDoS.
3. **Target utilization 60-70%** — buffer cho spike đột ngột.
4. **Scale up nhanh + scale down chậm** — chống flapping.
5. **Multi-metric** (CPU + memory + custom) — cover nhiều scenario.
6. **Monitor HPA events** — `kubectl describe hpa` để debug.
7. **Test load** trước go live — biết hành vi real.

## Multi-service HPA

Áp dụng HPA cho mọi service:

```text
$ kubectl apply -f infrastructure/k8s/order-service/hpa.yaml
$ kubectl apply -f infrastructure/k8s/payment-service/hpa.yaml
$ kubectl apply -f infrastructure/k8s/restaurant-service/hpa.yaml
$ kubectl apply -f infrastructure/k8s/customer-service/hpa.yaml

$ kubectl get hpa -n food-ordering-system

NAME                       REPLICAS
order-service-hpa          2
payment-service-hpa        2
restaurant-service-hpa     2
customer-service-hpa       2
```

Khi peak: tất cả scale up độc lập theo tải mỗi service.

## Bẫy thường gặp với HPA

| Triệu chứng | Sửa |
|---|---|
| HPA không scale dù CPU cao | Pod không có `resources.requests`. Bắt buộc. |
| HPA flapping (scale up/down liên tục) | Tăng `stabilizationWindowSeconds`. |
| Metrics-server không trả data | Restart metrics-server pod. |
| HPA scale 10 pod nhưng pending | Cluster Autoscaler chưa scale node. Check quota. |
| CPU đo sai (cgroup) | Image dùng OpenJDK cũ không respect cgroup. Dùng JDK 17 hoặc `-XX:+UseContainerSupport`. |
| Memory utilization 100% liên tục | Heap nhỏ + Spring bloat. Tăng `-Xmx` hoặc memory limit. |
| Scheduler scale 10 instance → outbox race | `@Version` chống được. Hoặc dedicate 1 instance làm scheduler. |

## Tóm tắt bài 52

- HPA scale Deployment theo metric (CPU, memory, custom) — formula `desiredReplicas = ceil(curr * (currentUtil / targetUtil))`.
- Cần `resources.requests` ở pod để HPA tính utilization %.
- `behavior` config scale up nhanh / down chậm để chống flapping.
- Custom metric qua Prometheus Adapter cho metric business (RPS, queue size).
- Cluster Autoscaler scale node-pool — phối hợp với HPA cover end-to-end scale.
- Multi-service HPA cho mọi microservice — scale độc lập theo tải mỗi service.

**Bài kế tiếp** → [Bài 53 (phase-13): Change Data Capture với Debezium — nâng cấp Outbox](../phase-13-cdc-debezium/01-cdc-intro.md)
