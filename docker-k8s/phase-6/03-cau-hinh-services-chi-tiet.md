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

```
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

```
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

```
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

**Tiếp theo:** docker-compose up và down commands →
