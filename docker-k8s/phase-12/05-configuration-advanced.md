# Bài 5: Cấu Hình Nâng Cao — Liveness Probes & Image Pull Policy

## Liveness Probes — Kiểm Tra Sức Khỏe Container

Mặc định, Kubernetes tự phát hiện container crash và restart. Nhưng bạn có thể **tùy chỉnh cách kiểm tra** sức khỏe container.

### Cấu Hình trong YAML

```yaml
containers:
  - name: my-app-container
    image: USERNAME/my-app:v1
    ports:
      - containerPort: 8080
    livenessProbe:
      httpGet:
        path: /          # Đường dẫn để gửi GET request
        port: 8080       # Port của container
      periodSeconds: 3         # Kiểm tra mỗi 3 giây
      initialDelaySeconds: 5   # Đợi 5 giây trước khi kiểm tra lần đầu
```

### Cách Hoạt Động

```text
Pod đang chạy
  │
  ├── Sau 5 giây (initialDelaySeconds)
  ▼
Kubernetes gửi GET /
  ├── 200 OK → Container healthy ✓
  ├── Sau 3 giây (periodSeconds) → gửi lại
  └── Không phản hồi / Error → Container unhealthy → Restart!
```

### Các Loại Probe

```yaml
# httpGet — gửi HTTP GET request (phổ biến nhất)
livenessProbe:
  httpGet:
    path: /health
    port: 8080
    httpHeaders:          # Optional headers
      - name: Custom-Header
        value: Awesome

# tcpSocket — kiểm tra TCP connection
livenessProbe:
  tcpSocket:
    port: 3306

# exec — chạy command trong container
livenessProbe:
  exec:
    command:
      - cat
      - /tmp/healthy
```

### Khi Nào Cần Liveness Probe?

```text
Mặc định (không cần config):
  → Kubernetes detect khi container exit/crash
  → Đủ cho hầu hết trường hợp

Nên thêm Liveness Probe khi:
  → App có thể bị "frozen" (không crash nhưng không response)
  → Muốn check sức khỏe qua endpoint cụ thể (/health, /ready)
  → App cần thời gian khởi động lâu (dùng initialDelaySeconds)
```

---

## Image Pull Policy — Khi Nào Pull Image Mới

### Vấn Đề

```text
kubectl set image deployment/my-app my-app=USERNAME/my-app:v2

Nếu tag KHÔNG đổi (vẫn là :v1):
  → Kubernetes KHÔNG pull image mới (dùng cache)
  → Code mới không được apply!
```

### 3 Giá Trị của imagePullPolicy

```yaml
containers:
  - name: my-app
    image: USERNAME/my-app:v1
    imagePullPolicy: Always   # Luôn pull từ registry

# Always:       Luôn pull image mới (ngay cả khi tag không đổi)
# IfNotPresent: Chỉ pull nếu image chưa có trên node (mặc định)
# Never:        Không bao giờ pull (chỉ dùng image local)
```

### Khi Nào Dùng Cái Nào?

```text
Always:
  ✓ Dùng :latest tag hoặc không có tag
  ✓ Development: muốn luôn có code mới nhất
  ✗ Production: chậm hơn, tốn bandwidth

IfNotPresent (mặc định):
  ✓ Production với versioned tags (:v1, :v2, :1.0.0)
  ✓ Tiết kiệm bandwidth
  ✓ Nên đổi tag khi deploy version mới

Never:
  ✓ Air-gapped environments (không có internet)
  ✓ Đã pre-load image vào nodes
```

### Best Practice Tagging

```bash
# ✓ ĐÚNG: Đổi tag mỗi khi có thay đổi
docker build -t USERNAME/my-app:v2 .
docker push USERNAME/my-app:v2
kubectl set image deployment/my-app my-app=USERNAME/my-app:v2

# ✗ SAI: Dùng cùng tag → Kubernetes không pull lại
docker build -t USERNAME/my-app:v1 .  # Code mới nhưng tag cũ
docker push USERNAME/my-app:v1
kubectl set image deployment/my-app my-app=USERNAME/my-app:v1
# → Kubernetes nói "đã có v1 rồi, không cần pull"
```

---

## Tổng Hợp Cấu Hình Container

```yaml
containers:
  - name: my-app-container
    image: USERNAME/my-app:v2
    imagePullPolicy: Always

    # Ports
    ports:
      - containerPort: 8080

    # Environment variables
    env:
      - name: NODE_ENV
        value: production

    # Resource requests/limits
    resources:
      requests:
        memory: "64Mi"
        cpu: "250m"
      limits:
        memory: "128Mi"
        cpu: "500m"

    # Health check
    livenessProbe:
      httpGet:
        path: /
        port: 8080
      periodSeconds: 10
      initialDelaySeconds: 5
```

---

## Namespaces — Tổ Chức Resources

```bash
# Xem namespaces
kubectl get namespaces
# → default      Active   (namespace mặc định)
# → kube-system  Active   (Kubernetes system components)

# Xem resources trong namespace cụ thể
kubectl get pods -n kube-system

# Tạo resource trong namespace khác
kubectl apply -f deployment.yaml -n my-namespace

# Trong YAML:
metadata:
  name: my-app
  namespace: my-namespace    # Nếu không có → dùng "default"
```

**Dùng Namespaces để:**
- Phân tách development / staging / production trên cùng cluster
- Phân quyền cho các teams khác nhau
- Tránh tên bị trùng giữa các apps

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách xử lý |
|---|---|---|
| **`livenessProbe` kiểm tra database** | Database chậm → **mọi Pod bị giết** dù chúng hoàn toàn khoẻ | Liveness chỉ kiểm tra **chính tiến trình đó**. Phụ thuộc bên ngoài để `readinessProbe` lo — xem [Phase 18 bài 2](../phase-18/02-probes-va-bay-liveness.md) |
| Chỉ có `livenessProbe`, không có `readinessProbe` | Traffic vào Pod chưa sẵn sàng → **502 mỗi lần deploy** | Luôn có readiness |
| `initialDelaySeconds` quá ngắn cho ứng dụng Java | **Vòng lặp chết** — Pod bị giết trước khi kịp khởi động | Dùng **`startupProbe`** thay vì kéo dài `initialDelaySeconds` |
| `timeoutSeconds: 1` (mặc định) | Pod bị giết oan khi tải cao → **sập dây chuyền** | Đặt 3–5 giây |
| `imagePullPolicy: Always` với tag cụ thể | Tải image mỗi lần tạo Pod, chậm và tốn băng thông | `IfNotPresent` khi đã ghim tag |
| Dùng tag `latest` trong Kubernetes | Kubernetes ngầm đặt `imagePullPolicy: Always`; và **hai Pod có thể chạy hai image khác nhau** | Luôn ghim tag cụ thể |
| Quên `namespace` trong lệnh `kubectl` | Thao tác nhầm vào `default` | `kubectl config set-context --current --namespace=<tên>` |
| Xoá namespace để "dọn dẹp" | **Xoá sạch mọi thứ bên trong**, kể cả PVC và dữ liệu | Kiểm tra `kubectl get all -n <tên>` trước |

Dòng đầu tiên đáng nhấn mạnh vì nó là cách một cụm **tự giết chính mình**:

```text
   Tải tăng đột biến → /health (có gọi database) chậm từ 50ms lên 4 giây
        │
        ▼
   livenessProbe timeout 1 giây → THẤT BẠI 3 lần → Kubernetes GIẾT Pod
        │
        ▼
   Pod còn lại gánh nhiều hơn → CHẬM HƠN → cũng bị giết
        │
        ▼
   TOÀN BỘ dịch vụ sập — trong khi nếu KHÔNG có livenessProbe
   thì hệ thống chỉ chậm rồi tự hồi phục khi tải giảm
```

Quy tắc gọn:

```text
   livenessProbe   → "TIẾN TRÌNH này còn chạy không?"    (không hỏi gì bên ngoài)
   readinessProbe  → "tôi PHỤC VỤ ĐƯỢC lúc này không?"   (được phép hỏi database)
   startupProbe    → "đã khởi động xong chưa?"           (tạm dừng hai cái trên)
```

---

## Tóm tắt bài 5

- **Ba loại probe, ba hậu quả khác nhau**: `readinessProbe` **gỡ Pod khỏi Service** (an toàn), `livenessProbe` **giết Pod** (nguy hiểm), `startupProbe` tạm dừng hai cái kia trong lúc khởi động.
- **`livenessProbe` không được kiểm tra phụ thuộc bên ngoài.** Nếu có, database chậm sẽ làm **mọi Pod bị giết** và gây sập dây chuyền.
- Ứng dụng khởi động lâu (Java, .NET) thì dùng **`startupProbe`**, không kéo dài `initialDelaySeconds`.
- `timeoutSeconds` mặc định là **1 giây** — quá chặt cho hầu hết ứng dụng thật.
- **`imagePullPolicy`**: `IfNotPresent` khi đã ghim tag cụ thể; `Always` chỉ khi buộc phải dùng tag hay thay đổi. Dùng tag `latest` khiến Kubernetes ngầm đặt `Always`, và **hai Pod có thể chạy hai image khác nhau**.
- **Namespace tách môi trường và phân quyền.** Xoá namespace là **xoá sạch mọi thứ bên trong** — kiểm tra `kubectl get all -n <tên>` trước.

---

**Bài kế tiếp** → [Tổng Kết Phase 12 — Kubernetes Core Concepts](06-tong-ket.md)
