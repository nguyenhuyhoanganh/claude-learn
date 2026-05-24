# Bài 4: NGINX as Layer 4 WebSocket proxy — stream context

Đã có 4 backend WS chạy ở port `2222, 3333, 4444, 5555`. Giờ đặt NGINX ở port `8080` làm L4 proxy. Mỗi WS connection mới sẽ round-robin về 1 trong 4 backend.

## Config

`tcp.conf`:

```nginx
events {
    worker_connections 1024;
}

stream {
    upstream ws_backends {
        server 127.0.0.1:2222;
        server 127.0.0.1:3333;
        server 127.0.0.1:4444;
        server 127.0.0.1:5555;
    }
    
    server {
        listen 8080;
        proxy_pass ws_backends;
        
        # WebSocket = long-lived → tăng timeout
        proxy_connect_timeout 5s;
        proxy_timeout         1h;
    }
}
```

3 phần:
- `stream { ... }` — L4 context.
- `upstream` — danh sách backend.
- `server` — listener + proxy_pass.

So với HTTP L7, **không có**:
- `location` block.
- `proxy_http_version`.
- `proxy_set_header Upgrade ...`.
- `Connection "upgrade"`.

Vì NGINX không hiểu HTTP/WebSocket — chỉ forward bytes thuần.

Chạy:

```bash
nginx -c $(pwd)/tcp.conf

# hoặc Docker:
docker run -d --name ng-l4 \
    -p 8080:8080 \
    --network host \
    -v $(pwd)/tcp.conf:/etc/nginx/nginx.conf \
    nginx:1.25
```

## Test sticky connection

Mở HTML test page (Bài 3), URL → `ws://localhost:8080`:

```text
[14:00:01] Connected to ws://localhost:8080
→ Hello
[14:00:05] ← Received "Hello" on port 4444
→ Hello again
[14:00:08] ← Received "Hello again" on port 4444    ← cùng backend!
→ Test 3
[14:00:10] ← Received "Test 3" on port 4444         ← vẫn cùng
```

Connection 1 → backend 4444 (random/round-robin pick lần đầu).

Disconnect → Connect lại:

```text
[14:00:15] Connected to ws://localhost:8080
→ Hello
[14:00:18] ← Received "Hello" on port 5555           ← backend mới
```

Connection 2 → backend 5555 (round-robin).

→ **Sticky per-connection, round-robin per-new-connection**. Đặc tính L4.

### Visualize bằng nhiều tab browser

Mở 4 tab cùng `ws://localhost:8080`:

| Tab | Connect time | Backend |
|---|---|---|
| 1 | 14:00:01 | 2222 |
| 2 | 14:00:02 | 3333 |
| 3 | 14:00:03 | 4444 |
| 4 | 14:00:04 | 5555 |
| 5 | 14:00:05 | 2222 ← quay vòng |

→ Mỗi tab pegged về 1 backend, round-robin cho connection mới.

## Layer 4 = NAT mapping

```text
NGINX NAT table:
┌──────────────────────────────────┬─────────────────────────┐
│ Client IP:Port                    │ Backend IP:Port          │
├──────────────────────────────────┼─────────────────────────┤
│ 127.0.0.1:54321 (tab 1)          │ 127.0.0.1:2222           │
│ 127.0.0.1:54322 (tab 2)          │ 127.0.0.1:3333           │
│ 127.0.0.1:54323 (tab 3)          │ 127.0.0.1:4444           │
│ 127.0.0.1:54324 (tab 4)          │ 127.0.0.1:5555           │
└──────────────────────────────────┴─────────────────────────┘
```

Mỗi connection client → 1 entry trong NAT table. Mọi byte trên port client đó về cùng backend port. Connection đóng → entry xoá.

## URL không quan trọng ở L4

```javascript
const ws1 = new WebSocket('ws://localhost:8080/chat');
const ws2 = new WebSocket('ws://localhost:8080/feed');
const ws3 = new WebSocket('ws://localhost:8080/anything');
```

Cả 3 đều đến cùng pool — NGINX không thấy `/chat` vs `/feed` vs `/anything`.

→ Để route theo URL, **bắt buộc dùng L7** (Bài 5).

## Với TLS (`wss://`) — passthrough

Setup backend có TLS riêng:

```javascript
// Backend with TLS
const https = require('https');
const fs = require('fs');

const server = https.createServer({
    cert: fs.readFileSync('backend.crt'),
    key:  fs.readFileSync('backend.key')
});

const wsServer = new WebSocketServer({ httpServer: server });
server.listen(PORT);
```

NGINX L4:

```nginx
stream {
    upstream ws_tls_backends {
        server backend1:443;
        server backend2:443;
    }
    
    server {
        listen 443;
        proxy_pass ws_tls_backends;
        # NGINX không có cert — passthrough hoàn toàn
    }
}
```

Client:

```javascript
const ws = new WebSocket('wss://nginx.example.com:443');
```

TLS handshake giữa **client và backend** trực tiếp. NGINX chỉ forward bytes.

### Với SNI routing nhiều domain

Nhiều domain, mỗi domain cert riêng:

```nginx
stream {
    map $ssl_preread_server_name $backend_pool {
        chat.example.com    chat_backends;
        feed.example.com    feed_backends;
        default             chat_backends;
    }

    upstream chat_backends {
        server chat1:443;
        server chat2:443;
    }
    
    upstream feed_backends {
        server feed1:443;
        server feed2:443;
    }
    
    server {
        listen 443;
        ssl_preread on;
        proxy_pass  $backend_pool;
    }
}
```

`ssl_preread on` cho phép NGINX peek SNI trong ClientHello (plaintext) → route đúng pool. NGINX vẫn không decrypt nội dung.

## Timeout — không thể bỏ

```nginx
server {
    listen 8080;
    proxy_pass ws_backends;
    
    proxy_connect_timeout 5s;
    proxy_timeout         1h;       # ← QUAN TRỌNG
}
```

`proxy_timeout` default chỉ 10 phút. Sau 10 phút **idle** (không có byte qua lại) → NGINX close connection. WebSocket có thể idle lâu (user mở tab nền) → bị disconnect.

**Đặt 1h+** và **app tự gửi heartbeat ping mỗi 30s** = không bao giờ idle thật → không bị cắt.

> `proxy_timeout` đo idle giữa các byte. Không phải tổng thời gian session.

## L4 vs HTTP — gotcha

Nếu cấu hình L4 trên port 80, **client gửi HTTP** thường sẽ "lạ":

```text
Browser request: GET / HTTP/1.1 → NGINX L4 → backend
Backend là WS server, không hiểu plain HTTP → trả "HTTP fallback on port 4444" (vì code bài 3 có handler)
Browser hiển thị text plain.
```

→ Mở `http://localhost:8080/` không phải WS upgrade — backend chỉ trả text. **Browser khó verify L4 đang work**. Phải dùng `wscat` hoặc HTML test page.

```bash
wscat -c ws://localhost:8080
# > hello
# < Received "hello" on port 3333
```

## Active health check — NGINX OSS không có

NGINX Open Source **không có active health check** built-in. Nó chỉ "passive": nếu connect/proxy fail → mark backend dead `fail_timeout`:

```nginx
upstream ws_backends {
    server 127.0.0.1:2222 max_fails=3 fail_timeout=10s;
    server 127.0.0.1:3333 max_fails=3 fail_timeout=10s;
    # ...
}
```

Nếu cần **active health check** (gửi probe định kỳ) — phải:
- Dùng NGINX Plus (paid).
- Hoặc dùng external tool (HAProxy thay NGINX, hoặc kube health check ngoài).
- Hoặc patch NGINX với module `ngx_http_upstream_check_module`.

## Pros & Cons cho WS

### Pros của L4

- ✓ End-to-end encryption (TLS passthrough).
- ✓ Setup đơn giản (5 dòng config).
- ✓ Performance cao (no decrypt).
- ✓ Protocol agnostic — không cần biết WS framing.
- ✓ Sticky tự nhiên — không cần config.

### Cons của L4

- ✗ Không URL routing.
- ✗ Không SNI routing (trừ khi bật `ssl_preread`).
- ✗ Không inspect message.
- ✗ Không thấy User-Agent, Origin header → khó security log.
- ✗ Browser không request được HTTP cùng port với WS — phải dùng 2 port hoặc 2 domain.

## Khi NÀO chọn L4 cho WS

- WebSocket là **dịch vụ duy nhất** trên cluster (không serve HTML hay API REST cùng).
- End-to-end encryption strict (compliance).
- Backend tự manage cert TLS.
- Multi-tenant với tenant tự sở hữu cert (SNI routing).
- Performance critical (tránh overhead L7 decrypt+encrypt).

→ Nếu **cùng port phục vụ HTTP + WS**, hoặc cần URL routing, **dùng L7** (Bài 5).

## Tóm tắt bài 4

- L4 WebSocket = `stream {}` + `proxy_pass` đơn giản.
- 4 directive thường có: `listen`, `proxy_pass`, `proxy_connect_timeout`, `proxy_timeout 1h`.
- Sticky per-connection tự nhiên — NAT mapping.
- URL/path/header không thấy được — chỉ ports.
- TLS passthrough = end-to-end encryption, NGINX không có cert.
- SNI routing với `ssl_preread on` cho multi-domain.
- Browser khó test trực tiếp — dùng `wscat` hoặc HTML.
- Active health check cần NGINX Plus hoặc external tool.

**Bài kế tiếp** → [Bài 5: NGINX as Layer 7 WebSocket proxy — routing và inspect](05-nginx-layer7-websocket.md)
