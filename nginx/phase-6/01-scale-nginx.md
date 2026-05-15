# Bài 1: How to Scale NGINX?

## Tại sao NGINX cần Scale?

NGINX nhận toàn bộ traffic → Single box có giới hạn:

**Resources bị consume:**
```
Mỗi client connection:
├── Memory: TCP state, TLS session keys, buffers
├── CPU: TLS encryption/decryption, HTTP parsing
└── File descriptors: 1 per connection

Với 10,000 connections:
├── 10,000 × TLS session states
├── 10,000 × socket buffers
└── CPU: decrypt + parse + proxy tất cả requests
```

**Khi NGINX overloaded:**
- Request queue grows
- New connections rejected
- Latency tăng đột biến

---

## Các Approach để Scale NGINX

### 1. Vertical Scaling (Scale Up)

```
Trước: 4 cores, 8GB RAM
Sau:   16 cores, 32GB RAM

Kết quả: NGINX tự động tạo thêm workers (auto mode)
```

**Ưu điểm:** Đơn giản, không thay đổi architecture
**Nhược điểm:** Có giới hạn vật lý, single point of failure

---

### 2. Horizontal Scaling (Scale Out)

Nhiều NGINX instances, mỗi cái trên machine riêng:

**Option A: DNS Round Robin**
```
mysite.com → A record: 1.2.3.4 (Machine 1 - NGINX 1)
           → A record: 5.6.7.8 (Machine 2 - NGINX 2)
           → A record: 9.0.1.2 (Machine 3 - NGINX 3)

DNS distributes clients across NGINX instances!
```

**Option B: Anycast IP**
```
Multiple NGINX instances share 1 IP address
Network routing (BGP) → nearest NGINX instance
(Used by Cloudflare, Google, etc.)
```

**Option C: L4 Load Balancer (AWS ELB, etc.)**
```
Client → AWS ELB → NGINX 1
                 → NGINX 2
                 → NGINX 3
                       ↓
                  Backends
```

---

### 3. Optimize Single NGINX Instance

Trước khi scale, tối ưu NGINX:

```nginx
worker_processes auto;         # 1 per CPU core

events {
    worker_connections 65535;  # Tăng max connections per worker
    use epoll;                 # Linux: Efficient event model
    multi_accept on;           # Accept multiple connections at once
}

http {
    keepalive_timeout 65;
    keepalive_requests 1000;   # Tăng requests per keepalive connection

    # Upstream keepalive (reuse backend connections)
    upstream backend {
        server backend1:8080;
        keepalive 32;          # Keep 32 idle connections per worker
    }
}
```

---

## Không Scale khi không cần!

> "Don't scale NGINX just because you can. Squeeze as much power from a single box first."

**Khi nào thực sự cần scale:**
- CPU consistently > 80%
- Memory pressure (OOM errors)
- Connection queue backup
- Response time degradation under load

**Load testing trước khi quyết định:**
```bash
# Test với wrk
wrk -t12 -c400 -d30s http://localhost/

# Test với ab
ab -n 10000 -c 100 http://localhost/
```

---

## NGINX vs Backends: Bottleneck ở đâu?

```
Client → NGINX → Backend

NGINX bottleneck:
├── CPU (encryption heavy)
├── Memory (connection states)
└── Network bandwidth

Backend bottleneck (thường xảy ra trước):
├── Business logic processing
├── Database queries
└── File I/O
```

Thường **backends** là bottleneck trước NGINX. Monitor cả 2!

---
**Tiếp theo:** Bài 2 - How Many Backends? →
