# Bài 5: proxy_connect_timeout — NGINX bắt tay backend

Đây là **timeout đầu tiên** xảy ra ở phía backend. NGINX phải mở TCP connection mới đến backend cho mỗi request (nếu không có keepalive pool) — `proxy_connect_timeout` quyết định bao lâu thì coi là "backend chết, fail nhanh".

Tune đúng = phát hiện backend chết nhanh. Tune sai = hoặc false positive (kill backend đang slow), hoặc user chờ quá lâu.

## Vị trí trong vòng đời request

```text
Client ──► NGINX  ──[proxy_connect_timeout]──► Backend
                       (đang ở đây)
            
            Sau khi connect xong:
            ──[proxy_send_timeout]──►   gửi request
            ──[proxy_read_timeout]──►   chờ response
```

3-way handshake TCP đến backend phải hoàn thành trong vòng `proxy_connect_timeout` giây.

## Định nghĩa chính thức

> **proxy_connect_timeout**: thời gian tối đa NGINX chờ TCP handshake với backend hoàn thành. Hết hạn = NGINX coi backend đó "down", có thể skip qua backend khác (nếu có) hoặc trả `502 Bad Gateway`.

**Default: 60 giây**. **Tối đa: 75 giây** (giới hạn cứng của NGINX, không vượt được).

```nginx
location / {
    proxy_pass             http://backend_pool;
    proxy_connect_timeout  2s;
}
```

## Flow chi tiết

```text
NGINX                        Backend
  │                             │
  │ ── SYN ────────────────────►│
  │     (timer start)            │
  │                             │
  │  Case 1: backend live, gần   │
  │ ◄── SYN-ACK ─────────────────│ (sau ~10ms)
  │ ── ACK ─────────────────────►│
  │     (connect done, timer reset)
  │                             │
  │  Case 2: backend down/firewall block
  │ (không có SYN-ACK)           │
  │     ... chờ ...              │
  │     ... chờ ...              │
  │ ✗ proxy_connect_timeout 2s   │
  │     close, mark backend dead │
  │     trả 502 hoặc try next    │
  │                             │
  │  Case 3: backend slow accept (queue đầy)
  │ ◄── SYN-ACK chậm (5s) ───────│
  │     (vượt 2s) → cũng timeout │
```

## Tại sao có hard limit 75 giây?

NGINX docs nói:

> "It should be noted that this timeout cannot usually exceed 75 seconds."

Đây là **giới hạn kernel-level**. Linux/BSD có default TCP retransmit time-out (`tcp_syn_retries`) ~75s. Sau 75s mà không nhận SYN-ACK, kernel tự fail handshake — NGINX nhận thông báo, không thể chờ lâu hơn.

→ Không thể đặt `proxy_connect_timeout 5m` rồi mong NGINX chờ 5 phút. Kernel sẽ kill trước.

## Tune theo distance backend

`proxy_connect_timeout` nên bằng **2-5 × RTT** đến backend.

| Backend location | RTT typical | `proxy_connect_timeout` suggested |
|---|---|---|
| Cùng container/host | < 1ms | 500ms-2s |
| Cùng DC | 1-5ms | 1s-2s |
| Cross-DC trong cùng region | 5-30ms | 2s-5s |
| Cross-region (vd US-EU) | 70-200ms | 5s-10s |
| Cross-cloud / on-prem ↔ cloud | variable | 10s |

> **Nguyên tắc**: ngắn để fail nhanh, đủ rộng cho network spike thông thường.

Đa số production: **2-5 giây** là đủ. Default 60s **quá lỏng**.

## Trade-off khi tune

### Tune quá ngắn — false positive

```text
proxy_connect_timeout 500ms

Backend đang spike CPU 100%, kernel chậm accept TCP (queue đầy).
SYN-ACK đến sau 700ms.
→ NGINX coi là dead → mark "down" → traffic toàn đi backend khác → backend quá tải tiếp.
```

→ Cascading failure: 1 backend slow → tất cả traffic dồn về backend khác → quá tải → mark dead → toàn pool chết.

### Tune quá dài — user chờ vô tận

```text
proxy_connect_timeout 60s
Backend thực sự chết (firewall block).
NGINX chờ 60s.
User chờ 60s rồi mới thấy 502 → bỏ web từ lâu.
```

→ Tệ trải nghiệm. Lý tưởng là 5s max.

## Phối hợp với load balancing

Khi có nhiều backend, `proxy_connect_timeout` ngắn = fail-over nhanh:

```nginx
upstream pool {
    server app1:8080 max_fails=3 fail_timeout=10s;
    server app2:8080 max_fails=3 fail_timeout=10s;
    server app3:8080 max_fails=3 fail_timeout=10s;
}

server {
    location / {
        proxy_connect_timeout 2s;
        proxy_next_upstream error timeout;
        proxy_pass http://pool;
    }
}
```

Logic:
- App1 down → NGINX SYN, không SYN-ACK trong 2s → timeout.
- `proxy_next_upstream` kích hoạt → try app2.
- App2 SYN-ACK trong 5ms → OK, response từ app2.

Từ góc nhìn user: thấy 2s delay (đợi app1 fail), sau đó OK. So với default 60s — better x30.

**`max_fails=3 fail_timeout=10s`**: nếu app1 fail 3 lần trong 10s, NGINX tạm thời mark dead 10s, không cố thử cho đến khi 10s trôi qua. Tránh lãng phí timeout cho backend đã rõ là chết.

## Default vs production — bảng so sánh

| Setup | Default | Production khuyến nghị |
|---|---|---|
| NGINX → backend cùng Docker host | 60s | **2s** |
| NGINX → backend qua intranet | 60s | **3s** |
| NGINX → backend cross-AZ | 60s | **5s** |
| NGINX → backend cross-region | 60s | **10s** |
| NGINX → 3rd party API (vd payment gateway) | 60s | **5-10s** + retry logic ở app |

## Phân biệt với các connection event khác

Quan trọng — đừng nhầm `proxy_connect_timeout` với:

| Event | Timeout liên quan |
|---|---|
| TCP handshake | **proxy_connect_timeout** |
| Đang gửi request body lên backend | `proxy_send_timeout` |
| Đang chờ response từ backend | `proxy_read_timeout` |
| Backend chết, thử backend khác | `proxy_next_upstream_timeout` |
| Backend "live nhưng chậm health-check" | `fail_timeout` trong upstream |

`proxy_connect_timeout` **chỉ** áp dụng giai đoạn handshake TCP. Sau khi connect xong, timer chuyển sang `proxy_send`/`proxy_read`.

## Khi nào trigger và cách debug

### Symptom: 502 với log "connect() failed (110: Connection timed out)"

```text
2026/05/17 10:23:45 [error] 1234#0: *5678 connect() failed (110: Connection timed out) 
   while connecting to upstream, client: 1.2.3.4, server: example.com, 
   request: "GET /api/users HTTP/1.1", upstream: "http://10.0.0.5:8080/api/users"
```

110 = Linux `ETIMEDOUT`. NGINX đợi SYN-ACK quá `proxy_connect_timeout`.

**Debug từng bước**:

1. Check backend live không:
   ```bash
   curl -v http://10.0.0.5:8080/
   ```

2. Check firewall / security group:
   ```bash
   nmap -p 8080 10.0.0.5
   # PORT     STATE    SERVICE
   # 8080/tcp filtered  http-proxy   ← firewall block
   ```

3. Check backend đang accept connection không:
   ```bash
   ss -lnt sport = 8080
   # LISTEN  0  128  0.0.0.0:8080  0.0.0.0:*
   ```

4. Check kernel accept queue:
   ```bash
   ss -lnt sport = 8080 | head -3
   # Send-Q là số connection trong accept queue
   ```

### Symptom: latency thỉnh thoảng spike, log normal

Có thể backend đôi khi chậm accept (CPU spike, GC pause). Tune:
- Tăng `proxy_connect_timeout` (nhưng không quá lỏng).
- Tune backend (giảm GC pause, scale CPU).
- Health check active để evict backend slow.

## Cấu hình production mẫu

```nginx
http {
    upstream api_pool {
        server app1:8080 max_fails=3 fail_timeout=10s;
        server app2:8080 max_fails=3 fail_timeout=10s;
        server app3:8080 max_fails=3 fail_timeout=10s;
        keepalive 32;
    }

    server {
        listen 443 ssl;

        location /api/ {
            proxy_pass                   http://api_pool;
            
            proxy_connect_timeout        2s;
            proxy_send_timeout           10s;
            proxy_read_timeout           30s;
            proxy_next_upstream_timeout  10s;
            proxy_next_upstream          error timeout http_502 http_503 http_504;
            proxy_next_upstream_tries    3;
            
            proxy_http_version 1.1;
            proxy_set_header   Connection "";       # bật keepalive với upstream
        }
    }
}
```

## Bẫy thường gặp

| Bẫy | Hệ quả | Cách tránh |
|---|---|---|
| Giữ default 60s | User chờ 60s mỗi lần backend chết | Set 2-5s |
| Set 100ms (quá strict) | False positive với network spike bình thường | Tối thiểu 1s, recommend 2s |
| Quên `proxy_next_upstream` | NGINX timeout xong trả 502 luôn, không try backend khác | Bật `proxy_next_upstream error timeout` |
| Backend dùng connection pool internal, expected slow first connect | First connect mất 5s (TLS setup, JDBC pool) | Tăng `proxy_connect_timeout` hoặc warm-up backend |
| Đặt `proxy_connect_timeout 5m` mong chờ 5 phút | Kernel limit 75s, không vượt được | Hard limit, không thể vượt |

## Tóm tắt bài 5

- `proxy_connect_timeout` đo TCP handshake NGINX → backend. Default 60s, hard max 75s.
- Production: 2-5s là đủ cho hầu hết case. Mặc định 60s quá lỏng → user chờ vô lý.
- Phối hợp với `proxy_next_upstream` để fail-over nhanh sang backend khác.
- Tune quá strict gây cascading failure khi backend spike CPU.
- Symptom: 502 + log "connect() failed (110: Connection timed out)".

**Bài kế tiếp** → [Bài 6: proxy_send_timeout + proxy_read_timeout — truyền dữ liệu 2 chiều với backend](06-proxy-send-read-timeout.md)
