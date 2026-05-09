# Bài 3: Utility Containers — Composer, Artisan, NPM

## Utility Container 1: Composer

Composer = Package manager của PHP (như npm cho Node.js).
Dùng để: tạo Laravel project, cài PHP packages.

### dockerfiles/composer.dockerfile

```dockerfile
FROM composer:latest        # Official composer image đã có sẵn!

WORKDIR /var/www/html

ENTRYPOINT ["composer", "--ignore-platform-reqs"]
# --ignore-platform-reqs: bỏ qua warnings về missing extensions
# Cần vì container có thể thiếu một số PHP extensions không quan trọng
```

### docker-compose.yml (composer service)

```yaml
services:
  composer:
    build:
      context: ./dockerfiles
      dockerfile: composer.dockerfile
    volumes:
      - ./src:/var/www/html    # Tạo project trong src/
```

### Tạo Laravel Project

```bash
# Tạo Laravel app mới vào ./src/
docker compose run --rm composer create-project laravel/laravel .
# ENTRYPOINT = composer
# "create-project laravel/laravel ." được append sau
# Kết quả: Laravel app xuất hiện trong ./src/ (via bind mount)
```

---

## Utility Container 2: Artisan

Artisan = CLI tool của Laravel (built-in, PHP).
Dùng để: run migrations, generate code, clear cache...

### Không cần Dockerfile riêng

Artisan cần PHP → Dùng lại `php.dockerfile`.
Nhưng cần override entrypoint → Có thể làm trong `docker-compose.yml`!

```yaml
services:
  artisan:
    build:
      context: .
      dockerfile: dockerfiles/php.dockerfile    # Dùng lại PHP image
    volumes:
      - ./src:/var/www/html
    entrypoint: ["php", "/var/www/html/artisan"]  # Override trong compose!
    # artisan là file PHP trong Laravel project
    # Khi run: php artisan <command>
```

### Sử dụng

```bash
# Run migrations (tạo tables trong MySQL)
docker compose run --rm artisan migrate

# Seed database
docker compose run --rm artisan db:seed

# Generate model
docker compose run --rm artisan make:model Post

# Clear cache
docker compose run --rm artisan config:clear
```

---

## Utility Container 3: NPM

Laravel dùng npm cho front-end assets (JavaScript, CSS).

### Không cần Dockerfile — Cấu hình trong Compose

```yaml
services:
  npm:
    image: node:18-alpine           # Dùng official image trực tiếp!
    working_dir: /var/www/html      # Override WORKDIR trong compose
    entrypoint: ["npm"]             # Override/set ENTRYPOINT trong compose
    volumes:
      - ./src:/var/www/html
    stdin_open: true                # -i (cho npm init hỏi input)
    tty: true                       # -t
```

**`working_dir` trong compose** = `WORKDIR` trong Dockerfile, nhưng không cần Dockerfile riêng.

### Sử dụng

```bash
# Install dependencies
docker compose run --rm npm install

# Build assets
docker compose run --rm npm run build

# Development watch mode
docker compose run --rm npm run dev
```

---

## Tổng hợp: 3 Cách Define Utility Containers

### Cách 1: Dockerfile với ENTRYPOINT (Composer)

```dockerfile
# composer.dockerfile
FROM composer:latest
WORKDIR /var/www/html
ENTRYPOINT ["composer", "--ignore-platform-reqs"]
```
```yaml
composer:
  build:
    context: ./dockerfiles
    dockerfile: composer.dockerfile
```
→ Tốt khi cần custom nhiều thứ

### Cách 2: Shared Dockerfile + Override trong Compose (Artisan)

```yaml
artisan:
  build:
    context: .
    dockerfile: dockerfiles/php.dockerfile    # Dùng lại
  entrypoint: ["php", "/var/www/html/artisan"]  # Override
```
→ Tái sử dụng Dockerfile, thêm entrypoint trong compose

### Cách 3: Official Image + Config trong Compose (NPM)

```yaml
npm:
  image: node:18-alpine           # Không cần Dockerfile!
  working_dir: /var/www/html
  entrypoint: ["npm"]
```
→ Đơn giản nhất, không cần Dockerfile

---

## Full `docker-compose.yml` — Tất cả 6 Services

```yaml
version: "3.8"

services:

  # === APPLICATION CONTAINERS ===
  server:
    build:
      context: .
      dockerfile: dockerfiles/nginx.dockerfile
    ports:
      - "8000:80"
    volumes:
      - ./src:/var/www/html
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf
    depends_on:
      - php
      - mysql

  php:
    build:
      context: .
      dockerfile: dockerfiles/php.dockerfile
    volumes:
      - ./src:/var/www/html:delegated

  mysql:
    image: mysql:5.7
    env_file:
      - ./env/mysql.env
    volumes:
      - mysql-data:/var/lib/mysql

  # === UTILITY CONTAINERS ===
  composer:
    build:
      context: ./dockerfiles
      dockerfile: composer.dockerfile
    volumes:
      - ./src:/var/www/html

  artisan:
    build:
      context: .
      dockerfile: dockerfiles/php.dockerfile
    volumes:
      - ./src:/var/www/html
    entrypoint: ["php", "/var/www/html/artisan"]

  npm:
    image: node:18-alpine
    working_dir: /var/www/html
    entrypoint: ["npm"]
    volumes:
      - ./src:/var/www/html
    stdin_open: true
    tty: true

volumes:
  mysql-data:
```

---

**Tiếp theo:** Chạy Services có chọn lọc và `--build` flag →
