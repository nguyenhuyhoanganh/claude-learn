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

## `run` khác `up` và `exec` chỗ nào

Ba lệnh này của Compose hay bị dùng nhầm cho nhau:

| | `docker compose up` | `docker compose run` | `docker compose exec` |
|---|---|---|---|
| Tạo container mới | Có | **Có (container riêng)** | **Không** |
| Cần service đang chạy | Không | Không | **Có** |
| Chạy `depends_on` | Có | **Có** | Không |
| Publish cổng theo `ports:` | **Có** | **KHÔNG** (trừ khi thêm `--service-ports`) | — |
| Ghi đè lệnh | Không | **Có** | Có |
| Dùng để | Khởi động cả stack | **Chạy tác vụ một lần** | Vào container đang chạy |

```bash
# Chạy migration — tạo container riêng, dùng chung network và biến môi trường
docker compose run --rm backend npm run migrate

# Vào container backend ĐANG CHẠY để xem file
docker compose exec backend sh

# Chạy test với cổng được publish (hiếm khi cần)
docker compose run --rm --service-ports backend npm test
```

Dòng "không publish cổng" của `run` là điểm bất ngờ nhất: nó **cố ý** như vậy để bạn chạy được nhiều tác vụ song song mà không tranh cổng.

### Mẫu hay dùng: định nghĩa tác vụ như service

```yaml
services:
  backend:
    build: ./backend
    ports: ["3000:3000"]
    depends_on:
      db: {condition: service_healthy}

  # Các service tiện ích — KHÔNG chạy khi `up`, chỉ chạy khi gọi tên
  migrate:
    build: ./backend
    command: ["npm", "run", "migrate"]
    depends_on:
      db: {condition: service_healthy}
    profiles: ["tools"]        # ← chìa khoá

  npm:
    build: ./backend
    entrypoint: ["npm"]
    volumes: ["./backend:/app"]
    profiles: ["tools"]
```

```bash
docker compose up -d                       # chỉ khởi động backend + db
docker compose run --rm migrate            # chạy migration khi cần
docker compose run --rm npm install axios  # cài thư viện
```

**`profiles`** là thứ giải quyết vấn đề khó chịu nhất khi trộn service ứng dụng với service tiện ích: không có nó, `docker compose up` sẽ **khởi động luôn cả các container tiện ích** — thứ chỉ nên chạy khi được gọi.

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách xử lý |
|---|---|---|
| Quên `--rm` với `compose run` | Container rác tích tụ với tên `duan-service-run-a1b2c3` | Luôn có `--rm` |
| Không dùng `profiles` cho service tiện ích | `docker compose up` khởi động luôn cả chúng | Thêm `profiles: ["tools"]` |
| Dùng `run` mà mong cổng được publish | Không truy cập được từ máy thật | Thêm `--service-ports`, hoặc dùng `up` |
| Dùng `exec` khi service chưa chạy | `service "x" is not running` | Dùng `run` thay vì `exec` |
| Chạy `compose run` cho tác vụ dài mà quên `-d` không có tác dụng | `run` luôn gắn kèm terminal | Đó là hành vi đúng — `run` dành cho tác vụ có điểm kết thúc |
| Tưởng `run` dùng lại container của `up` | Nó tạo container **riêng biệt** | Muốn vào container đang chạy thì dùng `exec` |

---

## Tóm tắt Phase 7

- **Utility container** = chạy một lệnh rồi thoát, thay vì chạy ứng dụng liên tục. Nó giải bài toán **"dùng công cụ X phiên bản Y mà không cài lên máy"**.
- Đáng dùng nhất cho **nhiều phiên bản song song**, **CI/CD**, và **onboard người mới**. Không đáng cho công cụ dùng hằng ngày ở mọi dự án.
- Bốn cái giá: gõ nhiều hơn, chậm hơn ~200–500 ms mỗi lệnh, **quyền file trên Linux**, và mất ngữ cảnh máy.
- Trên Linux phải thêm **`-u $(id -u):$(id -g)`**, nếu không file tạo ra thuộc `root`. Lỗi này **không xuất hiện trên macOS** nên rất dễ bỏ sót.
- **`ENTRYPOINT` giới hạn phạm vi** — biến image thành một công cụ chuyên dụng thay vì một shell mở toang.
- Ba lệnh Compose khác nhau: **`up`** (khởi động stack), **`run`** (tác vụ một lần, container riêng, **không publish cổng**), **`exec`** (vào container **đang chạy**).
- **`profiles: ["tools"]`** giữ cho service tiện ích không bị khởi động cùng `docker compose up`.
- Luôn **`--rm`** với `compose run`, và đặt **bí danh** cho lệnh hay dùng.

---

**Phase kế tiếp** → [Bài 1: Setup Mục tiêu — Laravel & PHP Project](../phase-8/01-setup-muc-tieu-laravel-php.md)
