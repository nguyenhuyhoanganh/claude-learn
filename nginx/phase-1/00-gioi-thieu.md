# NGINX Crash Course - Giới thiệu khóa học

## NGINX là gì?

NGINX là một **open-source web server** viết bằng C, có thể hoạt động như:
- Web server (serve static/dynamic content)
- Reverse proxy
- Load balancer

## Nội dung khóa học

```
Phase 1: Fundamentals
├── NGINX là gì?
├── NGINX Use Cases
├── Layer 4 vs Layer 7 Proxying
├── TLS Termination vs TLS Passthrough
└── NGINX Internal Architecture

Phase 2: Chạy NGINX trong Docker
├── Tổng quan kiến trúc
├── NGINX WebServer Container
├── Three Node App Containers + NGINX
├── Two NGINX Containers Load Balancing
└── Docker Networking

Phase 3: NGINX Timeouts
├── Frontend Timeouts (Client ↔ NGINX)
└── Backend Timeouts (NGINX ↔ Upstream)

Phase 4: More NGINX Configurations
├── NGINX as Web Server
├── NGINX as Layer 7 Proxy
├── NGINX as Layer 4 Proxy
├── Enable HTTPS
├── Enable TLS 1.3
└── Enable HTTP/2

Phase 5: WebSockets with NGINX
├── Introduction to WebSockets
├── Layer 4 vs Layer 7 WebSocket Proxying
├── Spin up WebSocket Server
├── Layer 4 WebSocket Proxy
└── Layer 7 WebSocket Proxy

Phase 6: Q&A và Bonus
├── How to Scale NGINX
├── How Many Backends
├── Proxy vs Reverse Proxy
└── NGINX Limitations (→ Cloudflare)
```

## Khái niệm Frontend vs Backend trong NGINX

> Đây là 2 khái niệm quan trọng cần phân biệt trong NGINX:

```
Client ──→ [Frontend] ──→ NGINX ──→ [Backend] ──→ Upstream Server
```

- **Frontend**: Giao tiếp giữa Client và NGINX (client side)
- **Backend**: Giao tiếp giữa NGINX và Upstream servers

Khi nói "frontend timeout" → timeout phía client-NGINX
Khi nói "backend timeout" → timeout phía NGINX-upstream

**Lưu ý:** "Frontend" ở đây KHÔNG phải React/Vue/HTML app của bạn.

---
**Tiếp theo:** Bài 1 - NGINX là gì →
