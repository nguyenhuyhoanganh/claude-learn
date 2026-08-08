# Bài 3: Cấu hình Services Chi tiết

## `ports` — Publish Ports

```yaml
services:
  backend:
    ports:
      - "80:80"            # "host_port:container_port"
      - "443:443"          # Có thể nhiều ports
      - "3000:3000"
```

Tương đương với `docker run -p 80:80 -p 443:443`.

**Không cần khai báo `-d` và `--rm`:** Compose tự động detach và remove containers khi down.

---

## `environment` — Environment Variables

### Cách 1: Key-Value trực tiếp

```yaml
services:
  mongodb:
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: secret
      MONGO_INITDB_DATABASE: myapp
```

### Cách 2: List với dấu bằng

```yaml
services:
  mongodb:
    environment:
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=secret
```

Cả 2 cách đều hoạt động. Cách 1 (key: value) được khuyến nghị vì dễ đọc hơn.

---

## `env_file` — Load từ File .env

### Tạo file env

```bash
# env/backend.env
MONGODB_USERNAME=admin
MONGODB_PASSWORD=secret
NODE_ENV=development
```

### Khai báo trong Compose

```yaml
services:
  backend:
    env_file:
      - ./env/backend.env     # Relative path từ docker-compose.yml
      - ./env/common.env      # Có thể nhiều files
```

### Khi nào dùng `env_file` thay `environment`?

```text
environment: (inline)
→ Tốt cho dev, cấu hình đơn giản
→ Config visible trong docker-compose.yml

env_file:
→ Tốt khi có nhiều variables
→ Có thể exclude khỏi git (add to .gitignore)
→ Tách biệt secrets khỏi config file
```

---

## `volumes` — Chi tiết

```yaml
services:
  backend:
    volumes:
      # Named volume (phải khai báo ở top-level)
      - logs:/app/logs

      # Bind mount (relative path — lợi thế so với docker run)
      - ./backend:/app
      # docker run cần: -v /absolute/path/to/backend:/app
      # docker-compose dùng: ./backend:/app (relative từ file)

      # Anonymous volume (bảo vệ subdirectory)
      - /app/node_modules

      # Read-only bind mount
      - ./config:/app/config:ro
```

**Lợi thế của Compose:** Bind mounts dùng **relative path** thay vì absolute path.

```text
docker run:    -v /Users/user/project/backend:/app
docker-compose: - ./backend:/app
```

---

## `depends_on` — Thứ tự Khởi động

```yaml
services:
  mongodb:
    image: mongo

  backend:
    build: ./backend
    depends_on:
      - mongodb          # Khởi động mongodb TRƯỚC backend

  frontend:
    build: ./frontend
    depends_on:
      - backend          # Khởi động backend TRƯỚC frontend
```

**Lưu ý quan trọng:** `depends_on` đảm bảo **thứ tự start**, không đảm bảo service đã "ready" (ví dụ MongoDB chưa accept connections khi container vừa start). Để xử lý điều này cần `healthcheck` (nâng cao).

### Vì sao `depends_on` thường không đủ — và cách làm đúng

Đây là nguồn của lỗi "chạy `up` lần đầu thì hỏng, chạy lại thì được" mà rất nhiều người gặp.

```text
   depends_on: [mongodb]  chỉ đảm bảo:

   t=0.0s   Docker START container mongodb   ← xong nhiệm vụ của depends_on
   t=0.1s   Docker START container backend
   t=0.2s   backend gọi mongodb:27017        → ECONNREFUSED
   t=8.0s   mongodb mới THẬT SỰ sẵn sàng nhận kết nối
                     ▲
        Có 8 giây mà backend đã chết vì không kết nối được
```

Cách đúng — kết hợp `healthcheck` với `condition`:

```yaml
services:
  mongodb:
    image: mongo:7
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 5s          # kiểm tra mỗi 5 giây
      timeout: 3s
      retries: 10           # thử 10 lần rồi mới báo hỏng
      start_period: 20s     # 20 giây đầu không tính là thất bại

  backend:
    build: ./backend
    depends_on:
      mongodb:
        condition: service_healthy      # ← CHỜ ĐẾN KHI THẬT SỰ SẴN SÀNG
```

Ba giá trị của `condition`:

| Giá trị | Chờ đến khi |
|---|---|
| `service_started` | Container đã start (bằng `depends_on` dạng danh sách) |
| **`service_healthy`** | **`healthcheck` báo khoẻ** — đây là thứ bạn thường cần |
| `service_completed_successfully` | Container đã chạy xong và thoát mã 0 (hợp cho container chạy migration) |

`start_period` là tham số hay bị bỏ quên nhưng quan trọng: nó cho dịch vụ một khoảng "khởi động" mà thất bại **không bị tính** vào `retries`. Không có nó, một database mất 30 giây để khởi động sẽ bị đánh dấu `unhealthy` trước khi kịp sẵn sàng.

> **Nhưng vẫn nên có logic thử lại trong ứng dụng.** `healthcheck` giải quyết lúc khởi động; nó **không** giải quyết trường hợp database khởi động lại giữa chừng khi hệ thống đang chạy. Ở production, ứng dụng phải tự chịu được việc mất kết nối tạm thời.

Mẫu chạy migration trước khi khởi động ứng dụng:

```yaml
  migrate:
    build: ./backend
    command: ["npm", "run", "migrate"]
    depends_on:
      mongodb:
        condition: service_healthy

  backend:
    build: ./backend
    depends_on:
      migrate:
        condition: service_completed_successfully    # chờ migrate XONG HẲN
```

---

## `stdin_open` và `tty` — Interactive Mode

Thay thế `-it` trong `docker run`:

```yaml
services:
  frontend:
    build: ./frontend
    stdin_open: true    # -i (giữ STDIN mở)
    tty: true           # -t (attach pseudo-TTY)
```

Cần cho React dev server vì nó mong đợi interactive input.

```text
docker run -it goals-react
↕
docker-compose.yml:
  stdin_open: true
  tty: true
```

---

## `container_name` — Đặt tên Container

Mặc định, Compose đặt tên container theo format: `projectname_service_1`

```bash
docker ps
# NAMES
# myapp_mongodb_1
# myapp_backend_1
# myapp_frontend_1
```

Để đặt tên custom:

```yaml
services:
  mongodb:
    image: mongo
    container_name: mongodb    # Tên container sẽ là "mongodb"
```

```bash
docker ps
# NAMES
# mongodb    ← tên custom
```

**Lưu ý:** Service name (trong Compose) vẫn là hostname cho DNS, không phải container name.

---

## Full docker-compose.yml của Goals App

```yaml
version: "3.8"

services:

  mongodb:
    image: mongo
    volumes:
      - mongo-data:/data/db
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: secret

  backend:
    build: ./backend
    ports:
      - "80:80"
    volumes:
      - logs:/app/logs
      - ./backend:/app
      - /app/node_modules
    env_file:
      - ./env/backend.env
    depends_on:
      - mongodb

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    volumes:
      - ./frontend/src:/app/src
    stdin_open: true
    tty: true
    depends_on:
      - backend

volumes:
  mongo-data:
  logs:
```

---

## Bảng so sánh: `docker run` flags vs Compose keys

| `docker run` | Compose key | Ví dụ |
|---|---|---|
| `--name` | `container_name` | `container_name: mongodb` |
| `-p 80:80` | `ports: ["80:80"]` | |
| `-v name:/path` | `volumes: [- name:/path]` | |
| `-v ./local:/path` | `volumes: [- ./local:/path]` | |
| `-e KEY=VAL` | `environment: {KEY: VAL}` | |
| `--env-file .env` | `env_file: [-.env]` | |
| `--network name` | `networks: [- name]` | (thường không cần) |
| `-d` | Tự động (detach by default) | |
| `--rm` | Tự động (remove on down) | |
| `-it` | `stdin_open: true` + `tty: true` | |
| `--build-arg` | `build.args: {}` | |

---

## Bẫy thường gặp

| Bẫy | Triệu chứng | Cách xử lý |
|---|---|---|
| Dựa vào `depends_on` để chờ database sẵn sàng | Lần `up` đầu hỏng, chạy lại thì được | `healthcheck` + `condition: service_healthy` |
| Quên `start_period` trong healthcheck | Dịch vụ khởi động chậm bị đánh dấu `unhealthy` oan | Đặt `start_period` rộng rãi |
| Đặt `container_name` cho service cần scale | `docker compose up --scale api=3` **thất bại** vì trùng tên | Bỏ `container_name` đi |
| Dùng `environment` cho mật khẩu rồi commit lên Git | Lộ bí mật | Dùng `env_file` và cho `.env` vào `.gitignore` |
| `ports: "8080:80"` mà quên nháy kép ở `"80:80"` | YAML hiểu `56:80` là **số phút giây**, không phải chuỗi | **Luôn để nháy kép** quanh giá trị `ports` |
| Named volume khai báo ở service nhưng quên khai ở cấp trên cùng | `service refers to undefined volume` | Phải khai **hai chỗ** |
| Thụt lề bằng tab | `found character '\t' that cannot start any token` | YAML **chỉ chấp nhận dấu cách** |
| Tưởng `env_file` ghi đè `environment` | Ngược lại — `environment` **thắng** | Thứ tự ưu tiên: shell > `environment` > `env_file` |

Bẫy `ports` đáng xem vì nó âm thầm:

```yaml
ports:
  - 56:80          # ✗ YAML đọc "56:80" thành số 3360 (56 phút 80 giây)
  - "56:80"        # ✓
```

Với cặp cổng thường dùng (`3000:3000`, `8080:80`) thì không sao vì có số lớn hơn 59, nhưng đúng một lần bạn viết `22:22` hoặc `56:80` là gặp lỗi rất khó hiểu. Cứ để nháy kép cho mọi trường hợp.

---

## Tóm tắt bài 3

- `ports`, `environment`, `env_file`, `volumes`, `depends_on` là năm khoá bạn dùng nhiều nhất — chúng ánh xạ gần một-một với cờ của `docker run`.
- Thứ tự ưu tiên biến môi trường: **shell > `environment` > `env_file`**.
- **`depends_on` chỉ đảm bảo thứ tự START, không đảm bảo dịch vụ SẴN SÀNG.** Đây là nguyên nhân của lỗi "lần đầu hỏng, chạy lại thì được".
- Cách đúng: **`healthcheck` + `depends_on.condition: service_healthy`**, kèm **`start_period`** cho dịch vụ khởi động chậm.
- `condition: service_completed_successfully` là cách chuẩn để **chạy migration xong rồi mới khởi động ứng dụng**.
- Vẫn cần **logic thử lại trong ứng dụng** — healthcheck chỉ lo lúc khởi động, không lo lúc database khởi động lại giữa chừng.
- **Luôn để nháy kép quanh giá trị `ports`**, nếu không YAML có thể đọc thành số phút giây.
- **Đừng đặt `container_name`** cho service cần scale.

---

**Bài kế tiếp** → [Bài 4: docker-compose up và down](04-docker-compose-up-va-down.md)
