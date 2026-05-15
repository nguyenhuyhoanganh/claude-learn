# Bài 3: NGINX Limitations - Tại sao Cloudflare tự build Proxy?

## Architecture Limitation: Per-Worker Connection Pools

NGINX có một hạn chế fundamental trong architecture:

```
NGINX Worker 1 ──→ Connection Pool 1 ──→ Backend
NGINX Worker 2 ──→ Connection Pool 2 ──→ Backend
NGINX Worker 3 ──→ Connection Pool 3 ──→ Backend
NGINX Worker 4 ──→ Connection Pool 4 ──→ Backend

Workers KHÔNG share connection pools!
```

**Hậu quả:**

```
Giả sử: 4 workers, 32 keepalive connections mỗi worker
→ NGINX có thể có 4 × 32 = 128 backend connections

Nhưng backend thấy: 128 connections từ NGINX!
Rất chatty với backend.
```

---

## Tại sao Cloudflare Cần Khác?

Cloudflare là CDN toàn cầu:
- Hàng tỷ requests/ngày
- Hàng nghìn backend servers
- Edge locations khắp thế giới

Với NGINX:
```
Cloudflare Edge → Backend servers
4 workers × 32 keepalive × nhiều edge nodes = Hàng triệu idle connections đến backends!
```

**Vấn đề:**
- Backends bị flood bởi idle connections
- Memory waste trên backend side
- Connection limits bị hit nhanh

**Cloudflare cần:** Global shared connection pool cross tất cả workers.

---

## Giải pháp: Cloudflare Pingora (2022)

Cloudflare build proxy riêng bằng Rust: **Pingora**

```
Pingora:
├── Shared connection pool across all workers/threads
├── Reuse connections thông minh hơn
├── Giảm số connections đến backends
└── Better memory efficiency
```

**Kết quả claim:**
- 160 billion requests/day xử lý hiệu quả hơn
- 87.5% giảm connections đến origins
- 2× faster

---

## NGINX Limitations Khác

### 1. Configuration Model
- Config thay đổi → cần reload
- Không dynamic config thay đổi không cần reload
- Nginx Plus (commercial) có dynamic upstream management

### 2. Single Config File
- Không built-in support cho distributed config
- Phải dùng external tools (Ansible, Chef, etc.)

### 3. No Native Circuit Breaker
- NGINX có health checks nhưng không có circuit breaker pattern
- Phải implement ở application layer

### 4. Limited Observability
- Metrics cơ bản trong open source
- Full metrics/tracing → Nginx Plus hoặc OpenTelemetry setup

---

## Khi nào NGINX vẫn là lựa chọn tốt?

NGINX vẫn excellent cho:
- Websites và web apps thông thường
- API gateways ở scale vừa
- Static file serving
- TLS termination
- Reverse proxy cho microservices

Chỉ cần alternative (Envoy, Caddy, Pingora) khi:
- Scale cực lớn (millions of backend connections)
- Need dynamic configuration without reload
- Complex service mesh requirements

---

## Summary: NGINX vs Alternatives

| | NGINX | Envoy | Caddy | HAProxy |
|--|-------|-------|-------|---------|
| **Language** | C | C++ | Go | C |
| **Config** | Static | Dynamic xDS | Auto HTTPS | Static |
| **Primary use** | Web server + proxy | Service mesh | Simple setup | HA Load Balancer |
| **Connection pooling** | Per-worker | Global | Global | Per-process |
| **Scale** | Very high | Extreme | High | Very high |

---
**Tiếp theo:** Bài 4 - Course Summary →
