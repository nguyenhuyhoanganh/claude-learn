# Bài 2: emptyDir và hostPath Volumes

## emptyDir — Volume Đơn Giản Nhất

### Cách Hoạt Động

```text
Khi Pod start:
  → Kubernetes tạo một folder MỚI và RỖNG
  → Tất cả containers trong Pod có thể dùng folder này

Khi container restart:
  → Data trong folder vẫn CÒN (vì Pod chưa bị xóa)

Khi Pod bị xóa:
  → folder bị xóa theo
```

### YAML Config

```yaml
spec:
  volumes:
    - name: story-volume
      emptyDir: {}         # {} = dùng default config

  containers:
    - name: my-app
      image: my-image
      volumeMounts:
        - name: story-volume
          mountPath: /app/story   # Folder trong container
```

### Hạn Chế của emptyDir

```text
Vấn đề với nhiều replicas:
  Pod 1 (replica 1)  →  emptyDir A (data của Pod 1)
  Pod 2 (replica 2)  →  emptyDir B (data của Pod 2)

  Request đến Pod 1 → lưu data vào A
  Request tiếp theo đến Pod 2 → KHÔNG thấy data của A!
  → Dữ liệu không được chia sẻ giữa các pods
```

---

## hostPath — Bind Mount vào Node

### Cách Hoạt Động

```text
Node (máy vật lý/VM chạy Kubernetes):
  /data/                   ← hostPath trỏ vào đây
  └── my-story.txt

  Pod 1 → mountPath:/app/story → Node:/data/
  Pod 2 → mountPath:/app/story → Node:/data/

  → Cả 2 pods chia sẻ cùng 1 folder trên Node!
```

### YAML Config

```yaml
spec:
  volumes:
    - name: story-volume
      hostPath:
        path: /data                # Đường dẫn trên Node
        type: DirectoryOrCreate    # Tạo nếu chưa tồn tại

  containers:
    - name: my-app
      image: my-image
      volumeMounts:
        - name: story-volume
          mountPath: /app/story
```

### type Options cho hostPath

```text
DirectoryOrCreate  → Tạo folder nếu chưa tồn tại
Directory          → Folder phải đã tồn tại
FileOrCreate       → Tạo file nếu chưa tồn tại
File               → File phải đã tồn tại
```

### Hạn Chế của hostPath

```text
Multi-node cluster:
  Node 1 → /data/ (có data)
  Node 2 → /data/ (KHÔNG có data, hoặc data khác)

  Pod A → chạy trên Node 1 → đọc được data
  Pod B → chạy trên Node 2 → KHÔNG thấy data của Node 1!

  Kubernetes tự quyết định Pod chạy trên Node nào
  → Không đảm bảo pod luôn ở cùng 1 node
```

**hostPath chỉ tốt cho:**
- Development với minikube (1 node duy nhất)
- Chia sẻ dữ liệu giữa pods trên cùng 1 node
- Pre-existing data cần đưa vào container

---

## So Sánh emptyDir vs hostPath

| | emptyDir | hostPath |
|---|---|---|
| **Data khi Pod xóa** | Mất | Còn (ở Node) |
| **Multi-pod sharing** | Không (mỗi Pod riêng) | Có (cùng Node) |
| **Multi-node** | N/A | Không (node-specific) |
| **Production** | Không (chỉ temp data) | Không khuyến khích |
| **Use case** | Temp cache, single pod | Dev, single-node |

---

## Khi Nào Dùng?

```text
emptyDir:
  ✓ Data tạm thời trong 1 Pod
  ✓ Chỉ cần survive container restarts (không phải pod restarts)
  ✓ Simple development, try-out

hostPath:
  ✓ Development với minikube
  ✓ Chia sẻ data giữa pods trên cùng node
  ✓ Inject existing data vào container
  ✗ Không dùng production multi-node cluster

→ Cho production: dùng Persistent Volumes!
```

---

## Ranh giới chính xác: `emptyDir` sống và chết khi nào

Đây là chỗ hay nhầm nhất, vì `emptyDir` **sống lâu hơn** nhiều người tưởng:

```text
   Container trong Pod bị crash rồi kubelet khởi động lại nó
        → emptyDir VẪN CÒN  ✓
        (Pod chưa bị xoá, chỉ container bên trong chạy lại)

   Pod bị xoá, hoặc bị đuổi, hoặc chuyển sang node khác
        → emptyDir MẤT  ✗
```

Kiểm chứng:

```bash
kubectl run thu-nghiem --image=alpine --restart=Never -- sh -c "sleep 3600" \
  --overrides='{"spec":{"volumes":[{"name":"tmp","emptyDir":{}}],"containers":[{"name":"thu-nghiem","image":"alpine","command":["sleep","3600"],"volumeMounts":[{"name":"tmp","mountPath":"/data"}]}]}}'

kubectl exec thu-nghiem -- sh -c "echo 'du lieu' > /data/note.txt"
kubectl exec thu-nghiem -- cat /data/note.txt        # du lieu

# Giết TIẾN TRÌNH trong container — container khởi động lại
kubectl exec thu-nghiem -- kill 1
sleep 5
kubectl exec thu-nghiem -- cat /data/note.txt        # VẪN CÒN

# Xoá POD — giờ mới mất
kubectl delete pod thu-nghiem
```

Đây chính là lý do `emptyDir` là lựa chọn đúng cho **bộ nhớ đệm sống qua được lần crash** — thứ mà lớp ghi của container không làm được.

### `emptyDir` trong RAM

Ít người biết `emptyDir` đặt được trong bộ nhớ thay vì trên đĩa:

```yaml
volumes:
  - name: cache-nhanh
    emptyDir:
      medium: Memory        # dùng tmpfs — nằm trong RAM
      sizeLimit: 256Mi
```

| | `medium: ""` (mặc định) | `medium: Memory` |
|---|---|---|
| Nằm ở | Đĩa của node | **RAM của node** |
| Tốc độ | Theo tốc độ đĩa | **Rất nhanh** |
| Tính vào | Dung lượng đĩa node | **Giới hạn bộ nhớ của Pod** |
| Hợp với | File tạm lớn | Bộ nhớ đệm nhỏ, dữ liệu nhạy cảm không muốn chạm đĩa |

> **Bẫy**: `medium: Memory` **tính vào `limits.memory` của Pod**. Ghi 500 MB vào đó với `limits.memory: 512Mi` sẽ làm Pod bị **OOMKilled** — dù ứng dụng chỉ dùng 50 MB. Luôn đặt `sizeLimit`.

### Vì sao `hostPath` gần như luôn sai

```text
   Pod chạy trên node-1, ghi dữ liệu vào hostPath /data
        │
        ▼
   node-1 bảo trì → Kubernetes chuyển Pod sang node-2
        │
        ▼
   Pod trên node-2 mở /data → THƯ MỤC RỖNG (hoặc dữ liệu của Pod khác!)
        │
        ▼
   Ứng dụng tưởng mất dữ liệu, hoặc tệ hơn: đọc nhầm dữ liệu
```

Và với Deployment nhiều bản sao thì tệ hơn nữa: mỗi Pod trên mỗi node thấy **một tập dữ liệu khác nhau**, nên hành vi phụ thuộc vào Pod nào nhận request.

`hostPath` chỉ đúng trong đúng một trường hợp: **DaemonSet cần đọc dữ liệu của chính node đó** — log container ở `/var/log`, chỉ số hệ thống ở `/proc`, socket của runtime. Xem [Phase 17 bài 2](../phase-17/02-daemonset.md).

Ngoài ra `hostPath` còn là **lỗ hổng bảo mật**: gắn `/` hoặc `/var/run/docker.sock` là trao quyền điều khiển node. Đây là lý do Pod Security mức `baseline` **chặn hostPath nguy hiểm** ([Phase 19 bài 4](../phase-19/04-networkpolicy-va-tong-ket.md)).

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| Tưởng `emptyDir` mất khi container crash | Lo lắng không cần thiết | Nó chỉ mất khi **Pod** bị xoá |
| Dùng `emptyDir` cho dữ liệu cần giữ | Mất ở lần deploy tiếp theo | PVC |
| `medium: Memory` mà không đặt `sizeLimit` | Ghi nhiều làm Pod **OOMKilled** dù ứng dụng nhẹ | Luôn có `sizeLimit` |
| Không đặt `sizeLimit` cho `emptyDir` thường | Ứng dụng ghi tràn làm **đầy đĩa node**, ảnh hưởng mọi Pod khác | `sizeLimit` |
| Dùng `hostPath` cho dữ liệu ứng dụng | Pod chuyển node là mất dữ liệu; nhiều bản sao thấy dữ liệu khác nhau | PVC |
| Gắn `hostPath: /` hoặc socket runtime | **Trao quyền điều khiển node** cho container | Không làm; Pod Security sẽ chặn |
| Dùng `hostPath` để "chia sẻ dữ liệu giữa Pod" | Chỉ hoạt động khi các Pod tình cờ cùng node | PVC `ReadWriteMany` (EFS/NFS) |

---

## Tóm tắt bài 2

- **`emptyDir` sống qua việc container khởi động lại, chỉ mất khi Pod bị xoá** — nên nó là lựa chọn đúng cho bộ nhớ đệm cần sống sót qua lần crash.
- **`medium: Memory`** đặt `emptyDir` vào RAM (rất nhanh), nhưng nó **tính vào `limits.memory` của Pod** — thiếu `sizeLimit` là **OOMKilled**.
- Luôn đặt **`sizeLimit`** cho cả hai loại, nếu không ứng dụng ghi tràn sẽ làm đầy đĩa node và ảnh hưởng mọi Pod khác.
- **`hostPath` gần như luôn sai cho ứng dụng thường**: Pod chuyển node là mất dữ liệu, và nhiều bản sao trên nhiều node thấy dữ liệu khác nhau.
- `hostPath` chỉ đúng cho **DaemonSet đọc dữ liệu của chính node** (log, chỉ số, socket runtime). Ngoài ra nó còn là **lỗ hổng bảo mật** và bị Pod Security chặn.

---

**Bài kế tiếp** → [Bài 3: CSI Volume Type và Persistent Volumes](03-csi-va-persistent-volumes.md)
