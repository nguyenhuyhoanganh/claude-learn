# Bài 0.3: Từ điển thuật ngữ Kubernetes cho người mới

Kubernetes có tiếng là khó, và phần lớn cái khó đó nằm ở **số lượng thuật ngữ**. Người mới nhìn một file YAML thấy `Deployment`, `ReplicaSet`, `Pod`, `Service`, `Ingress`, `PVC`, `ConfigMap` — bảy từ mới trong một màn hình, chưa kể chúng còn liên quan tới nhau theo cách không hiển nhiên.

Bài này giải nghĩa từng từ theo cùng khuôn: **nó là gì → giải bài toán gì → ví dụ nhỏ nhất → bẫy của người mới**.

> Bạn **không cần đọc hết bài này bây giờ**. Đọc phần "Bảy từ cốt lõi" là đủ để bắt đầu Phase 11. Phần còn lại dùng để tra khi gặp từ lạ.
>
> Bài này giả định bạn đã biết Docker ở mức [Bài 0.2](02-tu-dien-thuat-ngu-docker.md).

---

## Trước hết: Kubernetes làm gì

Một câu:

> **Bạn khai báo "tôi muốn hệ thống trông như thế này", Kubernetes lo cho thực tế luôn khớp với mô tả đó.**

```text
   BẠN NÓI:            "luôn có 3 bản sao ứng dụng đang chạy"
        │
        ▼
   KUBERNETES LẶP MÃI:
        ┌──────────────────────────────────────┐
        │ Thực tế có mấy bản?  → 2             │
        │ Mong muốn mấy bản?   → 3             │
        │ Thiếu 1 → tạo thêm 1                 │
        │ Lặp lại sau vài giây                 │
        └──────────────────────────────────────┘
```

Cơ chế này gọi là **vòng lặp điều hoà**, và nó giải thích gần như mọi hành vi khiến người mới bối rối — đặc biệt là *"vì sao tôi xoá Pod mà nó cứ hiện lại"*.

**Ví von**: Kubernetes giống một máy điều hoà nhiệt độ. Bạn không ra lệnh "hãy thổi gió lạnh 5 phút" — bạn đặt **26 độ**, rồi nó tự bật tắt để giữ nhiệt độ đó, mãi mãi, kể cả khi bạn đã ngủ.

---

## Bảy từ cốt lõi — đọc phần này là đủ để bắt đầu

### 1. Cluster (cụm) — toàn bộ hệ thống

> **Cluster** là tập các máy chạy Kubernetes cùng nhau, hoạt động như một khối duy nhất.

```text
   ┌──────────── CLUSTER ────────────┐
   │  Control plane (bộ não)          │
   │  Node 1  Node 2  Node 3 (cơ bắp) │
   └──────────────────────────────────┘
```

### 2. Node — một máy trong cụm

> **Node** là **một máy tính** (thật hoặc ảo) trong cụm. Nó là nơi ứng dụng thật sự chạy.

```bash
kubectl get nodes
```

```text
NAME        STATUS   ROLES           AGE   VERSION
worker-1    Ready    <none>          45d   v1.29.1
worker-2    Ready    <none>          45d   v1.29.1
```

> **Bẫy**: một node chạy được **hàng chục tới hàng trăm** container, không phải một.

### 3. Pod — đơn vị nhỏ nhất Kubernetes quản

> **Pod** là **một hoặc vài container luôn đi cùng nhau**: chung địa chỉ IP, chung cổng, chung ổ đĩa.

```text
   ┌──────────── POD ─────────────┐
   │  IP: 10.244.1.5              │
   │  ┌──────────┐  ┌──────────┐  │
   │  │ app      │  │ log-agent│  │  ← gọi nhau qua localhost
   │  └──────────┘  └──────────┘  │
   └──────────────────────────────┘
```

95% trường hợp một Pod chỉ có **một** container. Nhưng Kubernetes vẫn dùng Pod làm đơn vị, vì có những trường hợp cần hai tiến trình dính chặt vào nhau.

> **Bẫy quan trọng nhất**: **đừng tạo Pod trực tiếp**. Pod tạo tay không tự khởi động lại khi node chết. Gần như luôn dùng **Deployment**.

### 4. Deployment — thứ bạn thật sự khai báo

> **Deployment** nói *"tôi muốn N bản sao của ứng dụng này"*, rồi nó lo tạo Pod, thay Pod chết, và cập nhật phiên bản mới.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3                    # muốn 3 bản
  selector:
    matchLabels:
      app: web                   # quản những Pod có nhãn này
  template:                      # khuôn để tạo Pod
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: nginx
          image: nginx:1.25
```

Ba việc Deployment làm mà Pod trần không làm được:

| Việc | Chi tiết |
|---|---|
| **Giữ đủ số lượng** | Pod chết → tạo bù ngay |
| **Cập nhật luân phiên** | Đổi image → thay từng Pod, không đứt dịch vụ |
| **Quay lui** | `kubectl rollout undo` về phiên bản trước |

### 5. Service — địa chỉ ổn định để gọi Pod

> **Service** cho một **địa chỉ và tên cố định** đứng trước một nhóm Pod luôn thay đổi.

Vì sao cần: **IP của Pod đổi mỗi lần Pod tạo lại**. Không thể ghi IP vào code.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web            # chọn Pod theo NHÃN
  ports:
    - port: 80          # cổng của Service
      targetPort: 8080  # cổng trong container
```

```text
   Dịch vụ khác gọi:  http://web
        │
        ▼
   Service "web" (IP cố định)
        │  chia đều
        ├──► Pod 10.244.1.5
        ├──► Pod 10.244.2.7
        └──► Pod 10.244.3.9   (danh sách tự cập nhật)
```

> **Bẫy**: Service tìm Pod **bằng nhãn**, không bằng tên. Nhãn lệch một chữ là Service không trỏ tới đâu cả và trả lỗi 503.

### 6. Label và Selector — sợi dây nối mọi thứ

> **Label** (nhãn) là cặp `khoá: giá trị` gắn lên đối tượng. **Selector** là cách tìm đối tượng theo nhãn.

```yaml
# Pod mang nhãn
metadata:
  labels:
    app: web
    moi-truong: production
```

```yaml
# Service tìm theo nhãn
spec:
  selector:
    app: web
```

```text
   Đây là cơ chế NỐI của toàn bộ Kubernetes:

   Service ──tìm theo nhãn──► Pod
   Deployment ──quản theo nhãn──► Pod
   NetworkPolicy ──áp theo nhãn──► Pod
```

```bash
kubectl get pods -l app=web        # lọc theo nhãn
kubectl get pods --show-labels     # xem nhãn của Pod
```

> **Bẫy**: đây là nguyên nhân số một khi "Service không hoạt động". Kiểm tra bằng `kubectl get endpoints <tên-service>` — rỗng nghĩa là nhãn không khớp, hoặc Pod chưa sẵn sàng.

### 7. Namespace — chia cụm thành nhiều ngăn

> **Namespace** là cách chia một cụm thành các ngăn logic, để tên không đụng nhau và phân quyền riêng được.

```bash
kubectl get pods                     # namespace hiện tại
kubectl get pods -n production       # namespace khác
kubectl get pods -A                  # tất cả namespace
```

```text
   Cùng một cụm:
   namespace "dev"        có Service tên "api"
   namespace "production" cũng có Service tên "api"
   → không đụng nhau
```

> **Bẫy**: **xoá namespace là xoá sạch mọi thứ bên trong**, kể cả PVC và dữ liệu. Kiểm tra `kubectl get all -n <tên>` trước.

---

## Ba loại Service — hiểu đúng để không mở nhầm cửa

```yaml
spec:
  type: ClusterIP      # hoặc NodePort, LoadBalancer
```

| Loại | Ai gọi được | Dùng khi |
|---|---|---|
| **`ClusterIP`** (mặc định) | **Chỉ bên trong cụm** | Database, dịch vụ nội bộ |
| `NodePort` | Ai biết địa chỉ node và cổng 30000–32767 | Thử nghiệm, môi trường học |
| `LoadBalancer` | Cả Internet, qua cân tải của nhà cung cấp | Dịch vụ hướng người dùng |

```text
   ClusterIP     ─── chỉ trong nhà
   NodePort      ─── mở một cửa sổ ở mỗi node
   LoadBalancer  ─── thuê hẳn một cổng chính có bảo vệ (và có phí)
```

> **Bẫy tốn tiền**: mỗi Service `LoadBalancer` trên cloud tốn khoảng **16 USD/tháng**. Mười service là 160 USD. Dùng **một Ingress** cho nhiều service thay vì mười Load Balancer.

---

## Cấu hình và bí mật

### ConfigMap — cấu hình không nhạy cảm

```bash
kubectl create configmap app-config --from-literal=LOG_LEVEL=info
```

```yaml
envFrom:
  - configMapRef:
      name: app-config
```

### Secret — bí mật

```bash
kubectl create secret generic db-cred --from-literal=password='matkhau'
```

> **Bẫy rất quan trọng**: Secret **chỉ được mã hoá định dạng base64, không phải mã hoá thật**. Ai đọc được namespace là đọc được nội dung:
> ```bash
> kubectl get secret db-cred -o jsonpath='{.data.password}' | base64 -d
> ```
> Xem [Phase 19 bài 3](../phase-19/03-secret-that-su-an-toan.md) về cách bảo vệ đúng.

### Bẫy chung của cả hai

**Đổi ConfigMap/Secret thì Pod đang chạy không tự nhận giá trị mới.** Gắn bằng biến môi trường thì **không bao giờ** cập nhật; phải `kubectl rollout restart deployment/<tên>`.

---

## Lưu trữ — ba từ đi cùng nhau

```text
   StorageClass  →  "cụm này có những LOẠI ổ đĩa nào"      (quản trị lo)
   PV            →  "một ổ đĩa THẬT"                        (thường tự tạo)
   PVC           →  "tôi cần 20Gi"                          (bạn viết cái này)
```

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: du-lieu
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 20Gi
```

Bạn hầu như chỉ viết **PVC**. Hai cái kia hệ thống lo.

| Từ | Nghĩa | Bẫy |
|---|---|---|
| `emptyDir` | Thư mục tạm, mất khi **Pod** bị xoá | Sống sót khi container crash — nhiều người tưởng ngược lại |
| `PVC` | Đơn xin ổ đĩa | `reclaimPolicy: Delete` mặc định → **xoá PVC là xoá ổ đĩa thật** |
| `ReadWriteOnce` | Gắn được vào **một NODE** | **Không phải "một Pod"** — Deployment 3 bản trải 3 node chỉ chạy được 1 |

---

## Các loại workload — chạy cái gì thì dùng cái nào

| Loại | Dùng khi | Đặc điểm |
|---|---|---|
| **Deployment** | Web, API, worker — **90% trường hợp** | Mọi Pod giống nhau, thay thế được |
| **StatefulSet** | Database, Kafka | Tên cố định `-0`, `-1`; mỗi Pod một ổ đĩa riêng |
| **DaemonSet** | Agent thu thập log, giám sát | **Một Pod trên MỖI node**, không có `replicas` |
| **Job** | Migration, xử lý một lần | Chạy xong rồi **thoát** |
| **CronJob** | Sao lưu hằng đêm | Job chạy theo lịch |

Ba câu hỏi để chọn:

```text
   "Chạy bao nhiêu bản?"           → Deployment
   "Mỗi bản cần danh tính riêng?"   → StatefulSet
   "Chạy trên MỖI MÁY?"             → DaemonSet
   "Chạy một lần rồi xong?"         → Job
   "Chạy theo lịch?"                → CronJob
```

> **Bẫy**: dùng Deployment cho tác vụ có điểm kết thúc sẽ gây `CrashLoopBackOff` **dù tác vụ chạy đúng** — vì Deployment luôn khởi động lại Pod đã thoát. Đó là lúc cần **Job**.

---

## Trạng thái Pod — đọc để biết hỏng ở đâu

```bash
kubectl get pods
```

```text
NAME             READY   STATUS             RESTARTS   AGE
web-7d4-x7k2p    1/1     Running            0          2d
web-7d4-m9q4t    0/1     Pending            0          5m
web-7d4-b2n8w    0/1     CrashLoopBackOff   7          12m
```

| Trạng thái | Nghĩa | Làm gì |
|---|---|---|
| `Running` **1/1** | Chạy tốt | — |
| **`Running` 0/1** | Chạy **nhưng chưa sẵn sàng** → không nhận traffic | Kiểm tra `readinessProbe` |
| `Pending` | Chưa được xếp lên node nào | `kubectl describe pod` → đọc Events |
| `ContainerCreating` | Đang kéo image hoặc gắn ổ đĩa | Chờ, hoặc `describe` nếu quá lâu |
| `ImagePullBackOff` | Không tải được image | Sai tên/tag, hoặc thiếu quyền registry |
| `CrashLoopBackOff` | Container chết đi chết lại | `kubectl logs <pod> --previous` |
| `OOMKilled` | Vượt giới hạn bộ nhớ | Tăng `limits.memory`, hoặc sửa rò rỉ |
| `Terminating` (kẹt) | Không xoá được | Thường do finalizer hoặc node chết |

> **Điểm cần nhớ nhất**: cột **`READY`** quan trọng hơn cột `STATUS`. `Running 0/1` trông như khoẻ nhưng thật ra **không nhận traffic** — và rất nhiều người bỏ qua nó.

---

## Sáu lệnh `kubectl` dùng hằng ngày

```bash
kubectl get pods                    # liệt kê
kubectl describe pod <tên>          # chi tiết + EVENTS (quan trọng nhất khi lỗi)
kubectl logs <tên>                  # log ứng dụng
kubectl logs <tên> --previous       # log của container VỪA CHẾT
kubectl apply -f file.yaml          # tạo mới hoặc cập nhật
kubectl delete -f file.yaml         # xoá
```

Hai lệnh cứu bạn nhiều nhất:

```text
   kubectl describe pod <tên>    → mục "Events" ở cuối nói CHÍNH XÁC vì sao lỗi
   kubectl logs <tên> --previous → log của lần chạy TRƯỚC khi crash
```

Và một thói quen nên có ngay:

```bash
kubectl config current-context     # đang trỏ vào cụm NÀO?
```

Gõ nó **trước mọi lệnh có `delete`**. Xoá nhầm ở production không có nút hoàn tác.

---

## Bảng tra thuật ngữ đầy đủ

| Thuật ngữ | Tiếng Việt | Nghĩa ngắn |
|---|---|---|
| **Cluster** | cụm | Toàn bộ hệ thống Kubernetes |
| **Node** | nút / máy | Một máy trong cụm |
| **Control plane** | mặt phẳng điều khiển | Phần ra quyết định (bộ não) |
| **Pod** | — | Đơn vị nhỏ nhất: một hoặc vài container đi cùng nhau |
| **Deployment** | — | Khai báo "muốn N bản sao", tự tạo và thay Pod |
| **ReplicaSet** | — | Tầng giữa do Deployment tạo, giữ đúng số Pod |
| **Service** | dịch vụ | Địa chỉ ổn định đứng trước nhóm Pod |
| **Ingress** | — | Định tuyến HTTP từ ngoài vào nhiều Service |
| **Label / Selector** | nhãn / bộ chọn | Cơ chế nối mọi thứ với nhau |
| **Namespace** | không gian tên | Ngăn logic trong cụm |
| **ConfigMap** | — | Cấu hình không nhạy cảm |
| **Secret** | bí mật | Dữ liệu nhạy cảm (**chỉ base64, không mã hoá thật**) |
| **PVC** | đơn xin ổ đĩa | Yêu cầu dung lượng lưu trữ |
| **PV** | ổ đĩa bền vững | Ổ đĩa thật, thường tự tạo từ PVC |
| **StorageClass** | lớp lưu trữ | Loại ổ đĩa mà cụm cung cấp |
| **kubectl** | — | Công cụ dòng lệnh nói chuyện với cụm |
| **kubelet** | — | Chương trình trên mỗi node, thật sự chạy container |
| **API server** | — | Cửa vào duy nhất của cụm; mọi thứ đi qua nó |
| **Scheduler** | bộ xếp lịch | Chọn Pod chạy trên node nào |
| **manifest** | bản kê khai | File YAML mô tả đối tượng |
| **replica** | bản sao | Một bản của ứng dụng |
| **rollout** | triển khai | Quá trình cập nhật phiên bản mới |
| **probe** | phép thăm dò | Kiểm tra sức khoẻ container |
| **taint / toleration** | vết / khả năng chịu | Cách đẩy Pod ra khỏi node, và cho phép ở lại |

---

## Mười hai bẫy của người mới

| Bẫy | Sự thật |
|---|---|
| Xoá Pod để gỡ ứng dụng | Pod **tự hiện lại**. Phải xoá **Deployment** |
| Sửa Pod bằng `kubectl edit` | Bị ghi đè ở vòng lặp tiếp theo. Sửa **Deployment** |
| Tạo Pod trực tiếp bằng YAML | Node chết là Pod mất vĩnh viễn. Dùng Deployment |
| Nhìn `STATUS` mà bỏ qua `READY` | `Running 0/1` **không nhận traffic** |
| Đọc log khi Pod `Pending` | Container **chưa được tạo** — log luôn rỗng. Đọc `describe` |
| Quên `--previous` khi debug crash | Xem nhầm log của container đang khởi động |
| Nhãn Service lệch nhãn Pod | Service trả 503. Kiểm tra `kubectl get endpoints` |
| Tưởng Secret được mã hoá | **Chỉ base64**, ai cũng giải được |
| Đổi ConfigMap rồi mong Pod tự cập nhật | Với biến môi trường thì **không bao giờ**. Cần `rollout restart` |
| Gọi Pod bằng IP | IP đổi liên tục. Gọi qua **Service** |
| Xoá namespace cho gọn | **Xoá sạch mọi thứ bên trong**, kể cả dữ liệu |
| Mỗi service một `LoadBalancer` | Tốn ~16 USD/tháng mỗi cái. Dùng **Ingress** |

---

## Tự kiểm tra

**1. Vì sao xoá Pod xong nó lại hiện ra?**

<details><summary>Đáp án</summary>

Vì **trạng thái mong muốn** trong Deployment vẫn là N bản sao. Vòng lặp điều hoà thấy thiếu nên tạo bù. Muốn xoá thật thì đổi ý muốn: `kubectl scale --replicas=0` hoặc xoá Deployment.
</details>

**2. Pod hiện `Running` nhưng cột `READY` là `0/1`. Có sao không?**

<details><summary>Đáp án</summary>

**Có.** Container đang chạy nhưng **`readinessProbe` chưa qua**, nên Service **không gửi traffic** vào Pod này. Nhìn cột `STATUS` mà bỏ qua `READY` là bẫy rất phổ biến.
</details>

**3. Service không hoạt động. Lệnh đầu tiên nên gõ?**

<details><summary>Đáp án</summary>

`kubectl get endpoints <tên-service>`. Rỗng thì chỉ có hai lý do: **nhãn của Service không khớp nhãn Pod**, hoặc **Pod chưa Ready**.
</details>

**4. Kubernetes nối Service với Pod bằng cách nào?**

<details><summary>Đáp án</summary>

Bằng **nhãn (label)**, không phải bằng tên hay IP. Pod mang nhãn khớp `selector` thì tự vào danh sách; Pod chết thì tự ra.
</details>

**5. Muốn chạy migration database một lần khi deploy thì dùng loại workload nào?**

<details><summary>Đáp án</summary>

**Job.** Dùng Deployment sẽ gây `CrashLoopBackOff` vì Deployment luôn khởi động lại Pod đã thoát — kể cả khi nó thoát thành công.
</details>

**6. Secret có an toàn không?**

<details><summary>Đáp án</summary>

**Không hẳn.** Nó chỉ được mã hoá **định dạng base64**, ai đọc được namespace là giải ra ngay. Muốn an toàn thật cần bật mã hoá etcd và dùng kho bí mật bên ngoài.
</details>

---

## Tóm tắt bài 0.3

- Một câu về Kubernetes: **bạn khai báo trạng thái mong muốn, nó lo cho thực tế luôn khớp** — giống máy điều hoà giữ nhiệt độ, không phải công tắc bật tắt.
- **Bảy từ cốt lõi**: Cluster (cụm) → Node (máy) → Pod (đơn vị nhỏ nhất) → Deployment (thứ bạn khai báo) → Service (địa chỉ ổn định) → Label/Selector (sợi dây nối) → Namespace (ngăn logic).
- **Đừng tạo Pod trực tiếp** — dùng Deployment, vì Pod trần không tự phục hồi.
- **Label là cơ chế nối của toàn bộ Kubernetes.** Service tìm Pod bằng nhãn, Deployment quản Pod bằng nhãn. Nhãn lệch là mọi thứ đứt.
- **Cột `READY` quan trọng hơn cột `STATUS`.** `Running 0/1` nghĩa là không nhận traffic.
- Hai lệnh cứu bạn nhiều nhất: **`kubectl describe pod`** (đọc mục Events) và **`kubectl logs --previous`**.
- **Secret chỉ là base64, không phải mã hoá thật.**
- Đổi ConfigMap/Secret thì Pod **không tự nhận** giá trị mới — cần `kubectl rollout restart`.
- Gõ **`kubectl config current-context`** trước mọi lệnh có `delete`.

---

**Phase kế tiếp** → [Bài 1: Docker là gì và tại sao cần dùng?](../phase-1/01-docker-la-gi-va-tai-sao-can.md)
