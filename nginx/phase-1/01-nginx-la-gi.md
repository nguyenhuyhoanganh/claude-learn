# Bài 1: NGINX là gì?

## NGINX - Web Server

NGINX lắng nghe trên HTTP endpoint và serve web content:
- **Static content**: HTML, CSS, JS, images
- **Dynamic content**: Thông qua CGI/FCGI

Nhiều người dùng NGINX chỉ cho mục đích này, nhưng nó còn nhiều hơn thế.

---

## NGINX - Reverse Proxy

Reverse proxy là một server đứng trước các backend servers, nhận request từ client và forward đến backend phù hợp.

```
Internet → NGINX (Reverse Proxy) → Backend Servers
```

### Các use cases của Reverse Proxy:

**1. Load Balancing**
```
Client → NGINX → Backend 1
               → Backend 2
               → Backend 3
(Phân phối request đều giữa các backends)
```

**2. Backend Routing**
```
/app1  → Backend servers A
/app2  → Backend servers B
/v1    → Version 1 servers
/v2    → Version 2 servers
```

**3. Caching**
```
Client A → NGINX → Backend (lấy response)
Client B → NGINX → [cache hit!] → Không cần gọi backend
```
Giảm latency, giảm tải cho backend.

**4. API Gateway**
- Rate limiting (chặn client gọi quá nhiều request)
- API versioning
- Authentication/Authorization

---

## Proxy vs Reverse Proxy

```
Proxy (Forward Proxy):
Client → Proxy → Server
Server chỉ thấy Proxy, không biết Client thực sự là ai

Reverse Proxy:
Client → Reverse Proxy → Backend
Client chỉ thấy Reverse Proxy, không biết Backend thực sự là đâu
```

- **Forward Proxy**: Server không biết Client
- **Reverse Proxy**: Client không biết Backend (Server không biết Client gốc)

---

## Tóm tắt

```
NGINX có thể làm:
├── Web Server           → Serve static/dynamic content
├── Reverse Proxy        → Forward request đến backend
│   ├── Load Balancer    → Phân phối request
│   ├── Backend Routing  → Route theo path/header
│   ├── Caching          → Cache responses
│   └── API Gateway      → Rate limit, auth, versioning
```

---
**Tiếp theo:** Bài 2 - NGINX Use Cases →
