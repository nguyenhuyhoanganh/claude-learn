# Bài 5: Configure NGINX as Layer 7 WebSocket Proxy

## Cấu hình

```nginx
# http-ws.conf
events { }

http {
    # App backends (chỉ 2222 và 3333)
    upstream ws-app {
        server 127.0.0.1:2222;
        server 127.0.0.1:3333;
    }

    # Chat backends (chỉ 4444 và 5555)
    upstream ws-chat {
        server 127.0.0.1:4444;
        server 127.0.0.1:5555;
    }

    server {
        listen 80;

        # Serve HTML page
        location / {
            root /var/www/html;
            index index.html;
        }

        # WebSocket App endpoint
        location /wsapp {
            proxy_pass http://ws-app;

            # Required headers for WebSocket upgrade
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;

            # Keep WebSocket alive
            proxy_read_timeout 3600s;
            proxy_send_timeout 3600s;
        }

        # WebSocket Chat endpoint
        location /wschat {
            proxy_pass http://ws-chat;

            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;

            proxy_read_timeout 3600s;
            proxy_send_timeout 3600s;
        }
    }
}
```

---

## Giải thích các Headers

### `proxy_http_version 1.1`
WebSocket chỉ hoạt động với HTTP/1.1 (vì cần `Connection: keep-alive`).

### `proxy_set_header Upgrade $http_upgrade`
Forward `Upgrade: websocket` header từ client đến backend.

**Cẩn thận:** `$http_upgrade` có thể chứa bất kỳ protocol nào client request.
Nếu muốn chỉ allow WebSocket:
```nginx
proxy_set_header Upgrade "websocket";  # Hardcode
```

### `proxy_set_header Connection "upgrade"`
Báo cho backend biết đây là connection upgrade request.

---

## Test Layer 7 WebSocket

```javascript
// Connect đến /wsapp → chỉ đến backend 2222 hoặc 3333
const ws1 = new WebSocket('ws://localhost:80/wsapp');
ws1.onmessage = (e) => console.log('app:', e.data);
ws1.send('Hello app!');
// → "app: Received your message: "Hello app!" on port 2222"

// Refresh → new connection → round robin
// → có thể đến 3333 lần này

// Connect đến /wschat → chỉ đến backend 4444 hoặc 5555
const ws2 = new WebSocket('ws://localhost:80/wschat');
ws2.onmessage = (e) => console.log('chat:', e.data);
ws2.send('Hello chat!');
// → "chat: Received your message: "Hello chat!" on port 4444"
```

**Điểm khác biệt với Layer 4:**
- `/wsapp` → 2222 hoặc 3333 (không bao giờ đến 4444/5555)
- `/wschat` → 4444 hoặc 5555 (không bao giờ đến 2222/3333)
- Path routing chỉ khả dụng ở Layer 7!

---

## Connection Flow Layer 7

```
Browser                 NGINX                   Backend
   |                      |                        |
   |──TLS handshake──────→|                        |
   |←──TLS accept─────────|                        |
   |                      |──TLS handshake────────→|
   |                      |←──TLS accept───────────|
   |──WS Upgrade req──────→|                        |
   |  GET /wsapp HTTP/1.1  |──WS Upgrade req───────→|
   |  Upgrade: websocket   |  (new connection)      |
   |                      |←──101 Switching Proto──|
   |←──101 Switching Proto|                        |
   |  [WebSocket pipe 1]  |  [WebSocket pipe 2]    |
   |──WS message──────────→|──WS message───────────→|
   |←──WS response────────|←──WS response──────────|
```

Hai WebSocket tunnels hoàn toàn tách biệt!

---

## Tóm tắt Layer 4 vs Layer 7 cho WebSocket

| | Layer 4 | Layer 7 |
|--|---------|---------|
| **Config context** | `stream {}` | `http {}` |
| **Path routing** | ❌ | ✅ (`/wsapp`, `/wschat`) |
| **TLS** | Passthrough | Terminate |
| **Upgrade headers** | Auto (transparent) | Cần set thủ công |
| **Timeout** | `proxy_timeout` | `proxy_read_timeout` |
| **Use case** | Simple proxy | Smart routing |

---
**Tiếp theo:** Phase 6 - Q&A và Bonus →
