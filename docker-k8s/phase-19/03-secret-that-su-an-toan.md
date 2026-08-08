# Bài 3: Secret không hề bí mật — mã hoá, xoay vòng, quản lý bên ngoài

Thử nghiệm 10 giây:

```bash
kubectl get secret db-credentials -o jsonpath='{.data.password}' | base64 -d
```

```text
SieuMatKhau123!
```

**Base64 không phải mã hoá.** Nó là mã hoá **định dạng**, ai cũng giải được, không cần khoá gì cả. Đây là hiểu nhầm phổ biến nhất về Kubernetes Secret, và nó dẫn tới việc rất nhiều đội tưởng dữ liệu của mình đang được bảo vệ.

---

## Secret mặc định được bảo vệ tới đâu

```text
   ┌──────────────────────────────────────────────────────────┐
   │  Secret ĐƯỢC bảo vệ hơn ConfigMap ở ba điểm:             │
   │                                                           │
   │  1. Chỉ gửi tới node THẬT SỰ có Pod cần nó               │
   │  2. Gắn vào Pod dưới dạng tmpfs (RAM), không chạm đĩa    │
   │  3. Không hiện giá trị trong `kubectl describe`           │
   ├──────────────────────────────────────────────────────────┤
   │  Secret KHÔNG được bảo vệ ở bốn điểm:                    │
   │                                                           │
   │  1. Lưu trong etcd dưới dạng THÔ (trừ khi bật mã hoá)    │
   │  2. Ai có `get secrets` là đọc được ngay                 │
   │  3. Ai truy cập được etcd là đọc được TẤT CẢ             │
   │  4. Không có xoay vòng tự động, không có audit chi tiết  │
   └──────────────────────────────────────────────────────────┘
```

Kiểm chứng điểm thứ nhất trong danh sách không được bảo vệ:

```bash
# Trên node control-plane, đọc thẳng từ etcd
ETCDCTL_API=3 etcdctl get /registry/secrets/production/db-credentials \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key | strings
```

```text
k8s
v1Secret
db-credentials
production
passwordSieuMatKhau123!      ← MẬT KHẨU HIỆN NGUYÊN VĂN
```

Nghĩa là: **bản sao lưu etcd của bạn chứa mọi mật khẩu ở dạng đọc được**. Nếu bản sao lưu đó nằm trên S3 không mã hoá, hoặc ai đó tải về máy cá nhân, thì toàn bộ bí mật của hệ thống đã ra ngoài.

---

## Lớp 1 — bật mã hoá etcd

```yaml
# /etc/kubernetes/enc/encryption-config.yaml (trên node control-plane)
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources: ["secrets"]
    providers:
      - aescbc:                      # nhà cung cấp ĐẦU TIÊN dùng để GHI
          keys:
            - name: key-2025-08
              secret: <32 byte ngẫu nhiên, base64>
      - identity: {}                 # cho phép ĐỌC dữ liệu cũ chưa mã hoá
```

```bash
# Sinh khoá
head -c 32 /dev/urandom | base64
```

```yaml
# Thêm vào kube-apiserver
- --encryption-provider-config=/etc/kubernetes/enc/encryption-config.yaml
```

Sau khi bật, **Secret cũ vẫn chưa được mã hoá** — chúng chỉ mã hoá khi được ghi lại:

```bash
# Ghi lại MỌI secret để áp mã hoá
kubectl get secrets -A -o json | kubectl replace -f -
```

| Nhà cung cấp | Bảo mật | Ghi chú |
|---|---|---|
| `identity` | **Không mã hoá** | Mặc định |
| `aescbc` | Tốt | Khoá nằm **trên đĩa node control-plane** |
| `secretbox` | Tốt, nhanh hơn | Tương tự |
| **`kms` v2** | **Tốt nhất** | Khoá nằm ở **KMS bên ngoài** (AWS KMS, Vault), không trên node |

> **Giới hạn của `aescbc`**: khoá mã hoá nằm trong một file **trên chính node control-plane**. Ai chiếm được node đó thì có cả dữ liệu mã hoá lẫn khoá giải mã. Nó bảo vệ **bản sao lưu etcd**, nhưng không bảo vệ trước việc node bị chiếm. Muốn tách khoá ra khỏi node thì phải dùng **KMS provider**.
>
> Trên EKS/GKE/AKS, bật mã hoá secret bằng KMS chỉ là một tuỳ chọn lúc tạo cụm — nên bật ngay từ đầu vì đổi sau khá phiền.

---

## Lớp 2 — không đưa Secret vào Git

Đây là vấn đề thực tế lớn hơn cả mã hoá etcd. Bạn quản lý manifest bằng Git, nhưng không thể commit file chứa mật khẩu.

### Cách A — Sealed Secrets

```bash
# Mã hoá bằng khoá công khai của cụm
kubectl create secret generic db-credentials \
  --dry-run=client --from-literal=password='SieuMatKhau123!' -o yaml \
  | kubeseal --format yaml > sealed-secret.yaml
```

```yaml
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: db-credentials
  namespace: production
spec:
  encryptedData:
    password: AgBv3Kx8mQ2...          # chỉ CỤM này giải được
```

File này **commit vào Git an toàn**. Controller trong cụm giải mã và tạo Secret thật.

| Ưu | Nhược |
|---|---|
| Hợp GitOps hoàn hảo | Khoá riêng nằm trong cụm — **mất cụm là mất khả năng giải mã** |
| Không cần hệ thống ngoài | Xoay vòng bí mật phải làm tay |
| Đơn giản | Mỗi cụm một khoá riêng → phải mã hoá lại cho từng cụm |

**Phải sao lưu khoá riêng của controller**, nếu không dựng lại cụm là mọi SealedSecret thành rác:

```bash
kubectl get secret -n kube-system -l sealedsecrets.bitnami.com/sealed-secrets-key \
  -o yaml > sealed-secrets-master.key    # cất ở nơi rất an toàn
```

### Cách B — External Secrets Operator

Bí mật thật nằm ở **kho bí mật bên ngoài** (Vault, AWS Secrets Manager, GCP Secret Manager). Trong Git chỉ có **tham chiếu**.

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: db-credentials
  namespace: production
spec:
  refreshInterval: 1h                    # TỰ ĐỒNG BỘ lại mỗi giờ
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: db-credentials                 # tên Secret sẽ được tạo
  data:
    - secretKey: password
      remoteRef:
        key: production/database
        property: password
```

```text
   AWS Secrets Manager  ──đồng bộ mỗi giờ──►  Kubernetes Secret  ──►  Pod

   Xoay vòng mật khẩu ở AWS
        → trong vòng 1 giờ, Secret trong cụm tự cập nhật
        → KHÔNG cần sửa Git, KHÔNG cần deploy lại
```

| Ưu | Nhược |
|---|---|
| **Xoay vòng tự động** | Cần vận hành thêm operator |
| Một nguồn sự thật cho **nhiều cụm** | Phụ thuộc dịch vụ bên ngoài |
| Có **audit log đầy đủ** ở kho bí mật | Chi phí (AWS Secrets Manager tính tiền theo secret) |
| Git hoàn toàn sạch bí mật | |

> **Khuyến nghị**: Sealed Secrets cho đội nhỏ, một cụm, không có sẵn kho bí mật. **External Secrets cho production nghiêm túc** — vì nó là cách duy nhất có **xoay vòng tự động**, thứ mà Kubernetes Secret không hề có.

---

## Đưa Secret vào Pod — ba cách, khác nhau nhiều

```yaml
# CÁCH 1 — biến môi trường (phổ biến nhất, và có vấn đề)
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: db-credentials
        key: password

# CÁCH 2 — gắn thành file (an toàn hơn)
volumeMounts:
  - name: db-creds
    mountPath: /etc/secrets
    readOnly: true
volumes:
  - name: db-creds
    secret:
      secretName: db-credentials
      defaultMode: 0400              # chỉ chủ sở hữu đọc được

# CÁCH 3 — CSI driver, không tạo Kubernetes Secret nào cả
volumes:
  - name: secrets-store
    csi:
      driver: secrets-store.csi.k8s.io
      readOnly: true
      volumeAttributes:
        secretProviderClass: aws-secrets
```

| | Biến môi trường | File (volume) | CSI driver |
|---|---|---|---|
| Cập nhật khi Secret đổi | **Không** — phải khởi động lại Pod | **Có** (trong ~60 giây) | **Có** |
| Lộ qua `/proc/<pid>/environ` | **Có** | Không | Không |
| Lộ qua crash dump / log lỗi | **Có** — nhiều framework in cả env | Không | Không |
| Lộ qua `kubectl describe pod` | Tên biến hiện, giá trị thì không | Không | Không |
| Có tạo Kubernetes Secret không | Có | Có | **Không** |
| Ứng dụng phải sửa code | Không | **Có** — phải đọc file | Có |

Ba lý do file an toàn hơn biến môi trường:

**Một — biến môi trường bị kế thừa.** Mọi tiến trình con sinh ra từ ứng dụng đều thấy `DB_PASSWORD`. Một thư viện gọi ra ngoài là bí mật đi theo.

**Hai — biến môi trường hay bị in ra log.** Rất nhiều framework in toàn bộ môi trường khi có lỗi khởi động. Đó là cách mật khẩu production đi vào hệ thống log tập trung.

**Ba — `hostPID: true` ở Pod khác đọc được.** Như đã nói ở [Phase 17 bài 2](../phase-17/02-daemonset.md), một DaemonSet có `hostPID` đọc được `/proc/<pid>/environ` của **mọi** Pod trên node.

> **Khuyến nghị**: dùng **file (volume)** cho bí mật thật. Dùng biến môi trường cho cấu hình không nhạy cảm.

---

## Secret đổi thì Pod có biết không

Đây là chỗ gây bất ngờ:

```text
   Gắn bằng BIẾN MÔI TRƯỜNG
   → Secret đổi → Pod KHÔNG BIẾT GÌ, vẫn dùng giá trị cũ MÃI MÃI
   → Phải khởi động lại Pod

   Gắn bằng VOLUME
   → Secret đổi → kubelet cập nhật file trong ~60 giây
   → NHƯNG ứng dụng phải TỰ ĐỌC LẠI file
   → Đa số ứng dụng đọc file một lần lúc khởi động → vẫn không biết
```

Ba cách xử lý:

```yaml
# Cách 1 — buộc Deployment tạo Pod mới khi Secret đổi
# (Reloader tự thêm annotation này)
metadata:
  annotations:
    reloader.stakater.com/auto: "true"
```

```yaml
# Cách 2 — băm nội dung Secret vào annotation của Pod template (Helm)
    metadata:
      annotations:
        checksum/secret: {{ include (print $.Template.BasePath "/secret.yaml") . | sha256sum }}
```

Cách 2 làm Pod template đổi mỗi khi Secret đổi → Kubernetes tự tạo Pod mới. Đây là mẫu chuẩn trong Helm chart.

Cách 3 là tốt nhất nhưng cần sửa ứng dụng: **theo dõi file và nạp lại**. Ví dụ với Spring Boot là `spring-cloud-kubernetes` với `reload.enabled: true`.

---

## Xoay vòng bí mật — quy trình an toàn

Đổi mật khẩu database không phải chuyện đơn giản: đổi ở database rồi cập nhật Secret thì có một khoảng thời gian ứng dụng dùng mật khẩu cũ và bị từ chối.

```text
   QUY TRÌNH ĐÚNG — "hai khoá cùng hợp lệ"
   ═══════════════════════════════════════

   1. Tạo mật khẩu MỚI ở database, GIỮ NGUYÊN mật khẩu cũ
      → giờ có HAI mật khẩu cùng hoạt động

   2. Cập nhật Secret trong Kubernetes sang mật khẩu mới

   3. Khởi động lại lần lượt các Pod (rolling restart)
      kubectl rollout restart deployment/myapp

   4. XÁC NHẬN mọi Pod đã dùng mật khẩu mới
      (kiểm tra log kết nối ở database)

   5. CHỈ KHI ĐÓ mới thu hồi mật khẩu cũ
```

Bỏ qua bước 1 và 5 là nguyên nhân của sự cố "đổi mật khẩu xong cả hệ thống mất kết nối".

Với External Secrets + AWS Secrets Manager, bước 1–2 được tự động hoá bằng Lambda xoay vòng, và bước 3 vẫn phải làm (hoặc dùng Reloader).

---

## Kiểm toán ai đọc Secret

```yaml
# Audit policy của API server
apiVersion: audit.k8s.io/v1
kind: Policy
rules:
  - level: Metadata                    # ghi AI đọc, KHÔNG ghi nội dung
    resources:
      - group: ""
        resources: ["secrets"]
    verbs: ["get", "list", "watch"]
```

```bash
# Tìm ai đã đọc secret trong 24 giờ qua
grep '"resource":"secrets"' /var/log/kubernetes/audit.log \
  | jq -r 'select(.verb=="get" or .verb=="list")
           | "\(.requestReceivedTimestamp) \(.user.username) \(.objectRef.name)"' \
  | sort | uniq -c | sort -rn | head
```

> **Quan trọng**: đặt `level: Metadata`, **không** đặt `RequestResponse` — nếu không thì **nội dung secret sẽ nằm nguyên văn trong audit log**, biến log thành một chỗ rò rỉ mới.

---

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Tưởng base64 là mã hoá | Bí mật lộ hoàn toàn với bất kỳ ai đọc được manifest |
| Commit Secret vào Git | Lộ vĩnh viễn — **xoá commit không đủ**, phải coi như đã lộ và xoay vòng |
| Không bật mã hoá etcd | **Bản sao lưu etcd chứa mọi mật khẩu nguyên văn** |
| Bật mã hoá etcd nhưng quên ghi lại secret cũ | Secret cũ **vẫn ở dạng thô** |
| Dùng biến môi trường cho bí mật | Lộ qua `/proc/environ`, qua log lỗi, qua tiến trình con |
| Tưởng Secret đổi thì Pod tự cập nhật | Với biến môi trường thì **không bao giờ** cập nhật |
| Xoay vòng mật khẩu mà không có giai đoạn hai khoá | **Cả hệ thống mất kết nối** trong lúc chuyển |
| Không sao lưu khoá riêng của Sealed Secrets | Dựng lại cụm là **mọi SealedSecret thành rác** |
| Cấp `list secrets` rộng rãi | Đọc được toàn bộ nội dung — xem [bài 2](02-rbac-va-serviceaccount.md) |
| Audit `level: RequestResponse` cho secret | **Nội dung secret nằm nguyên văn trong log** |
| Dùng ConfigMap cho dữ liệu nhạy cảm | Không có cả ba lớp bảo vệ tối thiểu của Secret |

---

## Tóm tắt bài 3

- **Base64 không phải mã hoá.** `kubectl get secret -o jsonpath | base64 -d` là đủ để đọc mọi thứ.
- Secret hơn ConfigMap ở **ba điểm**: chỉ gửi tới node cần, gắn dưới dạng tmpfs (RAM), không hiện trong `describe`. Nhưng nó **lưu trong etcd ở dạng thô** — nghĩa là **bản sao lưu etcd chứa mọi mật khẩu nguyên văn**.
- **Lớp 1 — bật mã hoá etcd.** Sau khi bật phải **ghi lại mọi Secret cũ** (`kubectl get secrets -A -o json | kubectl replace -f -`). `aescbc` giữ khoá **trên node control-plane**; muốn tách khoá ra ngoài thì dùng **KMS provider**.
- **Lớp 2 — không đưa Secret vào Git.** **Sealed Secrets** cho đội nhỏ (nhưng **phải sao lưu khoá riêng**, mất là mất hết). **External Secrets Operator** cho production — vì nó là cách duy nhất có **xoay vòng tự động**.
- **Dùng file (volume) thay vì biến môi trường** cho bí mật thật. Biến môi trường **bị kế thừa bởi tiến trình con**, **hay bị in ra log lỗi**, và **đọc được từ Pod khác có `hostPID`**.
- **Secret đổi thì Pod không tự biết**: biến môi trường **không bao giờ** cập nhật; volume cập nhật file sau ~60 giây nhưng **ứng dụng phải tự đọc lại**. Dùng **Reloader** hoặc **checksum annotation** trong Helm.
- **Xoay vòng phải có giai đoạn hai khoá cùng hợp lệ**: tạo mật khẩu mới → cập nhật Secret → rolling restart → **xác nhận** → mới thu hồi mật khẩu cũ.
- Bật audit cho `secrets` ở **`level: Metadata`** — đặt `RequestResponse` sẽ ghi **nội dung secret nguyên văn vào log**.

**Bài kế tiếp** → [Bài 4: NetworkPolicy và Pod Security — tổng kết Phase 19](04-networkpolicy-va-tong-ket.md)
