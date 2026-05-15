# Bài 3: Spin up WebSocket Server với Node.js

## Code WebSocket Server

```javascript
// index.js
const http = require('http');
const WebSocketServer = require('websocket').server;

const PORT = process.argv[2] || 8080;  // Port từ command line argument

// Tạo HTTP server (WebSocket cần HTTP làm nền)
const httpServer = http.createServer();

// Tạo WebSocket server trên HTTP server
const wsServer = new WebSocketServer({ httpServer });

httpServer.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});

// Xử lý WebSocket connections
wsServer.on('request', (request) => {
  // Accept connection từ bất kỳ origin
  const connection = request.accept(null, request.origin);

  // Xử lý messages
  connection.on('message', (message) => {
    const data = message.utf8Data;
    console.log(`Received: ${data}`);

    // Echo back với thông tin server
    connection.send(`Received your message: "${data}" on port ${PORT}`);
  });

  connection.on('close', () => {
    console.log('Connection closed');
  });
});
```

```bash
npm init -y
npm install websocket
```

---

## Chạy Multiple Servers

```bash
# 4 WebSocket servers trên 4 ports
node index.js 2222 &
node index.js 3333 &
node index.js 4444 &
node index.js 5555 &
```

---

## Test từ Browser Console

```javascript
// Mở browser DevTools → Console
const ws = new WebSocket('ws://localhost:2222');

// Listen for messages
ws.onmessage = (event) => console.log(event.data);

// Send message
ws.send('Hello from browser!');
// → "Received your message: "Hello from browser!" on port 2222"
```

**Kiểm tra trong Network tab:**
- Status: `101 Switching Protocols`
- Protocol: `websocket`

---

## Tại sao quan tâm đến port trong response?

Khi đặt NGINX làm proxy:
```
Browser → NGINX → [Backend 2222 hoặc 3333 hoặc 4444 hoặc 5555]
```

Response chứa port → biết được request đã đi đến backend nào → Xác nhận load balancing hoạt động!

---
**Tiếp theo:** Bài 4 - Configure NGINX Layer 4 WebSocket Proxy →
