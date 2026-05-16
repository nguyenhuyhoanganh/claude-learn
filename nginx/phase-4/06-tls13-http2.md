# Bài 5: Enable TLS 1.3 và HTTP/2

## Tại sao TLS 1.3 quan trọng?

| | TLS 1.2 | TLS 1.3 |
|--|---------|---------|
| **Handshake** | 2 round trips | 1 round trip (faster!) |
| **Ciphers** | Nhiều cipher yếu | Chỉ cipher mạnh |
| **Forward Secrecy** | Optional | Bắt buộc |
| **Downgrade attack** | Vulnerable | Protected |

**Perfect Forward Secrecy**: Nếu private key bị leak → các session cũ vẫn không thể decrypt.

---

## Enable TLS 1.3

```nginx
server {
    listen 443 ssl;

    ssl_certificate     /etc/letsencrypt/live/nginx-test.ddns.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nginx-test.ddns.net/privkey.pem;

    # Chỉ cho phép TLS 1.3 (disable 1.2 và cũ hơn)
    ssl_protocols TLSv1.3;

    location / {
        proxy_pass http://all-backend;
    }
}
```

```bash
sudo nginx -s reload
```

**Kiểm tra:**
- Dùng SSL Labs hoặc `tls-checker.com`
- Should show: TLS 1.3 enabled ✅

**Trade-off:** Disable TLS 1.2 = Một số old clients (IE6, Android 4.x) không thể connect.

---

## Enable HTTP/2

HTTP/2 chỉ hoạt động qua HTTPS (browsers không support HTTP/2 trên plain text).

```nginx
server {
    listen 443 ssl http2;  # Thêm "http2"

    ssl_certificate     /etc/letsencrypt/live/nginx-test.ddns.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nginx-test.ddns.net/privkey.pem;

    ssl_protocols TLSv1.3;

    location / {
        proxy_pass http://all-backend;
    }
}
```

**Kiểm tra trong browser:**
- DevTools → Network tab → Protocol column
- Should show: `h2` (HTTP/2)

---

## HTTP/2 là gì?

### HTTP/1.1 (mặc định)
```
Browser → 1 TCP connection per domain (hoặc up to 6)
          Mỗi request phải đợi response xong mới gửi request kế tiếp

Browser mở nhiều TCP connections để "hack" performance:
├── TCP 1: GET /index.html
├── TCP 2: GET /style.css
├── TCP 3: GET /script.js
├── TCP 4: GET /logo.png
└── TCP 5: GET /favicon.ico
```

### HTTP/2
```
Browser → 1 TCP connection
          Multiplexing: nhiều request/response đồng thời trên 1 connection
          1 connection → GET /index.html, /style.css, /script.js, ... cùng lúc!
```

**Ưu điểm HTTP/2:**
- Ít TCP connections hơn → giảm overhead
- Header compression (HPACK)
- Server push (server gửi resources trước khi client request)
- Binary protocol (thay vì text như HTTP/1.1)

---

## NGINX + TLS 1.3 + HTTP/2 Full Config

```nginx
events { }

http {
    upstream backend {
        server 127.0.0.1:2222;
        server 127.0.0.1:3333;
    }

    # Redirect HTTP to HTTPS
    server {
        listen 80;
        server_name nginx-test.ddns.net;
        return 301 https://$server_name$request_uri;
    }

    # HTTPS with TLS 1.3 and HTTP/2
    server {
        listen 443 ssl http2;
        server_name nginx-test.ddns.net;

        ssl_certificate     /etc/letsencrypt/live/nginx-test.ddns.net/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/nginx-test.ddns.net/privkey.pem;

        ssl_protocols TLSv1.3;

        location / {
            proxy_pass http://backend;
        }
    }
}
```

---

## Tóm tắt

```
TLS 1.3: Nhanh hơn, an toàn hơn TLS 1.2
  → ssl_protocols TLSv1.3;

HTTP/2: Multiplexing trên 1 TCP connection
  → listen 443 ssl http2;
  → Chỉ hoạt động qua HTTPS
```

---
**Tiếp theo:** Phase 5 - WebSockets with NGINX →
