# Bài 4: Chạy Services Có Chọn lọc

## Workflow thực tế

Khi làm việc với project Laravel, không phải lúc nào cũng cần chạy tất cả 6 services. Cần phân biệt:

```
Lúc setup ban đầu:
  → composer create-project    (1 lần)
  → artisan migrate            (1 lần hoặc khi schema thay đổi)

Lúc development hàng ngày:
  → server + php + mysql       (chạy liên tục)
  → artisan, npm               (khi cần)
```

---

## `docker compose up <service>` — Chạy Một Số Services

```bash
# Start tất cả services (cả utility containers — không mong muốn)
docker compose up

# Start chỉ server (và dependencies: php + mysql)
docker compose up server

# Start tất cả app containers (không utility)
docker compose up server php mysql
```

### `depends_on` làm cho nó clean hơn

```yaml
services:
  server:
    depends_on:
      - php
      - mysql
```

```bash
# Chạy 1 lệnh → start 3 services
docker compose up server
# → Docker biết server cần php và mysql → start cả 3
```

---

## `docker compose up --build` — Force Rebuild Images

Theo mặc định, nếu image đã tồn tại, Compose **không rebuild**:

```bash
# Lần 1: Build image và start
docker compose up -d --build server

# Sửa php.dockerfile (thêm extension mới)

# Lần 2: Compose dùng image cũ — KHÔNG rebuild
docker compose up -d server
# ← Extension mới chưa được cài

# Giải pháp: --build
docker compose up -d --build server
# → Evaluate lại Dockerfile, rebuild nếu có thay đổi
# → Layer cache vẫn được dùng nếu layer không đổi (nhanh)
```

**Khuyến nghị:** Luôn dùng `--build` trong development để an toàn:
```bash
docker compose up -d --build server
```

---

## `docker compose run` — Chạy Utility Commands

```bash
# Tạo Laravel project (chỉ cần làm 1 lần)
docker compose run --rm composer create-project laravel/laravel .

# Run migrations
docker compose run --rm artisan migrate

# Install npm packages
docker compose run --rm npm install

# Build assets
docker compose run --rm npm run build
```

---

## Workflow từ đầu đến cuối

```bash
# === STEP 1: Tạo project (1 lần) ===
docker compose run --rm composer create-project laravel/laravel .
# → src/ được điền với Laravel code

# === STEP 2: Cấu hình src/.env ===
# Sửa database connection:
# DB_HOST=mysql
# DB_DATABASE=homestead
# DB_USERNAME=homestead
# DB_PASSWORD=secret

# === STEP 3: Start app containers ===
docker compose up -d --build server
# → Nginx + PHP + MySQL chạy

# === STEP 4: Setup database ===
docker compose run --rm artisan migrate
# → Tạo tables trong MySQL

# === STEP 5: Install frontend deps (nếu cần) ===
docker compose run --rm npm install
docker compose run --rm npm run dev

# === HÀNG NGÀY ===
# Sáng: bắt đầu làm việc
docker compose up -d server

# Thêm feature mới + migration
docker compose run --rm artisan make:migration create_posts_table
docker compose run --rm artisan migrate

# Cuối ngày
docker compose down
```

---

## Tóm tắt Các Lệnh

```bash
# Setup ban đầu
docker compose run --rm composer create-project laravel/laravel .

# Development (hàng ngày)
docker compose up -d --build server        # Start app
docker compose run --rm artisan migrate    # Migrations
docker compose run --rm npm run dev        # Frontend

# Utility tasks
docker compose run --rm artisan make:model Post -m
docker compose run --rm artisan db:seed
docker compose run --rm npm install <package>

# Stop
docker compose down                        # Keep data (volumes)
docker compose down -v                     # Remove data
```

---

**Tiếp theo:** COPY vs Bind Mounts — Development vs Production →
