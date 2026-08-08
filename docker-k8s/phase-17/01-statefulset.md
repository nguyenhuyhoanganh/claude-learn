# Bài 1: StatefulSet — khi Pod không thể thay thế lẫn nhau

Phase 12 dạy **Deployment**, và Deployment giải quyết tốt 80% nhu cầu. Nhưng nó dựa trên một giả định cốt lõi:

> **Mọi Pod đều giống hệt nhau và thay thế được cho nhau.**

Giả định đó đúng với web server, API, worker xử lý hàng đợi. Nó **sai hoàn toàn** với database, hàng đợi tin nhắn, và mọi hệ phân tán có trạng thái. Bài này chỉ ra vì sao sai, và Kubernetes giải bằng gì.

---

## Ba thứ Deployment không cho bạn

### 1. Tên Pod là ngẫu nhiên và đổi mỗi lần tạo lại

```text
   DEPLOYMENT
   ══════════
   kubectl get pods
   NAME                        READY   STATUS
   mysql-7d4b9c8f6d-x7k2p      1/1     Running
   mysql-7d4b9c8f6d-m9q4t      1/1     Running
              ▲          ▲
        hash template  chuỗi ngẫu nhiên

   Xoá Pod → Pod mới có TÊN KHÁC HẲN: mysql-7d4b9c8f6d-b2n8w
```

Với web server thì không sao — không ai quan tâm tên. Nhưng một cụm database cần cấu hình kiểu *"node `mysql-0` là primary, `mysql-1` và `mysql-2` là replica"*. Tên đổi liên tục thì cấu hình đó vô nghĩa.

### 2. Mọi Pod dùng chung một PersistentVolumeClaim

```yaml
# Deployment — MỌI replica trỏ vào CÙNG một PVC
volumes:
  - name: data
    persistentVolumeClaim:
      claimName: mysql-data      # dùng chung
```

```text
   ┌──────────┐  ┌──────────┐  ┌──────────┐
   │ mysql-a  │  │ mysql-b  │  │ mysql-c  │
   └────┬─────┘  └────┬─────┘  └────┬─────┘
        └─────────────┼─────────────┘
                      ▼
              ┌───────────────┐
              │  PVC dùng chung│   ← BA tiến trình MySQL
              └───────────────┘      cùng ghi vào MỘT thư mục dữ liệu
                                     → HỎNG DỮ LIỆU
```

Và với `accessModes: ReadWriteOnce` (mặc định của phần lớn StorageClass), PVC **chỉ gắn được vào một node**, nên replica thứ hai sẽ kẹt ở trạng thái `Pending` vĩnh viễn.

### 3. Pod khởi động và bị xoá theo thứ tự ngẫu nhiên

Deployment mặc định tạo mọi Pod **cùng lúc** và xoá cũng vậy. Cụm database cần primary lên trước replica, và cần tắt replica trước khi tắt primary.

---

## StatefulSet giải cả ba

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mysql
spec:
  serviceName: mysql-headless        # BẮT BUỘC — giải thích bên dưới
  replicas: 3
  selector:
    matchLabels:
      app: mysql
  template:
    metadata:
      labels:
        app: mysql
    spec:
      containers:
        - name: mysql
          image: mysql:8.0
          ports:
            - containerPort: 3306
              name: mysql
          volumeMounts:
            - name: data
              mountPath: /var/lib/mysql

  # KHÁC BIỆT LỚN NHẤT so với Deployment:
  # Kubernetes tự tạo MỘT PVC RIÊNG cho MỖI Pod
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: [ReadWriteOnce]
        storageClassName: gp3
        resources:
          requests:
            storage: 20Gi
```

Kết quả:

```text
   kubectl get pods
   NAME      READY   STATUS
   mysql-0   1/1     Running
   mysql-1   1/1     Running
   mysql-2   1/1     Running
     ▲
   TÊN CỐ ĐỊNH, đánh số từ 0, KHÔNG ĐỔI khi tạo lại

   kubectl get pvc
   NAME             STATUS   VOLUME       CAPACITY
   data-mysql-0     Bound    pvc-a1b2...  20Gi
   data-mysql-1     Bound    pvc-c3d4...  20Gi
   data-mysql-2     Bound    pvc-e5f6...  20Gi
     ▲
   MỖI Pod một PVC RIÊNG, tên theo công thức <tên-volume>-<tên-pod>
```

---

## Bốn đảm bảo của StatefulSet

| Đảm bảo | Chi tiết |
|---|---|
| **Danh tính ổn định** | Pod luôn tên `<tên>-0`, `<tên>-1`, … Xoá `mysql-1` thì Pod mới **vẫn tên `mysql-1`** |
| **Ổ đĩa ổn định** | `mysql-1` luôn gắn lại đúng PVC `data-mysql-1`, kể cả khi chuyển sang node khác |
| **Thứ tự triển khai** | Tạo tuần tự `0 → 1 → 2`. Pod sau chỉ tạo khi Pod trước **Ready** |
| **Thứ tự thu hồi** | Xoá ngược `2 → 1 → 0`. Nâng cấp cũng theo thứ tự ngược |

Đảm bảo thứ ba đáng chú ý: **Pod tiếp theo chỉ được tạo khi Pod trước đó Ready**. Nghĩa là `readinessProbe` sai sẽ làm StatefulSet **kẹt vĩnh viễn ở Pod 0** — một trong những sự cố hay gặp nhất.

```text
   mysql-0  Running, nhưng readinessProbe THẤT BẠI
   mysql-1  KHÔNG BAO GIỜ được tạo
   mysql-2  KHÔNG BAO GIỜ được tạo

   kubectl get pods → chỉ thấy 1 Pod, và người ta tưởng StatefulSet hỏng.
```

---

## Headless Service — thứ bắt buộc phải có

`spec.serviceName` trỏ tới một **Headless Service**, và không có nó thì StatefulSet không cấp DNS ổn định cho từng Pod.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mysql-headless
spec:
  clusterIP: None            # ĐÂY là thứ làm nó "headless"
  selector:
    app: mysql
  ports:
    - port: 3306
      name: mysql
```

`clusterIP: None` nghĩa là **không cấp IP ảo, không cân tải**. Thay vào đó DNS trả về **IP của từng Pod**:

```text
   SERVICE THƯỜNG (có clusterIP)
   ═════════════════════════════
   nslookup mysql
   → 10.96.45.12          (một IP ảo, cân tải ngẫu nhiên tới 3 Pod)
   → KHÔNG gọi được ĐÚNG Pod nào

   HEADLESS SERVICE
   ════════════════
   nslookup mysql-headless
   → 10.244.1.5, 10.244.2.7, 10.244.3.9      (IP thật của cả 3 Pod)

   Và quan trọng hơn — MỖI Pod có tên DNS RIÊNG:
   mysql-0.mysql-headless.default.svc.cluster.local  → 10.244.1.5
   mysql-1.mysql-headless.default.svc.cluster.local  → 10.244.2.7
   mysql-2.mysql-headless.default.svc.cluster.local  → 10.244.3.9
```

Đây chính là thứ cho phép cấu hình *"replica hãy đồng bộ từ `mysql-0.mysql-headless`"* — một địa chỉ **không bao giờ đổi**.

> **Thực tế hay dùng cả hai**: một Headless Service cho giao tiếp nội bộ giữa các node database, và một Service thường (có clusterIP) cho ứng dụng đọc dữ liệu qua cân tải.

---

## Nhận biết Pod là số mấy — mẫu thường dùng

Container cần biết *"tôi là Pod 0 hay Pod 2"* để quyết định làm primary hay replica:

```yaml
spec:
  containers:
    - name: mysql
      command:
        - bash
        - -c
        - |
          # Tên Pod luôn có dạng <tên-statefulset>-<số thứ tự>
          ORDINAL=${HOSTNAME##*-}

          if [ "$ORDINAL" -eq 0 ]; then
            echo "Tôi là PRIMARY"
            exec /entrypoint.sh --server-id=1 --log-bin
          else
            echo "Tôi là REPLICA, đồng bộ từ mysql-0"
            exec /entrypoint.sh \
              --server-id=$((ORDINAL + 1)) \
              --report-host=${HOSTNAME}.mysql-headless
          fi
```

`$HOSTNAME` trong Pod luôn bằng tên Pod, nên `${HOSTNAME##*-}` cắt lấy phần số. Đây là mẫu chuẩn, dùng trong hầu hết Helm chart database.

---

## Nâng cấp StatefulSet

```yaml
spec:
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      partition: 0          # cập nhật mọi Pod có số thứ tự >= giá trị này
```

```text
   partition: 0   → cập nhật TẤT CẢ (mặc định), theo thứ tự 2 → 1 → 0
   partition: 2   → CHỈ cập nhật mysql-2, giữ nguyên mysql-0 và mysql-1
```

`partition` là công cụ **triển khai từng bước (canary)** rất mạnh và ít người dùng:

```text
   Bước 1: partition=2, đổi image sang v2
           → chỉ mysql-2 chạy v2. Quan sát vài giờ.
   Bước 2: partition=1  → mysql-1 cũng lên v2
   Bước 3: partition=0  → mysql-0 lên v2. Hoàn tất.

   Có vấn đề ở bước 1 → tăng partition về 3 → quay lui chỉ một Pod.
```

Kiểu thứ hai:

```yaml
  updateStrategy:
    type: OnDelete       # Kubernetes KHÔNG tự cập nhật
```

Với `OnDelete`, bạn phải **tự xoá từng Pod** để nó được tạo lại với cấu hình mới. Nghe thủ công, nhưng đây là lựa chọn đúng cho database mà việc chuyển đổi primary phải do con người quyết định.

---

## Ba thao tác vận hành đáng biết

### Scale xuống KHÔNG xoá PVC

```bash
kubectl scale statefulset mysql --replicas=1
```

```text
   Pod mysql-2, mysql-1 bị xoá
   NHƯNG PVC data-mysql-2, data-mysql-1 VẪN CÒN

   → Scale lên lại thì dữ liệu cũ quay về nguyên vẹn. Đây là CỐ Ý.
   → Nhưng cũng nghĩa là bạn VẪN TRẢ TIỀN cho ổ đĩa không dùng.
```

Xoá PVC phải làm tay:

```bash
kubectl delete pvc data-mysql-1 data-mysql-2
```

> Từ Kubernetes 1.27 có `persistentVolumeClaimRetentionPolicy` cho phép tự xoá PVC khi scale xuống hoặc xoá StatefulSet. Mặc định vẫn là `Retain` — an toàn hơn.

### Xoá StatefulSet mà giữ Pod

```bash
kubectl delete statefulset mysql --cascade=orphan
```

Dùng khi cần sửa một trường **bất biến** (như `volumeClaimTemplates`) mà không muốn dừng dịch vụ: xoá StatefulSet, tạo lại với cấu hình mới, nó sẽ **nhận lại** các Pod đang chạy.

### Buộc tạo lại một Pod cụ thể

```bash
kubectl delete pod mysql-1
```

Pod mới **vẫn tên `mysql-1`** và **gắn lại đúng PVC cũ**. Đây là thao tác an toàn để khởi động lại một node database.

---

## StatefulSet có thật sự cần không

Đây là phần quan trọng nhất, và câu trả lời thường là **không**.

| Tình huống | Nên dùng |
|---|---|
| Web app, API, worker | **Deployment** |
| Database **quản lý sẵn** (RDS, Cloud SQL, Atlas) | **Deployment** cho app, database ở ngoài cụm |
| Database tự vận hành trong cụm | **StatefulSet** |
| Kafka, Zookeeper, Elasticsearch, Cassandra tự vận hành | **StatefulSet** |
| Redis dùng làm cache (mất cũng được) | **Deployment** |
| Redis dùng làm kho dữ liệu | **StatefulSet** |
| Ứng dụng cần ghi file cục bộ tạm | **Deployment** + `emptyDir` |

Lời khuyên thẳng thắn: **chạy database production trong Kubernetes là một quyết định lớn.** StatefulSet cho bạn danh tính và ổ đĩa ổn định, nhưng **không** cho bạn: sao lưu, khôi phục theo thời điểm, chuyển đổi primary tự động, nâng cấp phiên bản an toàn. Những thứ đó phải do **Operator** (như Zalando Postgres Operator, Strimzi cho Kafka) hoặc do bạn tự làm.

```text
   StatefulSet giải bài toán: "Pod cần danh tính và ổ đĩa ổn định"
   StatefulSet KHÔNG giải:    "làm sao vận hành một cụm database"

   Khoảng cách giữa hai điều đó chính là lý do Operator tồn tại.
```

Nếu đội chưa có kinh nghiệm vận hành database, dùng dịch vụ quản lý sẵn gần như luôn là lựa chọn đúng hơn.

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| Quên `serviceName` / Headless Service | Pod **không có DNS riêng**, cấu hình cụm không chạy | Tạo Service với `clusterIP: None` |
| `readinessProbe` sai | StatefulSet **kẹt vĩnh viễn ở Pod 0** | Kiểm tra probe trước, xem `kubectl describe pod` |
| Tưởng scale xuống là xoá PVC | **Vẫn trả tiền** cho ổ đĩa không dùng | Xoá PVC thủ công, hoặc dùng retention policy |
| Sửa `volumeClaimTemplates` của StatefulSet đang chạy | Bị từ chối — trường **bất biến** | Xoá với `--cascade=orphan` rồi tạo lại |
| Dùng StatefulSet cho ứng dụng không trạng thái | Triển khai chậm hơn (tuần tự), phức tạp vô ích | Deployment |
| Nghĩ StatefulSet lo luôn sao lưu và failover | **Không** — nó chỉ lo danh tính và ổ đĩa | Dùng Operator, hoặc database quản lý sẵn |
| `accessModes: ReadWriteMany` cho database | Nhiều tiến trình cùng ghi → **hỏng dữ liệu** | `ReadWriteOnce`, mỗi Pod một PVC |
| Không đặt `podManagementPolicy` khi không cần thứ tự | Khởi động 20 Pod mất rất lâu | `podManagementPolicy: Parallel` |

Dòng cuối là tối ưu ít người biết:

```yaml
spec:
  podManagementPolicy: Parallel     # mặc định là OrderedReady
```

Với hệ thống không cần thứ tự khởi động (ví dụ Cassandra, hay một cụm shard độc lập), `Parallel` giữ nguyên danh tính và ổ đĩa ổn định nhưng **tạo mọi Pod cùng lúc** — rút thời gian khởi động từ vài phút xuống vài giây.

---

## Tóm tắt bài 1

- **Deployment giả định mọi Pod thay thế được cho nhau** — sai với database và mọi hệ có trạng thái.
- Ba thứ Deployment không cho: **tên Pod ổn định**, **ổ đĩa riêng cho từng Pod**, **thứ tự khởi động và tắt**.
- **StatefulSet** cấp bốn đảm bảo: danh tính ổn định (`<tên>-0`, `-1`, …), PVC riêng qua **`volumeClaimTemplates`**, tạo tuần tự `0→1→2`, thu hồi ngược `2→1→0`.
- **Pod sau chỉ được tạo khi Pod trước Ready** → `readinessProbe` sai làm StatefulSet **kẹt vĩnh viễn ở Pod 0**. Đây là sự cố hay gặp nhất.
- **Headless Service (`clusterIP: None`) là bắt buộc** — nó cấp cho mỗi Pod một tên DNS riêng `mysql-0.mysql-headless...` không bao giờ đổi.
- Mẫu chuẩn để Pod tự biết mình là số mấy: **`ORDINAL=${HOSTNAME##*-}`**.
- **`partition`** trong `updateStrategy` là công cụ triển khai từng bước rất mạnh: cập nhật `mysql-2` trước, quan sát, rồi mới hạ dần.
- **Scale xuống KHÔNG xoá PVC** — cố ý để dữ liệu quay về khi scale lên, nhưng nghĩa là vẫn tốn tiền ổ đĩa.
- **StatefulSet giải bài toán danh tính và ổ đĩa, KHÔNG giải bài toán vận hành database** (sao lưu, khôi phục, failover). Khoảng cách đó là lý do **Operator** tồn tại — và là lý do database quản lý sẵn thường là lựa chọn đúng hơn.

**Bài kế tiếp** → [Bài 2: DaemonSet — chạy đúng một Pod trên mỗi node](02-daemonset.md)
