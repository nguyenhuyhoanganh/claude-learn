# Bài 2: NGINX Use Cases - Vấn đề và Giải pháp

## Kiến trúc hiện tại (Current Architecture) - Vấn đề

Giả sử bạn có một Node.js app lắng nghe trên Port 3001:

```
Client → App (Port 3001) → Database
```

**Khi traffic tăng, bạn nghĩ đến:**
```
Client → App 1 (Port 3001) → Database
       → App 2 (Port 3002)
       → App 3 (Port 3003)
```

**Nhưng vấn đề:**
1. **Client phải biết nhiều ports** → Không scalable, "yucky"
2. **HTTPS**: Phải copy certificate vào TẤT CẢ servers
3. **Single machine**: Nếu machine chết → tất cả chết
4. **Không có health check**: Client không biết server nào đang down

---

## Kiến trúc mong muốn (Desired Architecture)

```
Client → NGINX (1 endpoint) → Backend 1 (Port 3001)
                            → Backend 2 (Port 3001)
                            → Backend 3 (Port 3001)
```

**NGINX giải quyết tất cả:**
- **1 endpoint**: Client chỉ cần biết NGINX
- **HTTPS/TLS**: Chỉ cần certificate ở NGINX
- **Load balancing**: NGINX phân phối request
- **Health check**: NGINX kiểm tra backend còn sống không
- **Hide backend**: Client không biết backend thực sự là đâu

---

## Frontend vs Backend trong NGINX

```
Client ─── [NGINX Frontend] ─── NGINX ─── [NGINX Backend] ─── Upstream
         (Client-NGINX side)              (NGINX-Upstream side)
```

| | Frontend | Backend |
|--|---------|---------|
| **Là gì** | Giao tiếp Client ↔ NGINX | Giao tiếp NGINX ↔ Upstream |
| **Ví dụ** | Client gửi request đến NGINX | NGINX forward đến backend app |
| **Config** | `client_*` directives | `proxy_*` directives |

> **Quan trọng:** "Frontend" ở đây ≠ React/Vue/HTML app.
> "Frontend" = Phía client của NGINX connection.

---

## Lợi ích của Reverse Proxy

```
Không có Reverse Proxy:
- Certificate → cần trên từng server
- Health check → client phải tự handle
- Scale → phức tạp, client-aware
- HTTPS → expose từng server

Có Reverse Proxy (NGINX):
- Certificate → chỉ cần ở NGINX
- Health check → NGINX tự handle
- Scale → transparent với client
- HTTPS → chỉ NGINX cần cert (backend có thể HTTP)
```

---
**Tiếp theo:** Bài 3 - Layer 4 vs Layer 7 →
