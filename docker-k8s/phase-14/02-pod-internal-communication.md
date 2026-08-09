# Bài 2: Giao Tiếp Bên Trong Pod (Pod-internal)

## Kịch Bản: Nhiều Containers Trong 1 Pod

Đôi khi 2 containers cần giao tiếp chặt chẽ với nhau, ví dụ:
- **Users API** cần gọi **Auth API** để validate token
- Cả 2 đặt trong cùng 1 Pod (tight coupling)

```yaml
# users-deployment.yaml
spec:
  template:
    spec:
      containers:
        - name: users        # Container 1
          image: users-image
          ports:
            - containerPort: 8080

        - name: auth         # Container 2
          image: auth-image
          ports:
            - containerPort: 80
```

---

## localhost — Địa Chỉ Ma Thuật

Khi 2 containers trong **cùng 1 Pod**, chúng giao tiếp qua **`localhost`**:

```javascript
// users-api code - gọi auth-api
const AUTH_ADDRESS = process.env.AUTH_ADDRESS;

// Trong Kubernetes pod-internal:
// AUTH_ADDRESS = 'localhost'
// → gửi request đến localhost:80 (port của auth container)

axios.get(`http://${AUTH_ADDRESS}/verify`);
```

### Config Env Var trong Deployment

```yaml
containers:
  - name: users
    image: users-image
    env:
      - name: AUTH_ADDRESS
        value: localhost     # ← localhost vì cùng Pod

  - name: auth
    image: auth-image
```

---

## So Sánh với Docker Compose

```text
Docker Compose:
  services:
    users: ...
    auth: ...
  → Giao tiếp qua service name: "auth"
  → axios.get('http://auth/verify')

Kubernetes (same pod):
  → Giao tiếp qua localhost
  → axios.get('http://localhost/verify')

Kubernetes (different pods):
  → Giao tiếp qua ClusterIP service name (sẽ học ở bài tiếp)
```

---

## Service Expose Chỉ Public Container

```yaml
# users-service.yaml
spec:
  selector:
    app: users          # Chọn Pod có label app=users
  type: LoadBalancer
  ports:
    - port: 80
      targetPort: 8080  # Port của users container

# Không expose port 80 của auth container!
# Auth chỉ được gọi qua localhost từ bên trong Pod
```

```text
Internet → users-service → Pod:8080 (users container)
                               ↓ localhost:80
                           Pod:80 (auth container)
                           [Không accessible từ ngoài]
```

---

## Khi Nào Đặt 2 Containers Trong 1 Pod?

```text
✓ Dùng cùng 1 Pod khi:
  → Hai services phụ thuộc chặt chẽ
  → Luôn cần scale cùng nhau
  → Cần chia sẻ volumes
  → Cần localhost communication

✗ Không nên dùng 1 Pod khi:
  → Hai services có thể scale độc lập
  → Một service có thể dùng bởi nhiều services khác
  → Muốn kiểm soát lifecycle riêng biệt

→ Thường tốt hơn là dùng 2 Deployments riêng
  + ClusterIP service để communicate
```

---

## 2/2 — Xem Trạng Thái

```bash
kubectl get pods
# NAME                              READY   STATUS
# users-deployment-xxx-yyy          2/2     Running
#                                   ↑
#                               2 containers trong 1 Pod
```

---

## Vì sao `localhost` hoạt động — và ranh giới của nó

Container trong cùng Pod gọi nhau qua `localhost` không phải phép màu. Nó đến từ một cơ chế cụ thể:

```text
   ┌──────────────────── POD ────────────────────┐
   │                                              │
   │  Kubernetes tạo TRƯỚC một container ẩn      │
   │  ("pause container") giữ chỗ mạng.          │
   │  Mọi container của Pod NHẬP VÀO mạng đó.    │
   │                                              │
   │  ┌────────────┐        ┌────────────────┐   │
   │  │ app        │        │ log-collector  │   │
   │  │ cổng 8080  │        │ cổng 9000      │   │
   │  └─────┬──────┘        └────────┬───────┘   │
   │        └──── CÙNG một ─────────┘            │
   │             không gian mạng                  │
   │             CÙNG một IP: 10.244.1.5          │
   │                                              │
   │  → app gọi localhost:9000 tới log-collector │
   └──────────────────────────────────────────────┘
```

Hai container **chung một địa chỉ IP và chung một dải cổng** — giống hệt hai tiến trình chạy trên cùng một máy.

Hệ quả trực tiếp mà nhiều người gặp:

```text
   Hai container trong CÙNG Pod cùng nghe cổng 8080
        → container thứ hai KHÔNG khởi động được
        → "bind: address already in use"

   Giống y như chạy hai nginx cùng cổng 80 trên một máy.
```

### Cái gì được chia sẻ, cái gì không

Đây là bảng cần nắm để biết sidecar làm được gì:

| Thứ | Chung trong Pod | Ghi chú |
|---|---|---|
| **Không gian mạng** | **Có** | Cùng IP, cùng dải cổng, gọi nhau qua `localhost` |
| **Volume** | **Có** (nếu cùng khai `volumeMounts`) | Cách chia sẻ file giữa các container |
| Hệ thống file gốc | **Không** | Mỗi container có image riêng, `/app` của cái này khác cái kia |
| Không gian tiến trình | **Không** (mặc định) | Bật bằng `shareProcessNamespace: true` |
| Biến môi trường | **Không** | Khai riêng cho từng container |

Hai dòng đầu là toàn bộ cơ sở của mẫu **sidecar**: chung mạng để gọi nhau, chung volume để trao đổi file.

```yaml
spec:
  volumes:
    - name: logs
      emptyDir: {}                 # ổ đĩa chung
  containers:
    - name: app
      volumeMounts:
        - name: logs
          mountPath: /var/log/app  # app GHI vào đây
    - name: log-shipper
      volumeMounts:
        - name: logs
          mountPath: /logs         # sidecar ĐỌC từ đây
```

Chú ý `mountPath` **khác nhau** ở hai container — vì hệ thống file gốc không chung, chỉ có **volume** mới chung.

### `initContainer` — chạy trước, xong rồi mới tới container chính

```yaml
spec:
  initContainers:
    - name: cho-database
      image: busybox:1.36
      command: ['sh', '-c', 'until nc -z postgres 5432; do echo cho...; sleep 2; done']
  containers:
    - name: app
      image: myapp:v1
```

```text
   initContainer chạy TUẦN TỰ, phải THÀNH CÔNG (thoát mã 0)
   → rồi container chính mới bắt đầu

   Nhiều initContainer → chạy lần lượt, cái này xong mới tới cái kia
```

Ba việc `initContainer` làm tốt:

| Việc | Ví dụ |
|---|---|
| **Chờ phụ thuộc sẵn sàng** | Chờ database mở cổng trước khi ứng dụng khởi động |
| **Chuẩn bị dữ liệu** | Tải cấu hình, clone repo, giải nén tài nguyên vào volume chung |
| **Đặt quyền file** | `chown` thư mục volume cho user không phải root của app |

> **Lưu ý về migration database**: đừng đặt migration vào `initContainer` của Deployment — **mọi Pod đều chạy nó**, và ba Pod chạy migration cùng lúc sẽ tranh chấp schema. Dùng **Job** riêng chạy trước ([Phase 17 bài 4](../phase-17/04-chon-workload-va-tong-ket.md)).

---

## Bẫy thường gặp

| Bẫy | Triệu chứng | Cách xử lý |
|---|---|---|
| Hai container cùng Pod nghe cùng một cổng | `bind: address already in use` | Đổi cổng — chúng chung dải cổng như hai tiến trình một máy |
| Mong container này thấy file của container kia | Không thấy gì | Hệ thống file gốc **không chung**. Phải qua **volume** |
| Nhét ứng dụng **không liên quan** vào cùng Pod | Phải scale cùng nhau, chết cùng nhau | Mỗi ứng dụng một Deployment riêng |
| Đặt migration vào `initContainer` | Ba Pod chạy migration cùng lúc → tranh chấp schema | Dùng **Job** riêng |
| `initContainer` không bao giờ thoát | Pod kẹt mãi ở `Init:0/1` | Lệnh trong đó phải **kết thúc**, không được chạy liên tục |
| Quên rằng `initContainer` thất bại thì Pod restart cả cụm | Vòng lặp khởi động lại | Kiểm tra `kubectl logs <pod> -c <ten-init>` |
| Dùng `localhost` để gọi Pod **khác** | Không kết nối được | `localhost` chỉ trong **cùng Pod**. Pod khác thì qua Service |

---

## Tóm tắt bài 2

- Container trong cùng Pod **chung không gian mạng** — cùng IP, cùng dải cổng — nên gọi nhau qua **`localhost`**. Hệ quả: **hai container không được nghe cùng một cổng**.
- **Volume là thứ chung thứ hai**, và là cách duy nhất chia sẻ file. **Hệ thống file gốc không chung** — nên `mountPath` ở hai container có thể khác nhau.
- Mạng chung + volume chung = toàn bộ cơ sở của mẫu **sidecar**.
- **`initContainer` chạy tuần tự và phải thoát mã 0** trước khi container chính bắt đầu. Hợp cho: chờ phụ thuộc, chuẩn bị dữ liệu, đặt quyền file.
- **Đừng đặt migration database vào `initContainer`** — mọi Pod đều chạy nó. Dùng Job riêng.
- Lệnh trong `initContainer` phải **kết thúc**; chạy liên tục sẽ làm Pod kẹt mãi ở `Init:0/1`.

---

**Bài kế tiếp** → [Bài 3: Giao Tiếp Giữa Các Pods (Pod-to-Pod)](03-pod-to-pod-communication.md)
