# Bài 6: TLS 1.3 + HTTP/2 — tune lên SSL Labs A+

Sau Bài 5, bạn có HTTPS hoạt động. Bài này tune NGINX lên **A+ trên SSL Labs**: chỉ TLS 1.3, cipher modern, OCSP stapling, session resumption, kèm bật HTTP/2 cho multiplexing. Đây là cấu hình **production-grade hiện đại**.

## Vì sao TLS 1.3?

TLS 1.3 (RFC 8446, 2018) là **bước tiến lớn** so với TLS 1.2:

| Yếu tố | TLS 1.2 | TLS 1.3 |
|---|---|---|
| Handshake RTT | 2 RTT (request mới) | **1 RTT** (hoặc 0-RTT resumption) |
| Cipher suites | ~37, nhiều cipher legacy không an toàn | **5 cipher suites, tất cả AEAD** |
| Forward secrecy | Optional | **Bắt buộc** |
| Key exchange | RSA, DHE, ECDHE | Chỉ ECDHE/DHE (no static RSA) |
| Session ID resumption | Có | Bỏ (dùng PSK thay) |
| 0-RTT | Không | Có (với trade-off replay risk) |
| Compression | Có (CRIME attack) | **Bỏ** (an toàn hơn) |
| Renegotiation | Có (DoS risk) | **Bỏ** |
| Padding oracle | Vulnerable | Mitigated |
| Encrypted SNI | Không | EXTENSION (ESNI/ECH) |

### TLS 1.3 handshake — 1 RTT

```text
TLS 1.2 (2 RTT trước khi gửi data app):
   Client                    Server
     │ ClientHello ───────────►│
     │ ◄──────────── ServerHello│
     │ ◄──────── Certificate    │
     │ ◄────── ServerKeyExchange│
     │ ◄────── ServerHelloDone  │
     │ ClientKeyExchange ──────►│
     │ ChangeCipherSpec ───────►│
     │ Finished ──────────────►│
     │ ◄── ChangeCipherSpec     │
     │ ◄── Finished             │
     │ ════ Application data ═══│
     ↑ 2 round trips

TLS 1.3 (1 RTT):
   Client                    Server
     │ ClientHello + KeyShare ─►│
     │ ◄─── ServerHello + KeyShare│
     │       + Certificate         │
     │       + Finished            │
     │ Finished ──────────────►│
     │ ═══ Application data ═══│
     ↑ 1 round trip
```

Trên mạng 50ms RTT:
- TLS 1.2: 200ms để handshake xong.
- TLS 1.3: 100ms.
- TLS 1.3 0-RTT: 50ms (gửi data ngay từ ClientHello).

→ **Latency giảm 50%**. Cảm nhận rõ ở mobile / cross-region.

### Forward secrecy — tại sao quan trọng?

Forward secrecy (FS): nếu private key của server bị leak **trong tương lai**, các phiên TLS đã xảy ra trong **quá khứ** vẫn an toàn — vì mỗi phiên dùng ephemeral key (ECDHE), không phải static private key.

```text
Không có FS (TLS 1.2 với RSA key exchange):
   Adversary record traffic năm 2024.
   Năm 2030, lấy được private key (vd qua hack, subpoena).
   → Decrypt mọi traffic 2024 — disaster.

Có FS (TLS 1.3 mặc định):
   Mỗi session dùng ECDHE key riêng, chỉ tồn tại trong phiên.
   Lấy private key tương lai cũng vô dụng.
```

TLS 1.3 **bắt buộc** forward secrecy — không có cipher nào không-FS.

## Enable TLS 1.3 (only) trên NGINX

```nginx
server {
    listen 443 ssl;
    server_name api.example.com;
    
    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
    
    # CHỈ cho phép TLS 1.3
    ssl_protocols TLSv1.3;
    
    # ... location ...
}
```

Reload:
```bash
sudo nginx -t && sudo nginx -s reload
```

### Trade-off: client cũ không kết nối được

Disable TLS 1.2 = các client không hỗ trợ TLS 1.3 fail:

| Client | TLS 1.3 support |
|---|---|
| Chrome 70+ (2018) | ✓ |
| Firefox 63+ | ✓ |
| Safari 14+ (2020) | ✓ |
| Edge 79+ | ✓ |
| iOS 12.2+ | ✓ |
| Android 10+ | ✓ |
| IE 11 | ✗ |
| Android 5-9 | ✗ (default OS lib) |
| OpenSSL CLI < 1.1.1 | ✗ |

→ Nếu user base là consumer hiện đại (web/mobile), TLS 1.3 only OK. Nếu cần support legacy (banking, enterprise), giữ cả 1.2 và 1.3:

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
```

## Cipher suite — bỏ cipher yếu

TLS 1.3 đã giới hạn cipher suite (5 suite, đều an toàn). Nhưng nếu vẫn enable TLS 1.2, phải explicit list:

```nginx
# Mozilla "Intermediate" config (recommended)
ssl_protocols          TLSv1.2 TLSv1.3;
ssl_ciphers            ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;
```

Hoặc "Modern" (chỉ TLS 1.3):

```nginx
ssl_protocols TLSv1.3;
# Cipher list không cần — TLS 1.3 đã hardcode an toàn
```

> Generate Mozilla SSL config cho version NGINX của bạn: https://ssl-config.mozilla.org/

## Session resumption — giảm handshake repeat

User load trang lần đầu = full TLS handshake. Lần 2 (refresh) — có thể **reuse session ticket**:

```nginx
ssl_session_cache    shared:SSL:10m;       # 10MB shared cache giữa worker (~40k session)
ssl_session_timeout  1h;                    # session ticket valid 1h
ssl_session_tickets  off;                   # tắt session ticket truyền thống (security)
```

Vì sao `ssl_session_tickets off`?
- Session ticket truyền thống có security flaw (server-side ticket key cần rotate, nếu compromise → mọi session decrypted).
- TLS 1.3 dùng **PSK (Pre-Shared Key)** thay session ticket — an toàn hơn.

## OCSP stapling — tăng tốc cert validation

Mặc định, browser khi nhận cert phải hỏi CA "cert này còn hợp lệ không?" qua OCSP — **thêm 1 RTT**.

OCSP stapling: server (NGINX) đã hỏi CA sẵn, **đính kèm response** vào TLS handshake → browser không cần hỏi nữa.

```nginx
ssl_stapling          on;
ssl_stapling_verify   on;
ssl_trusted_certificate /etc/letsencrypt/live/api.example.com/chain.pem;

resolver 8.8.8.8 1.1.1.1 valid=300s;     # cần resolver để NGINX query OCSP
resolver_timeout 5s;
```

→ Trang load nhanh hơn ~50-200ms (một RTT đến OCSP server).

## Enable HTTP/2

HTTP/2 (RFC 7540, 2015) giải bài toán performance của HTTP/1.1.

### Vấn đề HTTP/1.1

```text
HTTP/1.1: head-of-line blocking
   Browser ─TCP─► Server
      GET /index.html  ────► response 200ms
      [block — phải đợi response xong]
      GET /style.css   ────► response 50ms
      [block]
      GET /script.js   ────► response 100ms
   
   → 6 connection song song để parallelize (workaround)
   → Vẫn block trong từng connection
```

### HTTP/2 multiplexing

```text
HTTP/2: 1 TCP connection, nhiều stream song song
   Browser ─TCP─► Server
      stream 1: GET /index.html  ──────► response
      stream 3: GET /style.css   ──────► response  (cùng lúc)
      stream 5: GET /script.js   ──────► response  (cùng lúc)
   
   → Không block. 1 connection thay 6.
```

### Tính năng HTTP/2

| Tính năng | Mô tả |
|---|---|
| **Multiplexing** | Nhiều request/response song song trên 1 TCP conn |
| **Binary framing** | Binary protocol (HTTP/1 text) → parse nhanh, ít lỗi |
| **Header compression** (HPACK) | Header lặp lại được nén — tiết kiệm bandwidth |
| **Server push** | Server proactively gửi asset client sẽ cần (deprecated 2022) |
| **Stream prioritization** | Client có thể nói "stream này quan trọng hơn" |

### Enable HTTP/2 trên NGINX

```nginx
server {
    listen 443 ssl http2;       # thêm 'http2'
    
    # ... rest of SSL config ...
}
```

Reload, test:

```bash
curl -I --http2 https://api.example.com/
# HTTP/2 200
# server: nginx/1.25.x
# ...
```

Hoặc Chrome DevTools → Network tab → cột "Protocol" → `h2`.

### HTTP/2 cần HTTPS

Đa số browser **chỉ implement HTTP/2 over TLS** (h2). Plain HTTP/2 (h2c) tồn tại nhưng không hỗ trợ browser. Đây là quyết định security của browser vendor để force adoption HTTPS.

→ Phải có HTTPS (Bài 5) trước, mới bật được HTTP/2.

## HTTP/3 (QUIC) — kế thừa HTTP/2

HTTP/3 (RFC 9114, 2022) dùng **QUIC** (UDP-based, replaces TCP) làm transport:

```text
HTTP/3 (QUIC over UDP):
   - Multiplexing như HTTP/2
   - + Built-in encryption (như TLS 1.3 nhưng tight integrate với transport)
   - + No head-of-line blocking ở TCP level
   - + Connection migration (đổi network mà giữ connection — mobile WiFi → 4G)
   - - Vẫn đang adoption rộng
```

NGINX 1.25+ hỗ trợ thử nghiệm:

```nginx
server {
    listen 443 ssl;
    listen 443 quic reuseport;       # QUIC/HTTP3
    
    http3 on;
    
    add_header alt-svc 'h3=":443"; ma=86400';     # advertise HTTP/3 support
    
    # ... rest ...
}
```

→ Production HTTP/3 chưa phải must-have. HTTP/2 đủ cho 99% case. Cloudflare/Google đã chạy HTTP/3 default.

## Cấu hình A+ hoàn chỉnh

```nginx
events { worker_connections 1024; }

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    
    # ── SSL/TLS general ──
    ssl_protocols          TLSv1.2 TLSv1.3;
    ssl_ciphers            ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;
    
    # Session resumption
    ssl_session_cache    shared:SSL:10m;
    ssl_session_timeout  1h;
    ssl_session_tickets  off;
    
    # OCSP stapling
    ssl_stapling         on;
    ssl_stapling_verify  on;
    resolver             8.8.8.8 1.1.1.1 valid=300s;
    resolver_timeout     5s;
    
    upstream api_backend {
        server app1:8080;
        server app2:8080;
        keepalive 32;
    }

    # HTTP → HTTPS redirect
    server {
        listen 80;
        server_name api.example.com;
        
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
        
        location / {
            return 301 https://$host$request_uri;
        }
    }

    # HTTPS + HTTP/2
    server {
        listen 443 ssl http2;
        server_name api.example.com;
        
        ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
        ssl_trusted_certificate /etc/letsencrypt/live/api.example.com/chain.pem;
        
        # Security headers
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        
        location / {
            proxy_pass http://api_backend;
            
            proxy_http_version 1.1;
            proxy_set_header   Connection         "";
            proxy_set_header   Host               $host;
            proxy_set_header   X-Real-IP          $remote_addr;
            proxy_set_header   X-Forwarded-For    $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto  $scheme;
            
            proxy_connect_timeout 2s;
            proxy_read_timeout    30s;
        }
    }
}
```

Test trên https://www.ssllabs.com/ssltest/ — kỳ vọng grade **A+**.

## Browser-side verify

```bash
# Chrome: chrome://flags/#enable-experimental-web-platform-features

# CLI verify
curl -v --http2 --tlsv1.3 https://api.example.com/
# *  TLSv1.3 (IN), TLS handshake, ...
# *  SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384
# *  Server certificate:
# *    issuer: C=US; O=Let's Encrypt; ...
# > GET / HTTP/2
# >
# < HTTP/2 200
```

## Disable HTTP/2 cho upstream proxy (gotcha)

NGINX là **HTTP/2 server** (client → NGINX), nhưng upstream (NGINX → backend) **mặc định HTTP/1.1**. Đa số case OK — backend không cần HTTP/2.

Nếu muốn proxy HTTP/2 đến backend (vd backend gRPC):

```nginx
upstream grpc_backend {
    server grpc1:50051;
}

server {
    listen 443 ssl http2;
    
    location / {
        grpc_pass grpc://grpc_backend;       # gRPC-aware proxy
    }
}
```

`grpc_pass` là syntax riêng cho gRPC, hiểu được trailer header và error code.

## Bẫy thường gặp

| Bẫy | Hệ quả | Cách tránh |
|---|---|---|
| `ssl_protocols TLSv1.3` chỉ → user IE/Android cũ fail | Mất user legacy | Giữ cả TLS 1.2 nếu cần backward compat |
| Quên `ssl_trusted_certificate` cho OCSP stapling | Stapling không work | Trỏ đến `chain.pem` |
| HSTS `max-age` quá ngắn | Browser quên nhanh, vẫn có thể http | Đặt 1 năm+ (`31536000` sec) |
| `add_header` không có `always` | Header không có với error response | Luôn `always` |
| `ssl_ciphers` copy từ stack overflow cũ | Có cipher yếu | Generate từ ssl-config.mozilla.org |
| Quên `http2` keyword | Browser dùng HTTP/1.1 dù SSL | Thêm `http2` sau `ssl` |

## Tóm tắt bài 6 + phase-4

- **TLS 1.3** giảm handshake từ 2 RTT → 1 RTT, bắt buộc forward secrecy, cipher modern.
- `ssl_protocols TLSv1.3` cho modern app; `TLSv1.2 TLSv1.3` cho backward compat.
- **OCSP stapling** + **session resumption** tăng tốc TLS handshake repeat.
- **HTTP/2** multiplexing trên 1 TCP conn — bật bằng `listen 443 ssl http2`.
- HTTP/2 cần HTTPS — browser chỉ implement h2 over TLS.
- HTTP/3 (QUIC) là tương lai nhưng chưa must-have.
- Combo A+: TLS 1.3, modern cipher, HSTS, OCSP stapling, HTTP/2, security headers.

Phase-4 tổng kết: bạn đã có **NGINX production-grade** — web server + L7 proxy + L4 proxy + HTTPS + TLS 1.3 + HTTP/2.

**Bài kế tiếp** → [Phase 5 — Bài 1: NGINX và WebSocket](../phase-5/01-intro-websockets.md)
