# Bài 3: Build WebSocket server với Node.js — chuẩn bị test NGINX

Để test NGINX làm WebSocket proxy, ta cần một WebSocket server thật. Bài này dựng server đơn giản nhưng đủ để chạy test 2 bài tiếp (L4 và L7 proxy). Nếu đã biết WS server, có thể skip — chỉ cần đảm bảo có 4 instance chạy ở port `2222, 3333, 4444, 5555`.

## Vì sao cần test với 4 server?

Mô phỏng cluster nhiều backend, verify NGINX load balance. Mỗi server tự return port của nó trong response → browser thấy "Received from port 3333" → biết NGINX đã chọn backend nào.

## Code WebSocket server

Tạo `app/index.js`:

```javascript
const http = require('http');
const WebSocketServer = require('websocket').server;

const PORT = process.argv[2] || 8080;

// HTTP server làm nền — WebSocket upgrade từ HTTP
const httpServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`HTTP fallback on port ${PORT}\n`);
});

// WebSocket server gắn vào HTTP server
const wsServer = new WebSocketServer({ httpServer });

httpServer.listen(PORT, () => {
    console.log(`WebSocket server listening on port ${PORT}`);
});

// Xử lý upgrade request
wsServer.on('request', (request) => {
    // Accept từ mọi origin (chỉ test, production cần whitelist)
    const connection = request.accept(null, request.origin);
    
    console.log(`[${PORT}] New connection from ${request.origin}`);
    
    connection.on('message', (message) => {
        if (message.type === 'utf8') {
            const data = message.utf8Data;
            console.log(`[${PORT}] Received: ${data}`);
            connection.sendUTF(`Received "${data}" on port ${PORT}`);
        }
    });
    
    connection.on('close', (reasonCode, description) => {
        console.log(`[${PORT}] Connection closed: ${reasonCode} ${description}`);
    });
});
```

### Phân tích từng phần

| Đoạn | Vai trò |
|---|---|
| `const http = require('http')` | Node built-in HTTP server |
| `require('websocket').server` | Library `websocket` (npm `websocket`) |
| `process.argv[2]` | Đọc port từ command line `node index.js 2222` |
| `http.createServer((req, res) => ...)` | HTTP fallback nếu ai gọi GET / |
| `new WebSocketServer({ httpServer })` | Gắn WS server lên HTTP server |
| `wsServer.on('request', ...)` | Event handler khi có WS upgrade |
| `request.accept(null, request.origin)` | Accept connection, mọi origin (test) |
| `connection.on('message', ...)` | Xử lý message từ client |
| `connection.sendUTF(...)` | Gửi text về client |

## `package.json`

```json
{
  "name": "ws-test-server",
  "version": "1.0.0",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "websocket": "^1.0.34"
  }
}
```

Setup:

```bash
cd app/
npm install
```

## Chạy 1 server trước để verify

```bash
node index.js 2222
# WebSocket server listening on port 2222
```

### Test bằng browser console

Mở Chrome → bất kỳ trang nào → DevTools → Console:

```javascript
const ws = new WebSocket('ws://localhost:2222');

// Event handlers
ws.onopen    = ()    => console.log('Connected');
ws.onmessage = (evt) => console.log('Received:', evt.data);
ws.onerror   = (e)   => console.error('Error:', e);
ws.onclose   = ()    => console.log('Closed');

// Send message
ws.send('Hello WebSocket!');
// → Received: Received "Hello WebSocket!" on port 2222
```

Đồng thời check Network tab:
- Filter "WS" → thấy connection với status `101 Switching Protocols`.
- Click vào → tab "Messages" → thấy frame gửi/nhận.

### Test bằng `wscat` CLI

```bash
npm install -g wscat

wscat -c ws://localhost:2222
# Connected (press CTRL+C to quit)
> Hello
< Received "Hello" on port 2222
> Test 2
< Received "Test 2" on port 2222
```

## Chạy 4 server cho test phase 5

```bash
# Terminal 1
node index.js 2222 &

# Terminal 2
node index.js 3333 &

# Terminal 3
node index.js 4444 &

# Terminal 4
node index.js 5555 &
```

Hoặc dùng `concurrently`:

```bash
npm install -g concurrently
concurrently "node index.js 2222" "node index.js 3333" "node index.js 4444" "node index.js 5555"
```

Hoặc Docker:

```bash
docker build -t ws-server .
docker run -d --name ws1 -p 2222:8080 -e PORT=8080 ws-server
docker run -d --name ws2 -p 3333:8080 -e PORT=8080 ws-server
# ...
```

(Sửa code đọc port từ env var nếu dùng Docker.)

## HTML test page production-like

Browser console hơi mệt. Code 1 file HTML đơn giản:

```html
<!DOCTYPE html>
<html>
<head>
    <title>WS Test</title>
    <style>
        body { font-family: sans-serif; max-width: 600px; margin: 2em auto; }
        #log { 
            border: 1px solid #ccc; padding: 1em; 
            height: 300px; overflow-y: auto;
            background: #f9f9f9; font-family: monospace;
            font-size: 13px;
        }
        input[type=text] { width: 80%; padding: 0.5em; }
        button { padding: 0.5em 1em; }
    </style>
</head>
<body>
    <h1>WebSocket Test</h1>
    <div>
        URL: <input id="url" value="ws://localhost:2222" style="width: 60%">
        <button onclick="connect()">Connect</button>
        <button onclick="disconnect()">Disconnect</button>
    </div>
    <div id="log"></div>
    <div>
        <input id="msg" type="text" placeholder="Type message and press Enter">
    </div>

    <script>
        let ws;
        const log = (m) => {
            const div = document.getElementById('log');
            div.innerHTML += `[${new Date().toLocaleTimeString()}] ${m}<br>`;
            div.scrollTop = div.scrollHeight;
        };

        function connect() {
            const url = document.getElementById('url').value;
            ws = new WebSocket(url);
            ws.onopen    = () => log('Connected to ' + url);
            ws.onmessage = (e) => log('← ' + e.data);
            ws.onclose   = () => log('Disconnected');
            ws.onerror   = (e) => log('Error');
        }

        function disconnect() {
            if (ws) ws.close();
        }

        document.getElementById('msg').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && ws && ws.readyState === WebSocket.OPEN) {
                const m = e.target.value;
                ws.send(m);
                log('→ ' + m);
                e.target.value = '';
            }
        });
    </script>
</body>
</html>
```

Mở file này trong browser (`file://` cũng được). Đổi URL → connect → gửi message → thấy port của server response.

## Test load-balance trực tiếp (no NGINX yet)

Đổi URL trong HTML test:
- `ws://localhost:2222` → connect → gửi "test" → thấy "Received on port 2222".
- Disconnect → đổi URL `ws://localhost:3333` → connect → "Received on port 3333".

→ Verify 4 server đều chạy. Sau đó set NGINX (Bài 4) để route tất cả qua 1 port duy nhất.

## Health check endpoint

Thêm vào server để verify nhanh:

```javascript
const httpServer = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200);
        return res.end(`OK on port ${PORT}\n`);
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`HTTP fallback on port ${PORT}\n`);
});
```

Test:

```bash
curl http://localhost:2222/health
# OK on port 2222
```

→ Hữu ích cho NGINX active health check (cần module bên ngoài hoặc NGINX Plus).

## Lưu ý production WebSocket server

Code trên là **toy server** để học. Production cần:

| Tính năng | Cách làm |
|---|---|
| Authentication | JWT trong query string hoặc subprotocol header |
| Origin whitelist | Check `request.origin` trong `wsServer.on('request')` |
| Rate limit message | Đếm message/giây/user, reject nếu vượt |
| Heartbeat ping-pong | `setInterval(() => ws.ping(), 30000)` |
| Reconnect logic | Client retry với backoff |
| Shared state giữa server | Redis Pub/Sub broadcast |
| Graceful shutdown | Bắt SIGTERM, drain connection trước khi exit |
| Connection limit | `max-old-space-size`, ulimit |

Frameworks giúp:
- **Socket.IO** — abstraction trên WS + fallback long-polling.
- **uWebSockets.js** — performance cao hơn `websocket` library nhiều.
- **ws** library — pure WS, nhẹ.

Khoá học giữ đơn giản với `websocket` library.

## Tóm tắt bài 3

- WebSocket server trong Node.js cần `http.Server` + `websocket` library gắn vào.
- `process.argv[2]` để pass port qua command line → chạy nhiều instance.
- Response chứa port → verify NGINX load balance đúng backend nào.
- Test bằng browser DevTools, `wscat`, hoặc HTML test page.
- 4 server ở port `2222, 3333, 4444, 5555` cho test phase này.
- Production WS cần auth, origin check, heartbeat, reconnect, shared state.

**Bài kế tiếp** → [Bài 4: NGINX as Layer 4 WebSocket proxy](04-nginx-layer4-websocket.md)
