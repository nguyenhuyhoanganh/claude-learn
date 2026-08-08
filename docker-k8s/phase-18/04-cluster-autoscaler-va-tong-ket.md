# Bài 4: Cluster Autoscaler, VPA và tổng kết Phase 18

[Bài 3](03-hpa-tu-dong-scale.md) kết thúc bằng một vấn đề bỏ ngỏ: HPA tạo thêm Pod, nhưng nếu mọi node đã đầy thì Pod mới chỉ nằm `Pending` mãi mãi.

```bash
kubectl get pods
```

```text
NAME              READY   STATUS    AGE
myapp-7d4-x7k2p   1/1     Running   2d
myapp-7d4-m9q4t   1/1     Running   2d
myapp-7d4-b2n8w   0/1     Pending   4m      ← HPA tạo ra nhưng KHÔNG CÓ CHỖ
```

```bash
kubectl describe pod myapp-7d4-b2n8w
```

```text
Events:
  Warning  FailedScheduling  4m  default-scheduler
    0/3 nodes are available: 3 Insufficient cpu.
```

Bài này giải quyết tầng đó, rồi tổng kết cả ba trục mở rộng.

---

## Ba trục autoscaling — đừng nhầm lẫn

```text
   ┌──────────────────────────────────────────────────────────────┐
   │  HPA — Horizontal Pod Autoscaler                             │
   │  Đổi SỐ LƯỢNG POD.  3 Pod → 10 Pod                           │
   ├──────────────────────────────────────────────────────────────┤
   │  VPA — Vertical Pod Autoscaler                               │
   │  Đổi KÍCH THƯỚC POD.  requests 200m → 800m                   │
   ├──────────────────────────────────────────────────────────────┤
   │  CA — Cluster Autoscaler                                     │
   │  Đổi SỐ LƯỢNG NODE.  3 node → 8 node                         │
   └──────────────────────────────────────────────────────────────┘

   HPA và CA làm việc CÙNG NHAU — đây là cặp chuẩn.
   HPA và VPA XUNG ĐỘT nhau nếu cùng dùng một chỉ số.
```

---

## Cluster Autoscaler

Cơ chế đơn giản một cách bất ngờ:

```text
   SCALE LÊN
   ═════════
   Cứ 10 giây, CA quét các Pod ở trạng thái Pending.
   Có Pod Pending vì thiếu tài nguyên?
        → Mô phỏng: "nếu thêm một node loại X thì Pod này xếp được không?"
        → Được  → gọi API của cloud để thêm node
        → Node sẵn sàng sau 1-5 phút → scheduler xếp Pod lên

   SCALE XUỐNG
   ═══════════
   Node có mức sử dụng dưới 50% liên tục 10 phút?
        → Kiểm tra: mọi Pod trên node này có chỗ khác để chuyển không?
        → Có → drain node → xoá node
        → Không → GIỮ NGUYÊN
```

```yaml
# Trên EKS — cấu hình qua annotation của Deployment cluster-autoscaler
command:
  - ./cluster-autoscaler
  - --cloud-provider=aws
  - --node-group-auto-discovery=asg:tag=k8s.io/cluster-autoscaler/enabled,k8s.io/cluster-autoscaler/my-cluster
  - --balance-similar-node-groups
  - --skip-nodes-with-local-storage=false
  - --scale-down-unneeded-time=10m
  - --scale-down-utilization-threshold=0.5
  - --expander=least-waste
```

### Năm điều kiện chặn node bị xoá

Đây là phần hay gây bối rối: *"vì sao node rảnh mà CA không xoá?"*

| Điều kiện | Chi tiết | Cách xử lý |
|---|---|---|
| Có Pod **không quản bởi controller** | Pod tạo trực tiếp (không qua Deployment) | Đừng tạo Pod trần |
| Có Pod dùng **local storage** (`emptyDir`, `hostPath`) | CA sợ mất dữ liệu | `--skip-nodes-with-local-storage=false`, hoặc annotation cho phép |
| Có Pod **không thể chuyển đi đâu** | PDB quá chặt, hoặc affinity ràng buộc | Nới `PodDisruptionBudget` |
| Có Pod **kube-system** không có PDB | CA mặc định không đụng | Tạo PDB cho chúng |
| Pod có **annotation cấm đuổi** | `cluster-autoscaler.kubernetes.io/safe-to-evict: "false"` | Bỏ annotation nếu không cần |

```yaml
# Cho phép CA xoá node chứa Pod dùng emptyDir
metadata:
  annotations:
    cluster-autoscaler.kubernetes.io/safe-to-evict: "true"
```

### Ba tham số quyết định hành vi

```text
   --scale-down-unneeded-time=10m
       Node phải rảnh LIÊN TỤC 10 phút mới bị xoá.
       Giảm xuống → tiết kiệm tiền hơn, nhưng dao động nhiều hơn.

   --scale-down-utilization-threshold=0.5
       Dưới 50% mới coi là "rảnh". Tính theo REQUESTS, không phải mức dùng thật.

   --expander=least-waste
       Chọn nhóm node nào khi cần thêm.
       least-waste: ít lãng phí tài nguyên nhất  ← thường là lựa chọn tốt
       priority:    theo thứ tự bạn định nghĩa
       random:      ngẫu nhiên
```

> **Chi tiết quan trọng**: `scale-down-utilization-threshold` tính theo **tổng `requests` của Pod trên node**, không phải mức dùng CPU thật. Node có 10 Pod requests tổng 60% nhưng thực tế chỉ dùng 5% CPU thì CA **vẫn không xoá**. Đây là lý do việc đặt `requests` quá cao ([bài 1](01-requests-limits-va-qos.md)) làm cụm tốn tiền gấp nhiều lần.

### Giải bài toán "chờ node quá lâu"

Thêm một node mất 1–5 phút — quá lâu cho đợt tải tăng đột ngột. Mẹo dùng **Pod giữ chỗ (overprovisioning)**:

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: giu-cho
value: -10                 # ĐỘ ƯU TIÊN ÂM
globalDefault: false
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pod-giu-cho
spec:
  replicas: 3
  template:
    spec:
      priorityClassName: giu-cho
      containers:
        - name: pause
          image: registry.k8s.io/pause:3.9
          resources:
            requests: {cpu: "1", memory: 2Gi}    # chiếm chỗ thật
```

```text
   Bình thường: 3 Pod "giữ chỗ" chiếm sẵn 3 CPU + 6 GB
                → CA đã tạo sẵn node để chứa chúng

   Tải tăng:    HPA tạo Pod thật (độ ưu tiên 0 > -10)
                → scheduler ĐUỔI Pod giữ chỗ ra ngay lập tức
                → Pod thật chạy NGAY, không chờ node mới

   Sau đó:      Pod giữ chỗ thành Pending → CA thêm node mới cho chúng
                → lại có sẵn chỗ trống cho lần sau
```

Đây là mẹo đổi **tiền** lấy **tốc độ phản ứng** — bạn trả tiền cho vài node luôn "rảnh" để không bao giờ phải chờ.

### Karpenter — thay thế hiện đại trên AWS

Cluster Autoscaler làm việc với **Auto Scaling Group** cố định: bạn định nghĩa trước các nhóm node loại nào, CA chỉ tăng giảm số lượng.

**Karpenter** bỏ hẳn khái niệm nhóm node:

```text
   CLUSTER AUTOSCALER
   Có Pod Pending → tăng số node trong ASG đã định nghĩa sẵn
   → bị giới hạn bởi các loại máy bạn đã chọn trước

   KARPENTER
   Có Pod Pending → nhìn CHÍNH XÁC Pod đó cần gì
                  → chọn loại máy PHÙ HỢP NHẤT từ hàng trăm loại EC2
                  → tạo node trong ~40 giây (thay vì 2-5 phút)
                  → gộp Pod lại và xoá node lãng phí (consolidation)
```

| | Cluster Autoscaler | Karpenter |
|---|---|---|
| Nhóm node | Phải định nghĩa trước | **Không cần** |
| Thời gian thêm node | 2–5 phút | **~40 giây** |
| Chọn loại máy | Trong nhóm đã có | **Tối ưu theo nhu cầu thật** |
| Gộp và dọn node lãng phí | Không | **Có** |
| Hỗ trợ cloud | AWS, GCP, Azure… | Chủ yếu **AWS** |

Trên EKS mới, Karpenter gần như luôn là lựa chọn tốt hơn.

---

## VPA — Vertical Pod Autoscaler

VPA giải bài toán khác: *"tôi không biết đặt `requests` bao nhiêu"*.

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: myapp
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  updatePolicy:
    updateMode: "Off"        # CHỈ khuyến nghị, không tự sửa
  resourcePolicy:
    containerPolicies:
      - containerName: app
        minAllowed: {cpu: 100m, memory: 128Mi}
        maxAllowed: {cpu: "2",  memory: 4Gi}
```

```bash
kubectl describe vpa myapp
```

```text
  Recommendation:
    Container Recommendations:
      Container Name:  app
      Lower Bound:   cpu: 180m   memory: 420Mi
      Target:        cpu: 240m   memory: 512Mi     ← nên đặt requests bằng đây
      Upper Bound:   cpu: 890m   memory: 1200Mi
```

Bốn chế độ:

| `updateMode` | Hành vi | Dùng khi |
|---|---|---|
| **`Off`** | Chỉ tính khuyến nghị, **không sửa gì** | **An toàn nhất, dùng phổ biến nhất** |
| `Initial` | Chỉ đặt lúc Pod được tạo mới | Chấp nhận được |
| `Recreate` | **Giết và tạo lại Pod** để áp giá trị mới | Nguy hiểm cho dịch vụ |
| `Auto` | Như `Recreate` (sẽ là in-place khi Kubernetes hỗ trợ) | Cẩn thận |

> **Khuyến nghị mạnh**: dùng **`updateMode: "Off"`** và đọc khuyến nghị để tự đặt `requests` trong YAML. Các chế độ khác **giết Pod** để áp giá trị mới — điều bạn không muốn xảy ra bất ngờ giữa giờ cao điểm.

### VPA và HPA xung đột

```text
   HPA scale theo CPU: CPU cao → thêm Pod
   VPA cũng nhìn CPU: CPU cao → tăng requests

   Cùng chạy trên CPU:
   VPA tăng requests 200m → 400m
   → utilization tụt một nửa (vì mẫu số gấp đôi)
   → HPA thấy "tải giảm" → scale XUỐNG
   → mỗi Pod tải nhiều hơn → CPU tăng
   → VPA lại tăng requests...
   → HAI HỆ THỐNG ĐÁNH NHAU
```

| Kết hợp | An toàn |
|---|---|
| VPA (`Off`) + HPA (CPU) | **An toàn** — VPA chỉ khuyến nghị |
| VPA (CPU) + HPA (CPU) | **Xung đột — đừng làm** |
| VPA (bộ nhớ) + HPA (CPU) | Chấp nhận được — hai chỉ số khác nhau |
| VPA (CPU) + HPA (custom metric) | Chấp nhận được |

---

## Ghép cả ba thành một hệ thống

```text
   ┌────────────────────────────────────────────────────────────┐
   │  Lưu lượng tăng                                             │
   │        │                                                    │
   │        ▼                                                    │
   │  HPA thấy CPU/chỉ số vượt ngưỡng                            │
   │        │                                                    │
   │        ▼                                                    │
   │  Tạo thêm Pod  ──►  Node còn chỗ?                          │
   │                        │                                    │
   │              ┌─────────┴──────────┐                        │
   │              ▼                    ▼                        │
   │           CÒN CHỖ              HẾT CHỖ                     │
   │           Pod chạy ngay        Pod → Pending               │
   │                                     │                       │
   │                                     ▼                       │
   │                          Cluster Autoscaler / Karpenter    │
   │                          thêm node (40s - 5 phút)          │
   │                                     │                       │
   │                                     ▼                       │
   │                                Pod chạy                     │
   └────────────────────────────────────────────────────────────┘

   VPA (chế độ Off) chạy song song, cho khuyến nghị requests
   để bạn chỉnh lại YAML — làm cả HPA lẫn CA chính xác hơn.
```

---

## Chi phí — con số thật

Ví dụ một dịch vụ trên EKS, lưu lượng theo giờ hành chính:

```text
   KHÔNG autoscaling
   replicas cố định = 20 Pod (đủ cho giờ cao điểm)
   → 5 node m5.xlarge chạy 24/7
   → ~700 USD/tháng

   CÓ HPA + Cluster Autoscaler
   minReplicas=3, maxReplicas=25
   Giờ cao điểm (8 tiếng): 5 node
   Ngoài giờ (16 tiếng):    1 node
   → (5 × 8 + 1 × 16) / 24 = 2,3 node trung bình
   → ~320 USD/tháng

   TIẾT KIỆM ~55%
```

Con số này giả định lưu lượng dao động rõ rệt. Với dịch vụ tải đều 24/7, autoscaling **gần như không tiết kiệm được gì** — và bạn đang trả giá bằng độ phức tạp. Đây là điều cần cân nhắc trước khi dựng.

---

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Có HPA nhưng không có Cluster Autoscaler | Pod `Pending` vĩnh viễn khi node đầy |
| `requests` đặt quá cao | CA không xoá node được (tính theo requests) → **tốn tiền gấp nhiều lần** |
| Không có PDB cho Pod kube-system | CA **không bao giờ xoá node nào** |
| Pod dùng `emptyDir` mà không có annotation | Node đó không bị xoá → lãng phí |
| Dùng VPA `Auto` cho dịch vụ | **Pod bị giết bất ngờ** giữa giờ cao điểm |
| VPA và HPA cùng dùng CPU | **Hai hệ thống đánh nhau**, dao động |
| `maxReplicas` quá cao + `maxSize` node group quá cao | Một sự cố scale lên 500 Pod / 50 node → **cháy hoá đơn** |
| Không dùng Pod giữ chỗ khi cần phản ứng nhanh | Chờ 2–5 phút mới có node mới |
| Bật autoscaling cho dịch vụ tải đều 24/7 | Thêm độ phức tạp mà **không tiết kiệm gì** |
| `scale-down-unneeded-time` quá ngắn | Node bị xoá rồi lại tạo → dao động, và mỗi lần tạo lại tốn thời gian kéo image |

---

## Tóm tắt Phase 18

- **`requests` là thứ scheduler nhìn**; **`limits` là trần kernel cưỡng chế**. CPU **nén được** (vượt thì bị điều tiết), bộ nhớ **không nén được** (vượt thì **OOMKilled**, mã 137). Luôn dùng hậu tố **`Mi`/`Gi`**.
- **Ba lớp QoS** quyết định thứ tự bị đuổi: BestEffort → Burstable → Guaranteed. Chỉ **một container** lệch là cả Pod tụt lớp.
- Với JVM phải dùng **`-XX:MaxRAMPercentage=75`**, không dùng `-Xmx` cố định, và chừa **25–30%** ngoài heap.
- **Throttling CPU âm thầm hơn OOM** — kiểm tra `nr_throttled/nr_periods` ở `/sys/fs/cgroup/cpu.stat`. Cân nhắc **không đặt `limits.cpu`** cho dịch vụ nhạy độ trễ.
- **Ba probe, ba hậu quả**: readiness **gỡ khỏi Service** (an toàn), liveness **giết Pod** (nguy hiểm), startup **tạm dừng hai cái kia** trong lúc khởi động.
- **`livenessProbe` có thể làm cụm tự giết chính mình** khi tải cao. Không kiểm tra phụ thuộc bên ngoài trong liveness, và **cân nhắc bỏ hẳn** nếu ứng dụng gặp lỗi thì tự crash.
- **`preStop` hook với `sleep 5-15`** là thứ chặn mất request khi deploy.
- **HPA tính utilization theo `requests`**, không theo năng lực node. Quên `requests.cpu` là HPA chết hoàn toàn. **Bỏ `replicas` khỏi Deployment** khi có HPA.
- **CPU thường không phải chỉ số đúng** — dùng custom/external metrics. **Đừng scale theo bộ nhớ với JVM**. **KEDA** cho scale về 0 và 60+ nguồn chỉ số.
- **HPA + Cluster Autoscaler là cặp chuẩn.** HPA tạo Pod, CA tạo node. Không có CA thì Pod `Pending` vĩnh viễn.
- **CA tính "node rảnh" theo tổng `requests`**, không theo mức dùng thật — nên `requests` đặt quá cao làm cụm tốn tiền gấp nhiều lần.
- **Karpenter** trên AWS: thêm node trong ~40 giây, tự chọn loại máy tối ưu, tự gộp và dọn node lãng phí.
- **VPA nên dùng `updateMode: "Off"`** — đọc khuyến nghị rồi tự sửa YAML. **VPA và HPA cùng dùng CPU sẽ đánh nhau.**
- Autoscaling tiết kiệm ~50% với lưu lượng dao động rõ rệt, nhưng **gần như không tiết kiệm gì** với tải đều 24/7 — cân nhắc trước khi dựng.

**Phase kế tiếp** → [Bài 1: Bảo mật image — quét lỗ hổng, non-root, distroless](../phase-19/01-bao-mat-image.md)
