# Bài 3: NGINX as Layer 4 Proxy

## Cấu hình Layer 4

Thay `http {}` bằng `stream {}`:

```nginx
events { }

stream {
    upstream all-backend {
        server 127.0.0.1:2222;
        server 127.0.0.1:3333;
        server 127.0.0.1:4444;
        server 127.0.0.1:5555;
    }

    server {
        listen 80;
        proxy_pass all-backend;
        # Không có http://, không có location!
    }
}
```

**Điểm khác biệt:**
- `stream {}` thay vì `http {}`
- `proxy_pass` không có `http://` prefix
- Không có `location {}` block
- Không có path-based routing

---

## Behavior: Sticky Connection

```bash
# Telnet test
telnet 127.0.0.1 80
GET / HTTP/1.1
# → "I am app 5555"

# Mở telnet connection khác
telnet 127.0.0.1 80
GET / HTTP/1.1
# → "I am app 2222"

# Trong cùng connection → ALWAYS same server
telnet 127.0.0.1 80
GET / HTTP/1.1    # → "I am app 3333"
GET /app1 HTTP/1.1  # → "I am app 3333" (same connection = same server!)
```

**Tại sao?**

Khi Layer 4, NGINX không biết HTTP request là gì. Nó chỉ thấy TCP connection → Forward **toàn bộ** connection đến 1 backend. Các requests trong cùng TCP connection → cùng backend.

---

## Layer 4 vs Layer 7: Connection Model

```
Layer 7 (HTTP):
Client ─TCP─→ NGINX ─TCP─→ Backend 1
                    ─TCP─→ Backend 2
              Mỗi HTTP request có thể đi backend khác

Layer 4 (Stream):
Client ─TCP─→ NGINX ─TCP─→ Backend 1 (fixed!)
              1 client connection = 1 backend connection (NAT table)
```

---

## Tại sao dùng Layer 4?

**1. Protocol NGINX không hiểu:**
```nginx
# Proxy PostgreSQL (NGINX không hiểu PostgreSQL protocol)
stream {
    upstream postgres {
        server db1:5432;
        server db2:5432;
    }
    server {
        listen 5432;
        proxy_pass postgres;
    }
}
```

**2. TLS Passthrough:**
```nginx
# Không decrypt, forward toàn bộ TLS đến backend
stream {
    upstream backend {
        server backend1:443;
    }
    server {
        listen 443;
        proxy_pass backend;
        # TLS handshake đi thẳng đến backend
    }
}
```

**3. Bất kỳ protocol nào:**
```
HTTP, HTTPS, gRPC, WebSocket, SMTP, MySQL, Redis, ...
Layer 4 proxy tất cả mà không cần hiểu protocol!
```

---

## Giới hạn của Layer 4

| Feature | Layer 7 | Layer 4 |
|---------|---------|---------|
| Path routing (`/app1` → backend A) | ✅ | ❌ |
| Block paths (`/admin` → 403) | ✅ | ❌ |
| Add headers | ✅ | ❌ |
| Cache responses | ✅ | ❌ |
| Share backend connections | ✅ | ❌ |
| Any protocol | ❌ (HTTP only) | ✅ |
| TLS Passthrough | ❌ | ✅ |

---
**Tiếp theo:** Bài 4 - Enable HTTPS →
