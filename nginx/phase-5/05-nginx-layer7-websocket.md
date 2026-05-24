# Bài 5: NGINX as Layer 7 WebSocket proxy — routing và serve HTML cùng port

L7 cho phép **routing theo URL** — điều L4 không làm được. Bài này setup NGINX route `/wsapp` về 2 backend và `/wschat` về 2 backend khác, đồng thời **serve HTML test page** trên cùng port — pattern không thể với L4.

## Tổng quan

```text
                                  Layer 7 NGINX
                                       │
   Browser ──ws://:8080/wsapp──────────►├── upstream ws_app
                                       │    ├─ 2222
                                       │    └─ 3333
                                       │
            ──ws://:8080/wschat────────►├── upstream ws_chat
                                       │    ├─ 4444
                                       │    └─ 5555
                                       │
            ──http://:8080/────────────►└── /var/www/test.html
```

Cùng 1 port `8080`:
- `GET /` → trả HTML test page (static).
- `WS /wsapp` → proxy đến `ws_app` pool.
- `WS /wschat` → proxy đến `ws_chat` pool.

## Config

`ws.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    # Upstream 1 — wsapp (2 backend)
    upstream ws_app {
        server 127.0.0.1:2222;
        server 127.0.0.1:3333;
    }
    
    # Upstream 2 — wschat (2 backend khác)
    upstream ws_chat {
        server 127.0.0.1:4444;
        server 127.0.0.1:5555;
    }

    server {
        listen 8080;
        
        # Serve test HTML
        location = / {
            root /usr/share/nginx/html;
            index index.html;
        }
        
        # WebSocket /wsapp
        location /wsapp {
            proxy_pass http://ws_app;
            
            # 4 directive BẮT BUỘC cho WebSocket
            proxy_http_version 1.1;
            proxy_set_header   Upgrade    $http_upgrade;
            proxy_set_header   Connection "upgrade";
            proxy_set_header   Host       $host;
            
            # Timeout dài cho WS
            proxy_read_timeout 1h;
            proxy_send_timeout 1h;
        }
        
        # WebSocket /wschat
        location /wschat {
            proxy_pass http://ws_chat;
            
            proxy_http_version 1.1;
            proxy_set_header   Upgrade    $http_upgrade;
            proxy_set_header   Connection "upgrade";
            proxy_set_header   Host       $host;
            
            proxy_read_timeout 1h;
            proxy_send_timeout 1h;
        }
    }
}
```

## 4 directive bắt buộc — giải thích chi tiết

### `proxy_http_version 1.1`

NGINX mặc định dùng **HTTP/1.0** cho upstream → không có `Connection: keep-alive` → không upgrade được.

```text
HTTP/1.0:
   NGINX gửi request đến backend với header "Connection: close" (mặc định)
   Backend hiểu là HTTP request thường, không phải WS upgrade
   → 426 Upgrade Required hoặc 200 OK trả về HTML
   → WebSocket fail
```

Set 1.1 = NGINX gửi request với HTTP/1.1, hỗ trợ upgrade.

### `proxy_set_header Upgrade $http_upgrade`

Forward header `Upgrade: websocket` từ client đến backend.

`$http_upgrade` là **variable** NGINX lấy từ request header `Upgrade` của client. Nếu client gửi `Upgrade: websocket`, NGINX forward y nguyên.

> ⚠️ **Security**: `$http_upgrade` có thể là **bất kỳ** giá trị client gửi — vd `h2c` (HTTP/2 cleartext upgrade attack). Hardcode an toàn hơn:
>
> ```nginx
> # Map an toàn
> map $http_upgrade $connection_upgrade {
>     default     "upgrade";
>     ""          "";
> }
> 
> location /wsapp {
>     proxy_set_header Upgrade    $http_upgrade;
>     proxy_set_header Connection $connection_upgrade;
> }
> ```
>
> Map này: nếu client không gửi `Upgrade`, set `Connection: ""` (không phải `"upgrade"`). Tránh nhầm WS upgrade với request HTTP thường.

### `proxy_set_header Connection "upgrade"`

Báo backend "connection này là upgrade request". Hardcode string `"upgrade"` thay vì forward `$http_connection` của client để đỡ rủi ro.

### `proxy_set_header Host $host`

Forward host header gốc (client gọi `localhost:8080` thì backend cũng thấy `localhost:8080`). Một số WS server check Host để decide accept.

## Tạo HTML test page

Tạo `index.html` (mount vào `/usr/share/nginx/html/` của container):

```html
<!DOCTYPE html>
<html>
<head>
    <title>WebSocket L7 Test</title>
    <style>
        body { font-family: sans-serif; max-width: 700px; margin: 2em auto; padding: 0 1em; }
        #log { 
            border: 1px solid #ccc; padding: 1em; 
            height: 350px; overflow-y: auto;
            background: #f9f9f9; font-family: monospace;
        }
        button { padding: 0.4em 1em; margin-right: 0.5em; }
        select, input { padding: 0.4em; }
    </style>
</head>
<body>
    <h1>WebSocket L7 Test</h1>
    <p>NGINX serve HTML này + proxy WebSocket cùng port 8080.</p>
    
    <div>
        Endpoint:
        <select id="ep">
            <option value="/wsapp">/wsapp → port 2222 hoặc 3333</option>
            <option value="/wschat">/wschat → port 4444 hoặc 5555</option>
        </select>
        <button onclick="connect()">Connect</button>
        <button onclick="disconnect()">Disconnect</button>
    </div>
    
    <div id="log" style="margin-top: 1em"></div>
    
    <div style="margin-top: 1em">
        <input id="msg" type="text" style="width: 70%" placeholder="Type and Enter">
    </div>

    <script>
        let ws;
        const log = (m) => {
            const d = document.getElementById('log');
            d.innerHTML += `[${new Date().toLocaleTimeString()}] ${m}<br>`;
            d.scrollTop = d.scrollHeight;
        };

        function connect() {
            const ep = document.getElementById('ep').value;
            const url = `ws://${location.host}${ep}`;
            ws = new WebSocket(url);
            ws.onopen = () => log(`✓ Connected to ${url}`);
            ws.onmessage = (e) => log(`← ${e.data}`);
            ws.onclose = () => log(`× Disconnected`);
            ws.onerror = () => log(`! Error`);
        }

        function disconnect() {
            if (ws) ws.close();
        }

        document.getElementById('msg').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && ws?.readyState === WebSocket.OPEN) {
                ws.send(e.target.value);
                log(`→ ${e.target.value}`);
                e.target.value = '';
            }
        });
    </script>
</body>
</html>
```

## Chạy NGINX

```bash
nginx -c $(pwd)/ws.conf

# Hoặc Docker:
docker run -d --name ng-l7 \
    -p 8080:8080 \
    --network host \
    -v $(pwd)/ws.conf:/etc/nginx/nginx.conf \
    -v $(pwd)/index.html:/usr/share/nginx/html/index.html \
    nginx:1.25
```

## Test trong browser

Mở `http://localhost:8080/` → load HTML test page (NGINX serve static).

Trong page:
1. Chọn `/wsapp` → Connect → gửi message → thấy "Received on port 2222" hoặc "3333".
2. Disconnect → Chọn `/wschat` → Connect → gửi → thấy "port 4444" hoặc "5555".

→ **Path routing work**. `/wsapp` không bao giờ về 4444/5555. `/wschat` không bao giờ về 2222/3333.

## Connection flow L7 — 2 kênh tách biệt

```text
Browser                    NGINX                       Backend (2222)
  │                          │                              │
  │  TCP handshake ─────────►│                              │
  │  (port 8080)              │                              │
  │                          │                              │
  │  GET /wsapp HTTP/1.1     │                              │
  │  Upgrade: websocket      │                              │
  │  Connection: Upgrade ────►│                              │
  │                          │ ← NGINX đọc, hiểu là WS req  │
  │                          │   match location /wsapp       │
  │                          │   chọn backend ws_app (2222) │
  │                          │                              │
  │                          │  TCP handshake ──────────────►│
  │                          │  (KÊNH 2)                     │
  │                          │                              │
  │                          │  GET /wsapp HTTP/1.1 ────────►│
  │                          │  Upgrade: websocket            │
  │                          │  Connection: upgrade           │
  │                          │  Host: localhost:8080         │
  │                          │  ◄── 101 Switching ──────────│
  │  ◄── 101 Switching ──────│                              │
  │                          │                              │
  │═════ WS frames ═══════════│════ WS frames ═══════════════│
  │                          │                              │
  │  send "Hello" ────────────►                              │
  │                          │ ← decrypt/parse frame         │
  │                          │   forward → backend           │
  │                          │  send "Hello" ────────────────►│
  │                          │                              │
  │                          │  ← "Received on port 2222" ──│
  │  ◄── "Received on port 2222"
```

→ 2 TCP connection: client-NGINX và NGINX-backend. **Tách biệt**, nhưng được NGINX nối logic.

## Round-robin per-connection — vẫn sticky

Cùng `/wsapp`, mở 3 connection:

```text
Connection 1 → backend 2222 (round-robin)
   msg 1, msg 2, msg 3 → tất cả 2222 (sticky)
   
Connection 2 → backend 3333
   msg → 3333 (sticky)
   
Connection 3 → backend 2222 (quay vòng)
   msg → 2222
```

→ Khác L4 ở chỗ: NGINX có thể chọn backend theo nhiều thuật toán (round-robin, least_conn, ip_hash, hash). Nhưng sau khi chọn cho WS connection rồi, vẫn sticky.

## Mix HTTP + WebSocket cùng port — siêu hữu ích

Một config L7 có thể:

```nginx
server {
    listen 443 ssl http2;
    
    # API REST
    location /api/ {
        proxy_pass http://api_backends;
    }
    
    # WebSocket
    location /ws/ {
        proxy_pass http://ws_backends;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection $connection_upgrade;
        # ...
    }
    
    # Static SPA
    location / {
        root /var/www/app;
        try_files $uri /index.html;
    }
}
```

→ 1 server: 1 cert, 1 port — phục vụ SPA + API + WS. **Đây là pattern phổ biến** cho modern app.

L4 không làm được điều này — phải tách port.

## Block path / Auth check tại NGINX

Có thể block hoặc require auth trước khi proxy WS:

```nginx
location /admin-ws {
    # Chỉ cho IP internal
    allow 10.0.0.0/8;
    deny all;
    
    proxy_pass http://admin_ws_backends;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade    $http_upgrade;
    proxy_set_header   Connection "upgrade";
}

location /chat-ws {
    # Auth qua subrequest
    auth_request /verify-token;
    
    proxy_pass http://chat_ws_backends;
    # ...
}

location = /verify-token {
    internal;
    proxy_pass http://auth_service/verify;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header X-Original-URI $request_uri;
}
```

→ Auth check ở **NGINX layer**, trước khi đến WS backend. L4 không làm được.

## TLS cho L7 WebSocket — `wss://`

```nginx
server {
    listen 443 ssl http2;
    server_name chat.example.com;
    
    ssl_certificate     /etc/letsencrypt/live/chat.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chat.example.com/privkey.pem;
    
    location /wsapp {
        proxy_pass http://ws_app;        # backend dùng HTTP plain
        
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host       $host;
        proxy_set_header   X-Forwarded-Proto $scheme;
        
        proxy_read_timeout 1h;
    }
}
```

Client:

```javascript
const ws = new WebSocket('wss://chat.example.com/wsapp');
```

NGINX terminate TLS, decrypt WS frame, forward đến backend qua HTTP plain. Phổ biến và **recommended** cho production.

## Bẫy thường gặp (L7 WebSocket)

| Bẫy | Hệ quả | Cách tránh |
|---|---|---|
| Quên `proxy_http_version 1.1` | WS không upgrade — 426 hoặc 200 | Phải set |
| Quên 2 header `Upgrade`/`Connection` | Backend không nhận WS request | Phải set đủ 2 |
| Forward `Connection: $http_connection` | Lỗi nếu client gửi giá trị lạ | Hardcode `"upgrade"` hoặc dùng map |
| `proxy_read_timeout` default (60s) | WS cắt sau 60s idle | Set ≥ 1h |
| `proxy_buffering on` (default) | Message delay | `proxy_buffering off` cho streaming/WS |
| Bật cache cho path WS | Không hợp lý, có thể conflict | `proxy_cache off` cho path WS |
| Mix `$http_upgrade` insecure | h2c smuggling attack | Dùng `map` an toàn |

## Bật `proxy_buffering off` khi cần real-time

Mặc định NGINX buffer response. Cho WebSocket frame thường nhỏ và real-time, **tắt** buffer:

```nginx
location /wsapp {
    proxy_pass http://ws_app;
    proxy_buffering off;       # ← gửi frame ngay, không buffer
    # ...
}
```

> WS frame thường nhỏ — buffer không có lợi, chỉ tăng latency.

## Tóm tắt bài 5 + phase-5

- L7 WebSocket cần **4 directive**: `proxy_http_version 1.1`, `Upgrade $http_upgrade`, `Connection "upgrade"`, `proxy_read_timeout 1h`.
- Cho phép **path routing** (`/wsapp` vs `/wschat`) và serve HTML cùng port — pattern phổ biến.
- 2 TCP connection: client-NGINX và NGINX-backend, tách biệt nhưng nối logic.
- Mix HTTP+WS+SPA cùng port = config production thực.
- Auth check qua `auth_request` chỉ có ở L7.
- Tắt `proxy_buffering off` cho WS real-time.
- Map `$connection_upgrade` an toàn hơn forward `$http_connection`.

**Bài kế tiếp** → [Phase 6 — Bài 1: Scale NGINX — câu hỏi thường gặp](../phase-6/01-scale-nginx.md)
