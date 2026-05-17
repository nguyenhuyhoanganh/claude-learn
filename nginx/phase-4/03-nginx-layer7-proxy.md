# Bài 3: NGINX as Layer 7 reverse proxy — routing, block, header

Bài này đào sâu vai trò **reverse proxy Layer 7** — vai trò dominant của NGINX trong môi trường server hiện đại. Khác Phase 2 (chỉ làm load balance đơn giản), ta sẽ học path-based routing, block path, IP hash, set header, và các pattern production phổ biến.

## Setup — 4 backend đã spin up ở Bài 1

```text
   app1 :2222   app2 :3333   app3 :4444   app4 :5555
   (cùng image, khác APP_ID)
```

Mọi config ví dụ trong bài này proxy đến 4 backend đó.

## Config nền — load balance round-robin

```nginx
events { worker_connections 1024; }

http {
    upstream all_backends {
        server 127.0.0.1:2222;
        server 127.0.0.1:3333;
        server 127.0.0.1:4444;
        server 127.0.0.1:5555;
    }

    server {
        listen 80;

        location / {
            proxy_pass http://all_backends;
        }
    }
}
```

Test:

```bash
curl http://localhost/
# I am app 2222
curl http://localhost/
# I am app 3333
curl http://localhost/
# I am app 4444
curl http://localhost/
# I am app 5555
curl http://localhost/
# I am app 2222     ← quay vòng
```

→ Round-robin theo từng request. Đây là pattern đã quen ở Phase 2.

## Load balancing algorithms — đào sâu

### 1. Round-robin (default)

Mỗi request đi backend tiếp theo theo thứ tự. Đơn giản, fair.

```nginx
upstream backend {
    server app1:8080;
    server app2:8080;
}
```

### 2. Weighted round-robin

Backend mạnh hơn nhận nhiều request hơn:

```nginx
upstream backend {
    server app1:8080 weight=3;
    server app2:8080 weight=1;
}
# Tỉ lệ 3:1
```

### 3. Least connections

Backend có ít connection đang active nhất nhận request mới:

```nginx
upstream backend {
    least_conn;
    server app1:8080;
    server app2:8080;
}
```

Phù hợp khi request có **thời gian xử lý khác nhau nhiều** (vd có request nhanh 50ms, có request chậm 5s).

### 4. IP hash — sticky session

```nginx
upstream backend {
    ip_hash;
    server app1:8080;
    server app2:8080;
}
```

NGINX hash IP client → cùng client luôn về cùng backend.

Test:

```bash
curl http://localhost/
# I am app 4444
curl http://localhost/
# I am app 4444     ← cùng backend mỗi lần
curl http://localhost/
# I am app 4444
```

**Khi nào dùng `ip_hash`**?
- Backend lưu session in-memory (vd PHP session, Java session).
- Không có shared session store (Redis/Memcached).
- Legacy app không stateless được.

**Cảnh báo**:
- Stateful app **chống chỉ định** cho microservice/cloud — backend chết là user mất session.
- Better: dùng shared session store, để app stateless, dùng round-robin.
- IP hash có vấn đề với client sau corporate NAT (1000 user cùng IP → tất cả về 1 backend → mất cân bằng).

### 5. Hash chung (consistent hashing)

```nginx
upstream backend {
    hash $request_uri consistent;
    server app1:8080;
    server app2:8080;
}
```

Hash URL → cùng URL về cùng backend → tận dụng cache locality của backend.

`consistent` (Ketama hashing) → khi thêm/bớt backend, chỉ ~1/N request bị shuffle, không phải full re-hash.

### 6. Random (NGINX 1.15+)

```nginx
upstream backend {
    random two least_conn;
    server app1:8080;
    server app2:8080;
}
```

Chọn ngẫu nhiên 2 backend, từ 2 đó pick cái least_conn. Tốt cho high-throughput.

### Tóm tắt khi nào dùng

| Algorithm | Khi nào |
|---|---|
| **round-robin** | Default, OK cho hầu hết case stateless |
| **weighted** | Backend heterogeneous (mạnh/yếu khác nhau) |
| **least_conn** | Request có duration phân tán rộng |
| **ip_hash** | Stateful app (legacy) cần sticky session |
| **hash URL** | Cache locality (CDN, varnish-like) |
| **random two** | High-throughput, NGINX Plus production |

## Path-based routing — chỉ làm được ở Layer 7

```nginx
http {
    upstream app1_backends {
        server 127.0.0.1:2222;
        server 127.0.0.1:3333;
    }

    upstream app2_backends {
        server 127.0.0.1:4444;
        server 127.0.0.1:5555;
    }

    server {
        listen 80;

        location /app1 {
            proxy_pass http://app1_backends;
        }

        location /app2 {
            proxy_pass http://app2_backends;
        }

        location / {
            proxy_pass http://all_backends;       # fallback
        }
    }
}
```

Test:

```bash
curl http://localhost/app1
# Hello from /app1 on 2222
curl http://localhost/app1
# Hello from /app1 on 3333     ← chỉ round-robin trong app1_backends

curl http://localhost/app2
# Hello from /app2 on 4444
curl http://localhost/app2
# Hello from /app2 on 5555

curl http://localhost/
# I am app 2222 (or 3333/4444/5555 — fallback)
```

→ NGINX **đọc URL path** rồi chọn upstream phù hợp. Layer 4 không làm được điều này vì không thấy URL.

## `location` matching rules — phải hiểu chính xác

`location` có 4 dạng match khác nhau với độ ưu tiên khác nhau:

| Modifier | Loại | Ưu tiên |
|---|---|---|
| `=` | Exact match | Cao nhất |
| `^~` | Prefix match (không regex check sau) | Cao |
| `~` `~*` | Regex (case-sensitive / case-insensitive) | Trung |
| (không có) | Prefix match (mặc định) | Thấp |

Ví dụ:

```nginx
location = /favicon.ico { ... }       # match đúng /favicon.ico
location ^~ /static/    { ... }       # match prefix /static/, skip regex
location ~* \.(jpg|png)$ { ... }      # match regex extension
location /api/          { ... }       # match prefix /api/
location /              { ... }       # match mọi thứ (fallback)
```

Algorithm match:
1. Thử exact (`=`) — nếu match, dùng ngay.
2. Tìm prefix match dài nhất.
3. Nếu prefix có `^~`, dùng ngay không thử regex.
4. Thử regex theo thứ tự khai báo — first match wins.
5. Nếu không regex nào match, fallback về prefix dài nhất.

> Học thuộc 4 modifier này — debug location bug 50% là do hiểu sai matching.

## `proxy_pass` — trailing slash matters

Cú pháp có trailing slash quyết định URL gửi đến backend.

```nginx
# Case 1: proxy_pass KHÔNG có path/slash
location /api/ {
    proxy_pass http://backend;
}
# Request /api/users → backend nhận /api/users

# Case 2: proxy_pass CÓ trailing slash
location /api/ {
    proxy_pass http://backend/;
}
# Request /api/users → backend nhận /users (location prefix bị strip)
```

**Bẫy cực phổ biến**: thiếu/thừa slash → backend nhận URL khác mong đợi → 404.

```text
Quy tắc đơn giản:
- proxy_pass http://x;     → forward đầy đủ
- proxy_pass http://x/;    → strip prefix location
```

## Block path — return status code

```nginx
location /admin {
    return 403;
}

location /health {
    return 200 "OK\n";
    add_header Content-Type text/plain;
}

location /old-page {
    return 301 https://example.com/new-page;
}
```

`return <code> [text|URL]`:
- 2xx: trả status + body (optional).
- 3xx: redirect.
- 4xx/5xx: error.

→ Cực nhẹ — NGINX không cần proxy, response ngay từ NGINX.

## Block by IP (whitelist/blacklist)

```nginx
location /admin {
    # Whitelist internal IP
    allow 10.0.0.0/8;
    allow 192.168.0.0/16;
    deny all;
    
    proxy_pass http://admin_backend;
}
```

Hoặc blacklist:

```nginx
location / {
    deny 1.2.3.4;
    deny 5.6.7.0/24;
    allow all;
    
    proxy_pass http://backend;
}
```

→ Block bot, abuser. Hoặc giới hạn admin endpoint cho internal IP.

## Set header gửi backend — quan trọng

Backend cần biết IP client thật, vì traffic đến backend là từ NGINX:

```nginx
location / {
    proxy_pass http://backend;
    
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host  $host;
}
```

Phân tích:

| Header | Ý nghĩa |
|---|---|
| `Host` | Domain client gọi (vd `api.example.com`); một số backend dùng để route |
| `X-Real-IP` | IP client trực tiếp |
| `X-Forwarded-For` | Chain IP qua các proxy (NGINX append IP vào cuối) |
| `X-Forwarded-Proto` | `http` hay `https` (backend biết client kết nối secure không) |
| `X-Forwarded-Host` | Host gốc (nếu có multi-proxy) |

> ⚠️ **Đừng tin các header này nếu client gửi vào**. NGINX phải **override** chúng trước khi forward, không trust client `X-Real-IP: 8.8.8.8` (có thể spoof).

`$proxy_add_x_forwarded_for` = `$http_x_forwarded_for, $remote_addr` — append IP của remote vào header có sẵn (nếu request đi qua nhiều proxy).

### Backend phải biết trust proxy đến mức nào

Ở Node Express:

```javascript
app.set('trust proxy', 1);     // tin proxy 1 hop trước
// hoặc trust IP cụ thể
app.set('trust proxy', '10.0.0.0/8');
```

Mặc định Express **không trust** — req.ip = IP NGINX. Phải bật `trust proxy` để dùng `X-Forwarded-For`.

## Layer 7 connection model — chia sẻ backend conn

```text
   Client A ──TCP1──┐
   Client B ──TCP2──┤              ┌──TCP-a──► Backend1
                    │  NGINX       │
   Client C ──TCP3──┼─[L7 parse]──►├──TCP-b──► Backend2
                    │              │
   ...              │              └──TCP-c──► Backend3
   1000 client    ──┘              (~32 conn keepalive)
```

NGINX:
- Nhận 1000 connection từ client.
- Mở **pool nhỏ** (vd 32) connection đến backend.
- Mỗi request từ client → tìm idle backend conn → forward → response.

→ Backend chỉ phải xử lý **~32 connection thay vì 1000**. Đây là lợi thế lớn của L7.

Bật bằng:

```nginx
upstream backend {
    server app1:8080;
    keepalive 32;
}

location / {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header   Connection "";
}
```

(Xem chi tiết ở Phase 3 Bài 7.)

## Combine tất cả — production config

```nginx
events { worker_connections 1024; }

http {
    # Upstream pools
    upstream app1_pool {
        server app1:8080 max_fails=3 fail_timeout=10s;
        server app2:8080 max_fails=3 fail_timeout=10s;
        keepalive 32;
    }

    upstream app2_pool {
        server app3:8080 max_fails=3 fail_timeout=10s;
        server app4:8080 max_fails=3 fail_timeout=10s;
        keepalive 32;
    }

    # Connection limit chống DoS
    limit_conn_zone $binary_remote_addr zone=per_ip:10m;
    limit_req_zone  $binary_remote_addr zone=req_limit:10m rate=20r/s;

    server {
        listen 80;
        server_name api.example.com;

        # Block admin
        location /admin {
            allow 10.0.0.0/8;
            deny all;
            
            proxy_pass http://admin_backend;
            proxy_set_header Host       $host;
            proxy_set_header X-Real-IP  $remote_addr;
        }

        # App1
        location /v1/ {
            limit_req  zone=req_limit burst=50 nodelay;
            limit_conn per_ip 10;
            
            proxy_pass http://app1_pool;
            proxy_http_version 1.1;
            proxy_set_header   Connection "";
            proxy_set_header   Host              $host;
            proxy_set_header   X-Real-IP         $remote_addr;
            proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto $scheme;
            
            proxy_connect_timeout 2s;
            proxy_read_timeout    30s;
            proxy_next_upstream   error timeout http_502 http_503;
        }

        # App2
        location /v2/ {
            limit_req  zone=req_limit burst=50 nodelay;
            
            proxy_pass http://app2_pool;
            # ... cùng các header và timeout
        }

        # Health endpoint cho LB cấp trên
        location = /health {
            access_log off;
            return 200 "OK\n";
            add_header Content-Type text/plain;
        }

        # Fallback
        location / {
            return 404;
        }
    }
}
```

## Bẫy thường gặp

| Bẫy | Hệ quả | Cách tránh |
|---|---|---|
| Quên trailing slash của `proxy_pass` | URL gửi backend sai → 404 | Hiểu rule slash, test với verbose |
| Quên `proxy_set_header X-Real-IP` | Backend log thấy IP NGINX, không phải client | Luôn set 4 header chuẩn |
| Quên `proxy_http_version 1.1` cho upstream keepalive | Pool keepalive không work | Set 1.1 + `Connection ""` |
| `ip_hash` với client sau corporate NAT | Tất cả về 1 backend → mất cân bằng | Dùng cookie sticky hoặc shared session |
| `location /api` (không trailing) match cả `/api2` | Match prefix sai | Dùng `location /api/` |
| `location ~ \.php$` không hoạt động | Regex syntax sai | Kiểm tra escape backslash trong config |

## Tóm tắt bài 3

- Layer 7 cho phép routing theo path/host/header — đặc quyền của L7.
- 6 thuật toán LB: round-robin, weighted, least_conn, ip_hash, hash, random.
- `location` có 4 modifier: `=`, `^~`, `~`, prefix — phải hiểu rule match.
- `proxy_pass` trailing slash quyết định URL gửi backend.
- `proxy_set_header X-Real-IP` + `X-Forwarded-For` là **bắt buộc** cho backend biết client thật.
- Backend connection pool (`keepalive 32` + `proxy_http_version 1.1`) giảm tải backend đáng kể.

**Bài kế tiếp** → [Bài 4: NGINX as Layer 4 proxy — stream context cho TCP/UDP](04-nginx-layer4-proxy.md)
