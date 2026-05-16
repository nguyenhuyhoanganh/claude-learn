# Bài 2: Proxy vs Reverse Proxy

## Forward Proxy

> Client dùng proxy để request thay mặt mình.

```
Client → Proxy → Google.com
                  ↑
         Google thấy Proxy, không thấy Client!
```

**Use cases:**
- ISP chặn websites (content filtering)
- Corporate proxy (bảo vệ employees)
- Anonymization (VPN, Tor)
- Cache cho corporate network

**Cấu hình phía client:**
```
Browser Settings → Proxy: corporate-proxy.company.com:8080
```

---

## Reverse Proxy

> Server đứng trước backends, nhận requests thay mặt backends.

```
Client → Reverse Proxy → Backend 1
                       → Backend 2

Client thấy Reverse Proxy, không thấy Backend!
```

**Use cases:**
- Load balancing
- TLS termination
- Caching
- Rate limiting
- API gateway

---

## So sánh

| | Forward Proxy | Reverse Proxy |
|--|---------------|---------------|
| **Phục vụ** | Client | Server |
| **Ai biết ai** | Server không biết Client | Client không biết Backend |
| **Cấu hình phía** | Client | Server |
| **Ví dụ** | VPN, Squid | NGINX, HAProxy, Envoy |

```
Forward Proxy:
[Client] → [Proxy] → [Server]
Server nghĩ client là Proxy

Reverse Proxy:
[Client] → [Reverse Proxy] → [Backend]
Client nghĩ backend là Reverse Proxy
```

---

## NGINX là Reverse Proxy

NGINX không phải là Forward Proxy. NGINX chỉ có thể làm Reverse Proxy.

**Tại sao?** NGINX không có cơ chế để client cấu hình sử dụng NGINX như forward proxy. NGINX luôn đứng trước backends.

---

## CDN: Là Reverse Proxy

Cloudflare, Fastly, AWS CloudFront đều là reverse proxies:

```
Client → CDN Edge (Reverse Proxy) → Origin Server

CDN:
- Cache content tại edge locations
- TLS termination
- DDoS protection
- Serve từ edge gần nhất với client
```

**Lưu ý:** CDN **decrypt** traffic của bạn để cache! Nếu content sensitive, hãy cân nhắc.

---
**Tiếp theo:** Bài 3 - NGINX Limitations →
