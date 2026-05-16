# Bài 2: Layer 4 vs Layer 7 WebSocket Proxying

## Layer 4 Proxying cho WebSocket

```
Client ──TCP──→ NGINX (Layer 4) ──TCP tunnel──→ WS Server

Quy trình:
1. Client → TCP SYN → NGINX
2. NGINX picks backend, opens TCP to backend
3. NGINX creates NAT mapping: Client port ↔ Backend connection
4. Everything is tunneled blindly
```

### Với TLS (WSS):
```
Client ──[TLS handshake]──→ NGINX ──[forward TLS]──→ Backend
                            (dumb pipe)

TLS handshake goes all the way to backend!
NGINX không thể decrypt gì cả → End-to-end encryption
```

**Ưu điểm Layer 4:**
- End-to-end encryption
- NGINX không cần certificate
- Works với bất kỳ protocol nào

**Nhược điểm:**
- Không thể route theo path (`/chat` vs `/feed`)
- Mỗi connection → 1 dedicated backend connection
- Không thể rewrite headers

---

## Layer 7 Proxying cho WebSocket

```
Client ──[TLS]──→ NGINX ──[New TLS]──→ WS Server
                 (terminate)

Quy trình:
1. Client → TLS handshake với NGINX
2. NGINX decrypt traffic
3. NGINX thấy: "Upgrade: websocket" → upgrade request
4. NGINX opens NEW connection đến backend
5. NGINX sends upgrade request đến backend
6. Backend responds 101 → NGINX responds 101 đến client
7. Hai WebSocket tunnels tách biệt: Client↔NGINX và NGINX↔Backend
```

### Smart Routing (chỉ Layer 7!):
```nginx
location /chat {
    proxy_pass http://chat-backend;
}

location /feed {
    proxy_pass http://feed-backend;
}
```

**Ưu điểm:**
- Path-based routing
- Header manipulation
- Content inspection (bad word filter, etc.)
- Load balancing thông minh hơn

**Nhược điểm:**
- NGINX cần certificate
- Thêm latency (decrypt + re-encrypt)
- NGINX đọc được content

---

## Load Balancing WebSocket

### Tại sao phức tạp hơn HTTP?

```
HTTP (Stateless):
Request 1 → Backend A
Request 2 → Backend B  ← Hoàn toàn OK!

WebSocket (Stateful):
Connect → Backend A → [ALL messages must go to A]
                      Cannot switch to Backend B mid-session!
```

### Load Balancing chỉ ở Connection Level

```
WebSocket Client 1 → Backend A (tất cả messages từ Client 1)
WebSocket Client 2 → Backend B (tất cả messages từ Client 2)
WebSocket Client 3 → Backend A (new connection, round-robin)
```

→ Load balancing per-connection, NOT per-message.

### Với Layer 7:
```nginx
upstream ws-backend {
    server backend1:8080;
    server backend2:8080;
    server backend3:8080;
}

server {
    listen 80;
    location /ws {
        proxy_pass http://ws-backend;
        # Each NEW connection → round-robin to different backend
        # Once connected → always same backend
    }
}
```

---

## So sánh

| | Layer 4 | Layer 7 |
|--|---------|---------|
| **TLS** | Passthrough (end-to-end) | Terminate (NGINX decrypt) |
| **Path routing** | ❌ | ✅ |
| **Certificate needed** | ❌ | ✅ |
| **Connection model** | Client→Backend (1 TCP) | Client→NGINX→Backend (2 TCP) |
| **Load balance per** | Connection | Connection |
| **Content inspection** | ❌ | ✅ |

---
**Tiếp theo:** Bài 3 - Spin up WebSocket Server →
