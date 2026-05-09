# Bài 1: Setup Mục tiêu — Laravel & PHP Project

## Tại sao Laravel là ví dụ tốt cho Docker?

Node.js: cài 1 tool → xong, bắt đầu code ngay.

PHP/Laravel: cần cài **nhiều thứ** trên máy:
- PHP runtime (đúng version)
- Composer (package manager của PHP)
- Nhiều PHP extensions (pdo, pdo_mysql, mbstring, xml...)
- Web server (Nginx hoặc Apache)
- MySQL database
- Node.js + npm (cho front-end assets của Laravel)

→ **Phức tạp, dễ version conflict, mỗi dev khác nhau.**

Với Docker: chỉ cần Docker, mọi thứ trong containers.

---

## Kiến trúc 6 Containers

```
┌─────────────────────────────────────────────────────────────────┐
│                    Application Containers                        │
│                   (Chạy liên tục với compose up)                │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │    Nginx     │    │    PHP       │    │     MySQL        │  │
│  │  Web Server  │───▶│ Interpreter  │───▶│    Database      │  │
│  │  port 8000   │    │  port 9000   │    │    port 3306     │  │
│  │  (internal)  │    │  (internal)  │    │    (internal)    │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     Utility Containers                           │
│               (Chạy 1 lần với docker compose run)               │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   Composer   │    │   Artisan    │    │      NPM         │  │
│  │ (PHP pkgs)   │    │ (Laravel CLI)│    │  (JS assets)     │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Luồng request

```
Browser
  │ HTTP (localhost:8000)
  ▼
Nginx Container
  │ Forward .php requests (port 9000, container name "php")
  ▼
PHP Container
  │ Connect to DB (port 3306, container name "mysql")
  ▼
MySQL Container
```

---

## Cấu trúc Project

```
laravel-docker/
├── docker-compose.yml
├── dockerfiles/
│   ├── nginx.dockerfile    ← Custom Nginx image
│   ├── php.dockerfile      ← Custom PHP image
│   └── composer.dockerfile ← Composer utility image
├── nginx/
│   └── nginx.conf          ← Nginx configuration
├── env/
│   └── mysql.env           ← MySQL environment variables
└── src/                    ← Laravel source code (được tạo bởi Composer)
```

---

## Thư mục `/var/www/html` — Điểm chung

Tất cả containers share cùng một quy ước: source code nằm ở `/var/www/html` trong container.

```
Nginx container: /var/www/html  ← Serve files từ đây
PHP container:   /var/www/html  ← Interpret PHP files từ đây
Artisan/NPM:     /var/www/html  ← Run commands từ đây

Host:            ./src          ← Bind mount vào /var/www/html
```

---

## Điểm mới so với các Phase trước

| Tính năng | Phase này |
|---|---|
| Build context cho nested Dockerfiles | `context: .` thay vì `context: ./dockerfiles` |
| `entrypoint` trong compose file | Không cần Dockerfile riêng cho mọi thứ |
| `working_dir` trong compose file | Override WORKDIR của Dockerfile |
| Bind mount từng file (không phải folder) | Nginx config file |
| `docker compose up server` | Start một service + dependencies |
| Bind mount + COPY kết hợp | Development + Production ready |

---

**Tiếp theo:** Application Containers (Nginx + PHP + MySQL) →
