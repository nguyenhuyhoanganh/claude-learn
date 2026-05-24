# Bài 1: Tổng quan phase-4 — cấu hình NGINX sâu

Phase-2 đã đụng tay vào NGINX qua Docker với load balancer cơ bản. Phase này đi **sâu hơn vào cấu hình** — học các vai trò khác nhau của NGINX và bật các tính năng quan trọng nhất production: HTTPS, TLS 1.3, HTTP/2.

Bài 1 này là setup + cấu trúc thư mục. Sau khi xong, 5 bài còn lại đào sâu từng vai trò/tính năng.

## Lộ trình phase-4

```text
   Bài 1 (đây) ─► Setup + install NGINX
   Bài 2       ─► NGINX as web server (static)
   Bài 3       ─► NGINX as Layer 7 reverse proxy (path-based routing)
   Bài 4       ─► NGINX as Layer 4 (stream) proxy
   Bài 5       ─► Enable HTTPS với Let's Encrypt
   Bài 6       ─► Bật TLS 1.3 + HTTP/2
```

Mỗi bài đứng độc lập. Có thể skip nếu đã biết, hoặc tập trung vào use case của bạn.

## Cài đặt NGINX

### macOS — Homebrew

```bash
brew install nginx
```

Sau cài:
```bash
brew info nginx
# nginx: stable 1.25.x
# 
# Docroot is: /opt/homebrew/var/www
# 
# The default port has been set in /opt/homebrew/etc/nginx/nginx.conf to 8080
# 
# nginx will load all files in /opt/homebrew/etc/nginx/servers/.
```

`brew install` đặt default port `8080` thay vì `80` — để chạy không cần `sudo`.

### Ubuntu/Debian

```bash
sudo apt-get update
sudo apt-get install -y nginx

# Verify
nginx -v
# nginx version: nginx/1.24.0 (Ubuntu)

# Start service
sudo systemctl start nginx
sudo systemctl enable nginx        # tự start lúc boot
```

Default config ở `/etc/nginx/nginx.conf`. Site config ở `/etc/nginx/sites-available/`, enable bằng symlink sang `/etc/nginx/sites-enabled/`.

### RHEL/CentOS/Fedora

```bash
sudo dnf install nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### Trong Docker (recommended cho course)

```bash
docker run -d --name ng \
  -p 8080:80 \
  -v $(pwd)/nginx.conf:/etc/nginx/nginx.conf \
  nginx:1.25
```

→ Cho khoá học và dev, Docker là lựa chọn sạch nhất. Production thường dùng package manager + systemd.

## Vị trí file quan trọng

Sau khi cài, biết các file/folder sau:

| Path (Debian/Ubuntu) | Mục đích |
|---|---|
| `/etc/nginx/nginx.conf` | Main config |
| `/etc/nginx/conf.d/*.conf` | Include — server block thêm vào |
| `/etc/nginx/sites-available/` | Site config (Debian-style) |
| `/etc/nginx/sites-enabled/` | Site được enable (symlink) |
| `/etc/nginx/mime.types` | Mapping extension → MIME type |
| `/etc/nginx/snippets/` | Config snippet tái sử dụng |
| `/var/log/nginx/access.log` | Access log |
| `/var/log/nginx/error.log` | Error log |
| `/var/www/html/` | Default docroot (static files) |
| `/var/run/nginx.pid` | PID file của master process |

> macOS Homebrew khác (`/opt/homebrew/etc/nginx/...`), nhưng cấu trúc tương tự.

## 5 lệnh CLI phải nhớ

```bash
nginx -t                          # test syntax config — LUÔN chạy trước reload
nginx -s reload                   # reload config không drop connection
nginx -s stop                     # stop ngay
nginx -s quit                     # graceful stop (worker xong việc rồi stop)
nginx -V                          # phiên bản + module compile sẵn
```

> **Quy tắc vàng**: trước khi reload production, **luôn** `nginx -t` để verify config. Reload với syntax sai = NGINX die.

## Cấu trúc file nginx.conf — block hierarchy

```nginx
# Global directives (top-level)
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    multi_accept on;
}

http {
    # HTTP-level directives
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    sendfile on;
    
    log_format main '$remote_addr - $remote_user [$time_local] "$request" ...';
    access_log /var/log/nginx/access.log main;
    
    keepalive_timeout 65;

    # Upstream definitions
    upstream backend {
        server app1:8080;
        server app2:8080;
    }

    # Server blocks — virtual hosts
    server {
        listen 80;
        server_name example.com;
        
        location / {
            root /var/www/html;
            index index.html;
        }
        
        location /api/ {
            proxy_pass http://backend;
        }
    }

    server {
        listen 443 ssl;
        # ...
    }
}

# Layer 4 (TCP/UDP) — tách context riêng
stream {
    upstream pg_cluster {
        server pg1:5432;
        server pg2:5432;
    }
    server {
        listen 5432;
        proxy_pass pg_cluster;
    }
}
```

**Hierarchy**:

```text
global (top-level)
├── events           — connection management
├── http             — HTTP/HTTPS context (Layer 7)
│   ├── upstream     — backend pool
│   └── server       — virtual host
│       └── location — URL matching block
└── stream           — TCP/UDP context (Layer 4)
    ├── upstream
    └── server
```

Đa số directive **kế thừa từ context cha**. Đặt `keepalive_timeout 30;` ở `http` → cả `server` và `location` inherit, trừ khi override.

## Setup 4 backend cho phase này

Các bài sau sẽ proxy đến 4 Node.js app. Spin up trước:

`app/index.js`:
```javascript
const express = require('express');
const app = express();

const APP_ID = process.env.APP_ID || 'unknown';

app.get('/', (req, res) => res.send(`I am app ${APP_ID}\n`));
app.get('/app1', (req, res) => res.send(`Hello from /app1 on ${APP_ID}\n`));
app.get('/app2', (req, res) => res.send(`Hello from /app2 on ${APP_ID}\n`));
app.get('/admin', (req, res) => res.send(`Admin page on ${APP_ID}\n`));

app.listen(9999, () => console.log(`Listening on 9999 (app ${APP_ID})`));
```

Dockerfile:
```dockerfile
FROM node:18-alpine
WORKDIR /home/node/app
COPY app/package.json .
RUN npm install --omit=dev
COPY app/ .
EXPOSE 9999
CMD ["node", "index.js"]
```

Build và spin up:

```bash
docker build -t node-app:1 .

docker run -d --name app1 -p 2222:9999 -e APP_ID=2222 node-app:1
docker run -d --name app2 -p 3333:9999 -e APP_ID=3333 node-app:1
docker run -d --name app3 -p 4444:9999 -e APP_ID=4444 node-app:1
docker run -d --name app4 -p 5555:9999 -e APP_ID=5555 node-app:1
```

Test:
```bash
curl http://localhost:2222/         # I am app 2222
curl http://localhost:3333/         # I am app 3333
curl http://localhost:4444/app1     # Hello from /app1 on 4444
```

→ Có 4 backend chạy, mỗi cái respond với APP_ID riêng. Test load balancing sẽ thấy round-robin.

## Workflow chuẩn để viết config

1. **Sửa nginx.conf** (bind mount nếu Docker, hoặc edit trực tiếp nếu cài system).
2. **Test syntax**: `nginx -t` (trong Docker: `docker exec ng nginx -t`).
3. **Reload**: `nginx -s reload`.
4. **Test request**: `curl -v ...`.
5. **Check log nếu lỗi**: `tail -f /var/log/nginx/error.log` hoặc `docker logs -f ng`.

Vòng lặp này lặp 50 lần mỗi session debug — quen nó.

## Khi NÀO config sẽ vỡ?

| Symptom | Nguyên nhân thường gặp |
|---|---|
| `nginx: [emerg] unknown directive "xxx"` | Sai tên directive hoặc module không có |
| `nginx: [emerg] host not found in upstream` | DNS resolve thất bại (custom network sai, hoặc backend chưa start) |
| `nginx: [emerg] bind() failed (98: Address already in use)` | Port đã bị app khác chiếm |
| `nginx: [emerg] open() "/path" failed` | File config include không tồn tại, hoặc cert path sai |
| Reload OK nhưng request 404 | Location/server block không match — kiểm tra server_name, listen port |
| Reload OK nhưng request 502 | Upstream down, hoặc resolver/timeout sai |
| Reload OK nhưng SSL fail | Cert/key file sai path, hoặc chain incomplete |

## Bonus: minimal Dockerfile cho phase này

Nếu bạn không thích thay đổi `nginx.conf` qua bind mount, có thể bake vào image:

```dockerfile
FROM nginx:1.25
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80 443
```

Build và run:
```bash
docker build -t my-nginx:1 .
docker run -d -p 80:80 -p 443:443 my-nginx:1
```

Mỗi lần sửa config = rebuild + re-run. Slow hơn bind mount nhưng immutable — phù hợp production.

## Tóm tắt bài 1

- Cài NGINX qua brew (macOS), apt (Debian), dnf (RHEL), hoặc Docker (lý tưởng cho course).
- Cấu trúc config: global → events / http / stream → upstream / server / location.
- 5 lệnh CLI: `-t` (test), `-s reload`, `-s stop`, `-s quit`, `-V` (version).
- Workflow chuẩn: sửa → `nginx -t` → reload → test → log.
- 4 backend test setup sẵn cho các bài tiếp.

**Bài kế tiếp** → [Bài 2: NGINX as web server — serve static content production-grade](02-nginx-web-server.md)
