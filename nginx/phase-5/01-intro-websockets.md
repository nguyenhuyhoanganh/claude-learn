# Bài 1: WebSocket protocol — vì sao tồn tại và hoạt động ra sao?

WebSocket trở thành tiêu chuẩn cho **full-duplex communication** trong browser. Chat, multiplayer game, live feed, collaborative editor — tất cả đều dùng WebSocket. Phase này dạy cách **scale WebSocket bằng NGINX** — bài toán không tầm thường vì WebSocket là **stateful**.

Bài 1 đặt nền tảng: WebSocket là gì, vì sao tồn tại, handshake hoạt động ra sao. Không hiểu protocol = không thể proxy đúng.

## Bài toán gốc — HTTP không đủ

### HTTP/1.0 — connection cho mỗi request

```text
Client                          Server
   │                              │
   │ TCP handshake ──────────────►│
   │ GET /index.html ────────────►│
   │ ◄──────────── 200 OK + HTML  │
   │ FIN ────────────────────────►│   (close)
   │                              │
   │ TCP handshake ──────────────►│   (open lại)
   │ GET /style.css ─────────────►│
   │ ◄──────────── 200 OK + CSS   │
   │ FIN ────────────────────────►│
   ...
```

Mỗi request 1 TCP connection → overhead cực lớn. Web 1990s đơn giản, không sao. Web 2000s+ với hàng chục asset/page → nghẹt thở.

### HTTP/1.1 — keep-alive

```text
Client                          Server
   │ TCP handshake ──────────────►│
   │ GET /index.html ────────────►│
   │ ◄──────────── 200 OK         │
   │ GET /style.css ─────────────►│
   │ ◄──────────── 200 OK         │
   │ ...                           │
   │ (giữ connection, dùng cho nhiều request)
   │ FIN ────────────────────────►│   (chỉ close khi 1 bên muốn)
```

Tốt hơn. Nhưng vẫn là **request-response một chiều** — client phải hỏi, server mới trả. Server không thể **chủ động** gửi cho client.

### Vấn đề chat / live notification

Muốn build chat app:
- User A gửi tin → server.
- Server cần **đẩy** tin xuống user B.

HTTP không có cơ chế đẩy. Workaround:
- **Polling**: client hỏi server mỗi 1s "có tin mới không?". → tốn bandwidth, tốn server, latency 1s.
- **Long polling**: client hỏi, server giữ request không response cho đến khi có tin mới. → ít tốn hơn nhưng vẫn không clean.
- **Server-Sent Events (SSE)**: server đẩy được, nhưng chỉ 1 chiều (server → client).

→ Cần protocol **2 chiều, real-time, không polling**. Đó là WebSocket.

## WebSocket — connection nâng cấp từ HTTP

```text
Client                          Server
   │                              │
   │ TCP handshake ──────────────►│
   │                              │
   │ GET /chat HTTP/1.1           │
   │ Upgrade: websocket           │
   │ Connection: Upgrade ────────►│
   │                              │
   │ ◄── HTTP/1.1 101 Switching   │
   │     Upgrade: websocket       │
   │                              │
   │═══ WebSocket protocol ═══════│
   │                              │
   │ ──message A──────────────────►
   │                              │
   │ ◄──message B (server push)── │
   │ ◄──message C (push lại)──── │
   │                              │
   │ ──message D──────────────────►
   │                              │
   │ (bidirectional, full-duplex)│
   │                              │
   │ FIN ────────────────────────►│
```

WebSocket **không phải protocol mới hoàn toàn** — nó **upgrade** một HTTP connection lên giao thức binary 2 chiều. Sau handshake, TCP connection trở thành **dumb pipe** chuyển message qua lại, **không còn rules HTTP**.

## WebSocket handshake — chi tiết

### Client gửi

```text
GET /chat HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
Sec-WebSocket-Protocol: chat, super-chat
Origin: http://example.com
```

Header quan trọng:

| Header | Ý nghĩa |
|---|---|
| `Upgrade: websocket` | Yêu cầu nâng cấp lên WebSocket |
| `Connection: Upgrade` | Báo NGINX/server "connection này cần upgrade" |
| `Sec-WebSocket-Key` | Random nonce base64, để verify server hỗ trợ WS |
| `Sec-WebSocket-Version` | Version protocol (13 là current) |
| `Sec-WebSocket-Protocol` | Sub-protocol (optional) — vd "chat", "graphql-ws", "stomp" |
| `Origin` | CORS-like check, server có thể reject từ origin lạ |

### Server reply

```text
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
Sec-WebSocket-Protocol: chat
```

`101 Switching Protocols` = "OK, chuyển sang WebSocket". Browser/client **không tiếp tục dùng HTTP** trên connection này — chuyển sang WS framing.

`Sec-WebSocket-Accept` = base64 SHA-1 của `Sec-WebSocket-Key + magic-string`. Verify server thực sự hỗ trợ WS, không phải HTTP server bình thường response 101 nhầm.

> Đây là **lý do WS phải qua HTTP**: tận dụng infrastructure HTTP hiện có (firewall, proxy, port 80/443). Nếu thiết kế từ đầu sẽ phức tạp hơn việc deploy.

## WebSocket frame format

Sau handshake, mọi data đi theo **frame**:

```text
   ┌─┬─┬─┬─┬───────┬─┬─────────────┬─────────────────────────────┐
   │F│R│R│R│ opcode│M│payload len  │ extended payload length      │
   │I│S│S│S│  (4)  │A│    (7)      │   (16 or 64 bit, optional)   │
   │N│V│V│V│       │S│             │                               │
   │ │1│2│3│       │K│             │                               │
   ├─┴─┴─┴─┴───────┴─┴─────────────┴─────────────────────────────┤
   │ Masking-key (if MASK set, 32 bit)                            │
   ├─────────────────────────────────────────────────────────────┤
   │                  Payload Data ...                            │
   └─────────────────────────────────────────────────────────────┘
```

- **FIN** — frame cuối của message (1 message có thể chia thành nhiều frame).
- **opcode** — loại frame: text (0x1), binary (0x2), close (0x8), ping (0x9), pong (0xA).
- **MASK** — client-to-server bắt buộc mask (XOR với key) để chống cache poisoning. Server→client không mask.
- **payload** — message thực sự.

> Engineer thường không tự parse frame — dùng library (`ws` cho Node.js, `websockets` cho Python, `tokio-tungstenite` cho Rust). Hiểu cấu trúc để debug khi cần.

## URL scheme

- `ws://` — WebSocket plain (qua HTTP).
- `wss://` — WebSocket secure (qua HTTPS, TLS).

```javascript
const ws = new WebSocket('wss://api.example.com/chat');
```

Production **luôn dùng `wss://`** — vì lý do tương tự `https://`.

## So sánh — WebSocket vs HTTP polling vs SSE

| | HTTP polling | Long polling | SSE | WebSocket |
|---|---|---|---|---|
| Hướng | Client → Server | Client → Server (delay) | Server → Client | 2 chiều |
| Real-time | Không (delay = poll interval) | Gần thật | Tốt | Tốt nhất |
| Overhead | Cao (request liên tục) | Trung | Thấp | Thấp |
| Bandwidth | Cao | Trung | Thấp | Thấp |
| Complexity | Đơn giản | Trung | Trung | Cao (cần WS library) |
| Browser support | Mọi browser | Mọi browser | Mọi modern | Mọi modern (IE10+) |
| Stateful | Không | Không | Có (kết nối kéo dài) | Có |
| Through firewall | Dễ | Dễ | Dễ | Cần WS-aware proxy |

→ WebSocket **không phải thay thế** HTTP. Chỉ dùng khi cần 2-chiều real-time. API REST thông thường vẫn HTTP.

## Use case kinh điển của WebSocket

| Use case | Vì sao WS phù hợp |
|---|---|
| Chat (1-1, group) | 2 chiều real-time, low latency |
| Live notification (push) | Server đẩy event cho client subscribe |
| Multiplayer game (input sync) | Latency thấp + bidirectional |
| Collaborative editor (Google Docs) | Cập nhật real-time |
| Live dashboard (stocks, metrics) | Server push update liên tục |
| Auction, bidding | Real-time price update |
| Trading platform | Order book update + place order |

### Khi nào KHÔNG dùng WebSocket

| Use case | Pattern phù hợp hơn |
|---|---|
| API CRUD thông thường | REST + HTTP/2 |
| File upload | HTTP multipart |
| Video stream | WebRTC (UDP) / HLS |
| Large data transfer | HTTP/2 streaming, chunked transfer |
| Public broadcast 1-N (live blog) | SSE — đơn giản hơn |
| Mobile background sync | Push notification (APNs/FCM) — WS chết khi app background |

## Stateful — bài toán scale

> **Quan trọng**: WebSocket connection **stateful** — message phụ thuộc state trước, server có thể giữ user context trong RAM.

Hệ quả với load balancer:

```text
HTTP (stateless):
   Request 1 → backend1 (OK)
   Request 2 → backend2 (cũng OK, mỗi request độc lập)
   Request 3 → backend3 (OK)

WebSocket (stateful):
   Connection mở → backend1 (chọn 1 lần)
   Message 1 → bắt buộc về backend1
   Message 2 → bắt buộc về backend1
   ...
   Connection close → release
```

→ LB phải **sticky** ở mức **connection**, không mức request. NGINX Layer 4 sticky tự nhiên. Layer 7 cần config riêng.

### Scaling pain points

- **Một server giữ N connection** = N user. Mỗi connection ~vài KB state. 100k connection = vài trăm MB RAM.
- **File descriptor limit** — mỗi connection 1 fd. Default ulimit thường 1024 — chỉnh thành 65535+.
- **Server crash = mất N connection**. Client phải retry, mất state phiên.
- **Pub-sub giữa các server** — User A trên server1, user B trên server2. A gửi tin → server1 phải đẩy đến server2 → user B. Cần Redis Pub/Sub hoặc message broker.

→ Đây là bài toán mà các phase tiếp đào sâu cùng NGINX.

## Tóm tắt bài 1

- WebSocket = protocol full-duplex, real-time qua TCP. Bắt đầu bằng HTTP `Upgrade` handshake, sau đó chuyển sang WS framing.
- Khác HTTP/SSE/polling: 2 chiều, server có thể push, stateful, low overhead.
- Schema `ws://` (plain) hoặc `wss://` (TLS).
- Use case: chat, game, collaborative, live notification.
- Stateful = bài toán scale phức tạp — sticky LB, shared state qua Redis.

**Bài kế tiếp** → [Bài 2: Layer 4 vs Layer 7 proxy cho WebSocket](02-layer4-vs-layer7-websocket.md)
