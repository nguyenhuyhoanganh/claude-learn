# Bài 2: NGINX Timeouts - Backend Timeouts

## Backend Timeouts là gì?

Khi NGINX đóng vai trò **reverse proxy / load balancer**, nó phải giao tiếp với upstream servers (backends). Các backend timeouts kiểm soát kết nối này.

```
Client → NGINX → [proxy_connect_timeout]
              ↕  [proxy_send_timeout]
              ↕  [proxy_read_timeout]
              ← Backend Server
```

---

## Các Backend Timeouts

### 1. `proxy_connect_timeout` (default: 60s, max: 75s)

> Timeout để **thiết lập TCP connection** tới upstream server.

```
NGINX → [TCP SYN] → Backend Server
      ← [SYN-ACK] (trong vòng proxy_connect_timeout)
      
Nếu không nhận được response → Backend coi là down
```

**Giới hạn:** Không thể set > 75s (hard limit).

**Tuning strategy:**

```nginx
# Backend trong cùng LAN/datacenter
upstream backend {
    server backend1.local;
    server backend2.local;
}
proxy_connect_timeout 2s;   # LAN: 2s là đủ, nếu không connect được → down

# Backend ở region khác (inter-region)
proxy_connect_timeout 10s;
```

**Trade-off:**
- Quá nhỏ → False positive (backend bị coi là down khi chỉ hơi chậm)
- Quá lớn → Tốn thời gian chờ backend thực sự down

---

### 2. `proxy_send_timeout` (default: 60s)

> Timeout giữa **hai lần ghi request** liên tiếp tới upstream.

NGINX gửi request lên backend — nếu ghi chậm quá → timeout.

**Flow:**
```
NGINX → [POST /upload (large body)]
      → [body segment 1] → backend
      → [body segment 2] → backend
      → [pause > proxy_send_timeout]
      → Close connection to backend
```

**Cấu hình:**
```nginx
proxy_send_timeout 30s;

# Với file upload lớn
proxy_send_timeout 120s;
```

**Tại sao cần timeout này?**
Nếu client gửi chậm → NGINX gửi chậm lên backend → backend connection bị chiếm giữ vô ích. Timeout giải phóng connection để serve client khác.

---

### 3. `proxy_read_timeout` (default: 60s)

> Timeout giữa **hai lần đọc response** liên tiếp từ upstream.

```
NGINX → GET /api/data → Backend
NGINX ← [response segment 1] (timer reset)
NGINX ← [response segment 2] (timer reset)
NGINX ← [pause > proxy_read_timeout]
      → Close connection to backend → Error
```

**Trường hợp đặc biệt: Server-Sent Events / Long Polling**

```nginx
# API thông thường
proxy_read_timeout 30s;

# Server-Sent Events (SSE): server gửi response không biết bao giờ
# → Phải để lớn!
location /events {
    proxy_read_timeout 3600s;  # 1 giờ
    proxy_pass http://backend;
}

# WebSockets tương tự
location /ws {
    proxy_read_timeout 86400s;  # 24 giờ
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_pass http://backend;
}
```

**Kết hợp với `send_timeout`:**
```
Client ─── (send_timeout) ──→ NGINX ─── (proxy_read_timeout) ──→ Backend
```
Nếu backend chậm → `proxy_read_timeout` → NGINX close với backend → Báo lỗi cho client → `send_timeout` cũng có thể trigger.

---

### 4. `proxy_next_upstream_timeout` (default: 0 = unlimited)

> Tổng thời gian tối đa để thử **các upstream servers tiếp theo** khi có lỗi.

```
NGINX → Backend 1 (lỗi/timeout)
      → Backend 2 (lỗi/timeout)  ← proxy_next_upstream_timeout đang chạy
      → Backend 3 (success!)
```

**Default = 0 (vô hạn):** Có thể loop qua tất cả backends mãi — **nguy hiểm** với nhiều backends!

```nginx
upstream backend {
    server backend1.local;
    server backend2.local;
    server backend3.local;
    server backend4.local;
    server backend5.local;
}

# Giới hạn thời gian thử các backends
proxy_next_upstream_timeout 10s;   # Thử tối đa 10s tổng cộng
proxy_next_upstream_tries   3;     # Hoặc tối đa 3 lần thử
```

**Khi nào chuyển sang backend tiếp theo?**
```nginx
proxy_next_upstream error timeout http_502 http_503 http_504;
```

---

### 5. `keepalive_timeout` (Upstream, khác với frontend)

> Thời gian giữ **idle connection** với upstream server.

```nginx
upstream backend {
    server backend1.local;
    server backend2.local;
    keepalive 32;  # Số connection keep-alive tối đa
}

proxy_http_version 1.1;
proxy_set_header Connection "";  # Bắt buộc để keepalive hoạt động

# Timeout cho idle upstream connection
keepalive_timeout 60s;
```

**Trade-off:**
- Cao → Giữ connections sẵn sàng → Giảm latency khi request mới tới
- Thấp → Tiết kiệm tài nguyên nhưng phải handshake lại nhiều hơn

---

## So sánh Frontend vs Backend Timeouts

| | Frontend (Client → NGINX) | Backend (NGINX → Upstream) |
|--|--------------------------|---------------------------|
| **Header** | `client_header_timeout` | — |
| **Body/Send** | `client_body_timeout` | `proxy_send_timeout` |
| **Response** | `send_timeout` | `proxy_read_timeout` |
| **Connect** | — | `proxy_connect_timeout` |
| **Keep-Alive** | `keepalive_timeout` | `keepalive_timeout` (upstream) |
| **Failover** | — | `proxy_next_upstream_timeout` |

## Ví dụ cấu hình hoàn chỉnh

```nginx
http {
    # Frontend timeouts
    client_header_timeout  10s;
    client_body_timeout    30s;
    send_timeout           30s;
    keepalive_timeout      75s;
    resolver_timeout        5s;

    server {
        listen 80;

        location / {
            proxy_pass http://backend;

            # Backend timeouts
            proxy_connect_timeout      5s;
            proxy_send_timeout        30s;
            proxy_read_timeout        30s;
            proxy_next_upstream_timeout 10s;
            proxy_next_upstream_tries   3;
        }

        # Long-running connections
        location /events {
            proxy_pass http://backend;
            proxy_read_timeout      3600s;
            proxy_send_timeout      3600s;
        }
    }

    upstream backend {
        server backend1.local;
        server backend2.local;
        keepalive 32;
    }
}
```

## Tóm tắt Backend Timeouts

| Timeout | Default | Mục đích |
|---------|---------|---------|
| `proxy_connect_timeout` | 60s (max 75s) | Thiết lập TCP connection tới backend |
| `proxy_send_timeout` | 60s | Gửi request lên backend |
| `proxy_read_timeout` | 60s | Đọc response từ backend |
| `proxy_next_upstream_timeout` | 0 (∞) | Thời gian thử failover backends |
| `keepalive_timeout` (upstream) | 60s | Giữ idle upstream connection |

**Lưu ý đặc biệt:**
- SSE/WebSocket → `proxy_read_timeout` phải rất lớn (hours)
- `proxy_next_upstream_timeout = 0` → set `proxy_next_upstream_tries` để tránh loop vô hạn
