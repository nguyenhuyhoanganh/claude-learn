# Bài 4: Enable HTTPS trên NGINX

## Yêu cầu

1. Domain name public (vd: `mysite.example.com`)
2. Certificate từ Let's Encrypt (free)
3. Port 80 và 443 được expose ra internet

---

## Bước 1: Expose NGINX ra Internet

```
Router → Port Forwarding:
  Port 80  → Your machine (IP 192.168.1.x)
  Port 443 → Your machine (IP 192.168.1.x)
```

**Test:**
```bash
curl http://<your-public-ip>
# → NGINX response
```

---

## Bước 2: Tạo Domain (Free với No-IP)

1. Đăng ký tại `noip.com`
2. Tạo hostname: `nginx-test.ddns.net` → trỏ về public IP
3. Chờ DNS propagation (vài phút)

**Test:**
```bash
curl http://nginx-test.ddns.net
# → NGINX response
```

---

## Bước 3: Lấy Certificate từ Let's Encrypt

```bash
# Install certbot (Mac)
brew install certbot

# Stop NGINX (certbot cần port 80)
nginx -s stop

# Lấy certificate (standalone mode - không touch nginx config)
sudo certbot certonly --standalone -d nginx-test.ddns.net
```

Sau khi chạy, certbot tạo:
- `/etc/letsencrypt/live/nginx-test.ddns.net/fullchain.pem` (public key / certificate)
- `/etc/letsencrypt/live/nginx-test.ddns.net/privkey.pem` (private key)

---

## Bước 4: Cấu hình NGINX với HTTPS

```nginx
events { }

http {
    upstream all-backend {
        server 127.0.0.1:2222;
        server 127.0.0.1:3333;
    }

    server {
        listen 80;
        location / {
            proxy_pass http://all-backend;
        }
    }

    # HTTPS server
    server {
        listen 443 ssl;

        ssl_certificate     /etc/letsencrypt/live/nginx-test.ddns.net/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/nginx-test.ddns.net/privkey.pem;

        location / {
            proxy_pass http://all-backend;
        }
    }
}
```

**Chạy NGINX với sudo** (vì cần đọc `/etc/letsencrypt/`):
```bash
sudo nginx -c $(pwd)/nginx.conf
```

**Test:**
```bash
curl https://nginx-test.ddns.net
# → NGINX response với TLS!
```

---

## Redirect HTTP → HTTPS

```nginx
server {
    listen 80;
    server_name nginx-test.ddns.net;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    # ... ssl config
}
```

---

## Kiểm tra SSL/TLS Grade

Dùng công cụ online như **SSL Labs** (`ssllabs.com/ssltest`):

```
Kết quả điển hình với default config:
- Grade: B hoặc C
- TLS 1.2 (không phải 1.3)
- RSA cipher (không phải Diffie-Hellman)
- Not Perfect Forward Secrecy
```

Để đạt Grade A → Enable TLS 1.3 và proper ciphers.

---

## Tóm tắt

```
HTTP → NGINX → Backend:
  Không mã hóa, ai sniff network đều đọc được

HTTPS (TLS Termination):
  Client ──[TLS]──→ NGINX ──[HTTP hoặc TLS]──→ Backend
  Certificate ở NGINX, NGINX decrypt traffic
  Backend có thể là HTTP (trusted internal network)
```

---
**Tiếp theo:** Bài 5 - Enable TLS 1.3 →
