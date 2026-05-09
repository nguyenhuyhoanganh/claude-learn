# Bài 2: Application Containers — Nginx, PHP, MySQL

## Service 1: Nginx Web Server

### nginx/nginx.conf

Nginx cần config để biết forward request PHP đến đâu:

```nginx
server {
    listen 80;
    index index.php index.html;
    server_name localhost;
    root /var/www/html/public;    # Laravel public folder

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        try_files $uri =404;
        fastcgi_split_path_info ^(.+\.php)(/.+)$;
        fastcgi_pass php:9000;    # Forward đến "php" container, port 9000
        fastcgi_index index.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param PATH_INFO $fastcgi_path_info;
    }
}
```

**Quan trọng:** `fastcgi_pass php:9000` — dùng service name "php" làm hostname, Docker resolve.

### dockerfiles/nginx.dockerfile

```dockerfile
FROM nginx:stable-alpine

WORKDIR /etc/nginx/conf.d

COPY nginx/nginx.conf .

RUN mv nginx.conf default.conf

WORKDIR /var/www/html

COPY src .
```

### docker-compose.yml (server service)

```yaml
services:
  server:
    build:
      context: .                           # Root folder (quan trọng!)
      dockerfile: dockerfiles/nginx.dockerfile
    ports:
      - "8000:80"
    volumes:
      - ./src:/var/www/html               # Bind mount source code
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf  # Bind mount config file
    depends_on:
      - php
      - mysql
```

**`context: .`** — Tại sao không dùng `context: ./dockerfiles`?

```
Nginx Dockerfile cần truy cập:
  - nginx/nginx.conf    → nằm ngoài ./dockerfiles
  - src/                → nằm ngoài ./dockerfiles

Nếu context = ./dockerfiles:
  → Không thể COPY nginx/nginx.conf
  → BUILD FAILS!

Giải pháp: context = . (root folder)
  → Dockerfile tìm thấy cả nginx/ và src/
  → Chỉ cần chỉ rõ đường dẫn dockerfile
```

---

## Service 2: PHP Interpreter

PHP cần được customize vì cần extension cho Laravel.

### dockerfiles/php.dockerfile

```dockerfile
FROM php:8.2-fpm-alpine

WORKDIR /var/www/html

# Cài extensions PHP mà Laravel cần
RUN docker-php-ext-install pdo pdo_mysql

# Cấp quyền write cho www-data user (cần cho Laravel)
RUN chown -R www-data:www-data /var/www/html
```

**Các điểm quan trọng:**
- `php:8.2-fpm-alpine`: PHP với FPM (FastCGI Process Manager), Alpine base
- `docker-php-ext-install`: Tool có sẵn trong PHP official image để cài extensions
- `pdo` + `pdo_mysql`: Extensions để kết nối MySQL từ PHP
- Không có CMD/ENTRYPOINT: Dùng default từ base image (PHP-FPM daemon, port 9000)
- `chown`: Cho phép PHP-FPM user write files (views cache, logs...)

### docker-compose.yml (php service)

```yaml
services:
  php:
    build:
      context: .
      dockerfile: dockerfiles/php.dockerfile
    volumes:
      - ./src:/var/www/html:delegated     # :delegated = optimize write performance
    # Không publish port! Chỉ nginx (cùng network) cần gọi vào đây
```

**Tại sao không publish port 9000?**

```
Nginx → PHP: Container-to-container trong cùng network
→ Không cần publish port ra ngoài
→ fastcgi_pass php:9000 hoạt động nội bộ

Nếu publish: -p 9000:9000
→ Port sẽ bị lộ ra ngoài (security risk, không cần thiết)
```

---

## Service 3: MySQL Database

MySQL có official image, không cần Dockerfile riêng.

### env/mysql.env

```bash
MYSQL_DATABASE=homestead
MYSQL_USER=homestead
MYSQL_PASSWORD=secret
MYSQL_ROOT_PASSWORD=secret
```

### docker-compose.yml (mysql service)

```yaml
services:
  mysql:
    image: mysql:5.7
    env_file:
      - ./env/mysql.env
    volumes:
      - mysql-data:/var/lib/mysql    # Named volume để persist database

volumes:
  mysql-data:
```

### Kết nối từ Laravel

```env
# src/.env (Laravel config)
DB_CONNECTION=mysql
DB_HOST=mysql              # Service name — Docker resolve
DB_PORT=3306
DB_DATABASE=homestead
DB_USERNAME=homestead
DB_PASSWORD=secret
```

---

## Full `docker-compose.yml` (Application Containers)

```yaml
version: "3.8"

services:

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

volumes:
  mysql-data:
```

```bash
# Khởi động chỉ 3 app containers (server + deps tự động)
docker compose up -d --build server
# → Tự start php và mysql vì server depends_on chúng
```

---

**Tiếp theo:** Utility Containers — Composer, Artisan, NPM →
