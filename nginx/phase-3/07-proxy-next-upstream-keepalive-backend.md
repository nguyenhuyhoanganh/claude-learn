# Bài 7: proxy_next_upstream_timeout + backend keepalive + tổng kết phase

Hai timeout cuối cùng của phase-3:

- **`proxy_next_upstream_timeout`** — tổng thời gian thử các backend khi 1 cái fail. Cài đặt sai = vô hạn loop hoặc fail-over chậm.
- **Backend `keepalive_timeout`** — idle time với upstream pool. Tune đúng = giảm overhead handshake, tăng throughput.

Sau đó là **tổng kết phase-3** với checklist tune timeout.

## proxy_next_upstream_timeout

> Định nghĩa: **tổng thời gian** NGINX được phép thử các backend thay thế khi backend đầu tiên fail.

**Default: `0` (off — không giới hạn)**.

### Khi nào có "thử backend khác"?

Khi `proxy_next_upstream` được kích hoạt — NGINX thử backend tiếp theo trong upstream pool:

```nginx
upstream pool {
    server app1:8080;
    server app2:8080;
    server app3:8080;
}

server {
    location / {
        proxy_pass http://pool;
        proxy_next_upstream error timeout http_502 http_503 http_504;
    }
}
```

`proxy_next_upstream` accept các giá trị:

| Value | Trigger khi |
|---|---|
| `error` | Lỗi connect/đọc/ghi backend |
| `timeout` | Bất kỳ proxy timeout nào trigger |
| `invalid_header` | Backend trả response header malformed |
| `http_500` `http_502` `http_503` `http_504` | Backend trả status code này |
| `http_403` `http_404` `http_429` | Backend trả status code này |
| `non_idempotent` | Cho phép retry với non-GET (mặc định chỉ retry GET) |
| `off` | Tắt — không thử backend khác |

### Flow

```text
Request đến NGINX
   │
   ▼
Try app1 ── timeout 2s ──► fail
   │
   ▼ proxy_next_upstream "timeout"
Try app2 ── timeout 2s ──► fail
   │
   ▼
Try app3 ── timeout 2s ──► fail
   │
   ▼
Trả 502 cho client

Tổng thời gian = 6s.

Nếu pool có 100 backend, mỗi cái fail timeout 2s → 200s? KHÔNG, vì giới hạn:
   - proxy_next_upstream_timeout: tổng max
   - proxy_next_upstream_tries: số lần max
```

### Phối hợp với `proxy_next_upstream_tries`

```nginx
location / {
    proxy_pass http://pool;
    proxy_next_upstream         error timeout;
    proxy_next_upstream_timeout 10s;     # tổng max
    proxy_next_upstream_tries   3;        # số backend tối đa thử
}
```

NGINX sẽ stop thử khi **đạt 1 trong 2 giới hạn**:
- Đã thử 3 backend khác nhau, **HOẶC**
- Đã trôi quá 10s tổng.

> Recommend production: cả 2 đều set. `tries 3 timeout 10s` là pattern an toàn.

### Vì sao default 0 lại nguy hiểm?

Default 0 = **không giới hạn tổng thời gian**. Pool 50 backend, mỗi cái fail timeout 60s → có thể 50 × 60 = **3000 giây** (50 phút) trước khi NGINX trả 502 cho user.

→ User chờ 50 phút, NGINX đốt resource thử 50 backend. **Thảm hoạ**.

**Luôn set `proxy_next_upstream_timeout`** trong production.

### Use case thực

```nginx
upstream payment_gateway {
    server pay1.example.com:443;
    server pay2.example.com:443;
    server pay3.example.com:443;
}

server {
    location /pay/ {
        proxy_pass                  https://payment_gateway;
        proxy_connect_timeout       2s;
        proxy_read_timeout          10s;
        
        proxy_next_upstream         error timeout http_502 http_503;
        proxy_next_upstream_timeout 15s;    # max 15s tổng
        proxy_next_upstream_tries   3;      # max 3 backend
    }
}
```

→ Payment phải retry (mạng không ổn định), nhưng phải fail-fast cho UX. 15s max là vừa.

### Cẩn thận với non-idempotent

Mặc định, NGINX **không retry** request **POST**, **PUT**, **PATCH**, **DELETE** — vì có thể tạo bản ghi 2 lần.

```text
   POST /api/users/  ──► backend1 (đã tạo user, sau đó timeout response)
                              │
                              │ NGINX không retry (default)
   ◄── 502 ────────────────── │
   
   User retry → POST /api/users/ → tạo user thứ 2 → trùng.
```

Để bật retry cho non-idempotent:

```nginx
proxy_next_upstream error timeout non_idempotent;
```

**Chỉ bật khi**:
- Backend là idempotent thật (request có ID, duplicate key được handle).
- Bạn ý thức được rủi ro.

## Backend keepalive_timeout

> Định nghĩa: thời gian giữ idle connection trong **upstream pool** (NGINX → backend) trước khi đóng.

**Default: 60 giây**.

### Vì sao có backend keepalive?

Tương tự client keepalive (Bài 3) — tránh TCP handshake mỗi request:

```text
Không có upstream keepalive:
   Mỗi request: NGINX → backend
                  SYN/SYN-ACK/ACK (handshake)
                  HTTP request
                  HTTP response
                  FIN/ACK (close)
   → Mỗi request mở/đóng 1 connection
   → Overhead lớn nếu request rate cao

Có upstream keepalive:
   Pool sẵn 32 idle connection.
   Request 1 → connection #5 (đã có sẵn) → response → trả về pool
   Request 2 → connection #5 → response → trả về pool
   ...
   → Không có overhead handshake
```

### Cấu hình

```nginx
upstream backend_pool {
    server app1:8080;
    server app2:8080;
    server app3:8080;
    
    keepalive          32;     # số connection idle pool max
    keepalive_timeout  60s;    # idle bao lâu thì close (default 60s)
    keepalive_requests 100;    # max request / connection
}

server {
    location / {
        proxy_pass         http://backend_pool;
        
        # BẮT BUỘC cho upstream keepalive:
        proxy_http_version 1.1;
        proxy_set_header   Connection "";
    }
}
```

### `keepalive 32` nghĩa là gì?

- `32` = số idle connection **giữ riêng trong pool**, **mỗi worker**.
- Total = `32 × worker_processes`. Với 4 worker: 128 idle connection.
- Có thể có nhiều hơn 32 connection active — nhưng chỉ 32 được kept-alive khi idle.

### `proxy_http_version 1.1` và `Connection ""` bắt buộc

NGINX default dùng **HTTP/1.0** cho upstream, **đóng connection** sau mỗi request — keepalive **không work**:

```text
Default (proxy_http_version 1.0):
   Request → backend
   Response (Connection: close header)
   NGINX đóng connection
   → keepalive pool vô dụng
```

Phải explicitly:

```nginx
proxy_http_version 1.1;
proxy_set_header   Connection "";
```

- `proxy_http_version 1.1` — gửi request HTTP/1.1.
- `proxy_set_header Connection ""` — **xoá** header `Connection` (thay vì gửi `Connection: close`).

**Quên 2 dòng này = keepalive không work**. Là bẫy phổ biến.

### `keepalive_requests` — đừng quá cao

```nginx
keepalive_requests 1000;     # default trong NGINX 1.19.10+
```

Mỗi connection xử lý max N request rồi close, force NGINX mở mới. Lý do:
- Backend có thể leak memory theo connection (rare nhưng có).
- LB phía sau backend (vd Envoy in mesh) có thể đóng connection theo policy.

Quá thấp (vd 10) = lãng phí, mở connection nhiều. Quá cao (vd 100k) = rủi ro nếu backend buggy.

Default 1000-10000 là an toàn.

### Tune keepalive cho cao tải

```nginx
upstream high_traffic {
    server app1:8080;
    server app2:8080;
    
    keepalive          64;        # pool lớn hơn
    keepalive_timeout  30s;
    keepalive_requests 10000;
}
```

64 = chấp nhận tốn ~64 fd per worker, đổi lấy không phải mở connection mới khi request đến.

> Tính nhanh: 4 worker × 64 keepalive = 256 idle connection đến backend. Backend phải support số này (file descriptor, thread).

## Tổng kết phase-3 — 11 timeout cheat sheet

| Timeout | Default | Production khuyến nghị (API thường) | Khi nào tune khác |
|---|---|---|---|
| `client_header_timeout` | 60s | **5-10s** | Hiếm khi cao |
| `client_body_timeout` | 60s | **30s** | Upload-heavy: 5m |
| `send_timeout` | 60s | **30s** | Download lớn: 5m |
| `keepalive_timeout` (client) | 75s | **30s** | Behind LB: < LB idle timeout |
| `lingering_timeout` | 5s | giữ default | Hiếm |
| `lingering_time` | 30s | giữ default | Hiếm |
| `resolver_timeout` | 30s | **5s** | Tuỳ DNS |
| `proxy_connect_timeout` | 60s | **2-5s** | Cross-region: 10s |
| `proxy_send_timeout` | 60s | **30s** | Upload streaming: 5m |
| `proxy_read_timeout` | 60s | **30s** | SSE/WS: 1h, batch: 5m |
| `proxy_next_upstream_timeout` | 0 (off) | **10s** | Phải set |
| `keepalive_timeout` (upstream) | 60s | giữ default | High-traffic: 30s |

## Decision tree: tune timeout cho location

```text
   Location loại gì?
        │
        ├── API REST nhanh (< 1s response)
        │      → proxy_connect 2s, proxy_read 5s
        │
        ├── API batch / report (vài phút)
        │      → proxy_read 5m, KHÔNG retry
        │
        ├── File upload lớn
        │      → client_body 5m, proxy_send 5m, proxy_request_buffering off
        │
        ├── File download lớn
        │      → send_timeout 5m, sendfile on
        │
        ├── SSE / streaming
        │      → proxy_read 1h, proxy_buffering off
        │
        ├── WebSocket
        │      → proxy_read 1h, Upgrade headers, http_version 1.1
        │
        └── Static content
               → Giữ default đa số, tune keepalive cao
```

## Checklist final — config production

```nginx
http {
    # ── Frontend timeouts ──
    client_header_timeout       5s;
    client_body_timeout         30s;
    client_max_body_size        10m;
    send_timeout                30s;
    keepalive_timeout           30s;
    keepalive_requests          1000;
    large_client_header_buffers 4 16k;

    # ── DNS resolver (cho dynamic backend) ──
    resolver          8.8.8.8 1.1.1.1 valid=30s ipv6=off;
    resolver_timeout  5s;

    # ── Connection limit (chống DoS) ──
    limit_conn_zone $binary_remote_addr zone=per_ip:10m;

    upstream api_backend {
        server app1:8080 max_fails=3 fail_timeout=10s;
        server app2:8080 max_fails=3 fail_timeout=10s;
        server app3:8080 max_fails=3 fail_timeout=10s;
        keepalive          32;
        keepalive_timeout  60s;
        keepalive_requests 1000;
    }

    server {
        listen 443 ssl http2;
        
        limit_conn per_ip 10;

        # ── API thường ──
        location /api/ {
            proxy_pass         http://api_backend;
            
            proxy_http_version 1.1;
            proxy_set_header   Connection "";
            proxy_set_header   Host       $host;
            proxy_set_header   X-Real-IP  $remote_addr;
            
            # Backend timeouts
            proxy_connect_timeout        2s;
            proxy_send_timeout           10s;
            proxy_read_timeout           30s;
            proxy_next_upstream          error timeout http_502 http_503 http_504;
            proxy_next_upstream_timeout  10s;
            proxy_next_upstream_tries    3;
        }

        # ── SSE ──
        location /events/ {
            proxy_pass         http://sse_backend;
            proxy_http_version 1.1;
            proxy_set_header   Connection "";
            proxy_buffering    off;
            proxy_read_timeout 1h;
            proxy_send_timeout 1h;
        }
    }
}
```

→ Đây là **starting point production-grade**. Tune theo workload thực sau khi monitoring.

## Monitor — đo trước, tune sau

Bật stub_status hoặc Prometheus exporter:

```nginx
location /nginx_status {
    stub_status on;
    allow 127.0.0.1;
    deny all;
}
```

Theo dõi:
- Số 408 trong access log → tune frontend timeout.
- Số 504 trong access log → backend chậm hoặc proxy_read timeout strict.
- `Waiting` connection (idle keepalive) → tune keepalive_timeout.

Trong production thật: dùng Grafana dashboard + alert. Đây là chủ đề ngoài phase này.

## Bẫy thường gặp tổng hợp

| Bẫy | Hệ quả |
|---|---|
| Quên `proxy_http_version 1.1` + `Connection ""` cho upstream | Upstream keepalive không work, mỗi request open conn mới |
| `proxy_next_upstream_timeout 0` (default) | Loop vô hạn khi nhiều backend chết |
| Tăng `proxy_read_timeout 1h` global | API thường cũng đợi 1h |
| Quên `proxy_buffering off` cho SSE | Event delay, không real-time |
| Không tách location cho upload/download | Tune timeout không thể fine |
| Quên `client_max_body_size` | Default 1m → user upload ảnh 5MB fail |

## Tóm tắt bài 7 + tổng kết phase-3

- `proxy_next_upstream_timeout` **luôn phải set** trong production, default 0 = nguy hiểm.
- Upstream `keepalive 32` + `proxy_http_version 1.1` + `Connection ""` = combo bắt buộc cho keepalive backend.
- Tổng cộng 11 timeout — học theo nhóm: frontend (6) + backend (5).
- Đa số default 60s **quá lỏng** cho production. Tune 5-30s là phổ biến.
- Tách `location` theo workload (API, upload, SSE, WS) để tune chính xác.
- **Đo trước, tune sau** — bật log, dùng metric, điều chỉnh theo p99 thực tế.

**Bài kế tiếp** → [Phase 4 — Bài 1: Tổng quan setup NGINX deeper config](../phase-4/01-tong-quan.md)
