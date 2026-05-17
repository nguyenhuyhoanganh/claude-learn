# Bài 2: NGINX use cases — đi từ "app trần" lên "kiến trúc mong muốn"

Bài này không liệt kê khô khan "NGINX dùng làm A, B, C". Ta sẽ đi theo một câu chuyện: bạn vừa viết xong một app, và từng vấn đề **bắt buộc** sẽ kéo bạn đến NGINX.

## Trạng thái khởi đầu — app trần

Tình huống bạn có:

```text
                       ┌─────────────────┐
   Client ──HTTP:3001──►│  app.js  :3001 │──► PostgreSQL
                       │  (Node/Go/Py)   │
                       └─────────────────┘
```

App nghe trên cổng `3001`, plain HTTP, một process duy nhất. Hoạt động tốt khi 10 user. Bắt đầu có vấn đề khi 1000 user.

## Vấn đề 1: Một app không gánh nổi traffic

Khi `concurrent connection > 500`, app bị nghẽn. Bạn nảy ra ý tưởng:

> "Chạy nhiều instance, mỗi cái một port: 3001, 3002, 3003..."

```text
   Client A ──:3001──► app instance 1
   Client B ──:3002──► app instance 2
   Client C ──:3003──► app instance 3
```

**Vấn đề ngay lập tức**:

| Vấn đề | Hệ quả |
|---|---|
| Client phải biết port nào | Bookmark `:3002` của một user là vô nghĩa cho user khác |
| Nếu instance 2 chết | Mọi client đang trỏ tới `:3002` bị mất kết nối |
| Không có cách phân phối thông minh | "Round-robin" do client tự làm = không khả thi |
| Mỗi instance phải có cert TLS riêng | Hàng chục cert quản lý lằng nhằng |

→ Đây là tín hiệu rõ ràng: **cần một layer trung gian**.

## Use case 1 — Load balancing

NGINX đứng trước, nhận **một** request, phân phối tới **nhiều** backend:

```text
   Client ────────► NGINX :443 (HTTPS)
                      │
            round-robin / least-conn / ip-hash
            │       │       │
            ▼       ▼       ▼
        app:3001 app:3002 app:3003
```

Client chỉ thấy `https://api.example.com`. Phía sau là 3, 10, hay 100 backend — không liên quan đến client.

Cấu hình tối giản:

```nginx
upstream my_app {
    server app1:3001;
    server app2:3001;
    server app3:3001;
}

server {
    listen 443 ssl;
    server_name api.example.com;

    ssl_certificate     /etc/nginx/cert.pem;
    ssl_certificate_key /etc/nginx/cert.key;

    location / {
        proxy_pass http://my_app;
    }
}
```

### Thuật toán load balancing trong NGINX

| Thuật toán | Cú pháp | Khi dùng |
|---|---|---|
| Round-robin (default) | (không cần khai báo) | Backend đồng đều về capacity, request tương đương |
| Weighted round-robin | `server app1 weight=3;` | Một backend mạnh hơn → nhận nhiều request hơn |
| Least connections | `least_conn;` | Request có thời gian xử lý khác nhau nhiều |
| IP hash | `ip_hash;` | Cần "sticky session" — cùng client luôn về cùng backend |
| Hash (chung) | `hash $request_uri;` | Cần consistent hashing theo URL (cache locality) |
| Random | `random two;` | High-load, NGINX Plus, hoặc nginx >= 1.15 |

> **Hệ quả quan trọng**: với round-robin, backend phải **stateless** — không lưu session vào RAM của instance. Session phải nằm ngoài (Redis, DB) hoặc dùng `ip_hash` (sticky).

## Vấn đề 2: HTTP plain → khách hàng bị browser cảnh báo

Backend nghe HTTP plain trên port 3001. Đặt vào internet là tự sát:
- Chrome/Firefox hiện "Not Secure".
- Cookie phiên đăng nhập đi plain text — bất kỳ ai sniff WiFi cũng đọc được.
- SEO bị tụt do Google ưu tiên HTTPS.

Một cách "ngây thơ" là enable TLS trong từng app — phải import cert ở mọi nơi, mỗi instance một cert hoặc share private key (nguy hiểm).

## Use case 2 — TLS termination (SSL/HTTPS offloading)

Đặt cert **chỉ ở NGINX**. Phía trong internal network có thể vẫn là HTTP:

```text
   Client ──HTTPS (TLS 1.3)──► NGINX :443
                                  │ decrypt
                                  │
                              HTTP plain
                                  │
                                  ▼
                              app:3001
```

Lợi:
- Một cert duy nhất, một nơi để renew.
- App backend không cần biết gì về TLS — code đơn giản hơn.
- TLS handshake xử lý tập trung ở NGINX (CPU efficient, dễ tune).

Cấu hình:

```nginx
server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://my_app;   # backend dùng HTTP plain
    }
}
```

> Phase-4 và Bài 4 phase này sẽ đào sâu chi tiết TLS handshake, TLS 1.3, OCSP stapling.

## Vấn đề 3: Cùng một public IP, nhiều ứng dụng

App admin dashboard, app API, blog static — đều muốn share `https://example.com`. Không thể chạy 3 process trên cùng port 443.

## Use case 3 — Backend routing (path-based / host-based)

NGINX nhìn URL/Host và route tới backend tương ứng:

```text
                            ┌──────────► admin app    /admin/*
   Client ──► NGINX :443 ──►├──────────► api app      /api/v1/*
                            └──────────► static blog  /

   hoặc theo Host:
   admin.example.com  ────► admin app
   api.example.com    ────► api app
   blog.example.com   ────► static blog
```

Path-based:

```nginx
server {
    listen 443 ssl;
    server_name example.com;

    location /admin/ {
        proxy_pass http://admin_app/;
    }

    location /api/v1/ {
        proxy_pass http://api_app_v1/;
    }

    location /api/v2/ {
        proxy_pass http://api_app_v2/;
    }

    location / {
        root /var/www/blog;   # static
    }
}
```

Host-based:

```nginx
server {
    listen 443 ssl;
    server_name admin.example.com;
    location / { proxy_pass http://admin_app; }
}

server {
    listen 443 ssl;
    server_name api.example.com;
    location / { proxy_pass http://api_app; }
}
```

→ Backend routing là **nền tảng của API gateway**. Khi bạn chia microservice, NGINX route theo path là pattern đầu tiên.

## Vấn đề 4: Backend bị "đập" liên tục với cùng câu hỏi

User load trang chủ → backend query DB lấy danh sách 50 sản phẩm mới nhất → trả HTML. Mỗi giây 100 user request → 100 lần DB query y hệt nhau.

## Use case 4 — Caching

NGINX nhớ response và trả lại từ RAM/disk cho request giống hệt:

```text
   Client A ──► NGINX ──[miss]──► backend ──► (DB query) ──► response
                  │
                  └── lưu vào cache với key = URL + method
   
   Client B ──► NGINX ──[hit  ]──► trả ngay từ cache, KHÔNG hỏi backend
```

Cấu hình:

```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=my_cache:10m
                 max_size=1g inactive=60m use_temp_path=off;

server {
    location / {
        proxy_cache       my_cache;
        proxy_cache_valid 200 10m;     # cache 10 phút cho status 200
        proxy_cache_valid 404 1m;
        proxy_pass        http://my_app;
        add_header        X-Cache-Status $upstream_cache_status;
    }
}
```

`X-Cache-Status` trả về `HIT`, `MISS`, `BYPASS`, `EXPIRED`, `STALE`... — debug rất hữu ích.

**Trade-off**:
- ✓ Giảm tải backend đáng kể (cache hit = 0 ms latency từ backend).
- ✓ Tăng throughput tổng.
- ✗ Stale data — phải set TTL hợp lý, cân nhắc `proxy_cache_revalidate` + `proxy_cache_use_stale`.
- ✗ Personalized content (có cookie/Auth) cần loại khỏi cache: `proxy_cache_bypass $http_authorization;`.

## Vấn đề 5: Một client gọi 10,000 request/giây — phá hệ thống

Bot, kẻ tấn công, hoặc client buggy gọi liên tục. Không hạn chế = backend chết.

## Use case 5 — Rate limiting + Basic API gateway

NGINX có thể:

- Giới hạn số request/giây/IP.
- Giới hạn số connection đồng thời/IP.
- Block IP theo blacklist.
- Yêu cầu API key trong header.

```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

server {
    location /api/ {
        limit_req       zone=api_limit burst=20 nodelay;
        proxy_pass      http://my_app;
    }
}
```

→ Mỗi IP tối đa 10 req/s, được "burst" thêm 20 trong khoảng ngắn.

Kết hợp các tính năng: TLS terminate + route + auth + rate limit + log = NGINX trở thành **basic API gateway**. Không thay được Kong/Tyk cho enterprise, nhưng đủ cho startup/SME.

## Use case 6 — Ẩn topology backend, decoupling

Đây là **lợi ích kiến trúc** ít người nói rõ, nhưng cực quan trọng.

**Trước khi có NGINX**:
- Client biết IP/port backend.
- Đổi backend = đổi client. Migrate DB, đổi region, đổi cloud → chết.

**Sau khi có NGINX**:
- Client chỉ biết `api.example.com`.
- Backend đổi IP, đổi version, đổi cloud, đổi ngôn ngữ — client không biết, không quan tâm.

```text
Trước:                              Sau:
Client ──► 12.34.56.78:3001        Client ──► NGINX (api.example.com)
       Client biết backend                       │
                                                 ├── 10.0.0.5:3001 (today)
                                                 ├── 10.0.0.6:3001 (after migrate)
                                                 └── new backend (Blue/Green deploy)
```

→ Đây là **lợi thế chiến lược** dài hạn của có một reverse proxy đứng trước.

## Bức tranh tổng — kiến trúc "mong muốn"

```text
                            ┌──────────────────────────────┐
   Internet                 │      Private Network         │
                            │                              │
   Client ──HTTPS──►──┬──► NGINX ──┬──► app instance 1     │
                     │            │                        │
                     │            ├──► app instance 2      │
   (TLS 1.3 + HTTP/2)│            │                        │
                     │            └──► app instance 3      │
                     │                      │              │
                     │                      ▼              │
                     │                  PostgreSQL         │
                     │                      ▲              │
                     │            ┌─────────┘              │
                     │            │ (read replica)         │
                     │            ▼                        │
                     │       PostgreSQL replica            │
                     └─────────────────────────────────────┘
```

So với "trạng thái khởi đầu" — đây là một **upgrade kiến trúc hoàn toàn**:

| Vấn đề ban đầu | Đã giải bằng |
|---|---|
| Plain HTTP, browser cảnh báo | TLS termination ở NGINX |
| Khách phải nhớ port | NGINX nghe 443, ẩn port backend |
| Single instance dễ chết | Load balancing nhiều backend |
| Khó migrate backend | Decoupling qua NGINX |
| DB query lặp lại | Cache ở NGINX |
| Bot quẩy nát hệ thống | Rate limit |
| Cần route nhiều app trên cùng domain | Path/host routing |

## "Cái giá" của có thêm layer

Mọi giải pháp kiến trúc đều có cost. NGINX thêm:

1. **Một network hop nữa** — latency thêm ~0.1-1 ms (cùng máy/DC).
2. **Một point of failure mới** — NGINX chết = mọi backend không tới được.
3. **Một component để vận hành** — log, monitor, security patch, capacity plan.
4. **Một CPU/RAM bill nữa** — dù NGINX rất nhẹ.

Mitigation phổ biến:
- Chạy **≥ 2 NGINX instance** sau một LB cấp 4 (cloud LB / Keepalived + VRRP).
- Monitoring (Prometheus stub_status, log analytics).
- Capacity test trước launch.

→ Phase-6 sẽ trả lời "scale NGINX như thế nào" cụ thể.

## Tóm tắt bài 2

- NGINX giải quyết **6 vấn đề kinh điển** khi đưa app lên internet: LB, TLS, route, cache, rate limit, decoupling.
- Mỗi tính năng đứng riêng giá trị; **kết hợp lại = kiến trúc production sạch**.
- Trade-off là 1 layer thêm: latency nhỏ + ops effort + single-point — đều có mitigation tiêu chuẩn.
- Đa số công ty bắt đầu với NGINX cho LB + TLS, dần thêm route + cache + rate limit khi traffic tăng.

**Bài kế tiếp** → [Bài 3: Layer 4 vs Layer 7 proxy — chọn đúng tầng OSI](03-layer4-vs-layer7.md)
