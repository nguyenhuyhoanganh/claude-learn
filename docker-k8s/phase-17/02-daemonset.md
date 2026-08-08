# Bài 2: DaemonSet — chạy đúng một Pod trên mỗi node

Deployment trả lời câu hỏi *"chạy bao nhiêu bản sao?"* — bạn nói `replicas: 5` và Kubernetes tìm chỗ đặt chúng.

DaemonSet trả lời một câu hỏi khác hẳn: *"chạy trên **những máy nào**?"* — và câu trả lời là **mọi node**, không cần biết cụm có bao nhiêu node.

---

## Vì sao Deployment không làm được

Bài toán: thu thập log của mọi container trên mọi node.

```text
   DÙNG DEPLOYMENT replicas=3, cụm có 5 node
   ═════════════════════════════════════════

   Node 1  [log-agent]  ✓ thu thập được
   Node 2  [log-agent]  ✓
   Node 3  [log-agent]  ✓
   Node 4              ✗ KHÔNG có agent → mất log
   Node 5              ✗ KHÔNG có agent → mất log

   Tệ hơn: scheduler có thể đặt CẢ BA Pod lên CÙNG một node
   → 4 node còn lại mất log
```

Và vấn đề lớn hơn: **cụm tự động thêm node** (autoscaling). Node 6 vừa sinh ra lúc 3 giờ sáng thì `replicas: 3` không hề biết để tăng lên 4.

```text
   DÙNG DAEMONSET
   ══════════════
   Node 1  [log-agent]  ✓
   Node 2  [log-agent]  ✓
   Node 3  [log-agent]  ✓
   Node 4  [log-agent]  ✓
   Node 5  [log-agent]  ✓

   Node 6 vừa tham gia cụm → Kubernetes TỰ TẠO Pod trên đó ngay
   Node 3 bị gỡ khỏi cụm   → Pod trên đó tự biến mất
```

> **Điểm cốt lõi**: DaemonSet **không có `replicas`**. Số Pod luôn **bằng số node phù hợp**, và nó tự điều chỉnh khi cụm thay đổi.

---

## Cấu hình cơ bản

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluent-bit
  namespace: logging
spec:
  selector:
    matchLabels:
      app: fluent-bit
  template:
    metadata:
      labels:
        app: fluent-bit
    spec:
      # Cho phép chạy cả trên node control-plane
      tolerations:
        - key: node-role.kubernetes.io/control-plane
          operator: Exists
          effect: NoSchedule

      containers:
        - name: fluent-bit
          image: fluent/fluent-bit:2.2
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              memory: 128Mi        # KHÔNG đặt limits.cpu — giải thích ở bài 3
          volumeMounts:
            # Log container thật nằm trên ĐĨA CỦA NODE
            - name: varlog
              mountPath: /var/log
              readOnly: true
            - name: dockercontainers
              mountPath: /var/lib/docker/containers
              readOnly: true

      volumes:
        - name: varlog
          hostPath:
            path: /var/log
        - name: dockercontainers
          hostPath:
            path: /var/lib/docker/containers
```

Không có `replicas`. Thay vào đó là hai thứ đặc trưng: **`hostPath`** để đọc dữ liệu của chính node, và **`tolerations`** để được phép chạy trên node bị "đánh dấu".

---

## Bốn nhóm việc dùng DaemonSet

| Nhóm | Ví dụ | Vì sao phải trên mọi node |
|---|---|---|
| **Thu thập log** | Fluent Bit, Fluentd, Filebeat, Promtail | Log container nằm trên đĩa của node đang chạy nó |
| **Thu thập chỉ số** | node-exporter, Datadog agent, cAdvisor | CPU/RAM/đĩa là chỉ số **của từng máy** |
| **Mạng** | Calico, Cilium, Flannel, kube-proxy | Mỗi node cần cấu hình mạng riêng cho Pod trên nó |
| **Lưu trữ** | CSI node plugin, Longhorn, Ceph agent | Gắn ổ đĩa là thao tác **cấp node** |

Điểm chung: **các Pod này phục vụ chính cái node chúng đang chạy**, không phục vụ request từ bên ngoài. Đó là dấu hiệu nhận biết bài toán DaemonSet.

---

## Chạy trên một nhóm node cụ thể

Không phải lúc nào cũng cần **mọi** node:

```yaml
spec:
  template:
    spec:
      nodeSelector:
        node-type: gpu           # chỉ node có nhãn này
```

```bash
kubectl label node worker-3 node-type=gpu
# → DaemonSet TỰ TẠO Pod trên worker-3 ngay lập tức

kubectl label node worker-3 node-type-
# → Pod trên worker-3 TỰ BỊ XOÁ
```

Đây là hành vi rất mạnh và cũng rất dễ gây bất ngờ: **gỡ một nhãn là xoá Pod**. Nhiều sự cố "tự nhiên mất agent giám sát" đến từ việc ai đó sửa nhãn node.

Điều kiện phức tạp hơn dùng `nodeAffinity`:

```yaml
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: topology.kubernetes.io/zone
                    operator: In
                    values: [ap-southeast-1a, ap-southeast-1b]
                  - key: node.kubernetes.io/instance-type
                    operator: NotIn
                    values: [t3.micro]
```

---

## Taint và Toleration — vì sao DaemonSet hay cần

Đây là cặp khái niệm mà DaemonSet gần như luôn phải đụng tới.

```text
   TAINT  = "vết bẩn" đánh lên NODE, đẩy Pod ra
   TOLERATION = "khả năng chịu đựng" khai trên POD, cho phép ở lại

   Node có taint  +  Pod KHÔNG có toleration tương ứng  →  KHÔNG được xếp lên
   Node có taint  +  Pod CÓ toleration                   →  ĐƯỢC xếp lên
```

```bash
# Xem taint của node
kubectl get nodes -o custom-columns=NAME:.metadata.name,TAINTS:.spec.taints
```

```text
NAME             TAINTS
control-plane    [map[effect:NoSchedule key:node-role.kubernetes.io/control-plane]]
worker-1         <none>
worker-2         <none>
gpu-node-1       [map[effect:NoSchedule key:nvidia.com/gpu value:true]]
```

Ba loại hiệu lực (`effect`):

| Effect | Với Pod MỚI | Với Pod ĐANG CHẠY |
|---|---|---|
| `NoSchedule` | Không được xếp lên | **Vẫn chạy tiếp** |
| `PreferNoSchedule` | Cố tránh, nhưng vẫn được nếu hết chỗ | Vẫn chạy tiếp |
| `NoExecute` | Không được xếp lên | **BỊ ĐUỔI ĐI** |

Với DaemonSet giám sát, bạn thường muốn chạy trên **mọi** node kể cả control-plane và node có taint đặc biệt:

```yaml
      tolerations:
        - operator: Exists          # chịu được MỌI taint
```

Một dòng này nghĩa là *"tôi chấp nhận mọi vết bẩn"* — hợp lý với agent hạ tầng, **nguy hiểm** với ứng dụng thường (nó sẽ chen được lên cả node đang bị rút khỏi cụm).

> **Lưu ý về hành vi mặc định**: từ Kubernetes 1.6, DaemonSet controller **tự thêm** một số toleration cho Pod của nó (`node.kubernetes.io/not-ready`, `unreachable`, `disk-pressure`, `memory-pressure`, `pid-pressure`, `unschedulable`). Nghĩa là **Pod DaemonSet vẫn được tạo trên node đang ốm** — cố ý, vì agent giám sát cần chạy nhất là lúc node có vấn đề.

---

## Nâng cấp DaemonSet

```yaml
spec:
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1        # mỗi lúc chỉ 1 node mất agent
      maxSurge: 0              # DaemonSet mặc định KHÔNG tạo Pod thừa
```

Khác biệt then chốt so với Deployment:

```text
   DEPLOYMENT nâng cấp
   ═══════════════════
   Tạo Pod mới TRƯỚC → chờ Ready → mới xoá Pod cũ
   → không bao giờ giảm năng lực phục vụ

   DAEMONSET nâng cấp (mặc định)
   ═════════════════════════════
   XOÁ Pod cũ trên node → rồi mới tạo Pod mới
   → node đó MẤT AGENT trong vài giây
```

Lý do: mỗi node chỉ được có một Pod, nên không thể tạo trước rồi mới xoá. Từ Kubernetes 1.22, `maxSurge` cho DaemonSet đã được hỗ trợ, cho phép tạm thời có hai Pod trên một node — nhưng chỉ dùng được khi agent không tranh chấp tài nguyên (ví dụ cùng bind một cổng `hostPort` thì không được).

Với cụm 100 node, `maxUnavailable: 1` nghĩa là nâng cấp mất rất lâu. Cân nhắc:

```yaml
      maxUnavailable: 10%       # nhanh hơn, chấp nhận 10 node mất agent cùng lúc
```

---

## hostPath, hostNetwork, hostPID — quyền lực và rủi ro

DaemonSet hay cần chọc thủng lớp cách ly của container:

```yaml
    spec:
      hostNetwork: true      # dùng thẳng mạng của node, không qua mạng Pod
      hostPID: true          # thấy MỌI tiến trình trên node
      dnsPolicy: ClusterFirstWithHostNet    # BẮT BUỘC khi hostNetwork=true
      containers:
        - name: agent
          securityContext:
            privileged: true             # gần như quyền root trên node
```

| Trường | Cho phép gì | Rủi ro |
|---|---|---|
| `hostPath` | Đọc/ghi thư mục của node | Mount nhầm `/` là **toàn quyền trên node** |
| `hostNetwork` | Dùng IP và cổng của node | Đụng cổng với dịch vụ khác; bỏ qua NetworkPolicy |
| `hostPID` | Thấy mọi tiến trình | Đọc được `/proc/<pid>/environ` → **lộ biến môi trường chứa mật khẩu** của Pod khác |
| `privileged: true` | Gần như root trên node | **Thoát container** dễ dàng |

> **Nguyên tắc**: DaemonSet hạ tầng thường cần những quyền này, và đó là lý do bạn phải **rất cẩn thận với image dùng cho DaemonSet**. Một agent giám sát bị xâm phạm nghĩa là **toàn bộ cụm bị xâm phạm** — vì nó chạy trên mọi node với quyền cao.
>
> Đừng quên `dnsPolicy: ClusterFirstWithHostNet` khi bật `hostNetwork` — thiếu nó thì Pod dùng DNS của node và **không phân giải được tên Service trong cụm**. Đây là lỗi rất hay gặp và triệu chứng rất khó hiểu.

---

## Lệnh vận hành

```bash
# Xem trạng thái — sáu cột đều có ý nghĩa
kubectl get daemonset -n logging
```

```text
NAME         DESIRED   CURRENT   READY   UP-TO-DATE   AVAILABLE   NODE SELECTOR   AGE
fluent-bit   5         5         5       5            5           <none>          12d
             ▲                   ▲       ▲
       số node phù hợp    đang chạy tốt  đã ở phiên bản mới
```

`DESIRED` khác `READY` là dấu hiệu có node đang gặp vấn đề:

```bash
# Tìm node nào thiếu Pod
kubectl get pods -n logging -o wide --selector app=fluent-bit \
  | awk 'NR>1{print $7}' | sort > /tmp/co-pod
kubectl get nodes -o name | sed 's|node/||' | sort > /tmp/moi-node
comm -13 /tmp/co-pod /tmp/moi-node       # node KHÔNG có Pod
```

```bash
# Nâng cấp và theo dõi
kubectl set image daemonset/fluent-bit fluent-bit=fluent/fluent-bit:2.3 -n logging
kubectl rollout status daemonset/fluent-bit -n logging

# Quay lui
kubectl rollout undo daemonset/fluent-bit -n logging
```

---

## Bảng phân biệt ba workload

| | Deployment | StatefulSet | DaemonSet |
|---|---|---|---|
| Số Pod do ai quyết | Bạn (`replicas`) | Bạn (`replicas`) | **Số node** |
| Tên Pod | Ngẫu nhiên | Cố định `-0`, `-1` | Ngẫu nhiên |
| Ổ đĩa | Dùng chung hoặc không có | **Riêng mỗi Pod** | Thường là `hostPath` |
| Thứ tự | Không | **Có** | Không |
| Thêm node mới | Không ảnh hưởng | Không ảnh hưởng | **Tự tạo Pod** |
| Nâng cấp | Tạo mới rồi xoá cũ | Ngược thứ tự, có `partition` | Xoá cũ rồi tạo mới |
| Dùng cho | Web, API, worker | Database, Kafka | Agent hạ tầng |

Câu hỏi chọn nhanh:

```text
   "Chạy bao nhiêu bản?"          → Deployment
   "Mỗi bản cần danh tính riêng?"  → StatefulSet
   "Chạy trên MỖI MÁY?"            → DaemonSet
```

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| Đặt `replicas` trong DaemonSet | Bị từ chối — DaemonSet không có trường này | Bỏ đi, dùng `nodeSelector` để giới hạn |
| Không có `tolerations` | **Thiếu Pod trên control-plane** và node có taint | `tolerations: [{operator: Exists}]` cho agent hạ tầng |
| `hostNetwork: true` mà quên `dnsPolicy` | Pod **không phân giải được tên Service** | Thêm `dnsPolicy: ClusterFirstWithHostNet` |
| `hostPort` trùng nhau | Chỉ một Pod chạy được trên mỗi node, agent khác `Pending` | Kiểm tra cổng đã ai dùng chưa |
| Gỡ nhãn node mà quên DaemonSet đang lọc theo nhãn đó | **Pod tự biến mất** — mất giám sát im lặng | Cảnh báo khi `DESIRED` giảm bất thường |
| Đặt `limits.cpu` cho agent giám sát | Bị **điều tiết (throttle)** đúng lúc node tải cao — lúc cần nhất | Đặt `requests` nhưng **không** đặt `limits.cpu` |
| `maxUnavailable: 1` trên cụm 100 node | Nâng cấp mất hàng giờ | Dùng phần trăm |
| Dùng image không tin cậy cho DaemonSet | Chạy trên **mọi node** với quyền cao → **cả cụm bị xâm phạm** | Quét image, ghim digest |
| Không giới hạn bộ nhớ | Agent rò rỉ bộ nhớ làm **node OOM**, giết cả Pod ứng dụng | Luôn đặt `limits.memory` |

---

## Tóm tắt bài 2

- **DaemonSet không có `replicas`.** Số Pod luôn bằng **số node phù hợp**, và tự điều chỉnh khi node vào/ra cụm — điều Deployment không làm được.
- Bốn nhóm việc: **thu thập log**, **thu thập chỉ số**, **mạng**, **lưu trữ**. Dấu hiệu nhận biết: Pod **phục vụ chính cái node nó đang chạy**, không phục vụ request bên ngoài.
- Giới hạn phạm vi bằng **`nodeSelector`** hoặc `nodeAffinity`. Lưu ý: **gỡ nhãn node là xoá Pod** — nguồn của nhiều sự cố "tự nhiên mất agent".
- **Taint đánh lên node để đẩy Pod ra; toleration khai trên Pod để được ở lại.** Ba hiệu lực: `NoSchedule` (chặn Pod mới), `PreferNoSchedule` (cố tránh), `NoExecute` (**đuổi cả Pod đang chạy**).
- DaemonSet controller **tự thêm toleration** cho các trạng thái node ốm — cố ý, vì agent giám sát cần chạy nhất là lúc node có vấn đề.
- **Nâng cấp DaemonSet xoá Pod cũ trước rồi mới tạo mới** (ngược với Deployment), nên node mất agent trong vài giây. Cụm lớn nên dùng `maxUnavailable` theo phần trăm.
- `hostPath`, `hostNetwork`, `hostPID`, `privileged` cho DaemonSet quyền rất lớn. Hệ quả: **một agent bị xâm phạm là cả cụm bị xâm phạm** — phải quét image và ghim digest.
- **Bật `hostNetwork` thì bắt buộc thêm `dnsPolicy: ClusterFirstWithHostNet`**, nếu không Pod không phân giải được tên Service.
- **Đừng đặt `limits.cpu` cho agent giám sát** — nó sẽ bị điều tiết đúng lúc node tải cao, tức là đúng lúc bạn cần nó nhất.

**Bài kế tiếp** → [Bài 3: Job và CronJob — công việc có điểm kết thúc](03-job-va-cronjob.md)
