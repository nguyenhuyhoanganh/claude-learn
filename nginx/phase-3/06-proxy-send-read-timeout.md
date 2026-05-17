# Bài 6: proxy_send_timeout + proxy_read_timeout — truyền dữ liệu với backend

Sau khi handshake xong (Bài 5), NGINX bắt đầu **gửi request** đến backend rồi **đọc response** trở về. Hai pha này có 2 timeout riêng: `proxy_send_timeout` và `proxy_read_timeout`. Đây là **2 timeout backend hay phải tune nhất** trong production.

Đặc biệt, `proxy_read_timeout` là **thủ phạm phổ biến nhất** của bug "WebSocket cứ 60s lại disconnect" và "Server-Sent Events bị cắt giữa chừng".

## Vị trí trong vòng đời

```text
Client ──► NGINX ──► Backend
              │
              │ ── proxy_connect_timeout ──► handshake xong
              │
              │ ── proxy_send_timeout ────►  gửi request body
              │       (NGINX write → backend read)
              │
              │ ◄── proxy_read_timeout ────  đọc response
              │       (NGINX read ◄ backend write)
              │
              │ ──► gửi response cho client (send_timeout của frontend)
```

## proxy_send_timeout — NGINX gửi request cho backend

> Định nghĩa: **khoảng cách tối đa giữa 2 lần write** request đến backend. Hết hạn = NGINX đóng connection backend, trả 504 Gateway Timeout về client.

**Default: 60 giây**.

### Khi nào trigger?

Chỉ trigger khi NGINX cần **stream request body lớn** lên backend, và backend **đọc chậm**.

```text
Client                    NGINX                     Backend
   │  POST 100MB           │                           │
   │ ──────────────────────►│                          │
   │                        │── chunk 1 (1MB) ────────►│ (read, lưu vào memory)
   │                        │ (timer reset)             │
   │                        │── chunk 2 ──────────────►│
   │                        │── chunk 3 ──────────────►│
   │                        │ ...                       │
   │                        │── chunk 50 ─────────────►│ (backend đọc chậm,
   │                        │                            buffer đầy)
   │                        │ [chờ backend...]          │
   │                        │ [chờ...]                  │
   │                        │ ✗ proxy_send_timeout 60s  │
   │                        │ close conn, trả 504 client│
```

### Khi nào KHÔNG trigger?

- GET request không có body → NGINX không write nhiều, timeout không relevant.
- POST body nhỏ (< 16KB default buffer) → NGINX gửi 1 lần xong, timer không kéo dài.

→ Chỉ tune cao khi workload có **upload lớn lên backend qua NGINX**.

### Cấu hình

```nginx
location /upload/ {
    client_max_body_size  100m;
    client_body_buffer_size 1m;
    
    proxy_pass            http://upload_backend;
    proxy_send_timeout    5m;          # rộng cho upload lớn
    proxy_request_buffering off;       # stream, không buffer hết vào NGINX trước
}
```

### `proxy_request_buffering` ảnh hưởng send timeout

NGINX có 2 mode:

**Default (`proxy_request_buffering on`)**:
1. NGINX **đọc toàn bộ** request body từ client vào buffer (RAM hoặc disk).
2. **Sau đó** mở connection backend, gửi từ buffer.
3. → `proxy_send_timeout` chỉ áp dụng giai đoạn "đọc từ buffer gửi backend" — thường nhanh.

```text
   Client ─── đọc body ──► NGINX (buffer full)
                              │
                              │  [client done]
                              │
                              ▼
                          Backend ◄── stream from buffer
                                  (proxy_send_timeout đo ở đây)
```

**Stream (`proxy_request_buffering off`)**:
1. NGINX vừa đọc body từ client vừa **stream ngay** sang backend.
2. → `proxy_send_timeout` đo cả thời gian backend chấp nhận data.

```text
   Client ── chunk ──► NGINX ── chunk ──► Backend
                       (stream pass-through)
                       (proxy_send_timeout đo trực tiếp)
```

→ Mode stream tốt cho upload **rất lớn** (nhiều GB) để NGINX không phải buffer hết trước. Đổi lại, mọi network spike client→NGINX hoặc NGINX→backend đều có thể trigger timeout.

## proxy_read_timeout — NGINX đọc response từ backend

> Định nghĩa: **khoảng cách tối đa giữa 2 lần read** response từ backend. Hết hạn = NGINX đóng connection, trả 504 về client.

**Default: 60 giây**. **Đây là timeout backend hay phải tune nhất**.

### Flow

```text
Client                    NGINX                    Backend
   │  GET /api/...         │                          │
   │ ──────────────────────►│                          │
   │                        │── forward request ──────►│
   │                        │                          │
   │                        │ [chờ response]            │
   │                        │                          │ (backend đang query DB...)
   │                        │ ── timer start ──        │
   │                        │                          │ (DB query chậm)
   │                        │                          │
   │                        │ [60s qua]                 │
   │                        │                          │ (backend vẫn đang xử lý)
   │                        │ ✗ proxy_read_timeout      │
   │                        │ close, trả 504 client     │
   │  504 ◄─────────────────│                          │
```

### Khi nào trigger?

3 nguyên nhân chính:

1. **Backend xử lý chậm** — DB query dài, AI inference, batch job.
2. **Backend tê liệt** — deadlock, hết RAM, GC pause.
3. **Long-lived response intentional** — SSE, long-polling, WebSocket upgrade — **không phải lỗi**, cần config nới rộng.

### Server-Sent Events (SSE) — case kinh điển bị cắt

SSE = backend gửi event xuống client liên tục qua một response HTTP duy nhất:

```text
GET /events HTTP/1.1
Host: example.com

──► HTTP/1.1 200 OK
    Content-Type: text/event-stream
    
    data: event 1\n\n          ← event đầu sau 0.5s
    
    [im lặng 30s]              ← không có event
    
    data: event 2\n\n          ← event thứ 2
    
    [im lặng 90s]              ← ← ← problem!
                                  với default 60s,
                                  NGINX cắt connection ở đây.
    
    data: event 3\n\n          ← không bao giờ đến client
```

Default 60s **không phù hợp** SSE — phải tune cao:

```nginx
location /events/ {
    proxy_pass         http://sse_backend;
    
    proxy_read_timeout 1h;     # SSE có thể im lặng lâu
    proxy_buffering    off;    # KHÔNG buffer, gửi thẳng cho client
    
    proxy_http_version 1.1;
    proxy_set_header   Connection "";
}
```

`proxy_buffering off` quan trọng: mặc định NGINX buffer response 4KB trước khi gửi client → SSE event nhỏ bị giữ lại trong buffer, **không real-time**.

### WebSocket — cùng vấn đề

WebSocket protocol: client + server giữ TCP connection long-lived, gửi message qua lại. Mặc định 60s không có data → NGINX cắt.

```nginx
location /ws/ {
    proxy_pass         http://ws_backend;
    
    # Bắt buộc cho WebSocket
    proxy_http_version 1.1;
    proxy_set_header   Upgrade $http_upgrade;
    proxy_set_header   Connection "upgrade";
    
    # Timeout — nới cho WebSocket
    proxy_read_timeout 1h;     # nếu WS app gửi heartbeat mỗi 30s, có thể 5m
    proxy_send_timeout 1h;
}
```

→ Phase-5 đi sâu vào WebSocket. Đây chỉ là preview.

### Heavy API batch — case khác

API "tổng hợp báo cáo tháng" có thể chạy 2-3 phút. Đừng để default 60s cắt:

```nginx
location /api/reports/ {
    proxy_pass         http://reports_backend;
    proxy_read_timeout 5m;     # cho batch API rộng
    proxy_send_timeout 30s;
    
    proxy_buffering    on;     # buffer OK cho file output lớn
}
```

> Tốt hơn: cho long-running job, dùng **async pattern**: API trả 202 Accepted + job ID, client poll status. Nhưng tăng `proxy_read_timeout` là fix nhanh.

## So sánh send vs read

| Yếu tố | `proxy_send_timeout` | `proxy_read_timeout` |
|---|---|---|
| Hướng | NGINX → Backend (write) | NGINX ← Backend (read) |
| Khi nào trigger | Backend đọc chậm | Backend xử lý/gửi chậm |
| Default | 60s | 60s |
| Tune cho upload lớn | Tăng nếu `proxy_request_buffering off` | Không liên quan |
| Tune cho download lớn | Không liên quan | Tăng (nếu backend stream chậm) |
| Tune cho SSE/WebSocket | Tăng | **Tăng nhiều** (case kinh điển) |
| Tune cho batch API | Hiếm | **Tăng** |
| Status khi fail | 504 Gateway Timeout | 504 Gateway Timeout |

## Phối hợp với send_timeout (frontend)

Vòng đời end-to-end:

```text
Client ──[1]──► NGINX ──[2]──► Backend
              ◄──[4]──        ◄──[3]──
              ──[5]──►

[1] = client_body_timeout (client gửi → NGINX)
[2] = proxy_send_timeout (NGINX gửi → backend)
[3] = proxy_read_timeout (NGINX đọc ← backend)
[4] = vẫn proxy_read_timeout
[5] = send_timeout (NGINX gửi ← client)
```

Quy tắc thực dụng: `proxy_read_timeout` (backend xử lý) thường **lớn hơn** `send_timeout` (NGINX gửi response cho client) vì backend xử lý có thể chậm, client nhận thì nhanh.

## Config production mẫu

```nginx
http {
    server {
        listen 443 ssl;

        # API thường
        location /api/ {
            proxy_pass         http://api_backend;
            proxy_connect_timeout 2s;
            proxy_send_timeout    10s;
            proxy_read_timeout    30s;
        }

        # API batch (báo cáo dài)
        location /api/reports/ {
            proxy_pass         http://reports_backend;
            proxy_connect_timeout 2s;
            proxy_send_timeout    30s;
            proxy_read_timeout    5m;
        }

        # SSE
        location /events/ {
            proxy_pass         http://sse_backend;
            proxy_connect_timeout 2s;
            proxy_read_timeout    1h;
            proxy_send_timeout    1h;
            proxy_buffering       off;
            proxy_http_version    1.1;
            proxy_set_header      Connection "";
        }

        # WebSocket
        location /ws/ {
            proxy_pass         http://ws_backend;
            proxy_connect_timeout 2s;
            proxy_read_timeout    1h;
            proxy_send_timeout    1h;
            proxy_http_version    1.1;
            proxy_set_header      Upgrade $http_upgrade;
            proxy_set_header      Connection "upgrade";
        }

        # Upload file lớn
        location /upload/ {
            client_max_body_size       500m;
            proxy_pass                  http://upload_backend;
            proxy_request_buffering     off;
            proxy_connect_timeout       2s;
            proxy_send_timeout          5m;
            proxy_read_timeout          30s;
        }
    }
}
```

→ **5 location**, 5 bộ timeout khác nhau. Đây là pattern production thực — không có "one config fits all".

## Debug — symptom và cách tìm

### 504 Gateway Timeout sau đúng 60s

Log NGINX:
```text
2026/05/17 11:00:00 [error] 1234#0: *5678 upstream timed out (110: Connection timed out) 
   while reading response header from upstream, ...
```

→ `proxy_read_timeout` trigger. Kiểm tra backend chậm hay không (APM, slow query log).

### 504 khi upload file lớn

Log:
```text
[error] ... upstream timed out (110: Connection timed out) while sending request to upstream
```

→ `proxy_send_timeout` trigger. Kiểm tra backend chấp nhận upload chậm hay không. Hoặc bật `proxy_request_buffering on` (default) để NGINX đệm.

### WebSocket disconnect đúng 60s

Đặc trưng: WebSocket connection alive 60s rồi tự dưng close. Browser DevTools thấy WebSocket frame chuyển sang trạng thái closed.

→ `proxy_read_timeout` default cắt vì không có WS message trong 60s. Fix: tăng lên 1h + ws app gửi ping mỗi 30s.

## Bẫy thường gặp

| Bẫy | Hệ quả | Cách tránh |
|---|---|---|
| Default 60s cho mọi location | WebSocket/SSE cắt, batch API fail | Tách location, tune riêng |
| Tăng global `proxy_read_timeout 1h` | API chậm cũng chờ 1h → user bỏ | Chỉ tăng cho location cần long-lived |
| Quên `proxy_buffering off` cho SSE | Event delay vì buffer 4KB | Set off cho SSE/streaming |
| Quên `Connection "upgrade"` cho WebSocket | WebSocket handshake fail | Set đầy đủ proxy_set_header cho WS |
| Đặt timeout trong `http` context cho long-lived | Tất cả endpoint bị ảnh hưởng | Đặt trong `location` cụ thể |

## Tóm tắt bài 6

- `proxy_send_timeout` = giữa 2 lần write request lên backend. Trigger chủ yếu khi upload lớn + backend đọc chậm.
- `proxy_read_timeout` = giữa 2 lần read response từ backend. Default 60s — **không đủ** cho WebSocket / SSE / batch API.
- Tách `location` để tune timeout riêng cho từng loại endpoint là **best practice**.
- 504 Gateway Timeout là status code đặc trưng — log NGINX nói rõ "while reading" hay "while sending".
- `proxy_buffering off` quan trọng cho SSE — không thì event bị buffer mất real-time.

**Bài kế tiếp** → [Bài 7: proxy_next_upstream_timeout + backend keepalive — tổng kết backend timeout](07-proxy-next-upstream-keepalive-backend.md)
