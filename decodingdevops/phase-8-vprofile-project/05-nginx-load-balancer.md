# Bài 5: nginx reverse proxy và end-to-end validation

Bài cuối manual setup. Setup nginx reverse proxy ở **web01** → forward traffic đến Tomcat app01. End-to-end test stack đầy đủ.

## Vì sao nginx?

App01 đã expose Tomcat port 8080. Tại sao phải thêm web01 với nginx?

- **Security**: app01 chỉ accept từ web01 (LAN internal), không expose internet trực tiếp.
- **Performance**: nginx cache static asset, serve nhanh hơn Tomcat.
- **Scalability**: nginx load balance giữa nhiều app01, app02, app03 sau này.
- **SSL termination**: nginx handle HTTPS, app01 chỉ HTTP nội bộ → đơn giản.
- **URL routing**: 1 domain → nhiều backend (vd `/api` → Tomcat, `/static` → CDN).

Pattern **reverse proxy** là chuẩn ngành cho mọi web app modern.

## Setup web01

```bash
vagrant ssh web01
sudo -i
```

### 1. Install nginx

```bash
apt update
apt install -y nginx
systemctl enable --now nginx
systemctl status nginx
```

Test default page:

```bash
curl http://localhost
# <title>Welcome to nginx!</title>
```

Browser host: `http://192.168.56.11` → nginx welcome.

### 2. Tạo config reverse proxy

Tạo file `/etc/nginx/sites-available/vprofileapp`:

```bash
cat > /etc/nginx/sites-available/vprofileapp <<'EOF'
upstream vprofile_backend {
    server app01:8080;
}

server {
    listen 80 default_server;
    server_name _;

    access_log /var/log/nginx/vprofile-access.log;
    error_log /var/log/nginx/vprofile-error.log;

    location / {
        proxy_pass http://vprofile_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeout
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF
```

### 3. Enable site

Symlink để nginx load:

```bash
ln -s /etc/nginx/sites-available/vprofileapp /etc/nginx/sites-enabled/vprofileapp

# Xoá default
rm /etc/nginx/sites-enabled/default
```

### 4. Test config + reload

```bash
nginx -t
# nginx: configuration file /etc/nginx/nginx.conf test is successful

systemctl reload nginx
```

> **Luôn `nginx -t` trước reload** — sai syntax = service down.

### 5. Verify

```bash
curl http://localhost
# vProfile login page HTML (đến từ app01)
```

Browser host: `http://192.168.56.11` → login form vProfile.

## Anatomy của config

```nginx
upstream vprofile_backend {
    server app01:8080;
    # server app02:8080;   ← Có thể thêm nhiều backend
    # server app03:8080 weight=2;
}

server {
    listen 80;
    server_name vprofile.example.com;
    # ↑ Nếu có DNS thật. Wildcard "_" cho mọi domain.

    location / {
        proxy_pass http://vprofile_backend;
        # ↑ "/" path → upstream backend

        # Header forward
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

| Phần | Vai trò |
|---|---|
| `upstream` | Define pool backend |
| `server` | Define virtual host |
| `listen` | Port nginx lắng nghe |
| `server_name` | Domain match |
| `location /` | Pattern URL |
| `proxy_pass` | Forward đến upstream |
| `proxy_set_header` | Forward header app cần biết |

## Load balancing nâng cao

Khi có nhiều Tomcat backend:

```nginx
upstream vprofile_backend {
    least_conn;                # Strategy: ít connection nhất
    server app01:8080 weight=3;
    server app02:8080 weight=1;
    server app03:8080 max_fails=3 fail_timeout=30s;
    server app04:8080 backup;  # Chỉ dùng khi tất cả primary fail
}
```

Strategies:
- `round-robin` (default): xoay tròn.
- `least_conn`: ít connection.
- `ip_hash`: cùng client IP → cùng backend (session sticky).
- `least_time` (commercial): ít latency.

## Static asset cache

Tomcat phục vụ JSP/JAR — chậm hơn nginx phục vụ HTML/CSS/JS static. Pattern:

```nginx
server {
    listen 80;

    # Static asset — serve trực tiếp từ nginx, cache aggressive
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff|woff2)$ {
        root /var/www/html;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Mọi thứ khác → Tomcat
    location / {
        proxy_pass http://vprofile_backend;
    }
}
```

Lab này skip để đơn giản.

## HTTPS với Let's Encrypt

Production cần HTTPS. Free cert từ Let's Encrypt:

```bash
# Cài certbot
apt install -y certbot python3-certbot-nginx

# Lấy cert (cần domain DNS đã trỏ về IP server)
certbot --nginx -d vprofile.example.com

# Auto-renew cron đã setup sẵn
systemctl status certbot.timer
```

Lab này dùng IP nên không setup HTTPS. Section AWS sẽ làm với domain thật.

## End-to-end validation

Test toàn stack từ browser:

### 1. Browser → nginx

```bash
# Host
curl -I http://192.168.56.11
# HTTP/1.1 200 OK
# Server: nginx/1.x.x
```

### 2. nginx → Tomcat → MySQL

```bash
# Browser
http://192.168.56.11
# → vProfile login page

# Login admin_vp / admin_vp
# → Dashboard
```

### 3. Cache hit/miss với Memcached

```bash
# Click vào "User List" — query MySQL, cache lên Memcached.
# Click lại — lấy từ cache (nhanh hơn).

# Trên mc01, check stats:
vagrant ssh mc01
echo "stats" | nc localhost 11211 | grep -E "cmd_get|cmd_set|hits|misses"
```

### 4. Message với RabbitMQ

```bash
# Browser → trang nào trigger event (vd notification setting)
# Mở RabbitMQ UI: http://192.168.56.14:15672 → tab Queues
# Xem message in/out.
```

## Network architecture cuối

```text
                 +─────────+
                 │ Browser │
                 +────┬────+
                      │ http://192.168.56.11
                      ▼
                 +─────────+
                 │ nginx   │  (web01)
                 │ proxy   │
                 +────┬────+
                      │ proxy_pass app01:8080
                      ▼
                 +─────────+
                 │ Tomcat  │  (app01)
                 │ vProfile│
                 +─┬───┬──┬+
                   │   │  │
            JDBC   │   │  │  AMQP
            3306   │   │  │  5672
                   ▼   │  ▼
              +────────+ │  +────────+
              │ MySQL  │ │  │RabbitMQ│
              │ (db01) │ │  │(rmq01) │
              +────────+ │  +────────+
                         │
                  11211  │
                         ▼
                    +──────────+
                    │Memcached │
                    │  (mc01)  │
                    +──────────+
```

5 service hợp tác = **production-like architecture**.

## Bẫy thường gặp

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| Symlink sai path | nginx không load config | `ls -l sites-enabled/` check |
| Quên `nginx -t` trước reload | Service down | Luôn test trước |
| `proxy_pass` thiếu `http://` | Syntax error | `proxy_pass http://upstream;` |
| Quên `proxy_set_header Host` | App nhận hostname sai | Set đủ header |
| 502 Bad Gateway | Backend (Tomcat) down | Check `systemctl status tomcat` trên app01 |
| 504 Gateway Timeout | Backend chậm | Tăng `proxy_read_timeout` |
| Path proxy không match | 404 | Check `location /` match |
| Backend Tomcat redirect domain | Loop | Set `proxy_redirect off;` |

## Cleanup lab

```bash
# Tắt cả 5 VM giữ disk
vagrant halt

# Xoá hẳn nếu xong
vagrant destroy -f
```

## Mở rộng — multiple environments

Pattern Vagrantfile setup lab giống nhau cho:
- dev environment.
- staging.
- production-like.

Section sau sẽ thay 5 VM Vagrant → 5 EC2 instance AWS với cùng architecture. Concept giữ nguyên, chỉ đổi infrastructure provider.

## Checklist hoàn thành vProfile manual

- [x] 5 VM Vagrant up: web01, app01, mc01, rmq01, db01.
- [x] MySQL: DB `accounts` + user `admin@%`, schema loaded.
- [x] Memcached: bind 0.0.0.0, port 11211 reachable.
- [x] RabbitMQ: user `test/test`, port 5672 reachable.
- [x] Tomcat 10 + Java 17 + Maven trên app01.
- [x] vProfile.war built + deployed as ROOT.war.
- [x] nginx reverse proxy: `192.168.56.11` → `app01:8080`.
- [x] Login `admin_vp` / `admin_vp` → dashboard.
- [x] Cache + queue verified.

→ Bạn có **stack 3-tier production-like** chạy local!

## Tóm tắt bài 5

- **nginx reverse proxy** = pattern industry-standard, web01 → app tier.
- Config ở `/etc/nginx/sites-available/`, enable qua symlink `sites-enabled/`.
- `upstream` define backend pool, `proxy_pass` forward.
- **`nginx -t`** test trước reload — life-saver.
- Load balance: round-robin (default), least_conn, ip_hash.
- Static asset serve trực tiếp nginx, dynamic → Tomcat.
- HTTPS qua Let's Encrypt + certbot cho production.
- End-to-end test: browser → nginx → Tomcat → MySQL/Memcached/RabbitMQ.

**Bài kế tiếp** → [Bài 6: Tự động hoá toàn bộ setup với Vagrant provisioning](06-automated-setup.md)
