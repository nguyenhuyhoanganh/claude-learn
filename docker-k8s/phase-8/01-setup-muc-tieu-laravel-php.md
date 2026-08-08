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

```text
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

```text
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

```text
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

```text
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

## Vì sao Nginx và PHP phải là hai container riêng

Đây là điểm gây bối rối nhất khi mới nhìn kiến trúc 6 container: sao không gộp Nginx và PHP làm một như cách cài truyền thống?

Câu trả lời nằm ở chỗ **PHP không phải một máy chủ web**.

```text
   VỚI NODE.JS / PYTHON / GO
   ═════════════════════════
   Trình duyệt ──► Node.js (VỪA là máy chủ web VỪA chạy code)
                   → một tiến trình là đủ


   VỚI PHP
   ═══════
   Trình duyệt ──► Nginx ──────────────► PHP-FPM ──► trả kết quả
                   │                      │
              nhận HTTP,             CHỈ biết chạy code PHP,
              phục vụ file tĩnh,     KHÔNG hiểu HTTP
              chuyển .php sang
              cho PHP-FPM qua
              giao thức FastCGI
```

PHP-FPM **không nói HTTP**. Nó nói một giao thức khác tên là **FastCGI**, và cần một máy chủ web đứng trước dịch qua lại. Đây là kiến trúc của PHP từ đầu, không phải do Docker bày ra.

Vì vậy tách hai container **không phải là làm phức tạp hoá** — nó phản ánh đúng thực tế: đây vốn là **hai chương trình khác nhau, làm hai việc khác nhau**.

Ba lợi ích cụ thể của việc tách:

| Lợi ích | Chi tiết |
|---|---|
| **Scale độc lập** | Trang nhiều ảnh tĩnh cần nhiều Nginx; trang nhiều tính toán cần nhiều PHP-FPM |
| **Nâng cấp độc lập** | Đổi PHP 8.1 lên 8.3 không phải đụng tới Nginx |
| **Dùng image chính thức** | `nginx:stable-alpine` và `php:8.2-fpm-alpine` đều được vá bảo mật sẵn |

### Vì sao cả hai cùng gắn `/var/www/html`

Đây là chi tiết dễ bỏ qua nhưng quan trọng:

```text
   Nginx cần đọc:   file tĩnh (.css, .js, .jpg) và biết file .php CÓ TỒN TẠI không
   PHP-FPM cần đọc: chính các file .php để chạy

   → CẢ HAI cùng cần thấy thư mục mã nguồn
   → nên cùng gắn vào /var/www/html
```

Nếu chỉ gắn cho PHP mà quên Nginx, bạn sẽ nhận **404 cho mọi file tĩnh** trong khi trang PHP vẫn chạy — một triệu chứng rất khó hiểu nếu không biết lý do.

---

## Bẫy thường gặp

| Bẫy | Triệu chứng | Cách xử lý |
|---|---|---|
| Chỉ gắn mã nguồn cho PHP, quên Nginx | Trang PHP chạy nhưng **CSS/JS đều 404** | Cả hai container cùng gắn `/var/www/html` |
| Đường dẫn trong `nginx.conf` khác đường dẫn gắn trong container | `502 Bad Gateway` hoặc `File not found` | Đường dẫn trong config phải khớp **đường dẫn bên trong container** |
| Trỏ `fastcgi_pass` tới `localhost:9000` | Không kết nối được PHP | Trong Compose, dùng **tên service**: `fastcgi_pass php:9000` |
| Gộp Nginx và PHP vào một container | Mất khả năng scale/nâng cấp độc lập, và cần `supervisord` | Giữ tách |
| Quên `depends_on` cho MySQL | Laravel chết lúc khởi động vì chưa có database | `healthcheck` + `condition: service_healthy` ([Phase 6 bài 3](../phase-6/03-cau-hinh-services-chi-tiet.md)) |
| Quyền thư mục `storage/` của Laravel sai | `Permission denied` khi ghi log/cache | Đảm bảo user trong container PHP ghi được vào `storage/` |

---

## Tóm tắt bài 1

- Kiến trúc 6 container: **3 chạy liên tục** (Nginx, PHP-FPM, MySQL) và **3 tiện ích** (Composer, Artisan, NPM) chạy theo yêu cầu.
- **PHP-FPM không phải máy chủ web** — nó nói giao thức FastCGI chứ không nói HTTP. Vì vậy tách Nginx và PHP là phản ánh đúng thực tế, không phải làm phức tạp hoá.
- Ba lợi ích của việc tách: **scale độc lập**, **nâng cấp độc lập**, **dùng được image chính thức**.
- **Cả Nginx lẫn PHP đều phải thấy `/var/www/html`** — quên gắn cho Nginx sẽ làm mọi file tĩnh trả về 404 trong khi trang PHP vẫn chạy.
- Trong Compose, Nginx trỏ tới PHP bằng **tên service** (`fastcgi_pass php:9000`), không phải `localhost`.

---

**Bài kế tiếp** → [Bài 2: Application Containers — Nginx, PHP, MySQL](02-application-containers.md)
