# Bài 2: Layer 4 vs Layer 7 proxy cho WebSocket

Phase 1 Bài 3 đã so sánh L4 vs L7 cho HTTP. Bài này áp dụng cụ thể cho WebSocket — protocol stateful, long-lived, có nhiều nuance. Hiểu sai = WebSocket disconnect random, mất state, không scale được.

## Layer 4 proxy cho WebSocket — dumb tunnel

```text
Client                    NGINX (L4)                  WS Server
   │                          │                           │
   │ TCP SYN ─────────────────►│                          │
   │                          │ SYN ─────────────────────►│
   │                          │ ◄──────────── SYN-ACK     │
   │                          │ ACK ─────────────────────►│
   │ ◄──── SYN-ACK ───────────│                          │
   │ ACK ─────────────────────►│                          │
   │                          │   (2 TCP đã set up,        │
   │                          │    NAT mapping tạo)        │
   │                          │                           │
   │ TLS ClientHello ─────────►│ ─────────────────────────►│
   │                          │ (forward bytes, không peek)│
   │ ◄── TLS ServerHello ─────│ ◄─────────────────────────│
   │ ...                       │                           │
   │ [TLS handshake hoàn tất giữa Client và Backend]      │
   │                          │                           │
   │ WS upgrade request ──────►│ ──────────────────────────►│
   │ ◄── 101 Switching ───────│ ◄──────────────────────────│
   │                          │                           │
   │═══════ WebSocket data ════│═══════════════════════════│
   │ (NGINX không decrypt, chỉ forward bytes)              │
```

### Đặc tính

| Yếu tố | Hành vi |
|---|---|
| TLS handshake | **Đi thẳng** từ client đến backend (passthrough) |
| NGINX có thấy WS handshake không | Không — chỉ thấy bytes mã hoá |
| NGINX có cert? | Không cần |
| 1 client conn = mấy backend conn? | 1 (NAT pegged) |
| Path routing (`/chat`, `/feed`) | **Không thể** — không thấy URL |

### Config cơ bản

```nginx
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
        proxy_timeout 1h;          # WebSocket idle
    }
}
```

### Ưu điểm L4 cho WebSocket

- ✓ **End-to-end TLS encryption** — NGINX không decrypt, không lưu khoá.
- ✓ **Không cần cert ở NGINX** — backend giữ cert.
- ✓ **NGINX không cần hiểu WebSocket protocol** — chỉ forward bytes.
- ✓ **Sticky tự nhiên** — connection đã pegged.
- ✓ **Performance** — không decrypt + re-encrypt → CPU thấp.

### Nhược điểm L4

- ✗ **Không path routing** — tất cả connection về cùng pool. Không thể `/chat` đi pool A, `/feed` đi pool B.
- ✗ **1 client = 1 backend conn dedicated** — không share, không pool.
- ✗ **Không inspect content** — không log message, không filter bad word, không tracing.
- ✗ **Không thấy header HTTP** — không log User-Agent, Origin.

## Layer 7 proxy cho WebSocket — smart

```text
Client                   NGINX (L7)                   WS Server
   │                          │                           │
   │ TLS ClientHello ─────────►│                          │
   │ ◄── TLS ServerHello ─────│  (NGINX có cert!)        │
   │ ... [TLS handshake giữa client ↔ NGINX]              │
   │                          │                           │
   │ GET /chat HTTP/1.1       │                           │
   │ Upgrade: websocket       │                           │
   │ Connection: Upgrade ────►│                           │
   │                          │ ← NGINX đọc request,      │
   │                          │   thấy "Upgrade: websocket"│
   │                          │                           │
   │                          │ (chọn backend từ upstream)│
   │                          │                           │
   │                          │ TLS handshake riêng ──────►│
   │                          │ (kênh 2, TLS giữa NGINX và Backend)
   │                          │ ◄────────────────────────│
   │                          │                           │
   │                          │ GET /chat HTTP/1.1 ──────►│
   │                          │ Upgrade: websocket        │
   │                          │ ◄── 101 Switching ───────│
   │ ◄── 101 Switching ───────│                          │
   │                          │                           │
   │═══ WS data (TLS A) ══════│═══ WS data (TLS B) ══════│
   │ (NGINX decrypt từ A, đọc, mã hoá lại bằng B)        │
```

### Đặc tính

| Yếu tố | Hành vi |
|---|---|
| TLS handshake | NGINX terminate kênh 1 (client ↔ NGINX); kênh 2 riêng (NGINX ↔ backend) |
| NGINX thấy WS handshake | **Có** — vì đã decrypt |
| NGINX cần cert? | **Có** |
| 1 client conn | 1 client-NGINX conn + 1 NGINX-backend conn (pegged once) |
| Path routing | **Có** — route theo `/chat`, `/feed`... |

### Config cơ bản

```nginx
http {
    upstream ws_chat {
        server 127.0.0.1:2222;
        server 127.0.0.1:3333;
    }
    
    upstream ws_feed {
        server 127.0.0.1:4444;
        server 127.0.0.1:5555;
    }
    
    server {
        listen 443 ssl;
        ssl_certificate ...;
        ssl_certificate_key ...;
        
        location /chat {
            proxy_pass http://ws_chat;
            
            # Bắt buộc cho WebSocket
            proxy_http_version 1.1;
            proxy_set_header   Upgrade    $http_upgrade;
            proxy_set_header   Connection "upgrade";
            proxy_set_header   Host       $host;
            
            # Timeout — WebSocket long-lived
            proxy_read_timeout 1h;
            proxy_send_timeout 1h;
        }
        
        location /feed {
            proxy_pass http://ws_feed;
            # ... cùng các header
        }
    }
}
```

> 4 directive **bắt buộc** cho L7 WebSocket: `proxy_http_version 1.1`, `Upgrade $http_upgrade`, `Connection "upgrade"`, `proxy_read_timeout` đủ lớn. Thiếu = WebSocket không upgrade được.

### Ưu điểm L7

- ✓ **Path routing**: `/chat` đi pool A, `/feed` đi pool B.
- ✓ **Host routing**: `chat.example.com` vs `feed.example.com`.
- ✓ **Inspect content** (sau khi decrypt) — log, filter, transform.
- ✓ **Inject header** — `X-Real-IP`, auth header, tracing ID.
- ✓ **Rate limit**, **WAF**, **monitoring** theo URL.
- ✓ **Có thể serve HTML/static cùng port** — vd `GET /` trả index.html, `GET /ws` upgrade WebSocket.

### Nhược điểm L7

- ✗ **NGINX có cert** + private key — nếu compromise NGINX = đọc được content.
- ✗ **2 kênh TLS** = decrypt + re-encrypt → tốn CPU hơn.
- ✗ **Cần `Upgrade` + `Connection` header** — nhiều người quên.

## Decision matrix

```text
                Cần routing theo /chat, /feed, /admin?
                          │
                ┌─────────┴─────────┐
               YES                  NO
                │                    │
                ▼                    ▼
       Cần inspect/log/filter   End-to-end encryption strict?
       message content?              │
                │             ┌──────┴──────┐
        ┌───────┴────────┐   YES            NO
       YES               NO    │              │
        │                │     ▼              ▼
        ▼                ▼   L4 passthrough  L4 đơn giản
       L7 proxy         L7 (recommended)   (recommended)
                       (recommended)
```

→ **Đa số case: L7**. Path routing + inspect quá hữu ích để bỏ. L4 chỉ khi cần passthrough TLS strict hoặc protocol khác.

## Load balancing — connection level, không message level

> ⚠️ Đây là điểm **gây hiểu lầm** lớn nhất.

```text
HTTP (stateless) round-robin:
   client → request A → backend1
          → request B → backend2     ← per-request rotate
          → request C → backend3

WebSocket round-robin:
   client → connect → backend1 (chọn 1 lần)
          → msg1 → backend1
          → msg2 → backend1            ← per-message bị pegged
          → msg3 → backend1
   ...
   (client mở connection thứ 2 mới rotate)
```

**Vì sao**? WebSocket stateful — message phụ thuộc state phiên trước. Server có thể nhớ "user vừa nói gì". Routing message này về backend khác = mất state.

→ NGINX **buộc** phải sticky ở connection level cho WebSocket.

### Với L4 — sticky tự nhiên

NAT mapping: client TCP conn ↔ backend TCP conn. Mọi byte trên conn đó về cùng backend. Không cần config.

### Với L7 — phải config

L7 mặc định round-robin **per-request**. Nhưng WebSocket "request" là `Upgrade` đầu tiên — sau đó là raw frames, không phải HTTP request nữa. NGINX hiểu điều này và **giữ connection pegged** sau khi upgrade thành công.

→ Trong cùng WebSocket connection, mọi frame về cùng backend. Không cần `ip_hash`.

## Vấn đề khi scale WebSocket — không chỉ NGINX

Ngoài load balancing, scale WS gặp:

### 1. Server side state

User A connect đến backend1, user B đến backend2. A gửi tin cho B → backend1 phải báo backend2 → backend2 đẩy xuống B.

**Pattern**: pub-sub layer như Redis Pub/Sub, RabbitMQ, Kafka.

```text
backend1                    backend2
   │ user A msg                  │
   │                              │
   ├──► Redis PUBSUB "chat" ─────┤
   │                              │
   │                       backend2 nhận event
   │                       push xuống user B WebSocket
```

### 2. Reconnect logic

WebSocket connection break (mạng, server restart) → client phải reconnect, có thể về backend khác. State có thể mất.

**Pattern**: client gửi "resume token" / "last message ID" khi reconnect → server restore từ DB/Redis.

### 3. Heartbeat / ping-pong

NGINX timeout cắt idle connection sau `proxy_read_timeout`. WebSocket app phải gửi **ping** định kỳ (mỗi 30s):

```javascript
// Client
setInterval(() => ws.send('{"type":"ping"}'), 30000);

// Server
ws.on('message', msg => {
    if (msg === '{"type":"ping"}') ws.send('{"type":"pong"}');
});
```

→ Tránh NGINX cắt connection vì "idle". Cũng phát hiện connection chết (TCP RST không phải lúc nào cũng nhận).

### 4. Max connection / instance

Mỗi connection 1 fd + vài KB state. Ulimit thấp = fail. Tune:

```bash
# /etc/security/limits.conf
nginx soft nofile 65535
nginx hard nofile 65535

ulimit -n 65535       # verify
```

NGINX:
```nginx
events {
    worker_connections 65535;
}
```

## So sánh đầy đủ L4 vs L7 cho WebSocket

| Yếu tố | L4 (`stream`) | L7 (`http`) |
|---|---|---|
| TLS | Passthrough | Terminate |
| Cert ở NGINX | Không | Có |
| URL routing | Không | Có |
| Host routing | SNI only | Có |
| Inspect content | Không | Có |
| Inject header | Không (chỉ PROXY protocol) | Có |
| Sticky | Tự nhiên | Tự nhiên (sau upgrade) |
| CPU cost | Thấp | Cao hơn (decrypt+encrypt) |
| Latency thêm | < 1ms | 1-5ms |
| Setup | Đơn giản (1 directive) | Phức tạp (cần 4 header) |
| Use case ideal | E2E encryption, mixed protocol | Mixed HTTP+WS, observability |

## Bẫy thường gặp

| Bẫy | Hệ quả | Cách tránh |
|---|---|---|
| Quên `proxy_http_version 1.1` cho L7 | WebSocket fail upgrade | Set 1.1 |
| Quên `Upgrade $http_upgrade` | Backend không nhận được upgrade request | Set 2 header |
| Quên `proxy_read_timeout` đủ lớn | Connection cắt sau 60s default | Set 1h+ |
| Mong L4 thấy URL | Không thể | Dùng L7 |
| Mong L7 sticky theo IP | Mặc định pegged per-connection rồi | Không cần làm gì |
| WebSocket trên `http://` qua firewall corporate | Block (firewall không hiểu WS) | Dùng `wss://` qua 443, transparent |
| Quên heartbeat | Connection chết sau idle | Bật ping-pong ở app |

## Tóm tắt bài 2

- **L4 WebSocket**: dumb tunnel, TLS passthrough, không URL routing. Đơn giản, end-to-end encryption.
- **L7 WebSocket**: smart proxy, URL routing, inspect content. Cần 4 directive (http_version, Upgrade, Connection, timeout).
- Load balancing **per-connection**, không per-message — stateful tự nhiên.
- Scale WebSocket cần: pub-sub layer (Redis), reconnect logic, heartbeat, ulimit cao.
- 90% case nên dùng L7 cho linh hoạt + observability.

**Bài kế tiếp** → [Bài 3: Build WebSocket server với Node.js — chuẩn bị test NGINX](03-websocket-server.md)
