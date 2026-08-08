# Bài 3: Chỉ số, giám sát và sổ tay chẩn đoán

Log và `kubectl debug` giúp bạn điều tra **sau khi** biết có sự cố. Chỉ số (metrics) giúp bạn **biết trước** — và quan trọng hơn, biết **có bao nhiêu người dùng đang bị ảnh hưởng**.

Bài này khép lại phase: bộ chỉ số cần theo dõi, cách đặt cảnh báo không gây mệt mỏi, và một sổ tay tra cứu cho các sự cố thường gặp.

---

## Ba trụ cột quan sát hệ thống

```text
   ┌─────────────────────────────────────────────────────────────┐
   │  LOG (nhật ký)      "chuyện gì đã xảy ra ở một thời điểm"   │
   │                     Chi tiết cao, khối lượng lớn, đắt        │
   ├─────────────────────────────────────────────────────────────┤
   │  METRIC (chỉ số)    "hệ thống đang thế nào theo thời gian"  │
   │                     Chi tiết thấp, khối lượng nhỏ, rẻ        │
   ├─────────────────────────────────────────────────────────────┤
   │  TRACE (dấu vết)    "một request đi qua những đâu"          │
   │                     Nối các dịch vụ lại với nhau             │
   └─────────────────────────────────────────────────────────────┘

   Quy trình điều tra điển hình:
   METRIC báo động  →  TRACE tìm dịch vụ chậm  →  LOG xem lỗi cụ thể
```

Ba thứ này **bổ sung nhau, không thay thế nhau**. Chỉ có log thì không biết "chậm hơn bình thường bao nhiêu"; chỉ có metric thì không biết "vì sao".

---

## Bốn tín hiệu vàng

Google SRE đúc kết: nếu chỉ theo dõi được bốn thứ, hãy theo dõi bốn thứ này.

| Tín hiệu | Câu hỏi | Truy vấn PromQL |
|---|---|---|
| **Latency** (độ trễ) | Request mất bao lâu | `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))` |
| **Traffic** (lưu lượng) | Bao nhiêu request | `sum(rate(http_requests_total[5m]))` |
| **Errors** (lỗi) | Bao nhiêu phần trăm thất bại | `sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))` |
| **Saturation** (bão hoà) | Còn dư địa không | `sum(rate(container_cpu_usage_seconds_total[5m])) / sum(kube_pod_container_resource_limits{resource="cpu"})` |

> **Chú ý về độ trễ**: đo **p99**, không đo trung bình. Trung bình 200 ms nghe ổn, nhưng nếu p99 là 8 giây thì **1% người dùng đang có trải nghiệm rất tệ** — và với 100.000 request/giờ thì đó là 1.000 người mỗi giờ. Trung bình che giấu chính xác thứ bạn cần thấy.

---

## Chỉ số Kubernetes cần theo dõi

Ngoài chỉ số ứng dụng, bản thân cụm cũng cần được nhìn:

```promql
# Pod khởi động lại — dấu hiệu sớm nhất của mọi vấn đề
sum by (namespace, pod) (increase(kube_pod_container_status_restarts_total[1h])) > 3

# Pod không Ready quá 10 phút
kube_pod_status_ready{condition="false"} == 1

# CPU bị điều tiết (Phase 18 bài 1)
sum by (namespace, pod) (rate(container_cpu_cfs_throttled_periods_total[5m]))
  / sum by (namespace, pod) (rate(container_cpu_cfs_periods_total[5m])) > 0.25

# Bộ nhớ sát trần — cảnh báo TRƯỚC khi OOMKilled
container_memory_working_set_bytes
  / on(pod, container) kube_pod_container_resource_limits{resource="memory"} > 0.9

# Node sắp hết đĩa
(node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) < 0.15

# PVC sắp đầy — hay bị quên nhất
kubelet_volume_stats_available_bytes / kubelet_volume_stats_capacity_bytes < 0.15

# Deployment không đủ bản sao
kube_deployment_status_replicas_available < kube_deployment_spec_replicas
```

Ba truy vấn đáng nhấn:

**Bộ nhớ sát trần** cảnh báo ở mức 90% cho bạn thời gian phản ứng **trước khi** Pod bị OOMKilled. Cảnh báo sau khi OOM thì đã muộn.

**CPU bị điều tiết** là chỉ số duy nhất phát hiện được vấn đề hiệu năng âm thầm mà [Phase 18 bài 1](../phase-18/01-requests-limits-va-qos.md) mô tả — ứng dụng chậm mà không có lỗi nào.

**PVC sắp đầy** hay bị bỏ quên nhất, và hậu quả thì nghiêm trọng: database hết đĩa là dừng ghi, và mở rộng volume không phải lúc nào cũng làm được ngay.

---

## Bộ giám sát tiêu chuẩn

```text
   ┌──── Mỗi node ────┐
   │  node-exporter   │ ← DaemonSet: CPU, RAM, đĩa, mạng của NODE
   │  cAdvisor        │ ← có sẵn trong kubelet: chỉ số CONTAINER
   └────────┬─────────┘
            │
   ┌────────▼──────────────────────────────┐
   │  kube-state-metrics                    │ ← Deployment: trạng thái ĐỐI TƯỢNG
   │  (số replica, trạng thái Pod, PVC...)  │    (không phải chỉ số tài nguyên)
   └────────┬──────────────────────────────┘
            │
   ┌────────▼─────────┐
   │   Prometheus     │ ← thu thập (scrape) và lưu chuỗi thời gian
   └────────┬─────────┘
            │
   ┌────────▼─────────┐   ┌──────────────┐
   │    Grafana       │   │ Alertmanager │
   │  (bảng điều khiển)│   │  (cảnh báo)  │
   └──────────────────┘   └──────────────┘
```

Cách cài nhanh nhất — toàn bộ bộ này trong một lệnh:

```bash
helm install monitoring prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace \
  --set grafana.adminPassword=... \
  --set prometheus.prometheusSpec.retention=15d \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=100Gi
```

Nó cài sẵn Prometheus, Grafana, Alertmanager, node-exporter, kube-state-metrics, cộng khoảng 30 bảng điều khiển và hàng chục quy tắc cảnh báo đã được cộng đồng tinh chỉnh. Với hầu hết đội, đây là điểm khởi đầu đúng — đừng tự dựng từ đầu.

> **Phân biệt hay nhầm**: **cAdvisor** cho chỉ số **tiêu thụ tài nguyên** (CPU, RAM container đang dùng). **kube-state-metrics** cho chỉ số **trạng thái đối tượng** (Deployment có mấy replica, Pod đang ở phase nào, PVC đã Bound chưa). Hai thứ khác hẳn nhau và cần cả hai.

### Đưa chỉ số ứng dụng vào Prometheus

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: myapp
  namespace: production
  labels:
    release: monitoring          # PHẢI khớp nhãn Prometheus đang chọn
spec:
  selector:
    matchLabels:
      app: myapp
  endpoints:
    - port: metrics              # TÊN cổng trong Service, không phải số
      path: /actuator/prometheus
      interval: 30s
```

> **Bẫy `ServiceMonitor` không hoạt động**: nhãn `release: monitoring` phải khớp với `serviceMonitorSelector` mà Prometheus được cấu hình để tìm. Thiếu nhãn này thì ServiceMonitor apply thành công nhưng Prometheus **hoàn toàn bỏ qua** — không có lỗi nào. Kiểm tra ở `Status → Targets` trong giao diện Prometheus.

---

## Cảnh báo — chống mệt mỏi

Vấn đề lớn nhất của cảnh báo không phải là thiếu, mà là **quá nhiều**:

```text
   Đội nhận 50 cảnh báo mỗi ngày
        → 45 cái là nhiễu, không cần làm gì
        → Đội học cách BỎ QUA cảnh báo
        → Cảnh báo thứ 46 là sự cố thật, cũng bị bỏ qua
        → Đây gọi là MỆT MỎI CẢNH BÁO (alert fatigue)
```

Ba nguyên tắc:

**1. Cảnh báo theo triệu chứng, không theo nguyên nhân.**

```text
   SAI:  "CPU của Pod backend > 80%"
         → có thể hoàn toàn bình thường, không ai cần dậy lúc 3 giờ sáng

   ĐÚNG: "Tỉ lệ lỗi 5xx > 1% trong 5 phút"
         → người dùng ĐANG bị ảnh hưởng, phải xử lý ngay
```

CPU cao mà người dùng không bị ảnh hưởng thì đó là thông tin cho bảng điều khiển, không phải cảnh báo.

**2. Mỗi cảnh báo phải có hành động rõ ràng.**

Nếu người nhận cảnh báo không biết phải làm gì, cảnh báo đó vô dụng. Luôn kèm liên kết tới sổ tay xử lý.

**3. Phân tầng nghiêm trọng.**

```yaml
groups:
  - name: myapp
    rules:
      - alert: TiLeLoiCao
        expr: |
          sum(rate(http_requests_total{status=~"5..",app="myapp"}[5m]))
            / sum(rate(http_requests_total{app="myapp"}[5m])) > 0.01
        for: 5m                    # phải kéo dài 5 phút mới báo
        labels:
          severity: critical       # gọi điện, đánh thức người trực
        annotations:
          summary: "Tỉ lệ lỗi 5xx của myapp là {{ $value | humanizePercentage }}"
          runbook: "https://wiki.acme.com/runbook/myapp-loi-cao"

      - alert: BoNhoSatTran
        expr: |
          container_memory_working_set_bytes{pod=~"myapp.*"}
            / on(pod,container) kube_pod_container_resource_limits{resource="memory"} > 0.9
        for: 15m
        labels:
          severity: warning        # chỉ gửi Slack, không gọi điện
```

| Mức | Nghĩa | Kênh |
|---|---|---|
| `critical` | **Người dùng đang bị ảnh hưởng** | Gọi điện, đánh thức |
| `warning` | Sẽ thành vấn đề nếu không xử lý | Slack, xử lý trong giờ hành chính |
| `info` | Chỉ để biết | Bảng điều khiển |

Trường **`for:`** rất quan trọng: nó lọc bỏ các đợt tăng vọt thoáng qua. Không có `for`, một đợt 5xx kéo dài 10 giây cũng gọi điện đánh thức người ta.

---

## Sổ tay chẩn đoán nhanh

Bảng tra khi có sự cố — cột cuối là bài giải thích chi tiết.

| Triệu chứng | Kiểm tra đầu tiên | Nguyên nhân thường gặp | Chi tiết |
|---|---|---|---|
| Pod `Pending` | `describe pod` → Events | Thiếu tài nguyên, taint, PVC chưa Bound | [Bài 2](02-bo-cong-cu-go-loi.md) |
| `CrashLoopBackOff` | `logs --previous` + mã thoát | Lỗi cấu hình, OOM, sai `command` | [Bài 2](02-bo-cong-cu-go-loi.md) |
| `OOMKilled` (mã 137) | `kubectl top pod` | `limits.memory` thấp, rò rỉ, JVM không biết giới hạn | [Phase 18 bài 1](../phase-18/01-requests-limits-va-qos.md) |
| `Running 0/1` | `describe` → probe | readinessProbe thất bại | [Phase 18 bài 2](../phase-18/02-probes-va-bay-liveness.md) |
| Service trả 503 | **`kubectl get endpoints`** | Endpoint rỗng: selector lệch nhãn, hoặc Pod chưa Ready | [Bài 2](02-bo-cong-cu-go-loi.md) |
| Ứng dụng chậm, không lỗi | `cpu.stat` → `nr_throttled` | **Bị điều tiết CPU** | [Phase 18 bài 1](../phase-18/01-requests-limits-va-qos.md) |
| Không phân giải được tên | `nslookup` từ netshoot | CoreDNS, hoặc **Egress NetworkPolicy chặn cổng 53** | [Phase 19 bài 4](../phase-19/04-networkpolicy-va-tong-ket.md) |
| Gọi được service này, không gọi được service kia | `kubectl get netpol` | NetworkPolicy thiếu quy tắc | [Phase 19 bài 4](../phase-19/04-networkpolicy-va-tong-ket.md) |
| Deploy xong mất một ít request | Kiểm tra `preStop` | Thiếu `preStop` hook | [Phase 18 bài 2](../phase-18/02-probes-va-bay-liveness.md) |
| Cả cụm chậm dần rồi sập lúc tải cao | Kiểm tra `livenessProbe` | **Liveness giết Pod dây chuyền** | [Phase 18 bài 2](../phase-18/02-probes-va-bay-liveness.md) |
| Pod bị `Evicted` | `describe node` → Conditions | `DiskPressure`/`MemoryPressure`; Pod ở lớp BestEffort | [Phase 18 bài 1](../phase-18/01-requests-limits-va-qos.md) |
| HPA không scale | `kubectl get hpa` → `<unknown>` | Thiếu `requests.cpu` hoặc metrics-server | [Phase 18 bài 3](../phase-18/03-hpa-tu-dong-scale.md) |
| Pod mới kẹt `Pending` khi HPA scale | `describe pod` → Insufficient | Node đầy, thiếu Cluster Autoscaler | [Phase 18 bài 4](../phase-18/04-cluster-autoscaler-va-tong-ket.md) |
| StatefulSet kẹt ở Pod 0 | `describe pod mysql-0` | readinessProbe thất bại → Pod 1 không được tạo | [Phase 17 bài 1](../phase-17/01-statefulset.md) |
| CronJob chạy sai giờ | `kubectl get cronjob` | Chạy theo **UTC** (trước 1.27) | [Phase 17 bài 3](../phase-17/03-job-va-cronjob.md) |
| Job chạy chồng nhau | `concurrencyPolicy` | Mặc định là `Allow` | [Phase 17 bài 3](../phase-17/03-job-va-cronjob.md) |
| `Terminating` kẹt | `jsonpath finalizers` | Finalizer chưa được gỡ, node chết | [Bài 2](02-bo-cong-cu-go-loi.md) |
| NetworkPolicy không có tác dụng | Thử nghiệm `deny-all` | **CNI không hỗ trợ** (Flannel, AWS VPC CNI) | [Phase 19 bài 4](../phase-19/04-networkpolicy-va-tong-ket.md) |

---

## Quy trình xử lý sự cố

```text
   1. XÁC ĐỊNH PHẠM VI      Một Pod? Một dịch vụ? Một node? Cả cụm?
                            kubectl get pods -A --field-selector=status.phase!=Running
                            kubectl get nodes

   2. ĐO MỨC ẢNH HƯỞNG      Bao nhiêu % người dùng bị ảnh hưởng?
                            → quyết định mức độ khẩn cấp

   3. GIẢM THIỆT HẠI TRƯỚC  Quay lui bản deploy, scale lên, chuyển traffic
                            kubectl rollout undo deployment/myapp
                            ← LÀM VIỆC NÀY TRƯỚC KHI ĐIỀU TRA

   4. THU THẬP BẰNG CHỨNG   logs --previous, describe, events, chỉ số
                            → LƯU LẠI, vì Event chỉ sống 1 giờ

   5. ĐIỀU TRA NGUYÊN NHÂN  Khi hệ thống đã ổn định

   6. GHI LẠI               Cập nhật sổ tay, thêm cảnh báo còn thiếu
```

Bước 3 là bước hay bị làm sai nhất. Bản năng tự nhiên là **tìm hiểu vì sao** trước khi sửa. Nhưng khi người dùng đang bị ảnh hưởng, **khôi phục dịch vụ luôn ưu tiên hơn hiểu nguyên nhân**. Quay lui trước, điều tra sau — và nhớ thu thập bằng chứng ở bước 4 **trước khi** Event hết hạn.

---

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Đo độ trễ trung bình thay vì p99 | **Che giấu** đúng nhóm người dùng đang gặp vấn đề |
| Cảnh báo theo nguyên nhân (CPU cao) | Nhiễu → **mệt mỏi cảnh báo** → bỏ qua cả cảnh báo thật |
| Không có `for:` trong quy tắc cảnh báo | Đợt tăng vọt 10 giây cũng đánh thức người trực |
| Cảnh báo không kèm sổ tay | Người nhận không biết làm gì |
| Chỉ cảnh báo OOM **sau khi** xảy ra | Cảnh báo ở mức 90% cho thời gian phản ứng |
| Quên theo dõi PVC sắp đầy | Database hết đĩa, dừng ghi |
| `ServiceMonitor` thiếu nhãn `release` | Prometheus **bỏ qua hoàn toàn**, không báo lỗi |
| Nhầm cAdvisor với kube-state-metrics | Thiếu hẳn một nửa bức tranh |
| Điều tra nguyên nhân trước khi khôi phục | Kéo dài thời gian người dùng bị ảnh hưởng |
| Không lưu bằng chứng trước khi Event hết hạn | Điều tra sau đó **không còn dữ liệu** |
| Prometheus không có ổ đĩa bền vững | Mất toàn bộ lịch sử chỉ số khi Pod tạo lại |
| Retention Prometheus quá ngắn | Không so sánh được với tuần trước |

---

## Tóm tắt Phase 20

- **Ba trụ cột bổ sung nhau**: log ("chuyện gì xảy ra"), metric ("hệ thống thế nào theo thời gian"), trace ("request đi qua đâu"). Quy trình: **metric báo động → trace tìm chỗ chậm → log xem lỗi cụ thể**.
- **Kubernetes chỉ thấy stdout/stderr** ([bài 1](01-log-va-event.md)). **`--previous` là cờ quan trọng nhất** khi debug crash. `kubectl logs` **không phải nơi lưu trữ** — Pod bị xoá là log mất.
- **Event chỉ sống 1 giờ** và là nguồn thông tin duy nhất cho `ImagePullBackOff`, `FailedScheduling`, `FailedMount`. Phải **xuất Event sang hệ thống log**.
- **Log có cấu trúc (JSON) với `trace_id`** là thay đổi lớn nhất bạn có thể làm — nó biến log từ "đọc được" thành "truy vấn được".
- **`Running` không có nghĩa là khoẻ** ([bài 2](02-bo-cong-cu-go-loi.md)) — nhìn cột `READY`. **`kubectl get endpoints` rỗng** là nguyên nhân phổ biến nhất khi Service không hoạt động, và chỉ có hai lý do: selector lệch nhãn, hoặc Pod chưa Ready.
- **`kubectl debug`** với ephemeral container là cách duy nhất gỡ lỗi image distroless, và **không làm Pod khởi động lại**. `--copy-to` cho phép vào bên trong Pod `CrashLoopBackOff`.
- **Bốn tín hiệu vàng**: độ trễ (đo **p99**, không đo trung bình), lưu lượng, tỉ lệ lỗi, mức bão hoà.
- **Cảnh báo theo triệu chứng, không theo nguyên nhân.** "Tỉ lệ 5xx > 1%" đáng đánh thức người; "CPU > 80%" thì không. Luôn có **`for:`** và **liên kết sổ tay**.
- Cảnh báo **trước** khi hỏng: bộ nhớ ở 90% limits, đĩa node dưới 15%, **PVC dưới 15%** (hay bị quên nhất), và **CPU bị điều tiết** — chỉ số duy nhất bắt được vấn đề hiệu năng âm thầm.
- **cAdvisor** cho chỉ số tiêu thụ tài nguyên; **kube-state-metrics** cho trạng thái đối tượng. Cần **cả hai**. `kube-prometheus-stack` cài sẵn tất cả.
- Khi có sự cố: **giảm thiệt hại trước, điều tra sau**. Quay lui bản deploy, rồi mới tìm nguyên nhân — nhưng nhớ **thu thập bằng chứng trước khi Event hết hạn**.

**Quay lại** → [Mục lục khoá Docker & Kubernetes](../README.md)
