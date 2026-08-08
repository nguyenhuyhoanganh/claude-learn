# Bài 3: HorizontalPodAutoscaler — tự động scale theo tải

Bạn đặt `replicas: 3`. Ban đêm lưu lượng gần bằng 0 — ba Pod ngồi không, vẫn tính tiền. Giữa trưa lưu lượng gấp mười — ba Pod không kham nổi, người dùng nhận lỗi 502.

**HorizontalPodAutoscaler (HPA)** tự động điều chỉnh con số đó. Nhưng nó có khá nhiều chi tiết mà không nắm thì HPA sẽ hoặc không hoạt động, hoặc hoạt động sai một cách khó hiểu.

---

## Điều kiện tiên quyết: metrics-server

HPA không tự đo được gì. Nó đọc chỉ số từ **Metrics API**, và API đó do `metrics-server` cung cấp.

```bash
kubectl top nodes
```

```text
error: Metrics API not available
```

Lỗi này nghĩa là chưa cài `metrics-server` — và **HPA sẽ không bao giờ hoạt động** cho tới khi cài.

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl top nodes
```

```text
NAME       CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
worker-1   842m         21%    3421Mi          43%
worker-2   1203m        30%    5102Mi          64%
```

> Trên EKS, GKE, AKS thì `metrics-server` thường đã có sẵn. Trên minikube phải bật: `minikube addons enable metrics-server`.

---

## HPA cơ bản

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70        # mục tiêu 70%
```

```bash
kubectl get hpa myapp
```

```text
NAME    REFERENCE          TARGETS         MINPODS  MAXPODS  REPLICAS  AGE
myapp   Deployment/myapp   43%/70%         3        20       5         2d
                            ▲    ▲
                      hiện tại  mục tiêu
```

### Công thức tính — đơn giản hơn bạn nghĩ

```text
   soPodMoi = ceil( soPodHienTai × ( chiSoHienTai / chiSoMucTieu ) )
```

```text
   Ví dụ: 5 Pod, CPU trung bình 85%, mục tiêu 70%

   soPodMoi = ceil( 5 × (85 / 70) ) = ceil(6.07) = 7 Pod
```

Có một vùng chết để tránh dao động:

```text
   Nếu | chiSoHienTai / chiSoMucTieu - 1 | < 0.1  →  KHÔNG làm gì

   Ví dụ: hiện tại 73%, mục tiêu 70% → tỉ lệ 1.043 → lệch 4,3% < 10%
          → KHÔNG scale. Đây là cố ý.
```

---

## Chi tiết quyết định mọi thứ: `averageUtilization` tính theo `requests`

Đây là điểm bị hiểu nhầm nhiều nhất về HPA.

```text
   averageUtilization: 70  KHÔNG có nghĩa là "70% CPU của node"

   Nó có nghĩa là:  70% của resources.requests.cpu
```

```yaml
resources:
  requests:
    cpu: 200m         # ← HPA tính phần trăm TRÊN CON SỐ NÀY
  limits:
    cpu: 1000m
```

```text
   Pod đang dùng 140m CPU
   → utilization = 140 / 200 = 70%  → đạt mục tiêu, không scale

   Pod đang dùng 500m CPU (vẫn dưới limits 1000m, hoàn toàn khoẻ)
   → utilization = 500 / 200 = 250%  → HPA SCALE MẠNH
```

Hai hệ quả:

| Sai lầm | Hậu quả |
|---|---|
| **Không đặt `requests.cpu`** | HPA **không tính được utilization** → `TARGETS` hiện `<unknown>` → **HPA không hoạt động** |
| Đặt `requests.cpu` quá thấp | Utilization luôn cao → **HPA scale liên tục** dù Pod thực ra rất rảnh |
| Đặt `requests.cpu` quá cao | Utilization luôn thấp → **HPA không bao giờ scale** dù Pod đang nghẹt |

> **Quy tắc**: HPA chỉ đúng khi `requests.cpu` được đặt **sát với mức dùng thật ở tải bình thường**. Đây là lý do [bài 1](01-requests-limits-va-qos.md) về đo đạc quan trọng — HPA khuếch đại mọi sai lầm ở đó.

Triệu chứng kinh điển:

```bash
kubectl get hpa
```

```text
NAME    REFERENCE          TARGETS           REPLICAS
myapp   Deployment/myapp   <unknown>/70%     3
                            ▲
                    Quên đặt requests.cpu
```

---

## Điều chỉnh hành vi scale — `behavior`

Mặc định HPA scale lên nhanh và scale xuống chậm, nhưng bạn kiểm soát được:

```yaml
spec:
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0      # scale lên NGAY, không chờ
      policies:
        - type: Percent
          value: 100                     # tối đa gấp đôi
          periodSeconds: 15
        - type: Pods
          value: 4                       # hoặc tối đa +4 Pod
          periodSeconds: 15
      selectPolicy: Max                  # lấy giá trị LỚN HƠN

    scaleDown:
      stabilizationWindowSeconds: 300    # nhìn lại 5 phút trước khi hạ
      policies:
        - type: Percent
          value: 10                      # mỗi 60 giây chỉ hạ 10%
          periodSeconds: 60
      selectPolicy: Min
```

### `stabilizationWindowSeconds` — thứ chống dao động

```text
   Không có cửa sổ ổn định:
   14:00  tải cao → scale lên 10 Pod
   14:01  tải giảm → scale xuống 3 Pod
   14:02  tải cao → scale lên 10 Pod
   → DAO ĐỘNG. Pod liên tục khởi động rồi bị giết, không kịp ấm.

   Có stabilizationWindowSeconds: 300 cho scaleDown:
   HPA nhìn lại 5 phút qua, lấy giá trị CAO NHẤT được đề nghị
   → chỉ hạ khi tải đã thấp ỔN ĐỊNH suốt 5 phút
```

Mặc định: `scaleUp` 0 giây (lên ngay), `scaleDown` 300 giây (xuống chậm). Đây là mặc định hợp lý — **scale lên muộn thì mất người dùng, scale xuống sớm thì gây dao động**.

### Cấu hình cho tải tăng đột ngột

```yaml
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 200                     # gấp BA mỗi 15 giây
          periodSeconds: 15
      selectPolicy: Max
```

Dùng cho sự kiện flash sale, livestream — nơi lưu lượng tăng 10 lần trong một phút.

---

## Scale theo chỉ số khác CPU

CPU thường **không** phải chỉ số đúng. Một API chờ database sẽ có CPU rất thấp trong khi đã nghẹt hoàn toàn.

### Theo bộ nhớ

```yaml
  metrics:
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

> **Cảnh báo**: scale theo bộ nhớ thường **không hiệu quả**. Nhiều runtime (JVM, Node.js) **không trả bộ nhớ về hệ điều hành** sau khi dùng — nên utilization chỉ tăng, không giảm. HPA sẽ scale lên rồi **không bao giờ scale xuống**.

### Theo chỉ số tuỳ chỉnh (custom metrics)

Đây mới là cách dùng đúng cho hầu hết dịch vụ:

```yaml
  metrics:
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "100"          # 100 request/giây mỗi Pod
```

Cần **Prometheus Adapter** để đưa chỉ số Prometheus vào Custom Metrics API.

### Theo chỉ số bên ngoài (external metrics)

```yaml
  metrics:
    - type: External
      external:
        metric:
          name: sqs_queue_length
          selector:
            matchLabels:
              queue: orders
        target:
          type: AverageValue
          averageValue: "30"           # 30 message mỗi Pod
```

Đây là cách đúng cho worker xử lý hàng đợi — scale theo **độ dài hàng đợi**, không phải CPU.

### Nhiều chỉ số cùng lúc

```yaml
  metrics:
    - type: Resource
      resource: {name: cpu, target: {type: Utilization, averageUtilization: 70}}
    - type: Pods
      pods:
        metric: {name: http_requests_per_second}
        target: {type: AverageValue, averageValue: "100"}
```

HPA tính số Pod cho **từng** chỉ số rồi **lấy giá trị lớn nhất**. Nghĩa là chỉ cần **một** chỉ số vượt ngưỡng là scale — an toàn nhưng có thể tốn kém.

---

## KEDA — khi HPA gốc không đủ

HPA có hai giới hạn lớn:

```text
   1. minReplicas TỐI THIỂU LÀ 1 — không scale về 0 được
   2. Chỉ số tuỳ chỉnh cần dựng Prometheus Adapter — khá phiền
```

**KEDA** (Kubernetes Event-Driven Autoscaling) giải cả hai:

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: order-worker
spec:
  scaleTargetRef:
    name: order-worker
  minReplicaCount: 0          # SCALE VỀ 0 khi không có việc
  maxReplicaCount: 50
  cooldownPeriod: 300
  triggers:
    - type: kafka
      metadata:
        bootstrapServers: kafka:9092
        consumerGroup: order-processor
        topic: orders
        lagThreshold: "100"    # mỗi Pod xử lý 100 message tồn đọng
```

KEDA có sẵn hơn 60 "scaler": Kafka, RabbitMQ, SQS, Redis, PostgreSQL, Prometheus, cron, Azure/GCP/AWS services. Nó tự dựng HPA bên dưới, nên bạn không phải cấu hình Prometheus Adapter.

| | HPA gốc | KEDA |
|---|---|---|
| Scale về 0 | **Không** | **Có** |
| Nguồn chỉ số | CPU, RAM, custom (cần adapter) | **60+ nguồn có sẵn** |
| Phải cài thêm | metrics-server | **KEDA operator** |
| Dùng cho | Dịch vụ HTTP | **Worker theo sự kiện** |

Với worker xử lý hàng đợi chỉ có việc vài giờ mỗi ngày, KEDA tiết kiệm được phần lớn chi phí.

---

## HPA và Deployment — đừng đánh nhau

```yaml
# SAI — cả hai cùng quản replicas
spec:
  replicas: 3        # trong Deployment
---
spec:
  minReplicas: 3     # trong HPA
  maxReplicas: 20
```

```text
   HPA scale lên 10 Pod
   Bạn chạy: kubectl apply -f deployment.yaml   (vẫn ghi replicas: 3)
   → Deployment hạ xuống 3 Pod
   → HPA thấy tải cao, lại scale lên 10
   → DAO ĐỘNG mỗi lần deploy
```

Cách đúng: **bỏ hẳn `replicas` khỏi Deployment** khi đã có HPA.

```yaml
spec:
  # replicas: KHÔNG khai — để HPA quản
  selector: ...
```

Với GitOps (ArgoCD, Flux), thêm cấu hình bỏ qua khác biệt ở trường này:

```yaml
# ArgoCD Application
spec:
  ignoreDifferences:
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas
```

---

## Chẩn đoán khi HPA không hoạt động

```bash
kubectl describe hpa myapp
```

```text
Conditions:
  Type            Status  Reason                  Message
  AbleToScale     True    ReadyForNewScale        recommended size matches current
  ScalingActive   False   FailedGetResourceMetric unable to get metrics for resource cpu
  ScalingLimited  True    TooManyReplicas         the desired count is more than the maximum
```

Bảng tra lỗi:

| Triệu chứng | Nguyên nhân | Cách chữa |
|---|---|---|
| `TARGETS: <unknown>/70%` | Thiếu `requests.cpu`, hoặc chưa có metrics-server | Đặt requests; cài metrics-server |
| `FailedGetResourceMetric` | metrics-server chưa chạy hoặc chưa thu thập kịp | `kubectl get pods -n kube-system \| grep metrics` |
| Không scale dù CPU cao | Nằm trong vùng chết 10%, hoặc đã chạm `maxReplicas` | Kiểm tra `ScalingLimited` |
| Scale liên tục lên xuống | `stabilizationWindowSeconds` quá nhỏ | Tăng `scaleDown` lên 300+ |
| Scale lên rồi không xuống | Chỉ số bộ nhớ không giảm (JVM giữ heap) | Đổi sang chỉ số CPU hoặc custom |
| Replicas bị đặt lại mỗi lần deploy | Deployment vẫn khai `replicas` | Bỏ trường đó |

---

## Danh sách kiểm tra trước khi bật HPA

| Mục | Vì sao |
|---|---|
| Đã cài `metrics-server` | Không có thì HPA không chạy |
| Mọi container có `requests.cpu` | HPA tính utilization dựa trên nó |
| Đã bỏ `replicas` khỏi Deployment | Tránh đánh nhau |
| `readinessProbe` chuẩn xác | Pod mới phải Ready mới nhận traffic, nếu không scale lên vô ích |
| Ứng dụng **không trạng thái** | Pod bị giết bất kỳ lúc nào khi scale xuống |
| Thời gian khởi động < 60 giây | Scale lên mà mất 5 phút mới phục vụ được thì đã muộn |
| `PodDisruptionBudget` đã có | Chặn scale xuống giết hết bản sao |
| `minReplicas >= 2` | Một Pod duy nhất không có tính sẵn sàng |
| Cụm có chỗ, hoặc có Cluster Autoscaler | Scale Pod mà hết node thì Pod `Pending` |

Dòng cuối dẫn sang bài kế tiếp: HPA tạo thêm Pod, nhưng **nếu node đã đầy thì Pod mới chỉ nằm `Pending`**. Cần một lớp autoscaling nữa ở cấp node.

---

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Quên `requests.cpu` | HPA hiện `<unknown>`, **không hoạt động** |
| Chưa cài metrics-server | Như trên |
| Vẫn khai `replicas` trong Deployment | **Dao động mỗi lần deploy** |
| Scale theo bộ nhớ với ứng dụng JVM | Scale lên rồi **không bao giờ xuống** |
| `minReplicas: 1` | Mất tính sẵn sàng khi Pod đó chết |
| `maxReplicas` quá cao | Một sự cố có thể scale lên 500 Pod, **cháy hoá đơn** |
| `stabilizationWindowSeconds: 0` cho scaleDown | Dao động liên tục |
| Dùng HPA cho StatefulSet database | Thêm bản sao database không tự động thành cụm |
| Không có Cluster Autoscaler | Pod mới `Pending` vĩnh viễn khi node đầy |
| Dùng CPU làm chỉ số cho dịch vụ chờ I/O | CPU thấp trong khi đã nghẹt → **không bao giờ scale** |
| Ứng dụng khởi động 3 phút | Scale lên xong thì đợt tải đã qua |

---

## Tóm tắt bài 3

- **HPA cần `metrics-server`**. Không có nó thì `TARGETS` hiện `<unknown>` và HPA hoàn toàn không hoạt động.
- Công thức: **`ceil(soPodHienTai × chiSoHienTai / chiSoMucTieu)`**, kèm **vùng chết 10%** để tránh dao động.
- Chi tiết quan trọng nhất: **`averageUtilization` tính theo `resources.requests`, không phải theo năng lực node**. Quên `requests.cpu` là HPA chết; đặt sai là HPA scale sai. HPA **khuếch đại mọi sai lầm** trong việc đặt requests.
- **`behavior`** kiểm soát tốc độ: mặc định **scale lên ngay, scale xuống sau 300 giây** — hợp lý, vì lên muộn thì mất người dùng, xuống sớm thì dao động.
- **CPU thường không phải chỉ số đúng.** Dịch vụ chờ I/O có CPU thấp khi đã nghẹt. Dùng **custom metrics** (request/giây) hoặc **external metrics** (độ dài hàng đợi).
- **Đừng scale theo bộ nhớ với JVM/Node.js** — chúng không trả bộ nhớ về hệ điều hành, nên HPA scale lên rồi **không bao giờ xuống**.
- **KEDA** giải hai giới hạn của HPA gốc: **scale về 0** và **60+ nguồn chỉ số có sẵn** không cần Prometheus Adapter. Đúng cho worker theo sự kiện.
- **Bỏ hẳn `replicas` khỏi Deployment** khi đã có HPA, nếu không sẽ dao động mỗi lần deploy. Với GitOps thì thêm `ignoreDifferences`.
- HPA chỉ tạo Pod. **Node đầy thì Pod mới nằm `Pending`** — cần thêm một lớp autoscaling ở cấp node.

**Bài kế tiếp** → [Bài 4: Cluster Autoscaler, VPA và tổng kết Phase 18](04-cluster-autoscaler-va-tong-ket.md)
