# Bài 3: Layer 4 vs Layer 7 Load Balancing trong NGINX

## OSI Model - Tổng quan

```
Layer 7 - Application  (HTTP, HTTPS, WebSocket, gRPC)
Layer 6 - Presentation
Layer 5 - Session
Layer 4 - Transport    (TCP/IP - ports, connections)
Layer 3 - Network      (IP addresses)
Layer 2 - Data Link    (MAC addresses)
Layer 1 - Physical     (signals, cables)
```

---

## Layer 4 - Những gì bạn thấy

Ở Layer 4, bạn chỉ thấy **TCP/IP stack**:
- Source IP address
- Destination IP address
- Source port
- Destination port

**Những gì bạn KHÔNG thể thấy:**
- HTTP headers
- URL path (`/api/users`)
- Cookies
- Request body

> **Quan trọng:** Thông tin Layer 4 (IP, ports) **KHÔNG BAO GIỜ** bị mã hóa — bất kỳ sniffer nào cũng có thể thấy.

---

## Layer 7 - Những gì bạn thấy

Ở Layer 7, bạn thấy **tất cả Layer 4 + application content**:
- HTTP method (GET, POST, PUT)
- URL path (`/api/users`, `/app1`, `/admin`)
- HTTP headers (Authorization, Content-Type)
- Cookies
- Request body
- Response body

> **Nhưng để đọc Layer 7, bạn phải decrypt TLS** → NGINX cần certificate + private key.

---

## So sánh Layer 4 vs Layer 7 Proxying

| | Layer 4 | Layer 7 |
|--|---------|---------|
| **Thấy được** | IP + ports | IP + ports + HTTP content |
| **TLS** | Passthrough (không decrypt) | Phải terminate (decrypt) |
| **Routing** | Chỉ theo IP/port | Theo URL, headers, cookies |
| **Connection** | 1 TCP conn end-to-end | Terminate + new conn to backend |
| **Sharing** | Không (1 client = 1 backend) | Có (nhiều clients dùng chung backend conn) |
| **Cache** | Không thể | Có thể |
| **NGINX config** | `stream {}` context | `http {}` context |

---

## Khi nào dùng Layer 4?

- NGINX **không hiểu protocol** của backend
  - PostgreSQL protocol
  - MySQL protocol
  - gRPC (nếu không muốn terminate)
  - WebRTC
- Bạn muốn **end-to-end encryption** (TLS passthrough)
- Bạn muốn **sticky connections** đơn giản

```nginx
# Layer 4 - stream context
stream {
    upstream backend {
        server backend1:5432;
        server backend2:5432;
    }
    server {
        listen 5432;
        proxy_pass backend;
    }
}
```

---

## Khi nào dùng Layer 7?

- Muốn **routing theo URL/headers** (path-based routing)
- Muốn **cache** responses
- Muốn **rewrite** headers/URLs
- Muốn **load balance** thông minh hơn (share connections)
- Muốn **block** certain paths (admin, etc.)

```nginx
# Layer 7 - http context
http {
    upstream backend {
        server backend1:8080;
        server backend2:8080;
    }
    server {
        listen 80;
        location /api {
            proxy_pass http://backend;
        }
        location /admin {
            return 403;
        }
    }
}
```

---

## Trade-off quan trọng

**Layer 7 có giá:**
- Phải terminate TLS → cần certificate
- Phải decrypt → tốn CPU
- Phải parse HTTP → tốn CPU

**Layer 4 đơn giản hơn nhưng:**
- Mỗi client connection → 1 backend connection (không share được)
- Không thể smart routing

---
**Tiếp theo:** Bài 4 - TLS Termination vs TLS Passthrough →
