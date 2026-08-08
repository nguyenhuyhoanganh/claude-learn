# Bài 2: RBAC và ServiceAccount — ai được làm gì trong cụm

Câu hỏi kiểm tra nhanh: Pod ứng dụng web của bạn — thứ chỉ cần trả về HTML — có quyền gì trong cụm Kubernetes?

Nếu bạn chưa từng cấu hình gì, câu trả lời có thể là: **nó đang mang theo một token có thể gọi API server**. Bài này chỉ ra điều đó nguy hiểm thế nào và cách siết lại.

---

## Bốn khái niệm, hai cặp

```text
   AI (chủ thể)                    ĐƯỢC LÀM GÌ (quyền)
   ═══════════                     ══════════════════

   User          ─┐                ┌─ Role         (trong 1 namespace)
   Group         ─┼── gắn với ───► ┤
   ServiceAccount ┘                └─ ClusterRole  (toàn cụm)
                       ▲
                       │
              RoleBinding / ClusterRoleBinding
```

| Khái niệm | Là gì |
|---|---|
| **ServiceAccount** | Danh tính **của Pod** — thứ ứng dụng dùng để gọi API server |
| **Role** | Tập quyền, **giới hạn trong một namespace** |
| **ClusterRole** | Tập quyền, **toàn cụm** hoặc cho tài nguyên cấp cụm (node, PV) |
| **RoleBinding** | Gắn Role (hoặc ClusterRole) cho chủ thể, **trong một namespace** |
| **ClusterRoleBinding** | Gắn ClusterRole cho chủ thể, **trên toàn cụm** |

> **Lưu ý về User**: Kubernetes **không có đối tượng User**. Danh tính người dùng đến từ bên ngoài — chứng chỉ client, OIDC, hoặc IAM của cloud. Bạn chỉ tham chiếu tới tên của họ trong binding.

---

## Mặc định nguy hiểm: token tự động gắn vào mọi Pod

```bash
kubectl exec myapp-xxx -- ls /var/run/secrets/kubernetes.io/serviceaccount/
```

```text
ca.crt
namespace
token          ← token JWT gọi được API server
```

Mọi Pod, kể cả web server tĩnh, đều được gắn token của ServiceAccount `default` trong namespace của nó.

```text
   RỦI RO THẬT
   ═══════════
   Ứng dụng của bạn có lỗ hổng SSRF hoặc RCE
        │
        ▼
   Kẻ tấn công đọc /var/run/secrets/.../token
        │
        ▼
   Dùng token đó gọi API server
        │
        ▼
   Quyền của ServiceAccount `default` là gì?
        ├─ Cụm cấu hình đúng  → gần như KHÔNG có quyền gì → an toàn
        └─ Ai đó lỡ gán quyền cho `default` → THẢM HOẠ
```

### Tắt gắn token khi không cần

```yaml
# Cách 1 — tắt cho từng Pod
spec:
  automountServiceAccountToken: false

# Cách 2 — tắt cho cả ServiceAccount (mọi Pod dùng nó)
apiVersion: v1
kind: ServiceAccount
metadata:
  name: myapp
automountServiceAccountToken: false
```

> **Quy tắc**: đại đa số ứng dụng **không bao giờ gọi API server**. Với chúng, `automountServiceAccountToken: false` là mặc định đúng — nó xoá sổ cả một lớp tấn công mà không tốn gì.

Kiểm tra nhanh toàn cụm:

```bash
kubectl get pods -A -o json | jq -r '
  .items[] | select(.spec.automountServiceAccountToken != false)
  | "\(.metadata.namespace)/\(.metadata.name)"' | head -20
```

---

## ServiceAccount riêng cho từng ứng dụng

Đừng dùng chung `default`:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: order-service
  namespace: production
automountServiceAccountToken: true      # ứng dụng này THẬT SỰ cần
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
spec:
  template:
    spec:
      serviceAccountName: order-service   # ← khai báo tường minh
```

Lợi ích: quyền được cấp **cho đúng ứng dụng đó**, và log kiểm toán cho biết chính xác ai đã gọi gì.

---

## Role và quyền

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: production
  name: doc-configmap
rules:
  - apiGroups: [""]                    # "" = core API group
    resources: ["configmaps"]
    verbs: ["get", "list", "watch"]

  - apiGroups: [""]
    resources: ["secrets"]
    resourceNames: ["db-credentials"]  # CHỈ secret CỤ THỂ này
    verbs: ["get"]

  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list"]
```

### Các động từ (verb)

| Verb | Nghĩa | Tương ứng lệnh |
|---|---|---|
| `get` | Đọc **một** đối tượng theo tên | `kubectl get pod myapp` |
| `list` | **Liệt kê** nhiều đối tượng | `kubectl get pods` |
| `watch` | Theo dõi thay đổi theo thời gian thực | controller dùng |
| `create` | Tạo mới | `kubectl create` |
| `update` | Sửa toàn bộ | `kubectl apply` |
| `patch` | Sửa một phần | `kubectl patch` |
| `delete` | Xoá | `kubectl delete` |
| `deletecollection` | Xoá hàng loạt | `kubectl delete pods --all` |

> **Bẫy `list` với Secret**: cấp `list` cho `secrets` nghĩa là **đọc được toàn bộ nội dung mọi secret trong namespace** — vì `list` trả về cả `data`. `resourceNames` **không hạn chế được `list`** (chỉ hạn chế `get`, `update`, `delete`). Nên nếu cần giới hạn secret cụ thể, chỉ cấp `get` và **tuyệt đối không cấp `list`**.

### Gắn quyền

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: order-service-doc-configmap
  namespace: production
subjects:
  - kind: ServiceAccount
    name: order-service
    namespace: production
roleRef:
  kind: Role
  name: doc-configmap
  apiGroup: rbac.authorization.k8s.io
```

---

## ClusterRole + RoleBinding — mẫu hay dùng nhất

Đây là kết hợp mà nhiều người bỏ lỡ:

```text
   ClusterRole + ClusterRoleBinding  →  quyền trên TOÀN CỤM
   ClusterRole + RoleBinding         →  quyền CHỈ trong namespace của binding
                                        (định nghĩa MỘT LẦN, dùng nhiều nơi)
   Role + RoleBinding                →  quyền trong một namespace
   Role + ClusterRoleBinding         →  KHÔNG HỢP LỆ
```

```yaml
# Định nghĩa MỘT LẦN cho cả cụm
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: doc-va-xem-log
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/log"]
    verbs: ["get", "list"]
---
# Gắn trong TỪNG namespace → quyền chỉ có hiệu lực ở đó
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: dev-doc-log
  namespace: team-a
subjects:
  - kind: Group
    name: team-a-developers
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole                    # dùng lại ClusterRole
  name: doc-va-xem-log
  apiGroup: rbac.authorization.k8s.io
```

Đây là cách chuẩn để định nghĩa "vai trò lập trình viên" một lần rồi gắn cho từng đội trong namespace của họ.

---

## Bốn ClusterRole có sẵn

```bash
kubectl get clusterroles | grep -E "^(cluster-admin|admin|edit|view)"
```

| ClusterRole | Quyền | Cảnh báo |
|---|---|---|
| **`view`** | Đọc hầu hết tài nguyên, **KHÔNG đọc Secret** | An toàn cho hầu hết người dùng |
| **`edit`** | Như `view` + sửa/xoá tài nguyên, **ĐỌC ĐƯỢC Secret** | Không phải "chỉ sửa chút" — đọc được mọi mật khẩu |
| **`admin`** | Như `edit` + quản RBAC **trong namespace** | Có thể tự nâng quyền của mình trong namespace |
| **`cluster-admin`** | **Toàn quyền mọi thứ** | Chỉ cấp cho rất ít người |

> **Hiểu nhầm nguy hiểm về `edit`**: nhiều đội cấp `edit` cho lập trình viên nghĩ rằng "chỉ cho sửa deployment thôi". Nhưng `edit` **đọc được Secret**, nghĩa là đọc được mật khẩu database, khoá API, chứng chỉ. Nếu cần cấp quyền sửa mà không lộ secret, phải tự viết ClusterRole loại `secrets` ra.

---

## Kiểm tra quyền — lệnh cần thuộc

```bash
# Tôi có làm được không?
kubectl auth can-i create deployments --namespace production

# Một ServiceAccount có làm được không?
kubectl auth can-i list secrets \
  --as=system:serviceaccount:production:order-service \
  --namespace production
```

```text
no
```

```bash
# Liệt kê MỌI thứ một ServiceAccount làm được — lệnh quan trọng nhất
kubectl auth can-i --list \
  --as=system:serviceaccount:production:order-service \
  --namespace production
```

```text
Resources          Non-Resource URLs   Resource Names     Verbs
configmaps         []                  []                 [get list watch]
secrets            []                  [db-credentials]   [get]
deployments.apps   []                  []                 [get list]
```

Bảng này là **bản kê khai quyền thật**. Chạy nó cho mọi ServiceAccount trong production, và nếu thấy dòng nào bạn không giải thích được thì đó là quyền thừa.

```bash
# Tìm mọi binding trỏ tới cluster-admin — kiểm toán quan trọng nhất
kubectl get clusterrolebindings -o json | jq -r '
  .items[] | select(.roleRef.name=="cluster-admin")
  | "\(.metadata.name): \(.subjects // [] | map(.kind + "/" + .name) | join(", "))"'
```

---

## Ba đường leo thang quyền

RBAC có những đường vòng mà không để ý sẽ vô hiệu hoá mọi thứ bạn siết.

### 1. Tạo Pod = chiếm ServiceAccount bất kỳ

```yaml
# Kẻ có quyền create pods trong namespace này
apiVersion: v1
kind: Pod
spec:
  serviceAccountName: admin-sa       # dùng SA có quyền cao
  containers:
    - name: x
      image: alpine
      command: ["sh","-c","cat /var/run/secrets/kubernetes.io/serviceaccount/token"]
```

> **Quyền `create pods` trong một namespace tương đương với quyền của ServiceAccount mạnh nhất trong namespace đó.** Đây là điều RBAC không tự chặn được — phải dùng admission policy để giới hạn ServiceAccount nào được dùng.

### 2. Đọc Secret của ServiceAccount khác

Cấp `get secrets` rộng rãi nghĩa là đọc được token của mọi ServiceAccount trong namespace (với Kubernetes cũ tạo secret token tự động).

### 3. `escalate` và `bind`

```yaml
# Kẻ có quyền này có thể TỰ TẠO Role với quyền cao hơn quyền của chính mình
rules:
  - apiGroups: ["rbac.authorization.k8s.io"]
    resources: ["roles", "clusterroles"]
    verbs: ["escalate", "bind"]        # gần như cluster-admin
```

Bình thường Kubernetes chặn việc tạo Role có quyền vượt quyền người tạo. `escalate` bỏ qua chặn đó.

---

## Cấp quyền cho ứng dụng thật sự cần API

Ví dụ: một controller cần theo dõi ConfigMap để nạp lại cấu hình.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata: {name: config-watcher, namespace: production}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata: {name: config-watcher, namespace: production}
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    resourceNames: ["app-config"]     # ĐÚNG MỘT configmap
    verbs: ["get", "watch"]
  # KHÔNG cấp "list" — watch cần list ở một số client,
  # nếu bắt buộc thì tách rule riêng và chấp nhận phạm vi rộng hơn
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: {name: config-watcher, namespace: production}
subjects:
  - kind: ServiceAccount
    name: config-watcher
    namespace: production
roleRef: {kind: Role, name: config-watcher, apiGroup: rbac.authorization.k8s.io}
```

Quy trình đúng khi cấp quyền:

```text
   1. Bắt đầu từ KHÔNG CÓ QUYỀN GÌ
   2. Chạy ứng dụng, đọc lỗi 403 trong log
   3. Cấp ĐÚNG quyền bị từ chối, phạm vi HẸP NHẤT
   4. Lặp lại tới khi chạy được
   5. kubectl auth can-i --list để xem lại bản kê khai cuối cùng
```

Đây là hướng ngược với cách phổ biến (cấp rộng rồi thu hẹp dần), và nó hiệu quả hơn nhiều — vì bước "thu hẹp dần" trên thực tế **không bao giờ xảy ra**.

---

## Danh sách kiểm tra RBAC

| Mục | Lệnh |
|---|---|
| Không ai ngoài admin có `cluster-admin` | `kubectl get clusterrolebindings -o wide \| grep cluster-admin` |
| ServiceAccount `default` không có quyền gì | `kubectl auth can-i --list --as=system:serviceaccount:default:default` |
| Pod không cần API đã tắt token | Kiểm tra `automountServiceAccountToken: false` |
| Mỗi ứng dụng có ServiceAccount riêng | Kiểm tra `serviceAccountName` trong Deployment |
| Không cấp `list secrets` rộng rãi | Rà mọi Role có `secrets` |
| Không ai có `escalate`/`bind` | `kubectl get clusterroles -o json \| jq '...escalate...'` |
| Đã bật audit log | Kiểm tra cấu hình API server |

---

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Để mặc định gắn token cho mọi Pod | Lỗ hổng ứng dụng → kẻ tấn công có token gọi API server |
| Dùng chung ServiceAccount `default` | Không truy vết được ai làm gì; dễ vô tình cấp quyền cho tất cả |
| Cấp `edit` nghĩ là "chỉ sửa chút" | **Đọc được mọi Secret** — mật khẩu, khoá API |
| Cấp `list` cho `secrets` | Đọc được **toàn bộ nội dung** mọi secret; `resourceNames` không chặn được `list` |
| Cấp `create pods` cho người ngoài đội vận hành | Tương đương quyền của ServiceAccount mạnh nhất namespace đó |
| Cấp `cluster-admin` "tạm thời để debug" | Không ai thu hồi. Kiểm toán 6 tháng sau thấy 30 người có |
| Dùng `Role` với `ClusterRoleBinding` | **Không hợp lệ**, im lặng không có tác dụng |
| Cấp quyền rộng rồi định thu hẹp sau | Bước thu hẹp **không bao giờ xảy ra** |
| Quên `apiGroups: [""]` cho tài nguyên core | Rule không khớp gì cả, và **không có lỗi** khi apply |
| Không kiểm toán ai có `cluster-admin` | Không biết bề mặt tấn công của mình |

Dòng áp chót đáng nói thêm: RBAC **không báo lỗi khi bạn viết rule không khớp tài nguyên nào**. `apiGroups: ["v1"]` cho `pods` là sai (phải là `[""]`), và nó apply thành công, im lặng không cấp quyền gì. Luôn kiểm chứng bằng `kubectl auth can-i`.

---

## Tóm tắt bài 2

- **Kubernetes không có đối tượng User** — danh tính người đến từ chứng chỉ, OIDC, hoặc IAM. **ServiceAccount là danh tính của Pod.**
- Mặc định **mọi Pod được gắn token** của ServiceAccount `default`. Lỗ hổng SSRF/RCE trong ứng dụng biến thành quyền gọi API server. Đại đa số ứng dụng nên đặt **`automountServiceAccountToken: false`**.
- Mỗi ứng dụng nên có **ServiceAccount riêng** — để cấp quyền đúng chỗ và để log kiểm toán truy được nguồn.
- **`ClusterRole` + `RoleBinding`** là mẫu mạnh mà nhiều người bỏ lỡ: định nghĩa vai trò **một lần**, gắn trong **từng namespace**. (`Role` + `ClusterRoleBinding` là **không hợp lệ**.)
- **`edit` đọc được Secret.** Cấp `edit` cho lập trình viên nghĩa là cho họ mọi mật khẩu database và khoá API.
- **`list` trên `secrets` trả về cả nội dung**, và **`resourceNames` không hạn chế được `list`** — chỉ hạn chế `get`/`update`/`delete`.
- Ba đường leo thang quyền RBAC không tự chặn: **`create pods`** (chiếm ServiceAccount bất kỳ trong namespace), **đọc secret của SA khác**, và **`escalate`/`bind`**.
- Quy trình cấp quyền đúng: **bắt đầu từ không có gì**, chạy, đọc lỗi 403, cấp đúng thứ bị từ chối. Hướng ngược lại ("cấp rộng rồi thu hẹp") thì bước thu hẹp **không bao giờ xảy ra**.
- Lệnh quan trọng nhất: **`kubectl auth can-i --list --as=system:serviceaccount:<ns>:<sa>`** — bản kê khai quyền thật của một ServiceAccount.
- **RBAC không báo lỗi khi rule viết sai** (ví dụ sai `apiGroups`). Luôn kiểm chứng bằng `kubectl auth can-i`.

**Bài kế tiếp** → [Bài 3: Secret không hề bí mật — mã hoá, xoay vòng, quản lý bên ngoài](03-secret-that-su-an-toan.md)
