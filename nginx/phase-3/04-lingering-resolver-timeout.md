# Bài 4: lingering_timeout + resolver_timeout — close graceful & DNS lookup

Hai timeout này ít gặp nhưng khi gặp sai thì cực khó debug — connection reset bí ẩn, hoặc 502 random khi backend đổi IP. Bài này giải thích **vì sao chúng tồn tại** và khi nào cần tune.

## lingering_timeout — close graceful, không phải RST

### Vấn đề: vì sao close không thể "ngay lập tức"?

Khi NGINX quyết định close connection (vì timeout, vì 4xx error, vì admin reload), nó **không nên** gửi TCP RST ngay. Lý do:

```text
   Client                        NGINX
     │                            │
     │ ── đang gửi POST body ──► │
     │ [đang truyền]              │
     │                            │ NGINX quyết định close
     │                            │ (vd 408 error)
     │ ── đang gửi byte tiếp ───►│ ✗ (RST)
     │                            │
     │ ← TCP RST ──────────────── │
     │                            │
     │ Browser/curl: "Connection reset by peer"
     │ User thấy lỗi kỳ lạ, retry không có ý nghĩa.
```

TCP `RST` (reset) = "đập bàn, ngắt sạch". Không phải close graceful. Client **không nhận response** của NGINX (vd "408 Request Timeout") — chỉ thấy reset.

**HTTP best practice**: gửi `4xx`/`5xx` response (graceful) → đợi client thấy → mới close.

### NGINX làm thế nào? — lingering close

NGINX gửi response **trước**, sau đó:
1. Khai báo muốn close (TCP `FIN`).
2. **Lingering period**: đọc và **vứt bỏ** mọi byte client còn gửi tiếp.
3. Sau khi client cũng `FIN` (hoặc hết `lingering_time`), close hẳn.

```text
   Client                        NGINX
     │                            │
     │ ── POST body part 1 ─────► │ (đọc)
     │ ── POST body part 2 ─────► │ (đọc, nhưng decide close)
     │                            │ 
     │                            │ NGINX: gửi response 408
     │ ◄── HTTP/1.1 408 ──────────│
     │ ◄── FIN ────────────────── │  (đề nghị close)
     │                            │
     │ ── POST body part 3 ─────► │ (client chưa kịp dừng)
     │                            │ NGINX: đọc + discard (lingering)
     │                            │   ← lingering_timeout window
     │ ── FIN ─────────────────► │  (client đồng ý close)
     │                            │
     │                       NGINX close socket
```

→ Client nhận được `408` response **đầy đủ**, có thông tin để retry/log. Connection close sạch, không RST flag.

### `lingering_timeout` vs `lingering_time`

NGINX có **2 directive** liên quan:

| Directive | Default | Ý nghĩa |
|---|---|---|
| `lingering_timeout` | 5s | Khoảng cách giữa 2 lần "read và discard" — nếu vượt, close hẳn |
| `lingering_time` | 30s | Tổng thời gian tối đa cho phép lingering — vượt là close cứng |

```text
NGINX gửi response, FIN
   │
   │ ───────────── lingering_time max 30s ──────────────►
   │                                                       │
   │ ── lingering_timeout 5s ──► (chờ data)                │
   │  client gửi (discard)                                 │
   │ ── reset 5s ──► (chờ tiếp)                            │
   │ ...                                                   │
   │                                                       │
   │ HOẶC quá lingering_timeout không có data → close      │
   │ HOẶC quá lingering_time 30s → close cứng              │
```

→ 2 lớp bảo vệ: timeout giữa-2-read, và tổng thời gian.

### Cấu hình

```nginx
http {
    lingering_close   on;          # bật lingering (default)
    lingering_timeout 5s;
    lingering_time    30s;
}
```

3 giá trị `lingering_close`:

| Value | Hành vi |
|---|---|
| `on` (default) | Áp dụng lingering trong tình huống mà NGINX **biết** client còn data đang truyền |
| `always` | Luôn lingering, kể cả khi NGINX nghĩ client đã xong |
| `off` | Tắt — close RST ngay, **không khuyến nghị** |

### Khi nào tune?

- **Đa số case**: giữ default. Không cần đụng.
- **DDoS extreme**: tăng strict bằng `lingering_close off` để giải phóng resource ngay — nhưng client thấy reset, có thể retry → counter-productive.
- **Client bug**: nếu client buggy không close, lingering có thể giữ socket lâu. Hiếm.

→ Hiểu là chính, không cần tune thường xuyên.

## resolver_timeout — DNS lookup backend

### Khi nào NGINX cần DNS resolve?

NGINX **load `nginx.conf`** lúc start hoặc reload. Lúc đó, các hostname trong `upstream` block được resolve ngay:

```nginx
upstream backend {
    server app1.example.com:8080;       # → 10.0.0.5 (cached)
    server app2.example.com:8080;       # → 10.0.0.6 (cached)
}
```

→ NGINX chỉ resolve **1 lần** khi load config. Nếu sau đó `app1.example.com` đổi IP, NGINX **vẫn dùng IP cũ**. Đây là một bẫy lớn trong môi trường dynamic (K8s, ECS, Heroku).

### Mode "dynamic resolution"

Nếu khai báo `resolver`, NGINX có thể resolve **lúc runtime** cho mỗi request:

```nginx
http {
    resolver 8.8.8.8 1.1.1.1 valid=30s;
    resolver_timeout 5s;

    server {
        location /api/ {
            # Dùng variable ép NGINX resolve runtime
            set $backend "app.dynamic.example.com";
            proxy_pass http://$backend:8080;
        }
    }
}
```

Key technique:
- **Khai báo `resolver`** — cho NGINX biết DNS server nào dùng.
- **Dùng variable** trong `proxy_pass` (vd `$backend`) — buộc NGINX resolve **mỗi request** thay vì cache lúc startup.

### `resolver_timeout` — DNS chậm hoặc chết

> Định nghĩa: **thời gian tối đa** chờ DNS resolver trả lời. Hết hạn = NGINX trả `502 Bad Gateway`.

**Default: 30 giây** (quá cao cho hầu hết trường hợp).

```text
   NGINX                       DNS Server (8.8.8.8)
     │                              │
     │ ── DNS query "app.dynamic"──►│
     │                              │ (chậm, hoặc chết)
     │                              │
     │ ← 30s default ──────         │
     │                              │
     │ ✗ resolver_timeout           │
     │ 502 Bad Gateway              │
```

30 giây là **quá lâu** — user đã bỏ web từ giây thứ 5. Thực tế nên `2s-5s`:

```nginx
resolver         8.8.8.8 1.1.1.1 valid=30s ipv6=off;
resolver_timeout 5s;
```

### Tham số chi tiết của `resolver`

```nginx
resolver  8.8.8.8  1.1.1.1  valid=30s  ipv6=off;
#         │        │        │           │
#         │        │        │           └─ chỉ resolve IPv4 (skip AAAA)
#         │        │        └─ cache kết quả 30s
#         │        └─ DNS server backup (Cloudflare)
#         └─ DNS server chính (Google)
```

- **Nhiều resolver** — NGINX query song song, dùng response đầu tiên.
- **`valid=30s`** — cache result trong 30s, không hỏi DNS lại trong window đó.
- **`ipv6=off`** — bỏ qua AAAA record, chỉ IPv4. Nếu hệ thống của bạn không support IPv6 cho backend.

### Sao không dùng `/etc/resolv.conf` của OS?

NGINX không tự đọc `/etc/resolv.conf` cho proxy resolution **runtime**. Phải khai báo `resolver` directive tường minh trong config.

(NGINX có đọc `/etc/resolv.conf` cho **resolution lúc startup** — vd resolve hostname trong upstream block. Nhưng cho runtime resolution, phải khai báo.)

### Use case quan trọng — service discovery

Trong K8s/cloud, service endpoint thay đổi liên tục:

```text
backend.default.svc.cluster.local
   ↓
   t=0:    [10.244.1.5, 10.244.1.6]
   t=30s:  [10.244.1.5, 10.244.1.7]    ← pod 6 chết, pod 7 lên
   t=60s:  [10.244.1.8, 10.244.1.7]    ← scale ra
```

Nếu NGINX cache IP từ startup, sau 30s nó vẫn proxy đến `10.244.1.6` → 502.

**Pattern dynamic resolver** giải:

```nginx
http {
    resolver kube-dns.kube-system.svc.cluster.local valid=10s;
    resolver_timeout 2s;

    server {
        location / {
            set $backend "backend.default.svc.cluster.local";
            proxy_pass http://$backend:8080;
        }
    }
}
```

Mỗi 10s, NGINX hỏi DNS lại → nhận IP set mới → traffic flow theo.

> Cách hay hơn: dùng K8s Ingress controller (chuyên dụng), không phải tự build NGINX. Nhưng pattern này vẫn dùng cho legacy app.

### `valid=...` tune theo TTL của DNS

- DNS public (google, cloudflare): TTL thường ngắn (300s).
- DNS K8s nội bộ: TTL thường ngắn hơn (vài giây).
- **`valid=` của NGINX override** TTL của record — set thấp để pick up thay đổi nhanh, nhưng đừng quá thấp gây spam DNS.

```nginx
resolver kube-dns valid=10s;     # K8s: 10s
resolver 8.8.8.8 valid=60s;       # public DNS: 60s
```

## Bẫy thường gặp với resolver

| Bẫy | Hệ quả | Cách tránh |
|---|---|---|
| Quên khai báo `resolver` khi `proxy_pass` có variable | Lỗi "no resolver defined" | Khai báo `resolver 8.8.8.8;` |
| Không dùng variable trong `proxy_pass` | NGINX cache IP từ startup, không refresh | Dùng `set $x "..."` + `proxy_pass http://$x` |
| `valid=` quá cao | Chậm pick up thay đổi backend | Set theo TTL DNS, vd 30s |
| `resolver_timeout` default 30s | User chờ quá lâu khi DNS chết | Set 2-5s |
| Quên `ipv6=off` khi backend chỉ IPv4 | AAAA lookup chậm hoặc fail | `ipv6=off` |

### Demo lỗi do không có resolver

```nginx
# Sai — không có resolver
location / {
    set $backend "http://api.dynamic.com";
    proxy_pass $backend;
}
```

Reload NGINX:

```text
nginx: [emerg] no resolver defined to resolve api.dynamic.com
```

Sửa:

```nginx
resolver 8.8.8.8 valid=30s;

location / {
    set $backend "http://api.dynamic.com";
    proxy_pass $backend;
}
```

## So sánh 2 timeout của bài này

| Yếu tố | `lingering_timeout` | `resolver_timeout` |
|---|---|---|
| Đo gì | Khoảng giữa 2 lần read & discard sau khi NGINX muốn close | Tổng thời gian chờ DNS lookup |
| Trigger khi nào | NGINX đã close khai báo, client vẫn gửi | NGINX cần resolve hostname runtime |
| Default | 5s | 30s |
| Status code | Không (chỉ close) | 502 Bad Gateway |
| Recommend tune | Hiếm khi cần | Luôn nên giảm xuống 2-5s |

## Tóm tắt bài 4

- `lingering_close` + `lingering_timeout` đảm bảo NGINX gửi response (vd 408, 504) đến client **trước** khi close — tránh RST làm client confused.
- 2 bậc: `lingering_timeout` (giữa 2 read khi discard) và `lingering_time` (tổng max). Mặc định 5s/30s.
- `resolver_timeout` quan trọng trong môi trường **dynamic** (K8s, cloud) — NGINX cần DNS lookup runtime.
- Mặc định 30s **quá cao** cho production — luôn giảm 2-5s.
- Để buộc dynamic resolution: khai báo `resolver` + dùng variable trong `proxy_pass`.

**Bài kế tiếp** → [Bài 5: proxy_connect_timeout — NGINX bắt tay backend](05-proxy-connect-timeout.md)
