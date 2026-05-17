# Bài 2: client_header_timeout + client_body_timeout — chống Slow Loris

Hai timeout này là **phòng tuyến đầu tiên** chống DoS đơn giản. Cấu hình sai = website của bạn dễ bị 1 attacker rẻ tiền hạ gục bằng 1 con script Perl 200 dòng.

## Trước khi vào: HTTP request có 2 phần

```text
POST /api/upload HTTP/1.1\r\n           ┐
Host: api.example.com\r\n               │
Content-Type: multipart/form-data\r\n   │ HEADER
Content-Length: 10485760\r\n            │ (vài KB)
User-Agent: Mozilla/5.0\r\n             │
Cookie: session=abc\r\n                 │
\r\n                                    ┘ ← phân cách: \r\n\r\n
<binary data 10MB>                      ┐ BODY
...                                     ┘ (có thể rất lớn)
```

NGINX phải **đọc xong header** trước khi quyết định route, parse, gọi backend. Body có thể stream qua sau.

Vì 2 phần có đặc tính khác nhau (header nhỏ, body có thể lớn), NGINX có 2 timeout tách biệt.

## client_header_timeout

> Định nghĩa NGINX: **thời gian tối đa để đọc xong toàn bộ HTTP request header từ client**. Hết hạn = NGINX trả `408 Request Timeout` và đóng connection.

**Default: 60 giây**.

### Flow chi tiết

```text
Client                          NGINX
  │  TCP SYN/SYN-ACK/ACK ────────► (handshake xong)
  │                                │
  │                                │ ── client_header_timeout start ──
  │                                │
  │  "POST /api/upload HTTP/1.1\r\n"►
  │  "Host: example.com\r\n"  ─────►   (đọc dần header)
  │  "Content-Type: ...\r\n"  ─────►
  │  [pause 10s — bình thường]     │   (vẫn trong budget)
  │  "Content-Length: ...\r\n"────►
  │  "\r\n"                  ─────►   (gặp \r\n\r\n → header xong)
  │                                │
  │                                │ ── timer reset (header done) ──
  │                                ▼
  │                          (chuyển sang chế độ đọc body, hoặc dispatch)
```

Nếu trong vòng `client_header_timeout`, client **không gửi hết header** (chưa thấy `\r\n\r\n` kết thúc) → NGINX `408` + close.

### Cấu hình

```nginx
http {
    client_header_timeout 10s;        # áp cho toàn bộ http context
    
    server {
        listen 443 ssl;
        # có thể override per-server
    }
}
```

Đặt ở `http`, `server` block. **Không đặt được trong `location`** — vì timeout này áp dụng trước khi NGINX biết location nào sẽ match.

## Slow Loris attack — vì sao tồn tại

Slow Loris (đặt theo loài thú cử động chậm) là pattern attack phát hiện 2009 bởi Robert Hansen.

### Cơ chế

Attacker:
1. Mở **một TCP connection** đến NGINX.
2. Gửi từ từ vài byte header.
3. **Mỗi 10-15 giây**, gửi thêm vài byte để timer "vẫn còn live".
4. Không bao giờ gửi `\r\n\r\n` kết thúc.
5. **Mỗi connection sẽ giữ một worker slot** trên NGINX cho tới khi `client_header_timeout` cuối cùng kích hoạt.

```text
Attacker thread 1: TCP conn 1, gửi 1 byte/15s, không kết thúc
Attacker thread 2: TCP conn 2, ... (same)
Attacker thread 3: TCP conn 3, ...
...
Attacker thread 10000: TCP conn 10000, ...

→ NGINX có 10000 connection bị "đóng băng" trong khi đang đọc header
→ Worker connection pool đầy
→ User thật connect đến = "connection refused" hoặc treo
```

### Vì sao Slow Loris hiệu quả với mặc định 60s?

`client_header_timeout` 60s nghĩa là **timer reset mỗi khi NGINX read được ≥ 1 byte header**. Nếu attacker gửi 1 byte mỗi 55s, timer **không bao giờ hết** — connection bị giữ vô tận.

Đợi từ-1.5.x (cũ rồi), NGINX đã sửa: `client_header_timeout` là **tổng thời gian** từ khi nhận byte đầu, **không reset** mỗi byte.

Tuy nhiên, 60s default vẫn là **quá rộng rãi** — attacker dễ dàng giữ connection 60s với ít byte. Strict đến 5-10s tốt hơn cho production.

### Mitigation tốt nhất

```nginx
http {
    client_header_timeout 5s;        # strict
    client_max_body_size  10m;       # cản POST khổng lồ
    
    # Giới hạn connection mỗi IP
    limit_conn_zone $binary_remote_addr zone=per_ip:10m;
    
    server {
        limit_conn per_ip 10;        # mỗi IP tối đa 10 conn đồng thời
    }
}
```

3 lớp:
1. **`client_header_timeout 5s`** — kẻ tấn công không thể giữ connection lâu.
2. **`limit_conn 10`** — 1 IP không thể mở 10000 connection.
3. Đặt NGINX sau một LB cấp 4 (cloud LB) có DDoS protection — Cloudflare, AWS Shield, GCP Cloud Armor.

> Lưu ý: Slow Loris **không là vấn đề lớn** với NGINX hiện đại vì event-loop scale tốt. Nó chỉ thực sự hạ gục Apache (thread-per-conn). Nhưng vẫn nên harden timeout cho rõ ràng.

## client_body_timeout

> Định nghĩa NGINX: **thời gian tối đa giữa 2 lần read body thành công** từ client. Hết hạn = `408` + close.

**Default: 60 giây**.

### Khác với header timeout — đo "khoảng cách giữa 2 read"

```text
Client upload 10MB:
   1KB ──► NGINX read (timer reset)
   1KB ──► NGINX read (timer reset)
   ...
   1KB ──► NGINX read (timer reset)
   [pause 30s]
   1KB ──► NGINX read (vẫn trong budget — 30s < 60s default)
   ...

   Tổng upload: có thể 30 phút nếu client chậm mà ổn.

Client tê liệt giữa chừng:
   1KB ──► NGINX read (timer start)
   [pause 70s — quá 60s]
   NGINX: 408 + close.
```

### Vì sao đo theo khoảng cách, không tổng?

```text
Use case A — mobile 2G upload ảnh:
   Mỗi packet đến NGINX cách nhau vài giây vì mạng yếu.
   Tổng upload 5 phút.
   Nếu đo TỔNG: phải set timeout > 5 phút → strict timeout không khả thi.
   Đo KHOẢNG: vẫn strict (60s) mà upload OK vì giữa các packet < 60s.

Use case B — attacker upload chậm:
   Cố ý gửi 1 byte/65s → vượt 60s → 408. Bắt được.
```

→ Pattern "đo khoảng cách" cân bằng giữa **chấp nhận client chậm legit** và **bắt attacker treo**.

### Cấu hình

```nginx
http {
    client_body_timeout    30s;    # API thông thường
    client_max_body_size   1m;     # bonus — giới hạn size body
    client_body_buffer_size 16k;   # buffer trong RAM
}
```

`client_body_buffer_size` đáng chú ý:
- Body nhỏ hơn buffer → giữ trong RAM, fast.
- Body lớn hơn → ghi tạm xuống `client_body_temp_path` (disk) → chậm hơn.

Production tune theo size body typical:
- API JSON: `client_body_buffer_size 16k` (default thường đủ).
- API upload ảnh nhỏ: `client_body_buffer_size 256k`.
- Upload file lớn: dùng `client_body_in_file_only on` để bypass buffer RAM hoàn toàn.

## So sánh nhanh

| Yếu tố | `client_header_timeout` | `client_body_timeout` |
|---|---|---|
| Default | 60s | 60s |
| Đo gì | Tổng thời gian đọc xong header | Khoảng giữa 2 lần read body |
| Khi nào reset timer | Không reset — tổng từ byte đầu | Mỗi lần đọc thành công |
| Khi nào trigger | Header không xong trong budget | 2 lần read body cách nhau quá xa |
| Status khi fail | 408 Request Timeout | 408 Request Timeout |
| Recommend (production API) | 5-10s | 30s |
| Recommend (upload-heavy) | 5-10s | 60s-5m |

## Code thực — test bằng Python

Script đơn giản để verify timeout đang work:

```python
# slow_client.py
import socket
import time

s = socket.socket()
s.connect(('nginx.example.com', 80))

# Gửi từng dòng header rất chậm
s.send(b'POST /upload HTTP/1.1\r\n')
print("Sent line 1")
time.sleep(3)

s.send(b'Host: nginx.example.com\r\n')
print("Sent line 2")
time.sleep(3)

s.send(b'Content-Length: 5\r\n')
print("Sent line 3")
time.sleep(10)             # ← thử > client_header_timeout

s.send(b'\r\n')            # kết thúc header
print("Sent header end")

response = s.recv(4096)
print("Server response:")
print(response.decode())
s.close()
```

Với `client_header_timeout 5s`, NGINX sẽ đóng connection trước khi script gửi `\r\n` — bạn nhận về `408 Request Timeout` (hoặc connection reset).

## Bẫy thường gặp

| Bẫy | Hệ quả | Cách tránh |
|---|---|---|
| Để default 60s mà công khai internet | Slow Loris vẫn giữ connection 60s | Giảm `client_header_timeout` ≤ 10s |
| Đặt `client_body_timeout` quá nhỏ (vd 5s) cho upload | Mobile user fail upload | Tăng theo workload, hoặc tách `location /upload` |
| Đặt timeout trong `location` cho header timeout | Không có hiệu lực (header đọc trước location match) | Đặt ở `http` hoặc `server` |
| Quên `client_max_body_size` | Attacker POST 1GB body | Set `client_max_body_size 10m;` (hoặc theo nhu cầu) |
| Test ở dev local thấy không trigger | Local quá nhanh, timeout không kích | Test với `tc` (Linux traffic control) hoặc proxy chậm |

### Tách config theo location

```nginx
server {
    listen 443 ssl;
    
    client_body_timeout 30s;          # default cho mọi location

    location /api/ {
        client_body_timeout 10s;       # API strict
        proxy_pass http://api_backend;
    }

    location /upload/ {
        client_body_timeout 5m;        # upload nới rộng
        client_max_body_size 100m;
        proxy_pass http://upload_backend;
    }
}
```

> `client_body_timeout` đặt được trong `location` (khác với `client_header_timeout`). Tận dụng để fine-tune.

## Phối hợp với `large_client_header_buffers`

Header **lớn** (vd cookie nhiều, Authorization token JWT dài) cần thêm buffer:

```nginx
http {
    client_header_buffer_size       2k;          # default buffer
    large_client_header_buffers     4 16k;       # 4 buffer × 16KB cho header lớn
}
```

Nếu header vượt buffer → NGINX trả `400 Bad Request`. JWT có thể >2KB nên cần set rộng hơn.

## Tóm tắt bài 2

- `client_header_timeout` = tổng thời gian đọc xong header; **không reset** mỗi byte. Default 60s nên giảm xuống **5-10s** cho production.
- `client_body_timeout` = khoảng cách giữa **2 read** body, reset mỗi lần. Default 60s. Tune theo workload: API 30s, upload có thể 5m.
- Slow Loris vẫn là pattern attack thực — giảm `client_header_timeout` + `limit_conn` + cloud DDoS protection là combo đủ chặn.
- Tách `location` để tune timeout khác nhau cho API/upload — best practice.
- Hết timeout = 408 Request Timeout về client.

**Bài kế tiếp** → [Bài 3: send_timeout — chiều ngược, NGINX gửi response về client](03-send-keepalive-timeout.md)
