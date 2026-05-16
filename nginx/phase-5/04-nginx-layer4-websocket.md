# Bài 4: Configure NGINX as Layer 4 WebSocket Proxy

## Cấu hình

```nginx
# tcp.conf
events { }

stream {
    upstream ws-backends {
        server 127.0.0.1:2222;
        server 127.0.0.1:3333;
        server 127.0.0.1:4444;
        server 127.0.0.1:5555;
    }

    server {
        listen 80;
        proxy_pass ws-backends;
    }
}
```

**Chạy NGINX:**
```bash
nginx -c $(pwd)/tcp.conf
```

---

## Test Layer 4 WebSocket Proxy

```javascript
// Browser console
const ws1 = new WebSocket('ws://localhost:80');
ws1.onmessage = (e) => console.log('ws1:', e.data);
ws1.send('Test 1');
// → "ws1: Received your message: "Test 1" on port 5555"

// Gửi nhiều messages trong cùng connection
ws1.send('Test 2');
// → "ws1: ... on port 5555"  ← SAME server! (sticky)
ws1.send('Test 3');
// → "ws1: ... on port 5555"  ← SAME server!

// Tạo connection MỚI
const ws2 = new WebSocket('ws://localhost:80');
ws2.onmessage = (e) => console.log('ws2:', e.data);
ws2.send('Test from ws2');
// → "ws2: ... on port 2222"  ← Different server (round robin!)
```

---

## Tại sao cùng TCP connection → cùng server?

```
Layer 4 = NAT table:
Client IP:Port ↔ Backend IP:Port

Connection ws1:
  127.0.0.1:54321 ↔ 127.0.0.1:5555
  → Tất cả packets từ client port 54321 → port 5555

Connection ws2:
  127.0.0.1:54322 ↔ 127.0.0.1:2222
  → Tất cả packets từ client port 54322 → port 2222
```

NGINX không đọc content → Không biết HTTP hay WebSocket → Chỉ tunnel theo NAT table.

---

## Với TLS: End-to-End Encryption

```nginx
stream {
    upstream ws-backends {
        server 127.0.0.1:2222;
    }

    server {
        listen 443;
        proxy_pass ws-backends;
        # TLS handshake đi thẳng đến backend
        # NGINX không thể đọc gì!
    }
}
```

```javascript
// Browser
const ws = new WebSocket('wss://nginx-test.ddns.net');
// TLS established trực tiếp với backend
// NGINX chỉ forward bytes
```

---

## Timeout Configuration cho Long-Lived Connections

```nginx
stream {
    upstream ws-backends {
        server 127.0.0.1:2222;
    }

    server {
        listen 80;
        proxy_pass ws-backends;

        # Giữ connection alive lâu hơn
        proxy_timeout 3600s;      # 1 giờ idle timeout
        proxy_connect_timeout 5s; # Kết nối đến backend trong 5s
    }
}
```

**Quan trọng:** WebSocket connections tồn tại lâu → cần tăng timeouts!
Không thì NGINX sẽ close connection vì "idle too long".

---
**Tiếp theo:** Bài 5 - Configure NGINX Layer 7 WebSocket Proxy →
