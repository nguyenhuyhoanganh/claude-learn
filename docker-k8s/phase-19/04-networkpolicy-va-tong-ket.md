# Bài 4: NetworkPolicy và Pod Security — tổng kết Phase 19

Mặc định mạng của Kubernetes gây bất ngờ cho hầu hết người mới:

> **Mọi Pod đều gọi được tới mọi Pod khác, trong mọi namespace, không có bất kỳ hạn chế nào.**

Nghĩa là Pod hiển thị trang chủ có thể gọi thẳng vào Pod database của hệ thống thanh toán. Không có tường lửa nào giữa chúng.

---

## Vì sao mặc định lại mở toang

Đây là lựa chọn có chủ đích: Kubernetes muốn **mọi thứ chạy được ngay**, rồi để bạn siết lại. Nhưng bước "siết lại" thì rất nhiều đội không bao giờ làm.

```text
   KHÔNG có NetworkPolicy
   ══════════════════════

   ┌─────────┐   ┌──────────┐   ┌─────────────┐   ┌──────────┐
   │ frontend│◄─►│ backend  │◄─►│  postgres   │◄─►│ redis    │
   └────┬────┘   └────┬─────┘   └──────┬──────┘   └────┬─────┘
        └─────────────┴────────────────┴───────────────┘
                  MỌI đường đều thông

   Kẻ tấn công chiếm được frontend (dễ nhất, phơi ra Internet)
        → gọi thẳng postgres:5432
        → không cần đi qua backend, không cần vượt qua tầng xác thực nào
```

**NetworkPolicy** là tường lửa cấp Pod, và nó chuyển hệ thống từ "một lỗ hổng là mất tất" sang "một lỗ hổng chỉ mất một phần".

---

## Điều kiện tiên quyết: CNI phải hỗ trợ

```bash
kubectl apply -f networkpolicy.yaml
```

Lệnh này **luôn thành công** — kể cả khi mạng của bạn hoàn toàn không hỗ trợ NetworkPolicy. Đối tượng được lưu vào etcd nhưng **không có gì cưỡng chế nó**.

| CNI plugin | Hỗ trợ NetworkPolicy |
|---|---|
| **Calico** | Có, đầy đủ + mở rộng |
| **Cilium** | Có, đầy đủ + tầng 7 |
| **Weave Net** | Có |
| **AWS VPC CNI** | **Không** — cần cài thêm Calico |
| **Flannel** | **KHÔNG** |

> **Bẫy nghiêm trọng**: cụm dùng Flannel hoặc AWS VPC CNI mặc định sẽ **âm thầm bỏ qua** mọi NetworkPolicy. Bạn viết chính sách, apply thành công, và tin rằng hệ thống đã được bảo vệ — trong khi mọi cổng vẫn mở. Phải kiểm chứng bằng thử nghiệm thật, không tin vào việc apply thành công.

Cách kiểm chứng:

```bash
# 1. Tạo policy chặn hết trong một namespace thử nghiệm
kubectl create namespace test-np
kubectl -n test-np run server --image=nginx
kubectl -n test-np expose pod server --port=80
kubectl apply -n test-np -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: deny-all}
spec:
  podSelector: {}
  policyTypes: [Ingress]
EOF

# 2. Thử gọi — PHẢI timeout
kubectl -n test-np run client --rm -it --image=busybox --restart=Never \
  -- wget -qO- --timeout=5 http://server
```

Nếu lệnh này trả về trang nginx thay vì timeout, **NetworkPolicy không có tác dụng** trên cụm của bạn.

---

## Mô hình: mặc định từ chối, rồi mở từng đường

```yaml
# BƯỚC 1 — chặn MỌI traffic vào, trong namespace này
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: production
spec:
  podSelector: {}                # {} = MỌI Pod trong namespace
  policyTypes:
    - Ingress
```

```yaml
# BƯỚC 2 — mở đúng đường cần
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-cho-phep-frontend
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: backend               # chính sách này áp cho Pod backend
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend      # CHỈ frontend được gọi vào
      ports:
        - protocol: TCP
          port: 8080
```

### Hai quy tắc nền tảng phải nắm

**Quy tắc 1 — chính sách là cộng dồn, chỉ có "cho phép".**

```text
   Không có khái niệm "từ chối" trong NetworkPolicy.
   Nhiều chính sách áp lên một Pod → HỢP của mọi quy tắc cho phép.

   → Không thể viết "cho phép tất cả TRỪ X".
   → Chỉ có thể viết "cho phép A, cho phép B" và mọi thứ khác bị chặn.
```

**Quy tắc 2 — Pod không bị chính sách nào chọn thì hoàn toàn mở.**

```text
   Pod KHÔNG khớp podSelector của bất kỳ NetworkPolicy nào
        → KHÔNG bị hạn chế gì cả

   Pod khớp ÍT NHẤT MỘT chính sách có policyTypes: [Ingress]
        → mọi traffic vào bị chặn, TRỪ những gì được cho phép tường minh
```

Đây là lý do chính sách `default-deny` ở bước 1 quan trọng: nó làm **mọi** Pod trong namespace bị "chọn", chuyển toàn bộ namespace sang chế độ từ chối mặc định.

---

## Kiểm soát traffic đi ra

Traffic đi ra (`Egress`) quan trọng không kém — nó chặn kẻ tấn công **mang dữ liệu ra ngoài**.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-egress
  namespace: production
spec:
  podSelector:
    matchLabels: {app: backend}
  policyTypes: [Egress]
  egress:
    # 1. DNS — GẦN NHƯ LUÔN CẦN, và hay bị quên nhất
    - to:
        - namespaceSelector:
            matchLabels: {kubernetes.io/metadata.name: kube-system}
          podSelector:
            matchLabels: {k8s-app: kube-dns}
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53

    # 2. Chỉ tới database
    - to:
        - podSelector:
            matchLabels: {app: postgres}
      ports:
        - {protocol: TCP, port: 5432}

    # 3. API bên ngoài — theo dải IP, CHẶN dải nội bộ
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - 10.0.0.0/8         # chặn mạng nội bộ VPC
              - 172.16.0.0/12
              - 192.168.0.0/16
              - 169.254.169.254/32 # CHẶN metadata service của cloud
      ports:
        - {protocol: TCP, port: 443}
```

Hai chi tiết đáng nói riêng:

**Quên DNS là lỗi số một.** Bật `Egress` mà không cho phép cổng 53 tới CoreDNS thì ứng dụng **không phân giải được tên nào cả**. Triệu chứng: mọi lời gọi báo `Name or service not known`, và người ta thường đi tìm lỗi ở tầng ứng dụng.

**Chặn `169.254.169.254` là quan trọng bậc nhất trên cloud.** Đó là địa chỉ **metadata service** của AWS/GCP/Azure. Trên EC2, gọi được nó nghĩa là **lấy được thông tin xác thực IAM của node** — và từ đó truy cập được S3, RDS, mọi thứ mà node có quyền.

```text
   Lỗ hổng SSRF trong ứng dụng
        │
        ▼
   Kẻ tấn công ép ứng dụng gọi http://169.254.169.254/latest/meta-data/iam/security-credentials/
        │
        ▼
   Nhận về AccessKey, SecretKey, Token của IAM role gắn với node
        │
        ▼
   Truy cập TOÀN BỘ tài nguyên AWS mà node đó có quyền
```

Đây là một trong những đường tấn công phổ biến nhất trên Kubernetes chạy trên cloud. Ngoài NetworkPolicy, còn phải bật **IMDSv2** và giới hạn `hop limit` về 1.

---

## Mẫu chính sách hay dùng

```yaml
# Cho phép từ namespace khác
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: monitoring
      ports:
        - {protocol: TCP, port: 9090}
```

```yaml
# Kết hợp namespace VÀ pod — chú ý dấu gạch đầu dòng
  ingress:
    - from:
        - namespaceSelector:
            matchLabels: {team: platform}
          podSelector:                      # CÙNG một mục → AND
            matchLabels: {app: prometheus}
```

> **Bẫy cú pháp rất hay gặp**: `namespaceSelector` và `podSelector` **trong cùng một mục danh sách** nghĩa là **VÀ** (namespace đó VÀ pod đó). Nếu tách thành **hai mục** (mỗi cái một dấu `-`) thì nghĩa là **HOẶC** — rộng hơn nhiều so với ý định. Một dấu gạch đầu dòng đặt sai làm chính sách mở hơn dự tính rất nhiều.

---

## Pod Security Standards

Từ Kubernetes 1.25, `PodSecurityPolicy` đã bị gỡ bỏ và thay bằng **Pod Security Admission** — đơn giản hơn nhiều, bật bằng nhãn trên namespace.

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: v1.29
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

Ba mức:

| Mức | Chặn gì | Dùng cho |
|---|---|---|
| `privileged` | Không chặn gì | Namespace hạ tầng (CNI, CSI) |
| `baseline` | Chặn `privileged`, `hostNetwork`, `hostPID`, hostPath nguy hiểm | Mức tối thiểu hợp lý |
| **`restricted`** | Như baseline + **bắt buộc** `runAsNonRoot`, `drop ALL capabilities`, `seccompProfile`, `allowPrivilegeEscalation: false` | **Ứng dụng thường** |

Ba chế độ hành động:

```text
   enforce  → TỪ CHỐI Pod vi phạm
   audit    → cho qua, nhưng GHI vào audit log
   warn     → cho qua, nhưng CẢNH BÁO ngay trên kubectl
```

Cách triển khai an toàn:

```text
   Bước 1: chỉ đặt warn + audit → xem có bao nhiêu thứ vi phạm
   Bước 2: sửa dần các workload
   Bước 3: khi số vi phạm về 0 → bật enforce
```

Bật `enforce: restricted` ngay lập tức trên namespace đang chạy sẽ làm **mọi Pod mới bị từ chối** (Pod đang chạy không bị ảnh hưởng, nhưng lần deploy tiếp theo là hỏng).

---

## Sáu tầng phòng thủ

```text
   ┌────────────────────────────────────────────────────────────┐
   │ 1. IMAGE          quét lỗ hổng, distroless, non-root, ký   │
   │                   → giảm bề mặt tấn công ngay từ đầu       │
   ├────────────────────────────────────────────────────────────┤
   │ 2. CONTAINER      securityContext, readOnlyRootFilesystem, │
   │                   drop ALL capabilities, seccomp           │
   │                   → hạn chế thứ kẻ tấn công làm được       │
   ├────────────────────────────────────────────────────────────┤
   │ 3. POD            Pod Security Standards mức restricted    │
   │                   → ép tầng 2 ở cấp namespace              │
   ├────────────────────────────────────────────────────────────┤
   │ 4. MẠNG           NetworkPolicy, mặc định từ chối          │
   │                   → chặn di chuyển ngang trong cụm         │
   ├────────────────────────────────────────────────────────────┤
   │ 5. API SERVER     RBAC, ServiceAccount tối thiểu quyền     │
   │                   → chặn leo thang qua API Kubernetes      │
   ├────────────────────────────────────────────────────────────┤
   │ 6. DỮ LIỆU        mã hoá etcd, external secrets, xoay vòng │
   │                   → giảm thiệt hại khi các tầng trên vỡ    │
   └────────────────────────────────────────────────────────────┘
```

Nguyên tắc: **không tầng nào là đủ**. Mỗi tầng giả định tầng trên nó có thể đã bị vượt qua.

---

## Danh sách kiểm tra bảo mật cụm

| Mục | Kiểm tra bằng |
|---|---|
| Image không chạy root | `kubectl get pods -A -o json \| jq '...runAsNonRoot...'` |
| Không có Pod `privileged` | `kubectl get pods -A -o json \| jq '.items[] \| select(.spec.containers[].securityContext.privileged==true)'` |
| Không có `hostNetwork`/`hostPID` ngoài hạ tầng | Tương tự |
| NetworkPolicy **thật sự có tác dụng** | Thử nghiệm `deny-all` như ở đầu bài |
| Mọi namespace ứng dụng có `default-deny` | `kubectl get netpol -A` |
| Egress chặn `169.254.169.254` | Đọc chính sách |
| Pod Security `restricted` trên namespace ứng dụng | `kubectl get ns -L pod-security.kubernetes.io/enforce` |
| Không ai thừa `cluster-admin` | `kubectl get clusterrolebindings` |
| `automountServiceAccountToken: false` cho Pod không cần API | Rà manifest |
| Mã hoá etcd đã bật | Đọc cấu hình API server, hoặc kiểm tra bằng `etcdctl` |
| Không có Secret trong Git | `gitleaks detect` hoặc `trufflehog` |
| Audit log đã bật | Đọc cấu hình API server |

---

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| CNI không hỗ trợ NetworkPolicy | Chính sách apply thành công nhưng **hoàn toàn không có tác dụng** |
| Không có `default-deny` | Chính sách chỉ có tác dụng với Pod nó chọn; phần còn lại mở toang |
| Bật Egress mà quên cho phép DNS cổng 53 | **Mọi lời gọi báo không phân giải được tên** |
| Không chặn `169.254.169.254` | SSRF → **lấy được thông tin xác thực IAM của node** |
| Tách `namespaceSelector` và `podSelector` thành hai mục | Thành **HOẶC** thay vì **VÀ** — chính sách rộng hơn dự tính rất nhiều |
| Bật `enforce: restricted` ngay trên namespace đang chạy | **Mọi Pod mới bị từ chối** ở lần deploy tiếp theo |
| Nghĩ NetworkPolicy chặn được traffic ra Internet | Chỉ chặn được nếu có quy tắc Egress; và `ipBlock` không hiểu tên miền |
| Chỉ làm Ingress, bỏ qua Egress | Không chặn được việc **mang dữ liệu ra ngoài** |
| Tin rằng một tầng phòng thủ là đủ | Mỗi tầng đều có thể bị vượt qua |

---

## Tóm tắt Phase 19

- **Mặc định Kubernetes mở toang**: mọi Pod gọi được mọi Pod, ở mọi namespace. Đây là lựa chọn có chủ đích, và bước "siết lại" là việc của bạn.
- **~84% lỗ hổng image đến từ hệ điều hành nền** ([bài 1](01-bao-mat-image.md)). Đổi `node:18` sang **distroless** giảm từ ~70 xuống ~0 lỗ hổng HIGH/CRITICAL. Distroless **không có shell, không có `curl`, không có trình quản lý gói** — vô hiệu hoá nhiều kỹ thuật tấn công tiêu chuẩn.
- **Container mặc định chạy root.** Đặt `USER` trong Dockerfile **và** ép `runAsNonRoot: true` ở Kubernetes. Bộ tối thiểu: `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `capabilities: drop: ["ALL"]`, `seccompProfile: RuntimeDefault`.
- **Xoá bí mật ở layer sau là vô ích** — dùng BuildKit secret mount. **Ghim image bằng digest**, không phải tag.
- **Mọi Pod mặc định mang token gọi API server** ([bài 2](02-rbac-va-serviceaccount.md)). Đại đa số ứng dụng nên tắt bằng `automountServiceAccountToken: false`.
- **`edit` đọc được Secret**; **`list secrets` trả về cả nội dung** và `resourceNames` không chặn được nó. **`create pods` tương đương quyền của ServiceAccount mạnh nhất namespace.**
- **Base64 không phải mã hoá** ([bài 3](03-secret-that-su-an-toan.md)). Secret nằm trong etcd ở dạng thô → **bản sao lưu etcd chứa mọi mật khẩu nguyên văn**. Bật mã hoá etcd, và **ghi lại mọi Secret cũ** sau khi bật.
- **Dùng file (volume) thay vì biến môi trường** cho bí mật — biến môi trường bị kế thừa, hay bị in ra log, và đọc được từ Pod có `hostPID`.
- **NetworkPolicy chỉ có tác dụng nếu CNI hỗ trợ.** Flannel và AWS VPC CNI mặc định **âm thầm bỏ qua** — phải kiểm chứng bằng thử nghiệm thật.
- Mô hình đúng: **`default-deny` trước, rồi mở từng đường**. Không có khái niệm "từ chối" — chỉ có cho phép, và cộng dồn.
- **Quên cho phép DNS cổng 53** là lỗi số một khi bật Egress. **Chặn `169.254.169.254`** là quan trọng bậc nhất trên cloud — nó là đường từ SSRF tới thông tin xác thực IAM của node.
- **Pod Security Standards** (thay `PodSecurityPolicy` đã bị gỡ ở 1.25) bật bằng nhãn namespace. Triển khai theo thứ tự **`warn` → `audit` → `enforce`**, đừng bật `enforce` ngay.
- **Sáu tầng phòng thủ**: image → container → pod → mạng → API server → dữ liệu. **Không tầng nào là đủ.**

**Phase kế tiếp** → [Bài 1: Log và Event — hai nguồn thông tin đầu tiên khi có sự cố](../phase-20/01-log-va-event.md)
