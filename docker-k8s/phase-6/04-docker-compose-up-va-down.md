# Bài 4: docker-compose up và down

## Lệnh cơ bản

```bash
# Khởi động tất cả services
docker compose up

# Tắt và xóa tất cả containers
docker compose down
```

---

## `docker compose up` — Chi tiết

```bash
# Khởi động (attached mode — thấy logs)
docker compose up

# Khởi động (detached mode — background)
docker compose up -d

# Force rebuild images trước khi start
docker compose up --build

# Khởi động chỉ một service
docker compose up backend
```

### Những gì `up` làm tự động:

```text
docker compose up
  │
  ├── Tạo network (nếu chưa có): projectname_default
  ├── Tạo named volumes (nếu chưa có): projectname_mongo-data, ...
  ├── Pull images (nếu cần): docker pull mongo
  ├── Build images (nếu cần): docker build ./backend
  └── Start containers (theo thứ tự depends_on)
```

### Output khi chạy `up`:

```bash
$ docker compose up -d
[+] Running 5/5
 ✔ Network myapp_default         Created
 ✔ Volume "myapp_mongo-data"     Created
 ✔ Container myapp_mongodb_1     Started
 ✔ Container myapp_backend_1     Started
 ✔ Container myapp_frontend_1    Started
```

**Lưu ý prefix:** Compose thêm tên project folder làm prefix. Ví dụ folder `myapp` → network là `myapp_default`, volume là `myapp_mongo-data`.

---

## `docker compose down` — Chi tiết

```bash
# Dừng và xóa containers + network
docker compose down

# Dừng, xóa containers + network + named volumes
docker compose down -v

# Dừng, xóa containers + network + volumes + images
docker compose down --rmi all
```

### Những gì `down` xóa:

```text
docker compose down (không có -v):
  ✓ Xóa containers
  ✓ Xóa network (projectname_default)
  ✗ GIỮ named volumes (mongo-data, logs)   ← Data được bảo toàn

docker compose down -v:
  ✓ Xóa containers
  ✓ Xóa network
  ✓ Xóa named volumes                       ← Data BỊ XÓA
```

**Thực hành tốt:** Không dùng `-v` trong normal workflow vì sẽ mất data. Chỉ dùng khi muốn reset hoàn toàn.

---

## `docker compose build` — Build-only

```bash
# Build tất cả images (không start containers)
docker compose build

# Build một service cụ thể
docker compose build backend
```

Hữu ích khi chỉ muốn chuẩn bị images mà chưa cần chạy.

---

## `docker compose up --build` — Force Rebuild

Mặc định, nếu image đã tồn tại, Compose **không rebuild**:

```bash
# Lần 1: Build image, start container
docker compose up -d
# ✓ Tạo image goals-react

# Thay đổi code trong frontend/src/App.js

# Lần 2: Compose KHÔNG rebuild (image đã có)
docker compose up -d
# ← App.js mới chưa được cập nhật vào image

# Giải pháp: Force rebuild
docker compose up -d --build
# ✓ Rebuild goals-react với code mới
```

**Khi nào cần `--build`?**

```text
1. Thay đổi Dockerfile
2. Thay đổi dependencies (package.json)
3. Thay đổi code (khi KHÔNG dùng bind mount)
```

---

## Container Names trong Compose

Compose đặt tên container theo format: `{project}_{service}_{number}`

```bash
docker ps
# CONTAINER ID   IMAGE          NAMES
# abc123         goals-react    myapp_frontend_1
# def456         goals-node     myapp_backend_1
# ghi789         mongo          myapp_mongodb_1
#                               ↑      ↑         ↑
#                               folder service   number
```

### Service names vs Container names

```yaml
services:
  mongodb:              ← Service name (dùng trong code, depends_on)
    image: mongo
    container_name: mongodb   ← Container name (override auto-generated)
```

```javascript
// Trong Node.js backend code
// Dùng SERVICE NAME, không phải container name
mongoose.connect('mongodb://mongodb:27017/mydb');
//                       ↑
//               service name từ docker-compose.yml
//               Docker Compose setup DNS theo service name này
```

---

## Các lệnh `docker compose` khác

```bash
# Xem logs của tất cả services
docker compose logs

# Xem logs của một service
docker compose logs backend

# Follow logs (real-time)
docker compose logs -f

# List containers của compose project
docker compose ps

# Exec command trong container đang chạy
docker compose exec backend bash

# Stop containers (không xóa)
docker compose stop

# Start đã-stopped containers
docker compose start

# Restart containers
docker compose restart
```

---

## Network tự động của Compose

```bash
# Sau khi docker compose up
docker network ls
# NETWORK ID     NAME              DRIVER    SCOPE
# abc123         myapp_default     bridge    local   ← Tự tạo bởi Compose
# ...

# Tất cả services trong compose file đều trong network này
# Backend có thể gọi "mongodb", "frontend" bằng service name
```

**Lợi thế:** Không cần `docker network create` thủ công như trước.

---

## Volumes trong Compose

```bash
# Sau khi docker compose up
docker volume ls
# DRIVER    VOLUME NAME
# local     myapp_mongo-data    ← Prefix bởi project name
# local     myapp_logs

# Xem chi tiết
docker volume inspect myapp_mongo-data
```

Named volumes được **giữ lại** sau `docker compose down` (không có `-v`) để data persist.

---

## Workflow thực tế hàng ngày

```bash
# Sáng: Bắt đầu làm việc
docker compose up -d

# Trong ngày: Xem logs khi có lỗi
docker compose logs -f backend

# Khi thêm dependency mới (package.json thay đổi)
docker compose up -d --build backend

# Cuối ngày / Sau khi làm xong
docker compose down
# Data trong named volumes vẫn còn

# Reset hoàn toàn (xóa cả data)
docker compose down -v
```

---

## Bốn lệnh hay bị nhầm lẫn

Đây là bảng phân biệt đáng dán lên tường:

| Lệnh | Container | Image | Volume | Network |
|---|---|---|---|---|
| `docker compose stop` | **Dừng**, giữ lại | Giữ | Giữ | Giữ |
| `docker compose down` | **Xoá** | Giữ | **Giữ** | Xoá |
| `docker compose down -v` | Xoá | Giữ | **XOÁ — mất dữ liệu** | Xoá |
| `docker compose down --rmi all` | Xoá | **Xoá** | Giữ | Xoá |

```text
   Muốn tạm nghỉ, mai làm tiếp     →  docker compose stop
   Muốn dọn sạch nhưng GIỮ dữ liệu →  docker compose down
   Muốn làm lại từ đầu HOÀN TOÀN   →  docker compose down -v    ⚠ mất dữ liệu
```

> **`docker compose down -v` là lệnh xoá dữ liệu.** Nó xoá named volume của dự án — nghĩa là toàn bộ dữ liệu database local. Không có hoàn tác. Nhiều người gõ nó theo phản xạ khi "muốn cho sạch" rồi mất dữ liệu thử nghiệm đã dựng cả buổi.

### Khi nào cần `--build`

```text
   Sửa file trong Dockerfile         →  BẮT BUỘC --build
   Thêm/xoá thư viện (package.json)  →  BẮT BUỘC --build
   Chỉ sửa code, CÓ bind mount       →  KHÔNG cần gì, hot reload lo
   Chỉ sửa code, KHÔNG bind mount    →  BẮT BUỘC --build
   Sửa docker-compose.yml            →  chỉ cần `up` lại (Compose tự nhận ra)
   Sửa file .env                     →  `up` lại (không cần --build)
```

```bash
# Build lại và bỏ qua toàn bộ bộ nhớ đệm — khi nghi build bị "kẹt" cache cũ
docker compose build --no-cache
docker compose up -d --force-recreate
```

`--force-recreate` cũng đáng biết: nó tạo lại container **kể cả khi Compose nghĩ là không có gì đổi**. Hữu ích khi bạn sửa thứ Compose không theo dõi được.

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách xử lý |
|---|---|---|
| `docker compose down -v` theo phản xạ | **Mất toàn bộ dữ liệu** database local | Dùng `down` không có `-v` |
| Sửa Dockerfile rồi chỉ `up` | Vẫn chạy image cũ, sửa gì cũng không thấy | `up --build` |
| Chạy `up` ở thư mục khác | Compose không tìm thấy file, hoặc tạo dự án **mới** với volume mới | `cd` đúng chỗ, hoặc `-f duong/dan/docker-compose.yml` |
| Đổi tên thư mục dự án | Compose coi là **dự án khác** → volume cũ thành mồ côi | Đặt `name:` ở đầu file, hoặc dùng `-p ten-du-an` |
| `up` bị treo ở `Attaching to...` | Không phải treo — đó là chế độ gắn kèm | Ctrl+C để thoát, hoặc dùng `-d` ngay từ đầu |
| Ctrl+C khi đang `up` (không có `-d`) | Container dừng theo | Đó là hành vi đúng. Dùng `-d` nếu muốn chạy nền |
| `port is already allocated` | Cổng bị dự án Compose khác chiếm | `docker ps` tìm thủ phạm, hoặc đổi cổng |
| Quên `docker compose down` dự án cũ | Nhiều dự án tranh cổng, và tốn RAM | `docker compose ls` xem dự án nào đang chạy |

Dòng "đổi tên thư mục" đáng nói thêm vì nó gây mất dữ liệu một cách bất ngờ:

```text
   Thư mục my-app/     →  Compose đặt tên volume: my-app_mongo-data
   Đổi tên thành myapp/ →  Compose tìm volume:    myapp_mongo-data  (chưa có!)
                        →  tạo volume RỖNG mới
                        →  database trống trơn, dữ liệu cũ vẫn nằm ở volume kia
```

Chữa bằng cách khai báo tên dự án tường minh:

```yaml
name: my-app        # Compose v2.20+, đặt ở đầu file
services:
  ...
```

---

## Tóm tắt bài 4

- `up` tự làm rất nhiều: tạo network, tạo volume, build image nếu chưa có, khởi động theo thứ tự `depends_on`.
- Phân biệt bốn lệnh: **`stop`** (giữ container), **`down`** (xoá container, **giữ volume**), **`down -v`** (**xoá cả dữ liệu**), `down --rmi all` (xoá cả image).
- **`docker compose down -v` không có hoàn tác.** Đừng gõ theo phản xạ.
- **Sửa Dockerfile hoặc `package.json` thì bắt buộc `--build`.** Sửa `docker-compose.yml` hoặc `.env` thì chỉ cần `up` lại.
- Compose lấy **tên thư mục** làm tên dự án, và tên dự án là tiền tố của volume/network. **Đổi tên thư mục là mất dấu volume cũ** — khai `name:` ở đầu file để tránh.
- `docker compose ls` cho biết những dự án nào đang chạy — hữu ích khi tranh cổng.

---

**Bài kế tiếp** → [Bài 5: Tổng kết Docker Compose](05-tong-ket-docker-compose.md)
