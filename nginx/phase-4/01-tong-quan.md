# Phase 4: More NGINX Configurations - Tổng quan

## Chúng ta sẽ làm gì?

Trong phase này, chúng ta sẽ cấu hình NGINX để làm nhiều thứ khác nhau:

```
1. NGINX as Web Server
   → Serve static files

2. NGINX as Layer 7 Proxy
   → Load balance HTTP traffic
   → Path-based routing (/app1 → backend A, /app2 → backend B)
   → Block certain paths (/admin)
   → IP hash sticky sessions

3. NGINX as Layer 4 Proxy
   → Blind TCP tunneling
   → Any protocol (HTTP, WebSocket, gRPC, etc.)

4. Enable HTTPS
   → Let's Encrypt certificate
   → ssl_certificate + ssl_certificate_key

5. Enable TLS 1.3
   → Disable TLS 1.2 (more secure)

6. Enable HTTP/2
   → Multiplexing trên 1 TCP connection
```

## Setup: 4 Node.js Backends

```bash
# Spin up 4 Node.js apps trên các ports khác nhau
docker run --name app1 -p 2222:9999 -e APP_ID=2222 -d node-app
docker run --name app2 -p 3333:9999 -e APP_ID=3333 -d node-app
docker run --name app3 -p 4444:9999 -e APP_ID=4444 -d node-app
docker run --name app4 -p 5555:9999 -e APP_ID=5555 -d node-app
```

Mỗi app respond với: `"I am app {APP_ID}"`

---
**Tiếp theo:** Bài 1 - NGINX as Web Server →
