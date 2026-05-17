# Bài 2: Proxy vs Reverse Proxy — đào sâu khái niệm

Phase 1 Bài 1 đã giới thiệu 2 khái niệm này. Bài bonus này đào sâu hơn: forward proxy ra sao, vai trò khác nhau, CDN có phải reverse proxy không, VPN vs proxy. Là kiến thức kiến trúc mà mọi backend engineer nên có.

## Định nghĩa rõ ràng — phía nào "ẩn"

```text
Forward Proxy (proxy thường):
   Client ──► [Proxy] ──► Server
              ↑
              Client cấu hình dùng proxy
   
   - Server KHÔNG biết client thật.
   - Server thấy proxy là "client".

Reverse Proxy:
   Client ──► [Reverse Proxy] ──► Backend Server
                                     ↑
                                     Server cấu hình đặt proxy phía trước
   
   - Client KHÔNG biết backend thật.
   - Client thấy reverse proxy là "server".
```

**Cốt lõi**: forward proxy phục vụ **client**, reverse proxy phục vụ **server**.

## Forward proxy — đứng cùng phía với client

Ai cấu hình? **Client** — trong browser settings, hoặc OS network setting, hoặc qua DHCP.

```text
   Browser settings:
   Proxy: corporate-proxy.company.com:8080
   
   → Mọi HTTP request đi qua proxy này thay vì trực tiếp.
```

### Use case 1 — Corporate proxy

```text
   Employee laptop ──► Corporate Proxy ──► Internet
                           │
                           ├── Log truy cập
                           ├── Block facebook.com (giờ làm việc)
                           ├── Cache content (giảm bandwidth)
                           └── Scan virus (DLP)
```

Tổ chức kiểm soát internet traffic của nhân viên. Mọi bên trong dùng cùng IP egress.

### Use case 2 — ISP / Government proxy

Một số chính phủ buộc ISP dùng proxy filter content. Hoặc ISP có proxy cache để giảm bandwidth uplink.

```text
   User (Vietnam) ──► ISP Proxy ──► youtube.com
                          │
                          └── Filter / cache / log
```

### Use case 3 — VPN/Anonymizer

```text
   User ──► VPN server (Switzerland) ──► destination
   
   Server thấy: VPN switzerland.
   Server không biết: user thật ở Vietnam.
```

VPN technically là 1 dạng forward proxy (tunnel toàn bộ traffic).

### Use case 4 — Privacy/security tool (Tor)

Multi-hop proxy: client → relay 1 → relay 2 → relay 3 → destination. Không relay nào biết cả client thật + destination.

## Reverse proxy — đứng cùng phía với server

Ai cấu hình? **Server admin** — set NGINX/HAProxy đứng trước backend.

```text
   User ──► NGINX (api.example.com) ──► backend instances
                                            ├── 10.0.0.1
                                            ├── 10.0.0.2
                                            └── 10.0.0.3
```

### Use case 1 — Load balancing

Phổ biến nhất. Đã học kỹ.

### Use case 2 — TLS termination

NGINX terminate TLS, backend nói HTTP plain. Đã học.

### Use case 3 — Caching layer

```text
   User ──► CDN edge (reverse proxy) ──► Origin
                │
                └── Cache 99% request, không gọi origin
```

CDN là reverse proxy + cache. Cloudflare, Fastly, Akamai, AWS CloudFront.

### Use case 4 — API Gateway

Kong, Tyk, AWS API Gateway = reverse proxy với feature đặc thù API:
- Auth (API key, OAuth, JWT).
- Rate limit per consumer.
- Versioning.
- Transform request/response.
- Aggregation (call nhiều backend, merge response).

### Use case 5 — Ingress (Kubernetes)

```text
   External traffic ──► Ingress controller (NGINX, Istio gateway) ──► Service ──► Pod
```

Reverse proxy đứng trước K8s cluster, route theo host/path → Service nội bộ.

### Use case 6 — Sidecar proxy (service mesh)

```text
   Pod
   ├── App container
   └── Sidecar proxy (Envoy/Linkerd)
        ├── outbound: proxy ra ngoài (forward proxy)
        └── inbound:  proxy vào trong (reverse proxy)
```

→ Sidecar **đồng thời là cả forward và reverse**! Outbound traffic đi qua sidecar → forward. Inbound qua sidecar → reverse.

## NGINX có làm forward proxy được không?

**Về kỹ thuật**: có thể. NGINX có module `ngx_http_proxy_module` chạy được như HTTP forward proxy. Nhưng:
- Không phải use case chính.
- Thiếu tính năng so với Squid, Privoxy, HAProxy forward mode.
- NGINX **không hỗ trợ HTTPS forward proxy** (CONNECT method) tốt — phải dùng `ngx_stream_proxy` cấp 4 với CONNECT-like behavior.

→ Trong thực tế, NGINX **chỉ dùng làm reverse proxy**. Forward proxy thì có Squid (open-source, mature, 30 năm tuổi).

## CDN — pure reverse proxy

```text
   User Vietnam ──► CDN edge Singapore ──► Origin US
   User Berlin  ──► CDN edge Frankfurt ──► Origin US
   User Tokyo   ──► CDN edge Tokyo ──────► Origin US
```

Mỗi edge:
- Reverse proxy → origin.
- Cache layer (lớn nhất là cache).
- TLS termination (đa số terminate ở edge).
- DDoS shield (rate limit, WAF).
- Anycast IP cho geo-routing.

### CDN decrypt content của bạn

Để cache HTTPS response, CDN **phải terminate TLS**. Tức là CDN có cert của domain của bạn (bạn upload, hoặc CDN generate qua "Universal SSL").

→ CDN **đọc được toàn bộ** request/response. Đây là trade-off của caching CDN. Sensitive data (token, password reset, internal API) thường được set `Cache-Control: private, no-store` để CDN không cache, nhưng vẫn pass qua CDN.

## Mtls và mutual TLS — không liên quan đến proxy/reverse trực tiếp

`Mutual TLS`: cả client và server đều có cert, xác thực 2 chiều. Phổ biến trong service mesh:

```text
   Service A ──[mTLS]──► Service B
   
   - Service A có cert client.
   - Service B có cert server.
   - Cả 2 verify lẫn nhau.
```

Reverse proxy (sidecar) thường terminate mTLS giữa các service.

## Bảng so sánh tổng

| | Forward Proxy | Reverse Proxy |
|---|---|---|
| Phục vụ | Client | Server |
| Cấu hình bởi | Client (browser, OS) | Server admin |
| Server thấy | Proxy | Reverse proxy |
| Client thấy | Server (transparent) | Reverse proxy |
| Use case | Corporate filter, VPN, anonymizer | LB, TLS term, cache, API gateway |
| Ví dụ phần mềm | Squid, Privoxy, Tor, VPN | NGINX, HAProxy, Envoy, Cloudflare |
| Cache | Cache response cho client | Cache response thay backend |
| TLS | Có thể MITM nếu cert installed | Terminate cert của server |

## VPN vs forward proxy — khác biệt

| | Forward Proxy | VPN |
|---|---|---|
| Tầng | Application (HTTP/SOCKS) | Network (IP layer) |
| Cover | Chỉ HTTP/HTTPS | Toàn bộ network traffic |
| Encryption | Tùy proxy (CONNECT tunnel HTTPS thì có) | Luôn (IPsec, WireGuard, OpenVPN) |
| Speed | Nhanh hơn (no overhead full stack) | Chậm hơn |
| Use case | Caching, content filter, anonymous web | Bypass geo-block, secure WiFi |

## Câu hỏi thường gặp

### Q: Cloudflare là proxy hay reverse proxy?

A: **Reverse proxy** + CDN + WAF + DDoS shield. Bạn (server owner) set DNS trỏ vào Cloudflare. Client thấy Cloudflare là server.

### Q: Có thể có forward proxy mà không cài gì trên client không?

A: **Transparent proxy** — proxy intercept traffic ở mức network (router/firewall), client không biết. Phổ biến trong ISP. Nhưng HTTPS proxy transparent rất khó (cần MITM cert installed trên client).

### Q: API gateway có phải reverse proxy?

A: **Có, là một dạng đặc biệt**. API gateway = reverse proxy + auth + rate limit + transform.

### Q: NGINX có làm forward proxy được không?

A: Limited. Squid/HAProxy/Privoxy chuyên dụng tốt hơn.

### Q: Có thể đặt forward proxy sau reverse proxy không?

A: **Có**, trong sidecar pattern. Microservice nói qua sidecar (forward proxy outbound) — gửi đến reverse proxy của service đích.

## Tóm tắt bài 2

- **Forward proxy**: phục vụ client, client cấu hình. Use case: corporate, VPN, ISP filter.
- **Reverse proxy**: phục vụ server, server admin cấu hình. Use case: LB, TLS, cache, API gateway.
- NGINX dùng làm reverse proxy chủ yếu — forward dùng Squid.
- CDN = reverse proxy + cache + WAF.
- Sidecar (service mesh) = vừa forward vừa reverse.
- VPN khác proxy: VPN tunnel network layer, proxy ở application.

**Bài kế tiếp** → [Bài 3: Giới hạn NGINX — vì sao Cloudflare build Pingora](03-nginx-limitations.md)
