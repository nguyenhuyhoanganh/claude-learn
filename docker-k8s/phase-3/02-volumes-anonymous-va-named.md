# Bài 2: Volumes — Anonymous và Named

## Volumes là gì?

Volume là một **thư mục đặc biệt** được Docker quản lý, tồn tại bên ngoài container filesystem. Khi container bị xóa, Volume vẫn còn đó.

```
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

---

## Tóm tắt — Khi nào dùng gì?

```
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

**Tiếp theo:** Bind Mounts — cách tốt nhất cho development workflow →
