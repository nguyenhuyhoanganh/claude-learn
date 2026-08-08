# Bài 2: Volumes — Anonymous và Named

## Volumes là gì?

Volume là một **thư mục đặc biệt** được Docker quản lý, tồn tại bên ngoài container filesystem. Khi container bị xóa, Volume vẫn còn đó.

```text
Host Machine
└── /var/lib/docker/volumes/
    ├── my_feedback_volume/
    │   └── _data/
    │       └── goal.txt    ← Data persist ở đây, ngay cả khi container bị xóa
    └── ...

Container
└── /app/feedback/          ← Trỏ vào volume bên trên
    └── goal.txt
```

---

## Anonymous Volumes

Anonymous volume được tạo tự động, Docker tự đặt tên ngẫu nhiên.

### Khai báo trong Dockerfile

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 80

# Khai báo anonymous volume cho thư mục này
VOLUME ["/app/feedback"]

CMD ["node", "server.js"]
```

### Tạo khi run

```bash
# Docker tự tạo anonymous volume cho /app/feedback
docker run -d -p 3000:80 --rm myapp

# Xem volumes đang có
docker volume ls
# DRIVER    VOLUME NAME
# local     a1b2c3d4e5f6789...    ← tên random, khó nhận ra
```

### Vấn đề của Anonymous Volumes

Anonymous volumes **bị xóa cùng container** khi dùng `--rm`:

```bash
docker run --rm myapp
# Container stop → anonymous volume BỊ XÓA

docker run myapp                # Không dùng --rm
docker stop <id> && docker rm <id>
# Container bị xóa thủ công → anonymous volume VẪN CÒN
# Nhưng bạn không thể nhận ra nó là của container nào!
```

→ **Anonymous volumes không giải quyết được vấn đề persistence thực sự**.

---

## Named Volumes

Named volumes có tên bạn đặt, **không bị xóa khi container bị xóa**.

### Khai báo khi run

Named volumes **không thể khai báo trong Dockerfile** — phải dùng flag khi run:

```bash
# -v <volume_name>:<container_path>
docker run -d -p 3000:80 --rm \
  -v feedback:/app/feedback \
  myapp
```

```bash
docker volume ls
# DRIVER    VOLUME NAME
# local     feedback          ← tên rõ ràng, dễ nhận ra
```

### Data persist sau khi container bị xóa

```bash
# Tạo container với named volume
docker run -d -p 3000:80 --name myapp -v feedback:/app/feedback myapp

# Tạo một số data (upload files, set goals...)

# Stop và xóa container
docker stop myapp && docker rm myapp

# Tạo lại container mới với CÙNG tên volume
docker run -d -p 3000:80 --name myapp -v feedback:/app/feedback myapp

# ✅ Data vẫn còn! Volume được tái sử dụng
```

---

## So sánh Anonymous vs Named Volume

| | Anonymous Volume | Named Volume |
|---|---|---|
| Tên | Tự động (hash) | Bạn đặt |
| Khai báo | Dockerfile hoặc `-v /path` | `-v name:/path` |
| Tồn tại sau `docker rm` | Không (nếu dùng `--rm`) | **Có** |
| Có thể tái sử dụng | Khó (không nhớ tên) | **Dễ dàng** |
| Use case | Ẩn thư mục con trong container | Persist production data |

---

## Khi nào dùng Anonymous Volume?

Anonymous volume có một use case đặc biệt: **bảo vệ thư mục con** khi có bind mount.

### Vấn đề: Bind mount "đè" lên node_modules

```bash
# Mount source code từ host vào /app
# Nhưng host không có node_modules! → node_modules trong container bị "che"
docker run -v /host/myapp:/app myapp
# → Lỗi vì /app/node_modules bị ghi đè bởi host directory (trống)
```

### Giải pháp: Anonymous volume cho node_modules

```bash
# Bind mount code, anonymous volume protect node_modules
docker run \
  -v /host/myapp:/app \                    # bind mount toàn bộ /app
  -v /app/node_modules \                   # anonymous volume bảo vệ /app/node_modules
  myapp

# Docker ưu tiên path cụ thể hơn (longer path wins)
# /app/node_modules (anonymous) > /app (bind mount) → node_modules được bảo vệ
```

---

## Quản lý Volumes với CLI

```bash
# Liệt kê tất cả volumes
docker volume ls

# Xem chi tiết một volume
docker volume inspect feedback
# Mountpoint: /var/lib/docker/volumes/feedback/_data

# Tạo volume thủ công (không cần chạy container)
docker volume create my_volume

# Xóa volume cụ thể (phải không có container nào đang dùng)
docker volume rm feedback

# Xóa tất cả volumes không dùng
docker volume prune
```

### Named volume thật sự nằm ở đâu

Câu hỏi hay bị bỏ qua: "Docker quản lý" nghĩa là để ở đâu?

```bash
docker volume inspect feedback --format '{{.Mountpoint}}'
```

```text
/var/lib/docker/volumes/feedback/_data
```

Trên **Linux**, đó là đường dẫn thật, xem được ngay:

```bash
sudo ls -la /var/lib/docker/volumes/feedback/_data
```

Trên **macOS/Windows** thì đường dẫn này nằm **bên trong máy ảo Docker Desktop** ([Phase 1 bài 2](../phase-1/02-containers-vs-virtual-machines.md)), nên `ls` ở máy thật sẽ không thấy gì. Muốn xem thì phải đi qua một container:

```bash
docker run --rm -v feedback:/data alpine ls -la /data
```

Mẹo này cũng là cách **sao lưu và khôi phục** volume — thao tác mà không có lệnh Docker riêng:

```bash
# SAO LƯU volume ra file tar trên máy thật
docker run --rm \
  -v feedback:/data:ro \
  -v "$(pwd)":/backup \
  alpine tar czf /backup/feedback-$(date +%F).tar.gz -C /data .

# KHÔI PHỤC vào một volume mới
docker volume create feedback-restored
docker run --rm \
  -v feedback-restored:/data \
  -v "$(pwd)":/backup \
  alpine sh -c "tar xzf /backup/feedback-2026-08-09.tar.gz -C /data"
```

Ý tưởng chung: **gắn volume vào một container tạm, rồi thao tác từ bên trong**. Không có volume nào Docker không cho bạn chạm tới — chỉ là phải đi vòng.

### `docker volume prune` — lệnh xoá dữ liệu thật

```bash
docker volume prune
```

```text
WARNING! This will remove anonymous local volumes not used by at least one container.
Are you sure you want to continue? [y/N]
```

Đây là lệnh nguy hiểm nhất trong bài, vì hai lý do:

**Một — "không dùng" nghĩa là "không có container nào đang gắn"**, chứ không phải "không có dữ liệu". Database local của bạn nằm trong một volume mà container vừa bị xoá → volume đó bị coi là không dùng → **prune xoá sạch dữ liệu**.

**Hai — không có thùng rác.** Không có lệnh hoàn tác, không khôi phục được.

```bash
# LUÔN xem trước rồi mới xoá
docker volume ls -f dangling=true
```

```text
DRIVER    VOLUME NAME
local     8f3a2b1c9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a
local     postgres-du-lieu-that          ← ĐÂY LÀ DỮ LIỆU BẠN CẦN
```

Và lưu ý: từ Docker 23, `docker volume prune` mặc định **chỉ xoá volume vô danh**. Nhưng `docker volume prune -a` và `docker system prune --volumes` thì **xoá cả named volume** — hai lệnh đó mới là thứ thật sự nguy hiểm.

---

## Tóm tắt — Khi nào dùng gì?

```text
Data cần persist giữa container restart/remove?
│
├── YES → Named Volume: -v myvolume:/container/path
│         (production databases, user uploads)
│
└── NO → Anonymous Volume hoặc container layer
          (temporary data, cache)

Đặc biệt: Cần "protect" subdirectory khỏi bị bind mount che?
└── Anonymous Volume: -v /container/path
    (thường dùng cho node_modules)
```

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| `docker system prune --volumes` để "dọn cho gọn" | **Xoá sạch dữ liệu** database local | Xem trước bằng `docker volume ls`, dùng `docker container prune` cho an toàn |
| Tưởng volume vô danh cũng persist được | Mỗi lần `docker run` sinh volume **mới**, volume cũ thành rác | Dùng **named volume** cho dữ liệu cần giữ |
| Volume vô danh tích tụ hàng trăm cái | Đầy đĩa mà không biết vì sao | `docker volume ls -f dangling=true` để rà |
| Gắn volume vào thư mục **đã có dữ liệu trong image** | Lần đầu Docker chép dữ liệu image vào volume; **những lần sau thì không** → tưởng image cập nhật mà thực ra đang đọc dữ liệu cũ | Đừng gắn volume đè lên thư mục chứa code |
| Dùng cùng một named volume cho nhiều container ghi đồng thời | Hỏng dữ liệu (đặc biệt với database) | Mỗi database một volume riêng |
| Tìm volume ở `/var/lib/docker` trên macOS | Không thấy gì, tưởng volume hỏng | Đường dẫn đó nằm trong **máy ảo**; truy cập qua container tạm |
| Không sao lưu volume | Máy hỏng là mất hết | Sao lưu bằng container tạm + `tar` |
| Xoá container bằng `docker rm -v` theo thói quen | Cờ `-v` **xoá luôn volume vô danh** gắn với nó | Bỏ `-v` nếu không chắc |

Bẫy thứ tư đáng xem tận mắt vì nó rất khó chẩn đoán:

```text
   Image có sẵn /app/config với file mac-dinh.json

   LẦN ĐẦU gắn volume rỗng vào /app/config
   → Docker CHÉP nội dung có sẵn từ image vào volume
   → volume giờ có mac-dinh.json  ✓

   Bạn sửa Dockerfile, thêm file moi.json, build lại image

   LẦN SAU chạy với CÙNG volume đó
   → Volume KHÔNG rỗng nữa → Docker KHÔNG chép gì cả
   → moi.json KHÔNG BAO GIỜ xuất hiện
   → Bạn build lại mười lần cũng không hiểu vì sao
```

Cách chữa: xoá volume rồi tạo lại (`docker volume rm`), hoặc **đừng gắn volume lên thư mục chứa file của image**.

---

## Tóm tắt bài 2

- **Volume là cơ chế lưu dữ liệu do Docker quản lý**, nằm ngoài lớp ghi của container nên sống sót qua `docker rm`.
- **Named volume** (`-v ten:/duong/dan`) cho dữ liệu cần giữ. **Anonymous volume** (`-v /duong/dan`) chủ yếu để **che một thư mục con** khỏi bị bind mount đè — điển hình là `node_modules`.
- Volume nằm ở `/var/lib/docker/volumes/<tên>/_data` trên Linux; trên macOS/Windows thì nằm **trong máy ảo**, phải truy cập qua container tạm.
- **Không có lệnh sao lưu volume.** Cách chuẩn: gắn volume vào container tạm rồi `tar` ra ngoài — và đó cũng là cách khôi phục.
- **`docker volume prune` xoá dữ liệu thật, không có thùng rác.** "Không dùng" chỉ nghĩa là "không container nào đang gắn". Nguy hiểm nhất là `docker system prune --volumes`.
- Bẫy khó chẩn đoán nhất: Docker **chỉ chép dữ liệu từ image vào volume ở lần đầu**. Sau đó volume đè lên image mãi mãi, nên file mới thêm vào image sẽ không bao giờ xuất hiện.

---

**Bài kế tiếp** → [Bài 3: Bind Mounts & Development Workflow](03-bind-mounts-va-dev-workflow.md)
