# Bài 4: NGINX as Layer 4 proxy — stream context cho TCP/UDP

Phase 1 Bài 3 đã giới thiệu khái niệm L4 vs L7. Bài này đào thực tế: cấu hình NGINX làm L4 proxy, demo sticky connection bằng telnet, và pattern thực cho Postgres, gRPC, WebSocket TLS-passthrough.

## Cấu hình tối thiểu

```nginx
events { worker_connections 1024; }

stream {
    upstream all_backends {
        server 127.0.0.1:2222;
        server 127.0.0.1:3333;
        server 127.0.0.1:4444;
        server 127.0.0.1:5555;
    }

    server {
        listen 80;
        proxy_pass all_backends;
    }
}
```

So với `http {}`:

| Khác biệt | `http {}` (L7) | `stream {}` (L4) |
|---|---|---|
| Context tên | `http` | `stream` |
| `location {}` block | Có | **Không** |
| `proxy_pass` syntax | `http://upstream_name` | `upstream_name` (không có scheme) |
| `proxy_set_header` | Có | Không (không thấy header) |
| Routing theo URL | Có | **Không** |
| Cache | Có | Không |

> ⚠️ `stream {}` đặt **ngang hàng** với `http {}` ở top-level của `nginx.conf`. Không lồng bên trong.

## Demo "sticky connection" của L4

Đây là behavior **dễ gây surprise** cho người mới. Cùng setup config trên, dùng `telnet`:

```bash
telnet 127.0.0.1 80
# Connected to 127.0.0.1
# GET / HTTP/1.1
# Host: localhost
#
# HTTP/1.1 200 OK
# I am app 5555           ← lần đầu, NGINX random/round-robin chọn 5555
```

Trong **cùng connection telnet đó**, gửi tiếp:

```bash
GET / HTTP/1.1
Host: localhost

# I am app 5555           ← VẪN là 5555
GET /app1 HTTP/1.1
Host: localhost

# Hello from /app1 on 5555  ← VẪN là 5555
```

Open một telnet connection mới (terminal khác):

```bash
telnet 127.0.0.1 80
GET / HTTP/1.1
Host: localhost

# I am app 2222           ← connection mới, backend mới
```

→ **1 TCP connection = 1 backend cố định**. NGINX không biết "request" là gì — chỉ thấy stream bytes, đã mapping connection-này-đến-backend-X.

### Vì sao browser thấy thay đổi?

Thử browser:

```bash
# Mở Chrome, vào http://localhost/
# Refresh nhiều lần
# Có lúc thấy 2222, có lúc 3333, 4444, 5555
```

Browser thấy thay đổi vì HTTP/1.1 mở **6 TCP connection song song** (browser parallel) — mỗi connection có thể về backend khác. Refresh nhanh có thể trigger connection mới về backend khác.

→ Nhưng trong **cùng 1 TCP connection** — luôn sticky.

## Connection model L4 vs L7

```text
LAYER 7 (http):
   Client conn ──► NGINX
                    ├──► Backend1 conn (request #1)
                    ├──► Backend2 conn (request #2)
                    └──► Backend3 conn (request #3)
   ↑ 1 client conn có thể route đến nhiều backend conn theo request

LAYER 4 (stream):
   Client conn ──► NGINX ───► Backend1 conn (pegged)
   Client conn ──► NGINX ───► Backend2 conn
   Client conn ──► NGINX ───► Backend1 conn
   ↑ Mỗi client conn map cứng đến 1 backend conn — NAT-like
```

L4 dùng cơ chế gần giống **NAT (Network Address Translation)**:
- Connection 1 từ `client_a:54321` → NGINX → backend_pool → chọn backend1 → mở connection NGINX:randomport → backend1:8080.
- Mọi byte tiếp theo trên connection 1 đi qua mapping này.
- Connection 2 từ `client_b:65432` → NGINX → backend_pool → có thể chọn backend khác.

## Use case 1 — Postgres / MySQL load balancing

NGINX **không hiểu** protocol Postgres. Phải dùng L4:

```nginx
stream {
    upstream pg_cluster {
        server pg-primary:5432;
        server pg-replica1:5432 backup;     # chỉ dùng khi primary down
    }

    server {
        listen 5432;
        proxy_pass pg_cluster;
        
        proxy_connect_timeout 2s;
        proxy_timeout         60s;          # tổng timeout (không có read/send tách riêng)
    }
}
```

Test:
```bash
psql -h nginx-host -p 5432 -U user dbname
# Kết nối qua NGINX → primary
```

Lưu ý:
- Read replica chỉ nhận **read query** — phải có routing logic ở app, không phải NGINX. NGINX chỉ proxy raw connection.
- HA pattern: dùng `backup` keyword cho replica → chỉ active khi primary fail.

## Use case 2 — gRPC

gRPC dùng HTTP/2 — về kỹ thuật vẫn là L7, nhưng NGINX open-source **gRPC support hạn chế**. Nhiều team dùng L4 cho đơn giản:

```nginx
stream {
    upstream grpc_backend {
        server grpc1:50051;
        server grpc2:50051;
    }

    server {
        listen 50051;
        proxy_pass grpc_backend;
    }
}
```

→ Hoặc dùng `grpc_pass` ở L7 (NGINX ≥ 1.13.10):

```nginx
http {
    upstream grpc_backend {
        server grpc1:50051;
    }

    server {
        listen 50051 http2;
        location / {
            grpc_pass grpc://grpc_backend;
        }
    }
}
```

`grpc_pass` mới (L7) tốt hơn vì hiểu được gRPC error code, retry, header. L4 chỉ dùng khi không cần các tính năng đó.

## Use case 3 — TLS passthrough

Backend tự sở hữu cert TLS — NGINX không cần và **không nên** terminate:

```nginx
stream {
    upstream backend_tls {
        server api1.internal:443;
        server api2.internal:443;
    }

    server {
        listen 443;
        proxy_pass backend_tls;
    }
}
```

Client TLS handshake đi thẳng đến backend, NGINX chỉ forward bytes.

### SNI-based routing với passthrough

Nếu cần route theo domain (mỗi tenant 1 cert riêng):

```nginx
stream {
    map $ssl_preread_server_name $backend_pool {
        api.example.com    api_pool;
        admin.example.com  admin_pool;
        default            api_pool;
    }

    upstream api_pool { server api:443; }
    upstream admin_pool { server admin:443; }

    server {
        listen 443;
        ssl_preread on;
        proxy_pass  $backend_pool;
    }
}
```

`ssl_preread` cho phép NGINX peek vào TLS ClientHello để đọc **SNI** (Server Name Indication) trong header — không decrypt, chỉ đọc plaintext metadata.

## Use case 4 — SMTP, mail proxy

Mail server (Postfix, Dovecot) cần load balance:

```nginx
stream {
    upstream smtp_backends {
        server smtp1:25;
        server smtp2:25;
        server smtp3:25;
    }

    server {
        listen 25;
        proxy_pass smtp_backends;
    }
}
```

NGINX còn có module `mail` chuyên dụng cho SMTP/IMAP/POP3 với feature như authentication — nhưng đa số case `stream` đủ.

## Use case 5 — UDP (DNS, syslog)

L4 không chỉ TCP, còn **UDP**:

```nginx
stream {
    upstream dns_backends {
        server 8.8.8.8:53;
        server 1.1.1.1:53;
    }

    server {
        listen 53 udp;
        proxy_pass dns_backends;
        proxy_responses 1;          # mỗi request có 1 response (UDP)
        proxy_timeout   1s;
    }
}
```

→ NGINX làm DNS proxy. UDP không có connection state, nên `proxy_responses N` chỉ ra mong đợi bao nhiêu UDP response cho 1 request.

## Timeout trong stream

`stream` có set timeout riêng, tên khác `http`:

| `http` (L7) | `stream` (L4) | Mô tả |
|---|---|---|
| `proxy_connect_timeout` | `proxy_connect_timeout` | TCP handshake với upstream |
| `proxy_send_timeout` | (không có) | (stream không phân biệt send/read) |
| `proxy_read_timeout` | `proxy_timeout` | Idle giữa các byte |
| `proxy_next_upstream_timeout` | `proxy_next_upstream_timeout` | Total time thử backend khác |

```nginx
stream {
    server {
        listen 5432;
        proxy_pass pg_cluster;
        
        proxy_connect_timeout 2s;
        proxy_timeout         5m;       # Postgres có thể chạy query dài
        
        proxy_next_upstream         on;
        proxy_next_upstream_timeout 10s;
        proxy_next_upstream_tries   2;
    }
}
```

`proxy_timeout` (stream) ~ `proxy_read_timeout` (http) — đo idle giữa các packet.

## Logging stream

`stream` có log riêng:

```nginx
stream {
    log_format basic '$remote_addr [$time_local] '
                     '$protocol $status $bytes_sent $bytes_received '
                     '$session_time';
    
    access_log /var/log/nginx/stream-access.log basic;
}
```

Biến available:

| Biến | Ý nghĩa |
|---|---|
| `$remote_addr` | IP client |
| `$protocol` | TCP / UDP |
| `$status` | 200 = OK, 400 = bad, 502 = upstream fail, etc. |
| `$bytes_sent` | Bytes NGINX gửi cho client |
| `$bytes_received` | Bytes NGINX nhận từ client |
| `$session_time` | Thời gian session (giây) |
| `$upstream_addr` | IP backend đã chọn |
| `$ssl_preread_server_name` | SNI (nếu `ssl_preread on`) |

Format này khác `http` access log — debug session phải biết.

## Giới hạn của L4

| Tính năng | L4 | L7 |
|---|---|---|
| Path/host routing | ❌ | ✅ |
| Block path | ❌ (chỉ block port) | ✅ |
| Inject/modify header | ❌ | ✅ |
| Cache response | ❌ | ✅ |
| Share backend conn giữa client | ❌ | ✅ |
| WAF, rate limit theo URL | ❌ | ✅ (limit_req) |
| Protocol nào cũng được | ✅ | ❌ (chỉ HTTP/family) |
| TLS passthrough | ✅ | ❌ |
| Performance overhead | Thấp hơn | Cao hơn (parse HTTP, TLS) |
| Sticky session tự nhiên | ✅ (per-conn) | Cần ip_hash |

## PROXY protocol — cứu cánh khi cần IP client

Khi L4 passthrough TLS, backend không thấy IP client thật (chỉ thấy IP NGINX). Solution: **PROXY protocol**:

```nginx
stream {
    server {
        listen 443;
        proxy_pass backend_pool;
        proxy_protocol on;          # gửi PROXY header trước TCP payload
    }
}
```

NGINX gửi 1 dòng metadata trước TCP payload:

```text
PROXY TCP4 203.0.113.45 198.51.100.10 54321 443\r\n
   ↑    ↑   ↑              ↑              ↑    ↑
   sig  family src_ip       dst_ip       src_port dst_port
[rest of TLS bytes...]
```

Backend (nếu hiểu PROXY protocol) parse dòng đầu → biết IP client.

Backend Node.js setup:
```javascript
const proxyProtocol = require('proxy-protocol-v2');
// hoặc dùng module Express middleware
```

## Combine L4 + L7 trong cùng config

NGINX có thể chạy **đồng thời** cả 2 context — config production thực:

```nginx
events { worker_connections 1024; }

# L4 — Postgres
stream {
    upstream pg_cluster {
        server pg-primary:5432;
        server pg-replica:5432 backup;
    }
    server {
        listen 5432;
        proxy_pass pg_cluster;
    }
}

# L7 — HTTP API
http {
    upstream api_backends {
        server api1:8080;
        server api2:8080;
        keepalive 32;
    }

    server {
        listen 443 ssl;
        server_name api.example.com;
        # ...
        location / {
            proxy_pass http://api_backends;
        }
    }
}
```

→ Một NGINX phục vụ cả Postgres (L4) và HTTP API (L7). Đây là pattern phổ biến.

## Bẫy thường gặp

| Bẫy | Hệ quả | Cách tránh |
|---|---|---|
| Đặt `stream` lồng trong `http` | Config error | Đặt top-level |
| Dùng `proxy_pass http://x` trong stream | Sai syntax | Bỏ scheme: `proxy_pass x;` |
| Cố dùng `location` trong stream | Sai syntax | Stream không có location |
| Quên `udp` keyword cho UDP service | Service không lắng nghe được UDP | `listen 53 udp;` |
| Lẫn lộn timeout name (`proxy_timeout` vs `proxy_read_timeout`) | Timeout không có hiệu lực | Stream dùng `proxy_timeout`, http dùng `proxy_read_timeout` |
| Quên `ssl_preread on` khi route theo SNI | `$ssl_preread_server_name` rỗng | Bật ssl_preread |
| Mong đợi sticky cho per-request | L4 sticky per-connection, không per-request | Dùng L7 + ip_hash nếu cần per-request sticky |

## Tóm tắt bài 4

- `stream {}` là L4 context — TCP/UDP proxy, không hiểu HTTP.
- Sticky tự nhiên: 1 TCP connection = 1 backend cố định.
- Use case: Postgres, MySQL, gRPC, TLS passthrough, SMTP, DNS UDP.
- Không có `location`, không inject header, không cache, không rate limit URL.
- `ssl_preread on` + `$ssl_preread_server_name` cho phép route theo SNI mà không decrypt.
- Timeout đặt tên khác http: `proxy_timeout` ~ `proxy_read_timeout`.
- PROXY protocol giúp truyền IP client cho backend khi passthrough.
- L4 + L7 chạy được đồng thời trong cùng nginx.conf.

**Bài kế tiếp** → [Bài 5: Enable HTTPS với Let's Encrypt](05-https.md)
