# Tóm tắt Khóa học NGINX

## Phase 1: Fundamentals

```
NGINX là gì:
├── Web Server: Serve static/dynamic content
└── Reverse Proxy: Load balancer, routing, caching, API gateway

Layer 4 vs Layer 7:
├── Layer 4 (stream {}): TCP tunnel, any protocol, TLS passthrough
└── Layer 7 (http {}): HTTP aware, routing, caching, header rewrite

TLS:
├── Termination: NGINX decrypt, needs certificate, smart routing OK
└── Passthrough: End-to-end encrypt, NGINX blind, Layer 4 only

NGINX Architecture:
├── Master process: Quản lý workers
├── Worker processes: 1 per CPU core, event-driven
└── Each worker: Handles thousands of connections (async I/O)
```

---

## Phase 2: Docker

```
Docker Basics:
├── Image: Template (như class)
└── Container: Instance (như object)

NGINX in Docker:
├── docker run -p 80:80 nginx
├── Volume mount: -v ./html:/usr/share/nginx/html
└── Custom config: -v ./nginx.conf:/etc/nginx/nginx.conf

Multi-container setup:
├── Create network: docker network create backend-net
├── All containers in same network → hostname DNS resolution
└── Don't expose backend ports (only NGINX needs public port)
```

---

## Phase 3: Timeouts

```
Frontend (Client → NGINX):
├── client_header_timeout (60s): Nhận HTTP headers
├── client_body_timeout (60s): Nhận HTTP body
├── send_timeout (60s): Gửi response đến client
├── keepalive_timeout (75s): Giữ idle connection
└── resolver_timeout (30s): DNS resolution

Backend (NGINX → Upstream):
├── proxy_connect_timeout (60s, max 75s): TCP connect đến backend
├── proxy_send_timeout (60s): Gửi request đến backend
├── proxy_read_timeout (60s): Đọc response từ backend
│   ⚠️ SSE/WebSocket: Set rất lớn (3600s, 86400s)
└── proxy_next_upstream_timeout (0=∞): Failover timeout
    ⚠️ Default 0 = dangerous! Set proxy_next_upstream_tries
```

---

## Phase 4: NGINX Configurations

```
Web Server:
  root /var/www/html;

Layer 7 Proxy:
  proxy_pass http://backend;
  Load balancing: round_robin (default), ip_hash, least_conn

Layer 4 Proxy:
  stream { proxy_pass backend; }
  Sticky connections, any protocol

HTTPS:
  listen 443 ssl;
  ssl_certificate + ssl_certificate_key

TLS 1.3:
  ssl_protocols TLSv1.3;

HTTP/2:
  listen 443 ssl http2;
```

---

## Phase 5: WebSockets

```
WebSocket:
├── Full duplex: Cả 2 bên gửi data bất kỳ lúc nào
├── Stateful: 1 connection = 1 server (không switch giữa chừng)
└── Handshake: HTTP Upgrade request → 101 Switching Protocols

Layer 4 WebSocket:
  stream { proxy_pass ws-backend; }  ← Sticky, TLS passthrough

Layer 7 WebSocket (cần thêm headers):
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 3600s;   ← VERY IMPORTANT for long-lived connections
  → Path routing: /chat → chat-backend, /feed → feed-backend
```

---

## Phase 6: Advanced

```
Scale NGINX:
├── Vertical: More CPU/RAM → auto more workers
├── Horizontal: DNS round robin, L4 LB in front
└── Optimize first: worker_connections, upstream keepalive

Limitation:
└── Per-worker connection pools → Chatty với backends (→ Cloudflare Pingora)
```

---

## Cheat Sheet: NGINX Config Structure

```nginx
# Layer 4 (TCP/UDP proxying)
stream {
    upstream backend { server host:port; }
    server {
        listen port;
        proxy_pass backend;
    }
}

# Layer 7 (HTTP proxying)
http {
    upstream backend {
        [ip_hash | least_conn;]
        server host:port;
        keepalive 32;
    }

    server {
        listen 80;
        listen 443 ssl [http2];
        ssl_certificate /path/to/cert.pem;
        ssl_certificate_key /path/to/key.pem;
        ssl_protocols TLSv1.3;

        location / {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;

            # Timeouts
            proxy_connect_timeout 5s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;
        }

        # WebSocket
        location /ws {
            proxy_pass http://ws-backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_read_timeout 3600s;
        }
    }
}
```
