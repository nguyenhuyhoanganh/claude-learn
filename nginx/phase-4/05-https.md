# Bài 5: Enable HTTPS với Let's Encrypt — từ HTTP plain đến browser "secure"

Đây là **bài chuyển ngoặt**. Sau bài này, NGINX của bạn sẽ có icon ổ khoá xanh trên browser. Phase 1 Bài 4 đã nói lý thuyết TLS termination — bài này làm thực: setup domain, lấy cert miễn phí từ Let's Encrypt, cấu hình NGINX với HTTPS.

## Yêu cầu trước khi bắt đầu

| Yêu cầu | Vì sao |
|---|---|
| Domain name public | Let's Encrypt cần verify ownership domain. `localhost` hay IP không lấy cert được |
| Port 80 public | Cert verification dùng HTTP-01 challenge qua port 80 |
| Port 443 public | Để serve HTTPS |
| NGINX đã cài | Đương nhiên |

> Nếu không có server public, dùng **dịch vụ dynamic DNS miễn phí** (No-IP, DuckDNS) trỏ về public IP nhà bạn — đủ để test.

## Bước 1 — Setup domain trỏ về máy bạn

### Cách "cloud" (production thật)

Mua domain (Namecheap, Cloudflare Registrar), thêm A record:

```text
example.com.     A   1.2.3.4    (public IP của server)
www.example.com. A   1.2.3.4
```

### Cách "free" cho test (Dynamic DNS)

1. Đăng ký tại `noip.com` hoặc `duckdns.org` (free).
2. Tạo hostname kiểu `my-nginx.ddns.net` trỏ về IP công khai của bạn.
3. Nếu IP nhà bạn dynamic, cài client agent (No-IP DUC) để tự update IP khi đổi.

```bash
# Verify DNS đã resolve đúng
dig my-nginx.ddns.net +short
# 1.2.3.4

curl http://my-nginx.ddns.net
# → response từ NGINX hoặc router default
```

> Lưu ý router gia đình: port 80/443 thường bị ISP chặn. Cần check + có thể đổi port (`listen 8443 ssl`).

### Setup port forwarding router (nếu chạy NGINX ở nhà)

Truy cập router admin (`192.168.1.1` thường):
- Port forward: external `80` → internal `your-mac-ip:80`.
- Port forward: external `443` → internal `your-mac-ip:443`.

Test từ điện thoại (tắt WiFi, dùng 4G):
```bash
# Trên điện thoại
curl http://your-public-ip/
```

## Bước 2 — Cài certbot và lấy cert

### Cài certbot

```bash
# macOS
brew install certbot

# Ubuntu/Debian
sudo apt-get install -y certbot

# RHEL/CentOS
sudo dnf install -y certbot
```

### Lấy cert qua standalone mode

Standalone = certbot tự dựng HTTP server tạm để Let's Encrypt verify, **không touch NGINX config**:

```bash
# Stop NGINX để certbot có port 80
sudo nginx -s stop

# Lấy cert
sudo certbot certonly --standalone \
    -d my-nginx.ddns.net \
    --email you@example.com \
    --agree-tos \
    --no-eff-email
```

Certbot:
1. Bind port 80.
2. Liên lạc Let's Encrypt → "tôi muốn cert cho `my-nginx.ddns.net`".
3. Let's Encrypt gửi challenge token, yêu cầu host token ở `http://my-nginx.ddns.net/.well-known/acme-challenge/<random>`.
4. Certbot serve token đó qua port 80.
5. Let's Encrypt fetch URL → verify match → cấp cert.
6. Certbot lưu cert + key vào disk.

Sau khi xong:

```text
/etc/letsencrypt/live/my-nginx.ddns.net/
├── cert.pem        ← certificate riêng cho domain
├── chain.pem       ← intermediate cert chain
├── fullchain.pem   ← cert + chain (dùng với NGINX)
├── privkey.pem     ← private key
└── README
```

→ **2 file cần** cho NGINX:
- `fullchain.pem` — cert + chain.
- `privkey.pem` — private key (BẢO MẬT TỐI ĐA, không leak ra).

### Webroot mode — không cần stop NGINX

Nếu NGINX đang chạy production, không thể stop, dùng webroot:

```nginx
# Trong nginx.conf, thêm location đặc biệt:
server {
    listen 80;
    server_name my-nginx.ddns.net;
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    location / {
        return 301 https://$host$request_uri;
    }
}
```

Tạo thư mục `/var/www/certbot/.well-known/acme-challenge/`.

Lấy cert (NGINX không stop):

```bash
sudo certbot certonly --webroot \
    -w /var/www/certbot \
    -d my-nginx.ddns.net \
    --email you@example.com --agree-tos
```

Certbot ghi token vào `/var/www/certbot/.well-known/...`. NGINX serve qua location đã config. Let's Encrypt verify được.

## Bước 3 — Config NGINX với HTTPS

```nginx
events { worker_connections 1024; }

http {
    upstream backend_pool {
        server 127.0.0.1:2222;
        server 127.0.0.1:3333;
    }

    # HTTP server — redirect lên HTTPS
    server {
        listen 80;
        server_name my-nginx.ddns.net;
        
        # ACME challenge cho cert renewal
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
        
        # Mọi request khác — force HTTPS
        location / {
            return 301 https://$host$request_uri;
        }
    }

    # HTTPS server
    server {
        listen 443 ssl;
        server_name my-nginx.ddns.net;

        ssl_certificate     /etc/letsencrypt/live/my-nginx.ddns.net/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/my-nginx.ddns.net/privkey.pem;

        location / {
            proxy_pass http://backend_pool;
            
            proxy_set_header Host              $host;
            proxy_set_header X-Real-IP         $remote_addr;
            proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

Khởi động NGINX:

```bash
sudo nginx -t
# nginx: configuration file ... test is successful

sudo nginx        # hoặc systemctl start nginx
```

> Phải dùng `sudo` vì NGINX cần đọc `/etc/letsencrypt/live/*/privkey.pem` (mode 600, owner root).

Test:

```bash
curl -v https://my-nginx.ddns.net/
# *   TLSv1.3 (IN), TLS handshake, Server hello (2):
# *   ...
# *   Server certificate:
# *     subject: CN=my-nginx.ddns.net
# *     start date: ...
# *     expire date: ...   (90 days từ hôm nay)
# *     issuer: C=US; O=Let's Encrypt; CN=R3
# HTTP/2 200
# ...
# I am app 2222
```

→ Có cert thật từ Let's Encrypt, browser hiện ổ khoá xanh.

## Hiểu kĩ hơn về cert chain — `fullchain.pem`

```text
fullchain.pem nội dung:
   -----BEGIN CERTIFICATE-----
   <cert của my-nginx.ddns.net>
   -----END CERTIFICATE-----
   -----BEGIN CERTIFICATE-----
   <intermediate cert: Let's Encrypt R3>
   -----END CERTIFICATE-----
```

Cert chain:
```text
   my-nginx.ddns.net
        ↑ signed by
   Let's Encrypt R3 (intermediate)
        ↑ signed by
   ISRG Root X1 (root, đã có trong browser trust store)
```

Browser verify ngược chain — đến root nó tin được. **Phải gửi cert + intermediate** (= `fullchain.pem`), không chỉ cert (`cert.pem`). Lỗi phổ biến: dùng `cert.pem` thay `fullchain.pem` → browser báo cert untrusted.

## Renewal — cert chỉ sống 90 ngày

Let's Encrypt cert hết hạn sau **90 ngày**. Phải renew tự động.

```bash
# Renewal command — chỉ renew cert sắp hết hạn
sudo certbot renew

# Dry-run để test
sudo certbot renew --dry-run
```

### Cron renew

```bash
# Crontab: chạy mỗi 12h
sudo crontab -e

# Thêm dòng:
0 0,12 * * * certbot renew --quiet --deploy-hook "nginx -s reload"
```

`--deploy-hook` — chỉ chạy `nginx -s reload` khi cert được renew thật (không spam reload mỗi lần cron).

### Systemd timer (Ubuntu modern)

```bash
sudo systemctl status certbot.timer
# certbot.timer - Run certbot twice daily
# Active: active (waiting)
```

Đa số distro đã setup timer tự động khi cài certbot. Verify bằng lệnh trên.

## Redirect HTTP → HTTPS

User vẫn có thể type `http://my-nginx.ddns.net` — force lên HTTPS:

```nginx
server {
    listen 80;
    server_name my-nginx.ddns.net;
    
    return 301 https://$host$request_uri;
}
```

`301 Moved Permanently` — browser nhớ redirect, lần sau gõ `http://...` cũng tự lên https.

Pair với **HSTS** header (HTTPS-only force ở mức browser):

```nginx
server {
    listen 443 ssl;
    
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    # ...
}
```

→ Browser nhớ "domain này phải HTTPS" trong 1 năm. Type `http://` cũng tự chuyển HTTPS không cần qua NGINX redirect.

## Kiểm tra SSL grade

**SSL Labs Server Test** (`ssllabs.com/ssltest`) — chuẩn vàng đánh giá HTTPS config.

```bash
# Hoặc CLI
nmap --script ssl-enum-ciphers -p 443 my-nginx.ddns.net
```

Với config trên (default NGINX 1.25), thường được grade **B-A** vì:
- ✓ TLS 1.2 + 1.3 (NGINX 1.25 hỗ trợ cả 2).
- ✓ HSTS.
- ✓ Cert chain đầy đủ.
- ✗ Chưa explicit cipher list → vẫn còn cipher yếu.
- ✗ Chưa OCSP stapling.

Bài 6 sẽ tune lên **A+**.

## Self-signed cert cho dev local

Không có domain public, chỉ test local:

```bash
# Tạo self-signed cert
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout selfsigned.key \
    -out selfsigned.crt \
    -subj "/CN=localhost"
```

NGINX config:

```nginx
server {
    listen 443 ssl;
    server_name localhost;
    
    ssl_certificate     /path/to/selfsigned.crt;
    ssl_certificate_key /path/to/selfsigned.key;
}
```

Test:

```bash
curl -k https://localhost/      # -k bypass cert verify (vì self-signed)
```

Browser sẽ cảnh báo "Not secure" → bypass thủ công. Chỉ dùng dev.

## Cấu hình production thực — minimum HTTPS

```nginx
events { worker_connections 1024; }

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    
    sendfile      on;
    keepalive_timeout 30;
    
    # Connection/rate limit
    limit_conn_zone $binary_remote_addr zone=per_ip:10m;
    
    upstream api_backend {
        server app1:8080;
        server app2:8080;
        keepalive 32;
    }

    # HTTP → HTTPS
    server {
        listen 80;
        server_name api.example.com;
        
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
        
        location / {
            return 301 https://$host$request_uri;
        }
    }

    # HTTPS
    server {
        listen 443 ssl;
        server_name api.example.com;
        
        ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
        
        # Security headers
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        
        limit_conn per_ip 20;
        
        location / {
            proxy_pass http://api_backend;
            
            proxy_http_version 1.1;
            proxy_set_header   Connection         "";
            proxy_set_header   Host               $host;
            proxy_set_header   X-Real-IP          $remote_addr;
            proxy_set_header   X-Forwarded-For    $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto  $scheme;
            
            proxy_connect_timeout 2s;
            proxy_read_timeout    30s;
        }
    }
}
```

→ Đây là **starting point** cho HTTPS production. Bài 6 sẽ tune TLS 1.3 + HTTP/2 để đạt A+.

## Wildcard cert (`*.example.com`)

Cert riêng cho mỗi subdomain → mệt. Wildcard cert (`*.example.com`) cover tất cả `api.example.com`, `www.example.com`...

Let's Encrypt hỗ trợ wildcard nhưng yêu cầu **DNS-01 challenge** (không phải HTTP-01):

```bash
sudo certbot certonly --manual --preferred-challenges dns \
    -d "*.example.com" -d "example.com"
```

Certbot yêu cầu tạo TXT record `_acme-challenge.example.com` với value cụ thể. Sau khi DNS update, ENTER tiếp.

→ Phức tạp hơn HTTP-01. Production thường dùng DNS provider có API (Cloudflare, Route53) + certbot plugin để tự động.

## Bẫy thường gặp

| Bẫy | Hệ quả | Cách tránh |
|---|---|---|
| Dùng `cert.pem` thay `fullchain.pem` | Browser báo "cert untrusted" | Luôn dùng `fullchain.pem` |
| Port 80 không expose | Let's Encrypt verify fail | Cần forward port 80 dù chỉ chạy HTTPS |
| Quên cron renew | Cert hết hạn → website 502 | Setup cron hoặc systemd timer |
| Cert đường dẫn sai trong nginx.conf | NGINX không start | `nginx -t` để verify trước reload |
| Private key permission 644 | Một số distro reject | Để mode 600, owner root |
| Self-signed cert dùng production | Browser cảnh báo, user không tin | Luôn dùng Let's Encrypt hoặc commercial CA |

## Tóm tắt bài 5

- Cần: domain public + port 80/443 + certbot.
- Let's Encrypt cấp cert miễn phí, sống 90 ngày — phải renew tự động.
- 2 mode: `standalone` (cần stop NGINX) và `webroot` (giữ NGINX chạy).
- NGINX cần `fullchain.pem` + `privkey.pem` — KHÔNG dùng `cert.pem`.
- Pattern: HTTP server redirect → HTTPS, HTTPS server proxy đến backend.
- HSTS header force browser luôn dùng HTTPS.
- Wildcard cert (`*.example.com`) cần DNS-01 challenge — phức tạp hơn.

**Bài kế tiếp** → [Bài 6: TLS 1.3 + HTTP/2 — tune lên SSL Labs A+](06-tls13-http2.md)
