# Bài 4: Utility Containers với Docker Compose

## Vấn đề với `docker run`

Mỗi lần dùng utility container phải gõ lại bind mount:

```bash
docker run -it -v /absolute/path/to/project:/app mynpm init
docker run -v /absolute/path/to/project:/app mynpm install
docker run -v /absolute/path/to/project:/app mynpm run start
```

→ Gõ lại path dài, dễ nhầm, không tiện.

---

## Giải pháp: `docker compose run`

Định nghĩa utility container trong `docker-compose.yml`:

```yaml
version: "3.8"

services:
  npm:
    build: .            # Dockerfile với ENTRYPOINT ["npm"]
    stdin_open: true    # -i
    tty: true           # -t
    volumes:
      - ./:/app         # Bind mount (relative path!)
```

### Chạy utility command

```bash
# Cú pháp
docker compose run [--rm] <service-name> [command-args]

# Ví dụ
docker compose run --rm npm init
docker compose run --rm npm install
docker compose run --rm npm install express --save
docker compose run --rm npm run dev
```

**Ưu điểm:**
- Bind mount chỉ cần cấu hình 1 lần trong file
- Lệnh ngắn gọn hơn
- Dễ chia sẻ với team (commit file, không commit lệnh)

---

## `docker compose run` vs `docker compose up`

| | `up` | `run` |
|---|---|---|
| Mục đích | Start services dài hạn | Chạy 1 lệnh rồi dừng |
| Dùng cho | App containers | Utility containers |
| Container tự xóa | Có (sau `down`) | Không (cần `--rm`) |

```bash
# Sai — up không phù hợp với utility containers
docker compose up npm   # → Chạy "npm" (ENTRYPOINT) không có argument
                        # → Bị lỗi hoặc exit ngay

# Đúng — run với argument
docker compose run --rm npm init   # → Chạy "npm init"
```

---

## `--rm` Flag — Quan trọng!

Khi dùng `docker compose run`, container **không tự xóa** sau khi xong:

```bash
# Không có --rm
docker compose run npm init
docker ps -a
# NAMES
# myproject_npm_1    ← Còn đây, đã stopped

# Chạy nhiều lần → nhiều stopped containers
docker compose run npm install
docker compose run npm run build
docker ps -a
# myproject_npm_1
# myproject_npm_2
# myproject_npm_3   ← Rác tích lũy

# Giải pháp: luôn dùng --rm
docker compose run --rm npm init   # Tự xóa sau khi xong
```

---

## Mix: App Containers + Utility Containers

Compose file có thể chứa cả hai loại:

```yaml
version: "3.8"

services:
  # Application containers (start với docker compose up)
  backend:
    build: ./backend
    ports:
      - "80:80"
    volumes:
      - ./backend:/app

  mongodb:
    image: mongo
    volumes:
      - mongo-data:/data/db

  # Utility containers (chạy với docker compose run)
  npm:
    build: ./npm-util
    stdin_open: true
    tty: true
    volumes:
      - ./:/app

  test-runner:
    build: ./backend
    volumes:
      - ./backend:/app
    entrypoint: ["npm", "test"]   # Override entrypoint trong compose

volumes:
  mongo-data:
```

```bash
# Start app
docker compose up -d

# Chạy utility tasks
docker compose run --rm npm install
docker compose run --rm test-runner

# Stop app
docker compose down
```

---

## Tổng kết Phase 7

**Utility Containers:**
1. Chỉ chứa environment, không chạy app
2. Chạy commands rồi dừng
3. Bind mount để kết quả xuất hiện trên host machine
4. `ENTRYPOINT` để restrict commands có thể chạy

**Commands:**
```bash
# Chạy lệnh trong container đang chạy
docker exec -it <container> <command>

# Chạy container mới với command override
docker run -it -v $(pwd):/app <image> <command>

# Với Compose (khuyến nghị)
docker compose run --rm <service> <args>
```

**`--rm` flag:** Luôn dùng với `docker compose run` để tránh tích lũy stopped containers.

---

**Tiếp theo:** Phase 8 — Laravel & PHP: Dự án phức tạp thực tế →
