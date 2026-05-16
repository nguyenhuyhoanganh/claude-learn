# Bài 2: NGINX as Layer 7 Proxy

## Cấu hình cơ bản: Load Balancing

```nginx
events { }

http {
    upstream all-backend {
        server 127.0.0.1:2222;
        server 127.0.0.1:3333;
        server 127.0.0.1:4444;
        server 127.0.0.1:5555;
    }

    server {
        listen 80;

        location / {
            proxy_pass http://all-backend;
        }
    }
}
```

**Test:**
```bash
curl localhost   # → "I am app 2222"
curl localhost   # → "I am app 3333"
curl localhost   # → "I am app 4444"
curl localhost   # → "I am app 5555"
# Round Robin!
```

---

## Load Balancing Algorithms

### 1. Round Robin (default)
```nginx
upstream backend {
    server 127.0.0.1:2222;
    server 127.0.0.1:3333;
}
# Requests: 2222, 3333, 2222, 3333, ...
```

### 2. IP Hash (Sticky Sessions)
```nginx
upstream backend {
    ip_hash;
    server 127.0.0.1:2222;
    server 127.0.0.1:3333;
}
# Client IP → hashed → always same server
```

**Khi nào dùng IP Hash?**
- Stateful applications (session stored in memory)
- Không khuyến nghị: Stateless là better practice

### 3. Least Connections
```nginx
upstream backend {
    least_conn;
    server 127.0.0.1:2222;
    server 127.0.0.1:3333;
}
# Route đến server ít connections nhất
```

---

## Path-based Routing

Chỉ khả dụng ở **Layer 7** vì cần đọc URL path:

```nginx
http {
    # App1 backends
    upstream app1-backend {
        server 127.0.0.1:2222;
        server 127.0.0.1:3333;
    }

    # App2 backends
    upstream app2-backend {
        server 127.0.0.1:4444;
        server 127.0.0.1:5555;
    }

    server {
        listen 80;

        location /app1 {
            proxy_pass http://app1-backend;
        }

        location /app2 {
            proxy_pass http://app2-backend;
        }

        location / {
            proxy_pass http://all-backend;  # Default
        }
    }
}
```

**Test:**
```bash
curl localhost/app1  # → chỉ hit app 2222 hoặc 3333
curl localhost/app2  # → chỉ hit app 4444 hoặc 5555
```

---

## Blocking Paths

```nginx
server {
    listen 80;

    # Block admin từ public internet
    location /admin {
        return 403;  # Forbidden
    }

    location / {
        proxy_pass http://all-backend;
    }
}
```

**Test:**
```bash
curl localhost/admin
# HTTP/1.1 403 Forbidden
```

**Tại sao làm được điều này?**
Vì NGINX đang ở **Layer 7** → có thể đọc URL path → route/block theo path.

---

## Proxy Headers

```nginx
location / {
    proxy_pass http://backend;

    # Pass original client info đến backend
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

**Tại sao cần?**
- Backend không biết IP thực của client (chỉ thấy IP của NGINX)
- Headers này giúp backend biết được origin client info

---

## Layer 7 Connection Model

```
Browser → 1 TCP connection → NGINX
NGINX → 4 TCP connections → 4 backends

Total: 5 TCP connections
```

**Ưu điểm:** NGINX **share** backend connections:
- Nhiều clients → 1 NGINX → pool connections đến backends
- Giảm overhead cho backends

---
**Tiếp theo:** Bài 3 - NGINX as Layer 4 Proxy →
