# Bài 1: Introduction to WebSockets

## HTTP Evolution

### HTTP/1.0 (original)
```
Client → [TCP connect] → GET /index.html → Response → [TCP close]
Client → [TCP connect] → GET /style.css  → Response → [TCP close]
Client → [TCP connect] → GET /image.png  → Response → [TCP close]
```
Mỗi request = 1 TCP connection mới → Rất tốn kém!

### HTTP/1.1 (Keep-Alive)
```
Client → [TCP connect]
       → GET /index.html → Response
       → GET /style.css  → Response  (cùng TCP connection!)
       → GET /image.png  → Response
       → [TCP close khi idle timeout]
```
1 connection, nhiều requests → Better!

### Vấn đề của HTTP: Request-Response
```
Client → Request → Server
Client ← Response ← Server
[Connection idle... chờ client gửi request tiếp]

Server KHÔNG THỂ tự gửi data khi không có request từ client!
```

---

## WebSocket Protocol

> **Full Duplex**: Cả 2 bên có thể gửi data bất kỳ lúc nào.

### WebSocket Handshake

```
Client → TCP connect → Server
Client → HTTP GET /chat HTTP/1.1
         Connection: Upgrade
         Upgrade: websocket
         Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
         ...
Server → HTTP/1.1 101 Switching Protocols
         Upgrade: websocket
         Connection: Upgrade
         Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

Sau 101 → TCP connection trở thành **WebSocket pipe** (không còn HTTP rules).

### WebSocket Communication
```
Client ↔ Server (bidirectional, any time)

Server → "New message from Alice: Hello!"
Client → "Reply from Bob: Hi!"
Server → "User joined: Charlie"
Client → "Bob sends file..."
```

---

## WebSocket URL

```
ws://localhost:8080/chat      ← Unencrypted
wss://localhost:8443/chat     ← Over TLS (like HTTPS)
```

---

## Use Cases

| Use Case | Tại sao WebSocket? |
|----------|-------------------|
| **Chat applications** | Bidirectional, real-time |
| **Live feeds** | Server push events |
| **Multiplayer games** | Low latency, bidirectional |
| **Collaboration tools** | Real-time sync |
| **Stock tickers** | Server push prices |
| **Progress updates** | Server push status |

**Khi nào KHÔNG dùng WebSocket:**
- Simple request-response → HTTP là đủ
- One-way server push → Server-Sent Events (SSE) nhẹ hơn
- Large bandwidth/video streaming → WebRTC (UDP-based)

---

## WebSocket là Stateful!

```
HTTP (Stateless):
Request 1 → Server A
Request 2 → Server B  ← OK! Independent requests
Request 3 → Server C

WebSocket (Stateful):
WS Connect → Server A (pinned!)
Message 1  → Server A
Message 2  → Server A (phải là A!)
Message 3  → Server A
```

**Scaling challenge:** Mỗi WebSocket connection phải luôn đi cùng 1 server.
Nếu switch server giữa chừng → connection break!

---
**Tiếp theo:** Bài 2 - Layer 4 vs Layer 7 WebSocket Proxying →
