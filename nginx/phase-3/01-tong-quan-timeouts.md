# Bài 1: Tổng quan NGINX timeouts — bản đồ 11 timeout phải nhớ

Timeouts là **một trong những phần** ít được dạy kỹ trong các khoá NGINX căn bản, nhưng lại là chỗ **vỡ nhiều nhất** trong production. Cấu hình sai = bị Slow Loris attack, hoặc kill nhầm long-polling, hoặc cạn file descriptor vì connection idle dồn ứ.

Phase này dạy **11 timeout** thường gặp, chia làm 2 nhóm: **frontend** (client ↔ NGINX) và **backend** (NGINX ↔ upstream). Bài này là **bản đồ tổng**. 6 bài sau đi vào từng cái.

## Vì sao timeout quan trọng?

3 lý do, không thể bỏ qua bất kỳ cái nào:

### 1. Security — chặn Slow Loris và họ hàng

**Slow Loris** là một attack pattern kinh điển: kẻ tấn công gửi 1 byte mỗi vài giây, mỗi lần gửi reset timer của server. Mục tiêu: chiếm **connection slot** trên server mà không hoàn thành request.

```text
   Attacker ─[byte 1]──────► NGINX  (worker slot bị chiếm)
              [byte 2 sau 30s]────►
              [byte 3 sau 30s]────►
              ...
              Mãi không gửi đủ header → NGINX vẫn giữ connection
   
   1000 client như vậy = 1000 connection chiếm dụng, NGINX không phục vụ user thật.
```

Không có timeout = kẻ tấn công có thể giữ connection **vô thời hạn**. Timeout phòng tuyến đầu.

### 2. Resource efficiency — giải phóng kết nối "ma"

Mỗi connection chiếm:
- **File descriptor** (giới hạn OS — vài chục nghìn/process).
- **Memory** (vài KB cho TCP state + TLS state).
- **Worker slot** (NGINX có giới hạn `worker_connections`).

Client treo, không response, không close — NGINX không thể tự biết "client còn sống hay chết". Timeout là **cơ chế tự dọn**.

### 3. User experience — không để user chờ vô tận

Backend treo → request chờ 10 phút → user bỏ web. Timeout đúng nghĩa là sau X giây mà backend không phản hồi, NGINX trả **504 Gateway Timeout** ngay, user biết để retry.

→ 3 yếu tố này **luôn cần** cân nhắc khi tune timeout: an toàn, tài nguyên, UX.

## Bản đồ 11 timeout

```text
                Client                                             Upstream
                  │                                                    │
                  │             ┌─────────────────┐                    │
                  │ FRONTEND    │                 │  BACKEND           │
                  │ side        │      NGINX      │  side              │
                  │             │                 │                    │
                  │ client_header_timeout         │                    │
                  │─[GET / ...]►│                 │                    │
                  │ [headers...]│ ← reading       │                    │
                  │             │                 │                    │
                  │ client_body_timeout           │                    │
                  │─[body...]──►│ ← reading body  │                    │
                  │             │                 │  proxy_connect_timeout
                  │             │                 │─[TCP connect]─────►│
                  │             │                 │                    │
                  │             │                 │  proxy_send_timeout
                  │             │                 │─[req body]────────►│
                  │             │                 │                    │
                  │             │                 │  proxy_read_timeout
                  │             │                 │◄─[resp body]───────│
                  │             │                 │                    │
                  │             │                 │  proxy_next_upstream_timeout
                  │             │   (if fail, try next backend)        │
                  │             │                 │                    │
                  │ send_timeout                  │                    │
                  │◄─[resp]─────│ ← writing       │                    │
                  │             │                 │                    │
                  │ keepalive_timeout             │  keepalive_timeout (backend pool)
                  │~~~idle~~~~~~│                 │~~~idle to upstream~~│
                  │             │                 │                    │
                  │ lingering_timeout             │                    │
                  │ (graceful close window)       │                    │
                  │             │                 │                    │
                  │             │  resolver_timeout                    │
                  │             │  (DNS lookup backend hostname)       │
                  │             │                                      │
```

## Frontend timeouts (6 cái)

Đây là timeout của **NGINX với client**. Mặc định đa số = **60 giây**.

| Timeout | Default | Đo lường gì? | Chống đỡ gì? |
|---|---|---|---|
| `client_header_timeout` | 60s | Thời gian đọc xong **header** từ client | Slow Loris (gửi header byte-by-byte) |
| `client_body_timeout` | 60s | Khoảng cách giữa **2 lần đọc body** liên tiếp | Slow upload, slow attacker |
| `send_timeout` | 60s | Khoảng cách giữa **2 lần ghi response** đến client | Client treo lúc nhận response |
| `keepalive_timeout` | 75s | Thời gian giữ **idle TCP connection** với client | Resource khi quá nhiều client idle |
| `lingering_timeout` | 5s | Cửa sổ chờ data sau khi NGINX quyết định **close** | Graceful TCP close, tránh RST |
| `resolver_timeout` | 30s | Thời gian DNS lookup khi NGINX gọi backend qua hostname | DNS chậm hoặc chết |

> 5 trong 6 cái này **hết hạn = trả 408 Request Timeout** về client. `resolver_timeout` thì khác — fail DNS = 502 Bad Gateway.

## Backend timeouts (5 cái)

Timeout của **NGINX với upstream**. Mặc định cũng đa số 60 giây.

| Timeout | Default | Đo lường gì? | Chống đỡ gì? |
|---|---|---|---|
| `proxy_connect_timeout` | 60s | Thời gian **bắt tay TCP** với backend | Backend chết, network chậm |
| `proxy_send_timeout` | 60s | Khoảng cách giữa **2 lần ghi request** đến backend | Backend đọc chậm |
| `proxy_read_timeout` | 60s | Khoảng cách giữa **2 lần đọc response** từ backend | Backend xử lý chậm |
| `proxy_next_upstream_timeout` | 0 (off) | **Tổng thời gian** thử các backend khi 1 cái fail | Loop vô tận khi nhiều backend |
| `keepalive_timeout` (upstream block) | 60s | Idle keep-alive với backend | Resource backend |

Hết hạn = thường trả **504 Gateway Timeout** về client.

## Tại sao có cả **header** timeout và **body** timeout?

HTTP request có 2 phần:

```text
POST /upload HTTP/1.1
Host: example.com
Content-Type: multipart/form-data
Content-Length: 10485760
                              ← phân cách header / body bằng \r\n\r\n
<10 MB binary data>           ← body
```

- **Header** thường vài KB, đọc nhanh. Slow header = signal Slow Loris.
- **Body** có thể vài chục/trăm MB. Slow body có thể là user mobile chậm bình thường, KHÔNG nhất thiết attack.

→ Tách 2 timeout, tune độc lập:
- `client_header_timeout 10s` — strict, vì header phải đến nhanh.
- `client_body_timeout 30s` — relax hơn, cho mobile upload.

## Tại sao **client_body_timeout** đo "khoảng cách giữa 2 lần read", không phải "tổng thời gian body"?

```text
Client upload 100 MB qua 3G:
   1 KB ──► NGINX (read OK, timer reset)
   1 KB ──► (timer reset)
   1 KB ──► (timer reset)
   ...
   Tổng có thể mất 30 phút. Nhưng NGINX không kill, vì giữa các read luôn < client_body_timeout.

Nếu giữa 2 read mà client treo 60s không gửi gì:
   1 KB ──► NGINX (timer start)
   [pause 60s]
   NGINX: hết kiên nhẫn, close.
```

→ Đo "khoảng giữa 2 read" cho phép upload **chậm nhưng ổn định** đi qua được. Chỉ đứt khi client thực sự treo.

`proxy_send_timeout`, `proxy_read_timeout`, `send_timeout` cũng có logic tương tự.

## Cú pháp đặt timeout trong nginx.conf

```nginx
http {
    # Frontend timeouts — đặt ở http context, áp dụng mọi server
    client_header_timeout  10s;
    client_body_timeout    30s;
    send_timeout           30s;
    keepalive_timeout      30s;
    lingering_timeout      5s;
    
    resolver               8.8.8.8 1.1.1.1 valid=60s;
    resolver_timeout       5s;

    upstream backend_pool {
        server app1:8080;
        server app2:8080;
        keepalive            32;
        keepalive_timeout    60s;   # backend keepalive
    }

    server {
        listen 443 ssl;
        server_name api.example.com;

        location / {
            proxy_pass http://backend_pool;
            
            # Backend timeouts
            proxy_connect_timeout      2s;
            proxy_send_timeout         30s;
            proxy_read_timeout         60s;
            proxy_next_upstream_timeout 10s;
        }
    }
}
```

Hầu hết directive **inherit từ context cha** — đặt ở `http` thì cả `server` và `location` đều dùng, trừ khi override.

## Đơn vị thời gian

```nginx
proxy_read_timeout 60;       # mặc định giây
proxy_read_timeout 60s;      # tường minh giây
proxy_read_timeout 5m;       # 5 phút
proxy_read_timeout 1h;       # 1 giờ
proxy_read_timeout 500ms;    # millisecond (1.21.1+)
```

Đơn vị viết tắt: `ms` `s` `m` `h` `d` `w` `M` `y`. Không có thì mặc định giây.

> ⚠️ Đa số config production dùng `s` tường minh để tránh nhầm.

## Decision matrix — tune cho use case của bạn

Mỗi loại workload có "fingerprint" timeout đặc thù:

| Use case | Header | Body | Send | Read | Keepalive |
|---|---|---|---|---|---|
| **API REST chuẩn** (~response < 1s) | 10s | 30s | 10s | 5s | 30s |
| **File upload** (mobile, lớn) | 10s | 5m | 30s | 30s | 30s |
| **WebSocket long-lived** | 10s | 30s | 30s | **1h** | **1h** |
| **Server-sent events / streaming** | 10s | 30s | 30s | **1h** | **1h** |
| **Heavy batch API** (vài phút) | 10s | 30s | 30s | **5m** | 30s |
| **CDN static** | 10s | 5s | 10s | 5s | 60s |

→ **Không có config 1 size fits all**. Workload khác nhau cần tune khác nhau.

## Status code đi kèm

Khi timeout xảy ra:

| Timeout | Status code trả về client |
|---|---|
| `client_header_timeout`, `client_body_timeout` | **408 Request Timeout** |
| `send_timeout` | Không trả status (TCP close là chính) |
| `keepalive_timeout` | Không trả status (close TCP graceful) |
| `proxy_connect_timeout` | **502 Bad Gateway** (hoặc 504 nếu cấu hình thế) |
| `proxy_send_timeout`, `proxy_read_timeout` | **504 Gateway Timeout** |
| `proxy_next_upstream_timeout` | **502** hoặc **504** tuỳ |
| `resolver_timeout` | **502 Bad Gateway** |

> Trong access log, status code này có thể giúp debug nhanh: thấy nhiều 408 → tune frontend timeout. Thấy nhiều 504 → backend chậm hoặc timeout backend quá strict.

## Khi NÀO không nên giảm timeout?

Phản đề: giảm timeout có rủi ro.

| Rủi ro khi quá strict | Hệ quả |
|---|---|
| `client_body_timeout` quá nhỏ | Mobile user upload không thành công, false positive |
| `proxy_read_timeout` quá nhỏ | Long-polling / SSE / WebSocket bị cắt sớm |
| `keepalive_timeout` quá nhỏ | Browser phải open connection liên tục → TLS handshake nhiều → tải tăng |
| `proxy_connect_timeout` quá nhỏ | Spike latency network bình thường bị tính là backend down |

→ Quy tắc: **đo trước, tune sau**. Bật log, đo p50/p99 latency thực tế của user, đặt timeout ~ 3-5× p99.

## Lộ trình 6 bài còn lại của phase-3

1. **Bài 2** — `client_header_timeout` & Slow Loris attack chi tiết.
2. **Bài 3** — `client_body_timeout` + upload patterns.
3. **Bài 4** — `send_timeout` + write semantics.
4. **Bài 5** — `keepalive_timeout` (frontend) + HTTP keep-alive history.
5. **Bài 6** — `lingering_timeout` + `resolver_timeout` (2 cái ít gặp gộp lại).
6. **Bài 7** — 5 backend timeout: `proxy_connect`, `proxy_send`, `proxy_read`, `proxy_next_upstream`, `keepalive` upstream.

## Tóm tắt bài 1

- Timeout giải 3 vấn đề: security (Slow Loris), resource (connection ma), UX (chờ vô hạn).
- 11 timeout chính, chia frontend (6) và backend (5).
- Đa số đo **khoảng giữa 2 lần I/O**, không phải tổng thời gian — cho phép request chậm-mà-ổn định đi qua.
- Tune theo workload: API ngắn ≠ upload lớn ≠ WebSocket.
- Strict quá có rủi ro — false positive với client chậm bình thường. Đo trước, tune sau.

**Bài kế tiếp** → [Bài 2: client_header_timeout — Slow Loris và phòng tuyến đầu](02-client-header-body-timeout.md)
