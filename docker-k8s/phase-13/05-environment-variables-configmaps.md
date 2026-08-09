# Bài 5: Environment Variables & ConfigMaps

## Environment Variables Cơ Bản

Trong container spec, dùng `env` key:

```yaml
containers:
  - name: my-app
    image: my-image
    env:
      - name: STORY_FOLDER       # Tên env var
        value: story             # Giá trị

      - name: NODE_ENV
        value: production

      - name: PORT
        value: "3000"            # Strings cần dùng quotes
```

### Trong Code (Node.js)

```javascript
// Trước: hard-coded
const folder = 'story';

// Sau: dùng env var
const folder = process.env.STORY_FOLDER;
```

---

## Vấn Đề: Env Vars Hard-coded trong YAML

```text
Vấn đề:
  → Nhiều Deployments dùng cùng env vars
  → Phải update nhiều files khi thay đổi
  → Khó quản lý, dễ sai sót

Giải pháp: ConfigMap
  → Tách env vars ra thành resource riêng
  → Nhiều Deployments có thể reference cùng 1 ConfigMap
  → Chỉ cần update 1 chỗ
```

---

## ConfigMap — Resource Quản Lý Config

### Tạo ConfigMap

```yaml
# environment.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: data-store-env      # Tên ConfigMap

data:                        # Không dùng "spec", dùng "data"
  folder: story              # key: value
  database: my-db
  port: "3000"
```

```bash
kubectl apply -f environment.yaml
kubectl get configmap
kubectl describe configmap data-store-env
```

```text
Name: data-store-env
Data
====
folder:  5 bytes
```

### Dùng ConfigMap trong Container

```yaml
containers:
  - name: my-app
    env:
      - name: STORY_FOLDER        # Tên env var trong container
        valueFrom:
          configMapKeyRef:
            name: data-store-env  # Tên ConfigMap
            key: folder           # Key trong ConfigMap data
```

---

## Toàn Bộ Flow

```text
ConfigMap (data-store-env):
  data:
    folder: story

Deployment:
  env:
    - name: STORY_FOLDER
      valueFrom:
        configMapKeyRef:
          name: data-store-env
          key: folder

Container chạy với:
  STORY_FOLDER=story
```

---

## Nhiều Env Vars từ ConfigMap

```yaml
# Cách 1: Lấy từng key
env:
  - name: STORY_FOLDER
    valueFrom:
      configMapKeyRef:
        name: data-store-env
        key: folder

  - name: DB_NAME
    valueFrom:
      configMapKeyRef:
        name: data-store-env
        key: database

# Cách 2: Lấy tất cả keys từ ConfigMap (prefix optional)
envFrom:
  - configMapRef:
      name: data-store-env
    # Keys từ ConfigMap trở thành env vars với tên gốc
```

---

## ConfigMap vs Hard-coded env

| | Hard-coded value | ConfigMap |
|---|---|---|
| **Cú pháp** | `value: story` | `valueFrom: configMapKeyRef...` |
| **Reuse** | Không | Nhiều Deployments |
| **Update** | Phải edit nhiều files | Chỉ edit ConfigMap |
| **Git-friendly** | OK | Tốt hơn (tách config) |
| **Use case** | Đơn giản | Production, nhiều services |

---

## Secrets (Tương Tự ConfigMap)

Cho sensitive data (passwords, API keys):

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: my-secret
type: Opaque
data:
  password: dGVzdDEyMw==     # Base64 encoded
```

```yaml
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: my-secret
        key: password
```

---

## Đổi ConfigMap rồi Pod có thấy không

Đây là câu hỏi ai cũng gặp, và câu trả lời **phụ thuộc cách bạn gắn nó**:

```text
   Gắn bằng BIẾN MÔI TRƯỜNG (envFrom, valueFrom)
   → Đổi ConfigMap → Pod KHÔNG BIẾT GÌ, mãi mãi
   → Biến môi trường được đặt MỘT LẦN lúc tiến trình khởi động
   → Phải tạo lại Pod

   Gắn bằng VOLUME
   → Đổi ConfigMap → kubelet cập nhật file sau ~60 giây
   → NHƯNG ứng dụng phải TỰ ĐỌC LẠI file
   → Đa số ứng dụng đọc cấu hình một lần lúc khởi động → vẫn không biết
```

Kiểm chứng phần cập nhật file:

```bash
kubectl create configmap app-config --from-literal=log_level=INFO
# ... gắn vào Pod dưới dạng volume ở /etc/config ...

kubectl exec my-pod -- cat /etc/config/log_level     # INFO

kubectl create configmap app-config --from-literal=log_level=DEBUG \
  --dry-run=client -o yaml | kubectl apply -f -

sleep 70
kubectl exec my-pod -- cat /etc/config/log_level     # DEBUG  ← file ĐÃ đổi
```

File đổi, nhưng ứng dụng vẫn dùng `INFO` nếu nó chỉ đọc lúc khởi động.

Ba cách xử lý, theo thứ tự đơn giản dần:

```yaml
# Cách 1 — băm nội dung ConfigMap vào annotation của Pod template
# Đổi ConfigMap → checksum đổi → Pod template đổi → Kubernetes tự tạo Pod mới
    metadata:
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
```

```bash
# Cách 2 — buộc tạo lại Pod bằng tay
kubectl rollout restart deployment/myapp
```

```yaml
# Cách 3 — dùng Reloader tự làm việc đó
metadata:
  annotations:
    reloader.stakater.com/auto: "true"
```

Cách tốt nhất nhưng cần sửa ứng dụng: **theo dõi file và nạp lại cấu hình khi nó đổi**. Spring Boot có `spring-cloud-kubernetes` với `reload.enabled: true`.

### `envFrom` — tiện nhưng có bẫy

```yaml
envFrom:
  - configMapRef:
      name: app-config          # nạp TẤT CẢ key thành biến môi trường
```

Ba điều cần biết:

| Điều | Chi tiết |
|---|---|
| Key không hợp lệ **bị bỏ qua im lặng** | Key `app.log.level` không thành biến môi trường được (có dấu chấm) → Kubernetes **bỏ qua**, không báo lỗi |
| ConfigMap không tồn tại → Pod **không khởi động** | Kẹt ở `CreateContainerConfigError`. Thêm `optional: true` nếu chấp nhận thiếu |
| Không kiểm soát được tên biến | Muốn đổi tên thì phải dùng `valueFrom` từng biến |

```bash
# Chẩn đoán khi Pod kẹt
kubectl describe pod my-pod | grep -A3 "Warning"
```

```text
  Warning  Failed  10s  kubelet  Error: configmap "app-config" not found
```

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| Đổi ConfigMap rồi mong Pod tự cập nhật | Với biến môi trường thì **không bao giờ** cập nhật | `rollout restart`, checksum annotation, hoặc Reloader |
| Dùng ConfigMap cho mật khẩu | ConfigMap **không được bảo vệ gì cả**, ai có quyền đọc namespace là thấy | Dùng Secret — và xem [Phase 19 bài 3](../phase-19/03-secret-that-su-an-toan.md) về giới hạn của nó |
| Key có dấu chấm trong `envFrom` | **Bị bỏ qua im lặng**, biến không tồn tại | Dùng `valueFrom` với tên biến tường minh |
| ConfigMap chưa tạo mà Pod đã apply | Pod kẹt `CreateContainerConfigError` | Tạo ConfigMap trước, hoặc `optional: true` |
| Gắn ConfigMap đè lên thư mục có sẵn file | Thư mục đó **chỉ còn** file của ConfigMap | Dùng `subPath` để gắn từng file |
| Nhét file lớn vào ConfigMap | Giới hạn **1 MB** (do etcd) | Dùng volume hoặc image |
| Sửa ConfigMap trực tiếp bằng `kubectl edit` | Lần `apply` sau ghi đè | Sửa file YAML trong Git |

Dòng "gắn đè lên thư mục" đáng vẽ ra vì nó phá ứng dụng theo cách khó hiểu:

```text
   Image có: /etc/nginx/conf.d/default.conf + mime.types + ...

   Gắn ConfigMap vào /etc/nginx/conf.d
   → thư mục đó giờ CHỈ CÓ file của ConfigMap
   → mime.types BIẾN MẤT → nginx phục vụ sai kiểu nội dung

   Cách đúng — gắn ĐÚNG MỘT FILE:
   volumeMounts:
     - name: config
       mountPath: /etc/nginx/conf.d/default.conf
       subPath: default.conf
```

Lưu ý: dùng `subPath` thì file **không tự cập nhật** khi ConfigMap đổi — đánh đổi phải chấp nhận.

---

## Tóm tắt bài 5

- **ConfigMap cho cấu hình không nhạy cảm; Secret cho bí mật.** ConfigMap **không được bảo vệ gì cả**.
- **Đổi ConfigMap thì Pod không tự biết**: gắn bằng **biến môi trường** thì **không bao giờ** cập nhật; gắn bằng **volume** thì file đổi sau ~60 giây nhưng ứng dụng phải **tự đọc lại**.
- Ba cách xử lý: **checksum annotation** (Helm), **`kubectl rollout restart`**, hoặc **Reloader**.
- **`envFrom` bỏ qua im lặng** những key không hợp lệ làm tên biến môi trường (có dấu chấm). Và ConfigMap chưa tồn tại làm Pod kẹt `CreateContainerConfigError`.
- **Gắn ConfigMap vào một thư mục sẽ che toàn bộ file có sẵn** trong đó. Dùng **`subPath`** để gắn từng file — đổi lại là mất khả năng tự cập nhật.
- ConfigMap giới hạn **1 MB** (do etcd).

---

**Bài kế tiếp** → [Tổng Kết Phase 13 — Volumes & Persistent Data trong Kubernetes](06-tong-ket.md)
