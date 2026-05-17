# Bài 3: send_timeout + keepalive_timeout — chiều ngược và TCP keep-alive

Bài 2 nói về NGINX đọc request từ client. Bài này nói về **chiều ngược** — NGINX gửi response cho client (`send_timeout`) và giữ idle connection sau response (`keepalive_timeout`). Hai timeout này hiểu kỹ thì tránh được nhiều bug debug đau đầu.

## send_timeout — NGINX gửi response cho client

> Định nghĩa: **thời gian tối đa giữa 2 lần write response** đến client. Hết hạn = NGINX đóng connection.

**Default: 60 giây**.

### Flow

```text
Backend                    NGINX                      Client
   │                         │                           │
   │ (response 100MB)        │                           │
   │ ──[chunk 1]────────────►│                           │
   │                         │ write chunk 1 ──────────► │
   │                         │   (timer reset)           │
   │ ──[chunk 2]────────────►│                           │
   │                         │ write chunk 2 ──────────► │
   │                         │   (client ACK chậm,       │
   │                         │    NGINX vẫn đang chờ ACK)│
   │                         │   ...                     │
   │                         │ [pause > 60s]             │
   │                         │ ✗ send_timeout            │
   │                         │ close connection          │
```

Nếu NGINX **không write thành công** trong 60s liên tiếp (vd client mạng chậm/treo, không ACK packet) → đóng connection.

### Vì sao "write thành công" có thể fail?

`write()` thành công từ application level **không** = data đã đến tay client. TCP có 2 layer:

1. **App write to kernel socket buffer** — usually nhanh.
2. **Kernel gửi qua TCP, chờ ACK từ client** — phụ thuộc mạng client.

Nếu client buffer đầy (chưa đọc, hoặc mạng chậm), kernel buffer của NGINX cũng đầy → `write()` block. NGINX chờ. Nếu chờ quá `send_timeout` → close.

```text
   NGINX → kernel buf → [pipe to client] ← client_buf → app client
                                  │
                                  │ Nếu pipe nghẹn:
                                  │   - client mạng kém
                                  │   - client app đọc chậm
                                  │   - TCP window full
                                  │
                            kernel buf đầy → write() block
                                  │
                                  ▼
                            send_timeout kick in
```

### Khi nào client gây ra `send_timeout` trigger?

- **Mobile bad network** — packet loss, retransmit nhiều.
- **Client app chậm consume** — vd browser tab background, JS chưa xử lý kịp.
- **Client lừa attack** — cố ý ACK chậm để chiếm connection (gọi là "Slow Read" attack — anh em với Slow Loris nhưng ngược).
- **Network spike** ở giữa đường.

### Cấu hình

```nginx
http {
    send_timeout 30s;        # default 60s
}
```

Hoặc per-location:

```nginx
location /download/ {
    send_timeout 5m;         # file lớn, cho client nhiều thời gian
}

location /api/ {
    send_timeout 10s;        # API response nhỏ, strict
}
```

### Cẩn thận với download file lớn

User download 500MB qua 3G — có thể mất rất lâu. Mặc dù mỗi `write()` chunk vẫn diễn ra thường xuyên, nếu mạng client lúc nào đó nghẹn 60s → bị cut.

→ Cho location download, tăng `send_timeout` đến vài phút hoặc dùng `sendfile` để giảm áp lực user-space buffer.

```nginx
location /downloads/ {
    sendfile         on;
    tcp_nopush       on;          # gói packet to send batch (hiệu quả)
    send_timeout     5m;
    
    root /var/www/files;
}
```

> `sendfile` = zero-copy từ disk → socket (xem Phase-1 Bài 1). Latency thấp, ít memory user-space.

## keepalive_timeout — giữ idle connection

> Định nghĩa: **thời gian giữ idle TCP connection** với client sau khi request-response xong, để client có thể gửi request tiếp **mà không cần handshake lại**.

**Default: 75 giây**.

### Tại sao HTTP keep-alive tồn tại?

Trang web modern có **hàng chục request** mỗi page load:
- HTML 1 request.
- CSS 2-5 request.
- JS 5-20 request.
- Hình ảnh 10-100 request.
- API call sau đó.

Nếu **mỗi request 1 TCP connection**:

```text
   Client                NGINX
      │  SYN          ─►│
      │  SYN-ACK     ◄──│   (handshake — 1 RTT)
      │  ACK          ─►│
      │  TLS handshake◄►│   (~ 2 RTT cho TLS 1.2, 1 RTT TLS 1.3)
      │  HTTP req    ──►│
      │  HTTP resp   ◄──│
      │  FIN          ─►│   (close — 1 RTT)
      │  ACK         ◄──│
```

Mỗi request **~3 RTT** chỉ để mở/đóng. Mạng 50ms RTT = 150ms overhead **mỗi request**. 50 request = 7.5 giây chỉ để bắt tay.

**Keep-alive** giải bằng cách: sau response, **không close** connection — chờ client gửi request tiếp.

```text
   Client                NGINX
      │  SYN/SYN-ACK/ACK│   (1 lần)
      │  TLS handshake  │   (1 lần)
      │                 │
      │  HTTP req 1   ──►
      │  HTTP resp 1  ◄──
      │                 │   ← idle, connection vẫn open
      │  HTTP req 2   ──►
      │  HTTP resp 2  ◄──
      │                 │
      │  HTTP req 3   ──►
      │  HTTP resp 3  ◄──
      │                 │
      │  [idle quá keepalive_timeout]
      │  FIN          ──►│
```

Một TCP connection phục vụ nhiều request → giảm latency drastically.

> HTTP/1.0 không có keep-alive (default), thêm bằng `Connection: keep-alive` header.
> HTTP/1.1 keep-alive là **default**, close bằng `Connection: close`.
> HTTP/2 đa thread cùng 1 connection — keep-alive là cốt lõi.

### Khi nào NGINX close idle connection?

```text
   client gửi request A ──► NGINX trả response A
                              │
                              │ ── keepalive_timeout 75s start ──
                              │
   client idle 30s            │ (vẫn trong budget)
                              │
   client gửi request B ──► NGINX trả response B
                              │
                              │ ── timer reset, lại 75s ──
                              │
   client idle 80s            │ (vượt 75s)
                              ▼
                       NGINX close connection
```

Mỗi response → timer reset 75s. Idle quá threshold = close.

### Cấu hình 2 tham số

```nginx
http {
    keepalive_timeout      30s;           # NGINX-side timeout
    keepalive_requests     1000;          # max request / 1 connection
}
```

| Directive | Ý nghĩa |
|---|---|
| `keepalive_timeout` | Idle bao lâu thì close |
| `keepalive_requests` | 1 connection xử lý tối đa N request trước khi close (NGINX 1.19.10+ default 1000) |

Tăng `keepalive_requests` để giảm reconnect, đặc biệt với client thường xuyên (single-page app, mobile).

### Tham số thứ 2 của `keepalive_timeout`

```nginx
keepalive_timeout 75s 60s;
#                  │   │
#                  │   └─ giá trị trong header "Keep-Alive: timeout=60" gửi client
#                  └───── NGINX server-side timeout
```

Hai số là cho mục đích riêng:
- Số 1: NGINX dùng để quyết định close.
- Số 2: gửi vào HTTP response header `Keep-Alive: timeout=N` — gợi ý cho client cũng close sau N giây.

Đa số người chỉ dùng 1 số (NGINX không gửi `Keep-Alive` header).

### Trade-off tune keepalive_timeout

| Giá trị | Pros | Cons |
|---|---|---|
| Cao (75s+) | Client tận dụng tốt, ít TLS handshake | Nhiều idle connection tồn tại → tốn fd/memory |
| Thấp (5-15s) | Resource gọn | Client phải reconnect → tăng tải TLS handshake |
| 0 (disable) | Tối ưu cho 1-request-and-gone use case (vd API CLI) | Web/SPA chậm |

**Recommend production**:
- Web/SPA: **30s** (đủ cho user click chuyển page).
- API public (rate-limited): **15-30s**.
- Internal service-to-service: cao hơn, kết hợp `keepalive` upstream block.

### `keepalive_timeout 0` — vô hiệu hoá keep-alive

```nginx
keepalive_timeout 0;
```

NGINX gửi `Connection: close` header, client close ngay sau response.

Use case hiếm:
- Behind LB cần "fresh connection" mỗi lần để LB phân phối.
- Debug — không muốn confused vì connection reuse.

Không khuyến nghị default.

### Quan sát keep-alive đang work

```bash
# Browser DevTools → Network tab → xem header "Connection: keep-alive" / "close"
# Hoặc curl:
curl -v https://example.com/

# Response sẽ có header:
# Connection: keep-alive
# Keep-Alive: timeout=60
```

Server-side đo bằng metric (NGINX stub_status hoặc Prometheus exporter):
- `nginx_connections_active`
- `nginx_connections_waiting` ← đây là idle keep-alive

Nếu `Waiting` rất nhiều → có thể giảm `keepalive_timeout`.

## Phối hợp: send_timeout và keepalive_timeout

| Tình huống | Timeout liên quan |
|---|---|
| NGINX đang gửi response, client treo | `send_timeout` |
| NGINX gửi response xong, chờ request tiếp | `keepalive_timeout` |

Hai timeout **liên tiếp** trong vòng đời connection:

```text
client ───request───► NGINX
                       │
                       │ process...
                       │
NGINX ──response (chunk 1, 2, 3...)───► client    ← send_timeout giữa các chunk
                       │
NGINX ────────────► client  (response xong)
                       │
                       │ ───── idle ─────         ← keepalive_timeout
                       │
client ──request 2 (cùng conn)──► NGINX
                       │
                       ...
```

## Test thực

```bash
# 1. Mở connection và gửi 1 request
curl -v --keepalive-time 30 \
     "https://nginx.example.com/" \
     "https://nginx.example.com/" \
     "https://nginx.example.com/"
# curl reuse connection → thấy "Re-using existing connection" trong verbose
```

```bash
# 2. Test send_timeout — request file lớn, mạng cố ý chậm
sudo tc qdisc add dev eth0 root netem delay 100ms rate 1kbit
curl https://nginx.example.com/big-file.bin
# Nếu rate quá thấp, NGINX có thể trigger send_timeout
sudo tc qdisc del dev eth0 root
```

## Bẫy thường gặp

| Bẫy | Hệ quả | Cách tránh |
|---|---|---|
| `send_timeout` quá nhỏ cho download lớn | Client tải file bị cắt giữa chừng | Tăng riêng cho `location /downloads/` |
| Quên tăng `send_timeout` cho SSE/long-poll | Streaming endpoint cắt sau 60s | Đặt 1h+ cho location SSE |
| `keepalive_timeout 0` ở web | Mỗi request handshake lại → TLS overhead lớn | Giữ 30s+ |
| Tăng `keepalive_timeout` đến 1h trên public | Idle connection tồn động nhiều, file descriptor cạn | 30-60s đủ |
| Confuse với upstream `keepalive_timeout` | Đây là client-side, khác hẳn với upstream pool | Sẽ học ở Bài 7 |

## Khi NGINX phối hợp với cloud LB phía trước

Pattern phổ biến:

```text
   Internet → Cloud LB (AWS ALB / GCP) → NGINX → backend
```

Cloud LB cũng có **idle timeout** (ALB default 60s, GCP 600s).

**Vấn đề**: NGINX `keepalive_timeout` nên **nhỏ hơn hoặc bằng** LB idle timeout.

```text
NGINX keepalive_timeout 75s, LB idle 60s:
   Sau 60s idle, LB close connection phía nó (nhưng NGINX chưa biết).
   NGINX cố write next request → packet đến LB phải reset → user thấy lỗi.
```

→ **Set NGINX `keepalive_timeout` < LB idle timeout** (vd LB = 60s thì NGINX 30-45s).

## Tóm tắt bài 3

- `send_timeout` = khoảng giữa 2 lần **write response** thành công đến client. Default 60s.
- `write()` block khi kernel buffer đầy do client mạng kém — đây là khi `send_timeout` trigger.
- `keepalive_timeout` = thời gian giữ idle connection sau response. Default 75s.
- Keep-alive là tối ưu **lớn nhất** của HTTP/1.1 — giảm overhead handshake, đặc biệt TLS.
- Tune theo workload: SPA web 30s, download 5m+ cho `send_timeout`, behind LB phải nhỏ hơn LB idle.

**Bài kế tiếp** → [Bài 4: lingering_timeout + resolver_timeout — 2 timeout ít gặp nhưng cần biết](04-lingering-resolver-timeout.md)
