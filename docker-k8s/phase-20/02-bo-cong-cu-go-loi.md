# Bài 2: Bộ công cụ gỡ lỗi — kubectl debug và các trạng thái hỏng

Pod không chạy. `kubectl get pods` cho bạn một chữ trong cột `STATUS`, và chữ đó quyết định bạn phải làm gì tiếp theo.

Bài này là bộ công cụ: đọc trạng thái để biết hỏng ở đâu, rồi dùng đúng lệnh cho từng loại.

---

## Cây chẩn đoán theo STATUS

```text
   kubectl get pods
        │
        ├─ Pending          → chưa được xếp lên node nào
        │                     → kubectl describe pod (đọc Events)
        │
        ├─ ContainerCreating→ đã có node, đang chuẩn bị
        │                     → thường là kéo image hoặc gắn volume
        │
        ├─ ImagePullBackOff → không kéo được image
        │                     → kiểm tra tên/tag/imagePullSecrets
        │
        ├─ CrashLoopBackOff → container liên tục chết
        │                     → kubectl logs --previous
        │
        ├─ Error            → container thoát với mã khác 0
        │                     → kubectl logs
        │
        ├─ OOMKilled        → vượt limits.memory
        │                     → tăng limits, hoặc sửa rò rỉ
        │
        ├─ Running 0/1      → CHẠY nhưng readinessProbe THẤT BẠI
        │                     → kubectl describe, kiểm tra probe
        │
        ├─ Terminating (kẹt)→ không xoá được
        │                     → finalizer, hoặc volume không gỡ được
        │
        └─ Evicted          → bị đuổi khỏi node
                              → node hết đĩa/RAM; xem QoS class
```

Điểm cần nhấn: **`Running` không có nghĩa là khoẻ**. Cột `READY` mới quan trọng.

```text
NAME          READY   STATUS    RESTARTS      AGE
myapp-x7k2p   0/1     Running   0             12m
              ▲▲▲
        Container chạy, nhưng KHÔNG Ready
        → không nhận traffic → Service trả 503
        → và nhiều người nhìn cột STATUS thấy "Running" rồi đi tìm chỗ khác
```

---

## Ba trạng thái khó nhất

### `Pending` — không có chỗ

```bash
kubectl describe pod myapp-xxx | grep -A10 Events
```

```text
  Warning  FailedScheduling  2m  default-scheduler
    0/5 nodes are available:
      2 Insufficient cpu,
      1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: },
      2 node(s) didn't match Pod's node affinity/selector.
```

Dòng này liệt kê **chính xác** vì sao từng node bị loại. Bảng tra:

| Thông báo | Nguyên nhân | Xử lý |
|---|---|---|
| `Insufficient cpu/memory` | Node hết chỗ theo `requests` | Giảm `requests`, thêm node, hoặc bật Cluster Autoscaler |
| `untolerated taint` | Node có taint | Thêm `tolerations` ([Phase 17 bài 2](../phase-17/02-daemonset.md)) |
| `didn't match node affinity/selector` | `nodeSelector` không khớp node nào | Kiểm tra nhãn node |
| `had volume node affinity conflict` | PV nằm ở AZ khác node | PV `ReadWriteOnce` bị buộc vào một AZ |
| `pod has unbound immediate PersistentVolumeClaims` | PVC chưa `Bound` | `kubectl get pvc` — StorageClass có tồn tại không |

```bash
# Xem node còn bao nhiêu chỗ (theo REQUESTS, không phải mức dùng thật)
kubectl describe node worker-2 | grep -A8 "Allocated resources"
```

### `CrashLoopBackOff` — chết liên tục

```bash
# BƯỚC 1 — log của container VỪA CHẾT (không phải container đang khởi động)
kubectl logs myapp-xxx --previous

# BƯỚC 2 — mã thoát nói lên nhiều điều
kubectl describe pod myapp-xxx | grep -A5 "Last State"
```

```text
    Last State:     Terminated
      Reason:       Error
      Exit Code:    1
```

| Mã thoát | Nghĩa |
|---|---|
| `0` | Thoát bình thường — nhưng với Deployment thì vẫn bị khởi động lại. **Bạn cần Job** ([Phase 17 bài 3](../phase-17/03-job-va-cronjob.md)) |
| `1` | Lỗi ứng dụng chung — đọc log |
| `126` | Lệnh không thực thi được — sai quyền file |
| `127` | **Không tìm thấy lệnh** — sai đường dẫn trong `command`, hoặc image distroless không có shell |
| `137` | `SIGKILL` — thường là **OOMKilled**, hoặc quá `terminationGracePeriodSeconds` |
| `139` | `SIGSEGV` — lỗi phân đoạn bộ nhớ, thường ở thư viện native |
| `143` | `SIGTERM` — bị yêu cầu dừng bình thường |

Ba nguyên nhân phổ biến nhất và cách phân biệt:

```text
   Exit 1 + log có stack trace          → lỗi code hoặc cấu hình
   Exit 137 + Reason: OOMKilled         → thiếu bộ nhớ
   Exit 0 nhưng vẫn restart             → dùng nhầm workload (cần Job)
   Không có log gì + Exit 127           → sai `command`/`args`
```

### `Terminating` kẹt mãi không xoá

```bash
kubectl get pod myapp-xxx -o jsonpath='{.metadata.finalizers}'
```

```text
["kubernetes.io/pvc-protection"]
```

**Finalizer** là "khoá" ngăn xoá cho tới khi một controller dọn xong việc của nó. Nếu controller đó đã chết, khoá không bao giờ được gỡ.

```bash
# Xoá cứng Pod (KHÔNG chờ tắt sạch)
kubectl delete pod myapp-xxx --grace-period=0 --force

# Gỡ finalizer — BIỆN PHÁP CUỐI CÙNG
kubectl patch pod myapp-xxx -p '{"metadata":{"finalizers":null}}' --type=merge
```

> **Cảnh báo**: gỡ finalizer bỏ qua việc dọn dẹp mà controller định làm — có thể để lại volume chưa gỡ, bản ghi rác ở cloud. Chỉ dùng khi đã hiểu rõ finalizer đó phục vụ gì. Nguyên nhân thường gặp nhất là **node chết** khiến kubelet không xác nhận được, và cách đúng là xoá node khỏi cụm.

---

## `kubectl debug` — công cụ mạnh nhất mà ít người biết

### Vấn đề: image production không có công cụ gỡ lỗi

```bash
kubectl exec myapp-xxx -- sh
```

```text
OCI runtime exec failed: exec: "sh": executable file not found in $PATH
```

Đây là image **distroless** ([Phase 19 bài 1](../phase-19/01-bao-mat-image.md)) — cố ý không có shell. Trước Kubernetes 1.23, tình huống này gần như bế tắc.

### Ephemeral container — gắn thêm container vào Pod đang chạy

```bash
kubectl debug -it myapp-xxx --image=nicolaka/netshoot --target=app
```

```text
Defaulting debug container name to debugger-8xzp2.
If you don't see a command prompt, try pressing enter.
/ #
```

```text
   Pod đang chạy
   ┌──────────────────────────────────────────────┐
   │  Container "app"      (distroless, không shell)│
   │  Container "debugger" (netshoot, đầy đủ công cụ)│
   │                                                │
   │  --target=app → DÙNG CHUNG process namespace   │
   │  → thấy được tiến trình của app                │
   │  → dùng chung network namespace                │
   │  → curl localhost:8080 gọi ĐƯỢC vào app        │
   └──────────────────────────────────────────────┘

   Container gỡ lỗi KHÔNG làm Pod khởi động lại.
   Xong việc thì xoá đi, Pod vẫn nguyên.
```

Image `nicolaka/netshoot` có sẵn `curl`, `dig`, `nslookup`, `tcpdump`, `netstat`, `ss`, `iperf`, `mtr`, `jq` — gần như mọi thứ cần để chẩn đoán mạng.

```bash
# Bên trong container gỡ lỗi
curl -v localhost:8080/health          # gọi thẳng vào app qua localhost
nslookup postgres.production.svc.cluster.local
dig +short kubernetes.default.svc.cluster.local
ss -tulpn                              # xem cổng nào đang mở
tcpdump -i any -n port 5432            # bắt gói tin
```

### Sao chép Pod để thử nghiệm an toàn

```bash
# Tạo BẢN SAO của Pod với image khác — Pod gốc KHÔNG bị đụng
kubectl debug myapp-xxx -it --copy-to=myapp-debug --image=ubuntu --share-processes

# Bản sao nhưng đổi command để container không chết ngay
kubectl debug myapp-xxx -it --copy-to=myapp-debug --container=app -- sh
```

Cách thứ hai cực kỳ hữu ích với `CrashLoopBackOff`: nó tạo bản sao với `command` bị thay bằng `sh`, nên container **không chạy ứng dụng và không chết** — bạn vào bên trong xem file cấu hình, biến môi trường, quyền truy cập.

### Gỡ lỗi node

```bash
kubectl debug node/worker-2 -it --image=ubuntu
```

Tạo Pod đặc quyền trên node đó, với hệ thống file của node gắn tại `/host`:

```bash
chroot /host
journalctl -u kubelet -n 100
df -h
crictl ps
```

---

## Chẩn đoán mạng — ba tầng

Khi dịch vụ A không gọi được dịch vụ B, kiểm tra theo thứ tự:

```bash
# TẦNG 1 — DNS phân giải được không?
kubectl run tmp --rm -it --image=nicolaka/netshoot --restart=Never -- \
  nslookup backend.production.svc.cluster.local
```

```text
Server:    10.96.0.10
Name:      backend.production.svc.cluster.local
Address 1: 10.96.45.12
```

```bash
# TẦNG 2 — Service có endpoint không?  ← LỖI PHỔ BIẾN NHẤT
kubectl get endpoints backend
```

```text
NAME      ENDPOINTS                        AGE
backend   <none>                           5m
                ▲
        RỖNG → Service không trỏ tới Pod nào
```

Endpoint rỗng có đúng hai nguyên nhân:

```text
   1. selector của Service KHÔNG KHỚP nhãn của Pod
   2. Pod chưa READY (readinessProbe thất bại)
```

```bash
# Kiểm tra nguyên nhân 1
kubectl get svc backend -o jsonpath='{.spec.selector}'      # {"app":"backend"}
kubectl get pods --show-labels | grep backend               # app=backend-api  ← LỆCH

# Kiểm tra nguyên nhân 2
kubectl get pods -l app=backend      # cột READY có phải 1/1 không
```

```bash
# TẦNG 3 — kết nối được không?
kubectl run tmp --rm -it --image=nicolaka/netshoot --restart=Never -- \
  curl -v --max-time 5 http://backend.production.svc.cluster.local:8080/health
```

Nếu tầng 1 và 2 ổn mà tầng 3 timeout → nghi ngờ **NetworkPolicy** ([Phase 19 bài 4](../phase-19/04-networkpolicy-va-tong-ket.md)):

```bash
kubectl get networkpolicy -n production
```

---

## Lệnh vận hành cần thuộc

```bash
# Tổng quan sức khoẻ cụm — chạy đầu tiên khi có sự cố
kubectl get nodes
kubectl get pods -A --field-selector=status.phase!=Running
kubectl top nodes
kubectl get events -A --sort-by='.lastTimestamp' | tail -30

# Pod nào khởi động lại nhiều nhất
kubectl get pods -A --sort-by='.status.containerStatuses[0].restartCount' | tail -10

# Pod nào không Ready
kubectl get pods -A -o json | jq -r '
  .items[] | select(.status.containerStatuses != null)
  | select(any(.status.containerStatuses[]; .ready == false))
  | "\(.metadata.namespace)/\(.metadata.name)"'

# Node đang chịu áp lực
kubectl get nodes -o json | jq -r '
  .items[] | select(any(.status.conditions[];
      .type != "Ready" and .status == "True"))
  | "\(.metadata.name): \(.status.conditions[] | select(.status=="True") | .type)"'

# Xem YAML thật của Pod (kèm mọi giá trị mặc định Kubernetes điền vào)
kubectl get pod myapp-xxx -o yaml

# So sánh manifest của bạn với thứ đang chạy
kubectl diff -f deployment.yaml
```

Lệnh **`kubectl diff`** rất đáng dùng trước mỗi lần apply — nó cho biết chính xác thay đổi gì sắp xảy ra.

---

## Trạng thái node

```bash
kubectl describe node worker-2 | grep -A8 Conditions
```

```text
  Type                 Status
  MemoryPressure       False
  DiskPressure         True      ← VẤN ĐỀ
  PIDPressure          False
  Ready                True
```

| Condition | `True` nghĩa là | Hậu quả |
|---|---|---|
| `MemoryPressure` | Node sắp hết RAM | kubelet **đuổi Pod** theo thứ tự QoS |
| `DiskPressure` | Node sắp hết đĩa | kubelet **xoá image không dùng**, rồi đuổi Pod |
| `PIDPressure` | Quá nhiều tiến trình | Không tạo được Pod mới |
| `Ready = False` | Node chết | Pod bị đuổi sau `pod-eviction-timeout` (mặc định 5 phút) |

`DiskPressure` hay đến từ **log và image cũ** tích tụ:

```bash
kubectl debug node/worker-2 -it --image=ubuntu -- chroot /host df -h /var/lib
# Dọn image không dùng
kubectl debug node/worker-2 -it --image=ubuntu -- chroot /host crictl rmi --prune
```

---

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Nhìn cột `STATUS` mà bỏ qua cột `READY` | `Running 0/1` trông như khoẻ, thực ra không nhận traffic |
| Quên `--previous` với `CrashLoopBackOff` | Xem log rỗng của container đang khởi động |
| Không đọc Events trong `describe` | Bỏ lỡ toàn bộ thông tin cho `Pending`, `ImagePullBackOff` |
| Không kiểm tra `kubectl get endpoints` | Bỏ lỡ nguyên nhân phổ biến nhất khi Service không hoạt động |
| Dùng `kubectl exec` với image distroless | Thất bại, và tưởng Pod hỏng — dùng `kubectl debug` |
| Gỡ finalizer bừa | Để lại volume chưa gỡ và tài nguyên rác ở cloud |
| `--grace-period=0 --force` cho Pod StatefulSet | **Có thể gây hỏng dữ liệu** — hai Pod cùng ghi một volume |
| Chỉ nhìn Pod, quên nhìn node | Vấn đề thật là `DiskPressure` trên node |
| `kubectl top` mà chưa có metrics-server | Báo lỗi, và người ta tưởng cụm hỏng |
| Sửa trực tiếp bằng `kubectl edit` ở production | Thay đổi mất khi GitOps đồng bộ lại; không ai biết ai sửa gì |

---

## Tóm tắt bài 2

- **Cột `STATUS` quyết định bạn làm gì tiếp theo**, nhưng **`Running` không có nghĩa là khoẻ** — phải nhìn cột `READY`. `Running 0/1` nghĩa là readinessProbe thất bại và Pod **không nhận traffic**.
- **`Pending`**: đọc Events trong `kubectl describe` — nó liệt kê **chính xác** vì sao từng node bị loại (thiếu CPU, taint, affinity, PVC chưa Bound).
- **`CrashLoopBackOff`**: `kubectl logs --previous` trước, rồi đọc **mã thoát**. `137` = OOMKilled hoặc SIGKILL; `127` = không tìm thấy lệnh; **`0` mà vẫn restart = dùng nhầm workload, cần Job**.
- **`Terminating` kẹt** thường do **finalizer**. Gỡ finalizer là biện pháp cuối cùng — nó bỏ qua việc dọn dẹp và có thể để lại tài nguyên rác. **Không bao giờ `--force` Pod StatefulSet** — có thể hỏng dữ liệu.
- **`kubectl debug`** là công cụ mạnh nhất và ít người biết: gắn **ephemeral container** vào Pod đang chạy (không khởi động lại), dùng chung network và process namespace. Đây là cách duy nhất gỡ lỗi image **distroless**.
- **`--copy-to` với `command` thay thế** cho phép vào bên trong một Pod `CrashLoopBackOff` mà container không chết.
- **`kubectl debug node/<tên>`** cho shell trên node với hệ thống file gắn tại `/host`.
- Chẩn đoán mạng theo **ba tầng**: DNS → **`kubectl get endpoints`** → kết nối. **Endpoint rỗng là nguyên nhân phổ biến nhất**, và chỉ có hai lý do: **selector không khớp nhãn**, hoặc **Pod chưa Ready**.
- Kiểm tra **Condition của node** — `DiskPressure` và `MemoryPressure` là nguyên nhân gốc của nhiều sự cố trông như lỗi ứng dụng.

**Bài kế tiếp** → [Bài 3: Chỉ số, giám sát và sổ tay chẩn đoán](03-chi-so-giam-sat-va-so-tay.md)
