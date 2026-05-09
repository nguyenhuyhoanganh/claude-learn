# Bài 5: COPY vs Bind Mounts — Development & Production

## Vấn đề với Bind Mounts trong Production

Bind mounts rất tiện trong development, nhưng **không phù hợp cho production**:

```
Development (laptop):
  Container mount → ./src trên laptop
  → Code luôn fresh, live-reload

Production (server):
  Container mount → ./src trên server???
  → ./src không có ở đó!
  → Container không hoạt động

Vấn đề: Bind mount phụ thuộc vào cấu trúc folder của host machine
```

**Nguyên tắc containers:** Container phải tự đủ — mọi thứ nó cần phải nằm trong image.

---

## Giải pháp: Kết hợp COPY + Bind Mount

```
Image chứa snapshot của code (qua COPY)
  ↕ (development)
Bind mount override với code mới nhất

Production: không có bind mount → dùng snapshot trong image
Development: bind mount override → luôn có code mới nhất
```

---

## Cập nhật dockerfiles/nginx.dockerfile

```dockerfile
FROM nginx:stable-alpine

# Set working directory đến nơi nginx config cần
WORKDIR /etc/nginx/conf.d

# COPY config vào image (snapshot)
COPY nginx/nginx.conf .
RUN mv nginx.conf default.conf

# COPY source code snapshot vào image
WORKDIR /var/www/html
COPY src .
```

**Trong docker-compose.yml**, vẫn giữ bind mount cho development:
```yaml
server:
  build:
    context: .
    dockerfile: dockerfiles/nginx.dockerfile
  volumes:
    - ./src:/var/www/html    # Override snapshot bằng live code
    - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf
```

---

## Cập nhật dockerfiles/php.dockerfile

```dockerfile
FROM php:8.2-fpm-alpine

WORKDIR /var/www/html

RUN docker-php-ext-install pdo pdo_mysql

# COPY source code snapshot
COPY src .

# Cấp quyền write (Laravel cần ghi files)
RUN chown -R www-data:www-data /var/www/html
```

**Tại sao cần `chown`?**

```
PHP-FPM chạy với user "www-data" (user mặc định của PHP image)
Laravel cần ghi files vào /var/www/html:
  - storage/logs/
  - bootstrap/cache/
  - vendor/ (một số files)

Không có chown:
  → www-data không có quyền ghi
  → Permission denied errors
  → Application crashes

Với chown -R www-data:www-data /var/www/html:
  → www-data sở hữu toàn bộ /var/www/html
  → Có thể đọc và ghi thoải mái
```

---

## Build Context — Điều Quan trọng

```yaml
# Sai: context = ./dockerfiles
php:
  build:
    context: ./dockerfiles    # COPY src . → Không tìm thấy ./dockerfiles/src
    dockerfile: php.dockerfile  # BUILD FAILS!

# Đúng: context = . (root)
php:
  build:
    context: .                # COPY src . → Tìm thấy ./src
    dockerfile: dockerfiles/php.dockerfile
```

**Quy tắc:** Context phải là folder cha của tất cả folders/files mà Dockerfile cần COPY.

```
project/
├── docker-compose.yml
├── dockerfiles/
│   ├── nginx.dockerfile    ← Cần COPY nginx/ và src/ → context = .
│   └── php.dockerfile      ← Cần COPY src/ → context = .
├── nginx/
│   └── nginx.conf
└── src/
    └── (Laravel files)

Context = . (project root) cho cả 2 Dockerfiles
```

---

## Artisan cũng cần cập nhật context

Artisan dùng php.dockerfile mà context phải là root:

```yaml
artisan:
  build:
    context: .                         # Trước: context: ./dockerfiles
    dockerfile: dockerfiles/php.dockerfile
```

---

## Tóm tắt: Development vs Production Mode

| | Development | Production |
|---|---|---|
| Code source | Bind mount (live) | COPY trong image (snapshot) |
| Config files | Bind mount | COPY trong image |
| Rebuild cần | Khi Dockerfile thay đổi | Khi code thay đổi |
| Cách chạy | `docker compose up` | `docker run` hoặc orchestrator |
| Bind mounts | Có | Không |

### Development (Dockerfile với COPY + Compose với Bind Mount)

```
Image build:  COPY src .  → snapshot
↕
Runtime:  -v ./src:/var/www/html  → override với live code
```

### Production (chỉ dùng COPY từ Dockerfile)

```
Image build:  COPY src .  → snapshot
Runtime:  không có bind mount  → dùng snapshot
```

---

## Tổng kết Phase 8

Bạn đã học:

1. **Kiến trúc 6 containers**: 3 app (Nginx, PHP, MySQL) + 3 utility (Composer, Artisan, NPM)
2. **Nginx config**: Serve static files, forward PHP requests đến PHP-FPM
3. **PHP custom Dockerfile**: Extensions, working directory, `chown` cho quyền write
4. **Build context**: Phải bao gồm tất cả folders mà COPY cần truy cập
5. **3 cách define utility container**: Custom Dockerfile, shared Dockerfile + override, official image + compose config
6. **`entrypoint` trong compose**: Override/set entrypoint mà không cần Dockerfile riêng
7. **`working_dir` trong compose**: Override WORKDIR
8. **`docker compose up <service>`**: Start service cụ thể + dependencies
9. **COPY + Bind Mount kết hợp**: Development (live) + Production (snapshot)
10. **`chown` command**: Cấp quyền write cho PHP-FPM user

---

**Tiếp theo:** Phase 9 — Deploying Docker Containers →
