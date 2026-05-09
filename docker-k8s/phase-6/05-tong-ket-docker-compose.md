# Bài 5: Tổng kết Docker Compose

## Full docker-compose.yml — Goals App (Complete)

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
    # Không cần: -d (auto), --rm (auto), --network (auto)
    # Không cần: -p (MongoDB chỉ dùng nội bộ, không expose ra ngoài)

  backend:
    build: ./backend      # Tham chiếu Dockerfile trong ./backend/
    ports:
      - "80:80"
    volumes:
      - logs:/app/logs            # Named: persist log files
      - ./backend:/app            # Bind: live code sync (relative path!)
      - /app/node_modules         # Anonymous: protect node_modules
    env_file:
      - ./env/backend.env
    depends_on:
      - mongodb

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    volumes:
      - ./frontend/src:/app/src   # Bind: hot-reload React code
    stdin_open: true              # -i: keep STDIN open
    tty: true                     # -t: allocate TTY (React needs this)
    depends_on:
      - backend

volumes:
  mongo-data:             # Khai báo named volumes ở top-level
  logs:
```

---

## env/backend.env

```bash
MONGODB_USERNAME=admin
MONGODB_PASSWORD=secret
```

---

## Workflow với Docker Compose

```bash
# === Lần đầu setup ===
# Không cần gì thêm, compose lo hết

# === Khởi động ===
docker compose up -d
# → Tạo network, volumes, build images, start containers

# === Xem logs ===
docker compose logs -f               # Tất cả
docker compose logs -f backend       # Chỉ backend

# === Khi thay đổi Dockerfile hoặc dependencies ===
docker compose up -d --build backend

# === Dừng (data được giữ) ===
docker compose down

# === Reset hoàn toàn ===
docker compose down -v
```

---

## Cheat Sheet: docker compose commands

| Command | Mô tả |
|---|---|
| `docker compose up` | Start tất cả services (attached) |
| `docker compose up -d` | Start (detached/background) |
| `docker compose up --build` | Force rebuild rồi start |
| `docker compose down` | Stop + remove containers + network |
| `docker compose down -v` | + xóa cả named volumes |
| `docker compose build` | Chỉ build images |
| `docker compose ps` | List containers của project |
| `docker compose logs -f` | Stream logs |
| `docker compose exec <svc> bash` | Shell vào container |
| `docker compose stop` | Stop containers (không xóa) |
| `docker compose start` | Start stopped containers |

---

## Cheat Sheet: Compose file keys

| Key | Mô tả | Tương đương docker run |
|---|---|---|
| `image` | Image để dùng | `docker run image_name` |
| `build` | Path đến Dockerfile | `docker build ./path` |
| `ports` | Publish ports | `-p host:container` |
| `volumes` | Mount volumes | `-v name:/path` hoặc `-v ./local:/path` |
| `environment` | Env variables (inline) | `-e KEY=VAL` |
| `env_file` | Env variables (từ file) | `--env-file .env` |
| `depends_on` | Startup order | (không có) |
| `stdin_open` | Keep STDIN open | `-i` |
| `tty` | Allocate TTY | `-t` |
| `container_name` | Custom container name | `--name` |
| `networks` | Thêm vào network | `--network` |

---

## Điều Docker Compose làm Tự động

```
1. Network: Tạo default network, thêm tất cả services vào
   → Không cần docker network create thủ công

2. Detach mode: Với -d flag, tất cả services start detached
   → Không cần --rm hay -d trên từng container

3. Cleanup: docker compose down xóa containers + network
   → Không cần docker stop + docker rm từng cái

4. Naming: Tạo tên cho volumes/network với project prefix
   → myapp_mongo-data, myapp_default

5. Image build: Tự build khi cần (khi chỉ định build:)
   → Không cần docker build thủ công
```

---

## Điều Docker Compose KHÔNG làm

```
1. Thay thế Dockerfile
   → Vẫn cần Dockerfile cho custom images

2. Deploy lên nhiều servers
   → Dùng Docker Swarm hoặc Kubernetes

3. Đảm bảo service "healthy" trước khi start dependencies
   → depends_on chỉ đảm bảo thứ tự start, không đợi health
   → Cần thêm healthcheck (nâng cao)

4. Hot-reload mọi thứ tự động
   → Bind mounts giúp code sync, nhưng cần nodemon/dev server riêng
```

---

## Tổng kết Phase 6

Bạn đã học:

1. **Docker Compose là gì**: Tool quản lý multi-container, thay thế nhiều `docker run` commands
2. **docker-compose.yml structure**: `version`, `services`, `volumes` sections
3. **`image` vs `build`**: Pull image sẵn có vs build từ Dockerfile
4. **Service configuration**: `ports`, `volumes`, `environment`, `env_file`, `depends_on`
5. **Interactive mode**: `stdin_open` + `tty` thay cho `-it`
6. **`docker compose up/down`**: Khởi động/dừng toàn bộ stack
7. **`--build` flag**: Force rebuild images
8. **Container naming**: Auto-generated names, override với `container_name`
9. **Network tự động**: Compose tạo default network cho tất cả services
10. **Volume types**: Named phải khai báo top-level, bind/anonymous không cần

---

**Tiếp theo:** Phase 7 — Utility Containers & Executing Commands →
