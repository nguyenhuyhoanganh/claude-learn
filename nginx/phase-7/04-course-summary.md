# Bài 4: Tổng kết toàn khoá NGINX

7 phase, 35+ bài, ~13,000 dòng — đây là bản đồ tổng. Sau khi học xong, bạn có thể đứng cạnh một NGINX production và biết mọi directive làm gì, tune thế nào, debug khi nào.

## Bản đồ kiến thức

```text
┌──────────────────────────────────────────────────────────────┐
│ PHASE 1 — Fundamentals                                       │
│   - NGINX = web server + reverse proxy + LB + L4 proxy       │
│   - Lịch sử C10K, vì sao event-driven                        │
│   - Layer 4 vs Layer 7 (kính lúp OSI)                        │
│   - TLS termination vs passthrough                           │
│   - Kiến trúc nội bộ: master + worker + epoll                │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ PHASE 2 — Docker                                             │
│   - Setup NGINX trong container                              │
│   - 3 backend + 1 NGINX trong custom network                 │
│   - 2 NGINX cùng pool — pattern và hạn chế                   │
│   - Docker networking deep: bridge, custom, multi-network    │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ PHASE 3 — Timeouts (11 timeout production-critical)          │
│   Frontend: client_header, client_body, send,                │
│             keepalive, lingering, resolver                    │
│   Backend:  proxy_connect, proxy_send, proxy_read,           │
│             proxy_next_upstream, keepalive (upstream)         │
│   - Slow Loris, WebSocket cắt 60s, retry strategy            │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ PHASE 4 — Configs sâu                                        │
│   - Web server: root vs alias, try_files, sendfile, gzip     │
│   - Layer 7 proxy: 6 LB algorithms, location matching        │
│   - Layer 4 proxy: stream, NAT, SNI routing                  │
│   - HTTPS với Let's Encrypt                                  │
│   - TLS 1.3 + HTTP/2 → A+ SSL Labs                          │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ PHASE 5 — WebSockets                                         │
│   - WS protocol: handshake Upgrade → 101 → frame             │
│   - L4 vs L7 cho WS                                          │
│   - Build WS server Node.js                                  │
│   - NGINX L4 proxy WS (sticky tự nhiên)                      │
│   - NGINX L7 proxy WS (4 directive bắt buộc, path routing)   │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ PHASE 6 — Q&A                                                │
│   - Scale NGINX: vertical, DNS RR, cloud LB, anycast, VRRP   │
│   - Bao nhiêu backend: 3 minimum HA, đo bằng load test       │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ PHASE 7 — Bonus                                              │
│   - Socket connections deep (kernel queues, ulimit)          │
│   - Proxy vs Reverse Proxy đào sâu                           │
│   - NGINX limitations → Cloudflare Pingora                   │
│   - Course summary (đây)                                     │
└──────────────────────────────────────────────────────────────┘
```

## Cheat sheet — toàn bộ NGINX config production

```nginx
user                 nginx;
worker_processes     auto;
worker_rlimit_nofile 65535;
error_log            /var/log/nginx/error.log warn;
pid                  /var/run/nginx.pid;

events {
    worker_connections 65535;
    use epoll;
    multi_accept on;
}

# ── Layer 4 (TCP/UDP) ──
stream {
    upstream pg_cluster {
        server pg-primary:5432;
        server pg-replica:5432 backup;
    }
    server {
        listen 5432;
        proxy_pass pg_cluster;
        proxy_timeout 5m;
    }
}

# ── Layer 7 (HTTP) ──
http {
    include            /etc/nginx/mime.types;
    default_type       application/octet-stream;
    
    # ── Logging ──
    log_format main '$remote_addr - [$time_local] "$request" '
                    '$status $body_bytes_sent $request_time '
                    '"$http_referer" "$http_user_agent"';
    access_log /var/log/nginx/access.log main;
    
    # ── Performance ──
    sendfile      on;
    tcp_nopush    on;
    tcp_nodelay   on;
    server_tokens off;                   # ẩn version
    
    # ── Frontend timeouts ──
    client_header_timeout  5s;
    client_body_timeout    30s;
    send_timeout           30s;
    keepalive_timeout      30s;
    keepalive_requests     10000;
    client_max_body_size   10m;
    large_client_header_buffers 4 16k;
    
    # ── Compression ──
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml image/svg+xml;
    
    # ── SSL/TLS ──
    ssl_protocols          TLSv1.2 TLSv1.3;
    ssl_ciphers            ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;
    ssl_session_cache    shared:SSL:50m;
    ssl_session_timeout  1h;
    ssl_session_tickets  off;
    ssl_stapling         on;
    ssl_stapling_verify  on;
    
    # ── DNS ──
    resolver          8.8.8.8 1.1.1.1 valid=30s ipv6=off;
    resolver_timeout  5s;
    
    # ── Rate limiting ──
    limit_conn_zone $binary_remote_addr zone=per_ip:10m;
    limit_req_zone  $binary_remote_addr zone=req_limit:10m rate=20r/s;

    # ── Map an toàn cho WebSocket ──
    map $http_upgrade $connection_upgrade {
        default     "upgrade";
        ""          "";
    }
    
    # ── Upstream ──
    upstream api_backend {
        server app1:8080 max_fails=3 fail_timeout=10s;
        server app2:8080 max_fails=3 fail_timeout=10s;
        server app3:8080 max_fails=3 fail_timeout=10s;
        keepalive          64;
        keepalive_timeout  60s;
        keepalive_requests 10000;
    }
    
    upstream ws_backend {
        server ws1:8080;
        server ws2:8080;
        ip_hash;                  # WS không bắt buộc, nhưng cho ổn định reconnect
    }
    
    # ── HTTP → HTTPS redirect ──
    server {
        listen 80;
        server_name example.com www.example.com;
        
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
        
        location / {
            return 301 https://$host$request_uri;
        }
    }
    
    # ── HTTPS server ──
    server {
        listen 443 ssl http2 reuseport;
        server_name example.com www.example.com;
        
        ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
        ssl_trusted_certificate /etc/letsencrypt/live/example.com/chain.pem;
        
        # ── Security headers ──
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        
        # ── Connection limit ──
        limit_conn per_ip 20;
        
        # ── Static SPA ──
        root /var/www/app/dist;
        index index.html;
        
        location ~* \.(jpg|jpeg|png|gif|webp|ico|svg|woff2?|ttf|css|js)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
            access_log off;
            try_files $uri =404;
        }
        
        # ── API REST ──
        location /api/ {
            limit_req zone=req_limit burst=50 nodelay;
            
            proxy_pass http://api_backend;
            
            proxy_http_version 1.1;
            proxy_set_header   Connection         "";
            proxy_set_header   Host               $host;
            proxy_set_header   X-Real-IP          $remote_addr;
            proxy_set_header   X-Forwarded-For    $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto  $scheme;
            
            proxy_connect_timeout      2s;
            proxy_send_timeout         10s;
            proxy_read_timeout         30s;
            proxy_next_upstream        error timeout http_502 http_503;
            proxy_next_upstream_timeout 10s;
            proxy_next_upstream_tries  3;
        }
        
        # ── SSE / streaming ──
        location /events/ {
            proxy_pass         http://api_backend;
            proxy_http_version 1.1;
            proxy_set_header   Connection         "";
            proxy_buffering    off;
            proxy_read_timeout 1h;
        }
        
        # ── WebSocket ──
        location /ws/ {
            proxy_pass http://ws_backend;
            
            proxy_http_version 1.1;
            proxy_set_header   Upgrade            $http_upgrade;
            proxy_set_header   Connection         $connection_upgrade;
            proxy_set_header   Host               $host;
            proxy_set_header   X-Real-IP          $remote_addr;
            proxy_set_header   X-Forwarded-For    $proxy_add_x_forwarded_for;
            
            proxy_read_timeout 1h;
            proxy_send_timeout 1h;
        }
        
        # ── Block admin ──
        location /admin {
            allow 10.0.0.0/8;
            deny all;
            proxy_pass http://admin_backend;
        }
        
        # ── SPA fallback ──
        location / {
            add_header Cache-Control "no-cache";
            try_files $uri $uri/ /index.html;
        }
        
        # ── Health endpoint ──
        location = /health {
            access_log off;
            return 200 "OK\n";
            add_header Content-Type text/plain;
        }
        
        # ── nginx_status nội bộ ──
        location = /nginx_status {
            stub_status on;
            allow 127.0.0.1;
            deny all;
        }
    }
}
```

→ ~150 dòng config production-grade. Có TLS A+, HTTP/2, rate limit, security header, WebSocket, SSE, cache header, health endpoint.

## 30 quy tắc rút ra từ khoá

### Architecture

1. NGINX = swiss-army knife cho 90% case web. Không phải mọi case.
2. Layer 4 cho protocol không phải HTTP, hoặc TLS passthrough strict.
3. Layer 7 cho mọi thứ liên quan HTTP — routing, cache, WAF.
4. 1 NGINX = SPOF. ≥ 2 NGINX trên ≥ 2 host = HA thật.
5. Cloud LB phía trước NGINX = pattern chuẩn hiện đại.

### Performance

6. Tune `worker_connections`, `keepalive`, OS sysctl trước khi scale.
7. `sendfile + tcp_nopush + tcp_nodelay` cho static — zero-copy.
8. `proxy_http_version 1.1 + Connection ""` cho upstream keepalive — **không bao giờ quên**.
9. Bật `reuseport` cho NGINX 1.9+ — kernel-level LB giữa worker.
10. Compress text-based (`gzip`), **không compress** binary đã nén.

### Security

11. TLS 1.3 + ECDHE cipher + HSTS + OCSP stapling = A+.
12. `Strict-Transport-Security` luôn có `always`.
13. Rate limit `limit_req` + `limit_conn` cho mọi public endpoint.
14. Block admin path theo IP.
15. Đừng forward `$http_connection` mù — dùng map an toàn.

### Timeout

16. Default 60s **quá lỏng** — tune theo workload.
17. `client_header_timeout 5s` chống Slow Loris.
18. `proxy_read_timeout 1h` cho WebSocket/SSE — **không bao giờ default**.
19. `proxy_next_upstream_timeout 10s tries 3` — không để loop vô tận.
20. `keepalive_timeout` < cloud LB idle timeout.

### TLS / HTTPS

21. Let's Encrypt + certbot renew tự động qua cron.
22. Dùng `fullchain.pem` không `cert.pem`.
23. Wildcard cert cần DNS-01 challenge.
24. `ssl_session_cache shared:SSL:50m` giảm handshake repeat.
25. Mozilla SSL config generator: `ssl-config.mozilla.org`.

### Observability & debug

26. `nginx -t` trước mọi reload — luôn luôn.
27. `stub_status on` + `nginx-prometheus-exporter` cho metric.
28. Access log `$request_time` để đo latency NGINX.
29. `ss -lnt + nstat ListenDrops` debug accept queue.
30. Error log `[error]` mức tối thiểu — đừng `[warn]` thiếu thông tin.

## Skill đạt được sau khoá

Sau 7 phase:

- ✓ Hiểu rõ NGINX kiến trúc nội bộ (master/worker, epoll, event loop).
- ✓ Cấu hình NGINX làm web server, L4 proxy, L7 proxy, WebSocket proxy.
- ✓ Setup HTTPS production-grade với Let's Encrypt + TLS 1.3 + HTTP/2.
- ✓ Tune 11 loại timeout cho workload cụ thể.
- ✓ Setup multi-tier deployment với Docker.
- ✓ Hiểu khi nào dùng NGINX vs alternative (HAProxy, Envoy, Caddy, Pingora).
- ✓ Debug NGINX bug (timeout, accept queue, upstream fail).
- ✓ Scale NGINX horizontally và vertically đúng cách.

## Tài nguyên đào sâu thêm

- **Official**: nginx.org/en/docs/
- **Best practice**: nginx.com/blog/ (paid blog nhưng nhiều free article)
- **SSL config generator**: ssl-config.mozilla.org
- **NGINX deep dive sách**: "NGINX Cookbook" (Derek DeJonghe, O'Reilly)
- **Cloudflare blog**: blog.cloudflare.com (Pingora, networking deep)
- **HAProxy**: haproxy.com/blog
- **Envoy**: envoyproxy.io/docs

## Path tiếp theo

NGINX là gateway cho nhiều topic networking & backend infrastructure:

| Hướng | Tool/Topic |
|---|---|
| **Service mesh** | Istio, Linkerd, Consul Connect |
| **Cloud-native LB** | AWS ELB, GCP HTTPS LB, Azure App Gateway |
| **CDN** | Cloudflare, Fastly, AWS CloudFront |
| **Auto-HTTPS / simple** | Caddy |
| **High-traffic LB** | HAProxy |
| **Container LB** | Traefik, K8s Ingress |
| **Custom proxy** | Pingora framework (Rust) |
| **Observability** | OpenTelemetry, Prometheus, Grafana |
| **WAF** | ModSecurity, Cloudflare WAF, AWS WAF |
| **Networking deep** | OS course (Hussein Nasser), TCP/IP Illustrated |

## Lời cuối

NGINX là **một trong những phần mềm thành công nhất** của thời đại web. 2004 đến giờ vẫn dùng được, ổn định, performance hàng đầu. Mặc dù có Pingora, Envoy, alternative mới — NGINX vẫn là **default safe choice** cho đa số công ty trên thế giới.

Đi qua khoá này, bạn có nền tảng vững để:
- Vận hành NGINX production tự tin.
- Debug bug nhanh hơn.
- Đánh giá khi nào nên chọn alternative.
- Hiểu kiến trúc backend infrastructure nói chung.

Chúc các bạn build hệ thống thành công với NGINX!

→ Khoá kết thúc. Toàn bộ 7 phase, 35+ bài đã hoàn thành.
