# Bài 4: CDN - Content Delivery Network

## Vấn đề: Distance = Latency

Dù có multi-region deployment với GSLB, vẫn còn latency do physical distance.

**Ví dụ: User ở Brazil, server ở US-East (200ms latency)**

```
TCP Handshake:        3 × 200ms = 600ms
HTTP Request/Response:            400ms  
Load 10 assets:       10 × 200ms = 2000ms
                               ─────────
Total:                          ~3 giây!
```

Google Analytics: **53% mobile users bỏ site nếu load > 3 giây**

## CDN là gì?

> **CDN** (Content Delivery Network) = Mạng lưới servers phân tán toàn cầu, cache content tại các vị trí gần user (edge servers / Points of Presence).

```
User (Brazil) ──(DNS)──> CDN Edge Server (São Paulo)
                                ↓
                        Serve cached content!
                        (50ms latency thay vì 200ms)
```

**Tính toán lại với CDN (50ms latency):**
```
TCP Handshake:          3 × 50ms = 150ms
HTTP Request:                      100ms
Load 10 assets:         10 × 50ms = 500ms
                                 ────────
Total:                           ~750ms ✅ (excellent!)
```

## Loại content CDN phục vụ

- **Static assets**: HTML, CSS, JavaScript, fonts
- **Images & thumbnails**
- **Video streams**: VOD (on-demand) và Live streaming
- **Downloads**: PDFs, software installers
- **API responses**: Có thể cache một số API responses

## Lợi ích của CDN

| Quality Attribute | Cơ chế |
|------------------|--------|
| **Performance** | Gần user → latency thấp, bandwidth cao |
| **Availability** | System issues ít ảnh hưởng (content từ CDN) |
| **Security** | DDoS attacks phân tán khắp CDN network |
| **Cost** | Giảm traffic đến origin servers |

**CDN và DDoS protection:**
```
Attacker gửi 1M requests/giây
→ Phân tán khắp hàng nghìn CDN servers toàn cầu
→ Mỗi server chỉ nhận ~1000 req/s → manageable
→ Origin servers không bị ảnh hưởng
```

## Hai chiến lược Cache

### 1. Pull Strategy (Lazy Caching)

```
Lần đầu (cache miss):
User → CDN → CDN không có content
        → CDN pull từ Origin Server
        → Serve user + cache lại

Lần sau (cache hit):
User → CDN → Serve từ cache instantly

Hết TTL:
CDN → kiểm tra Origin Server
    → Nếu content không đổi: refresh TTL
    → Nếu có version mới: fetch và cache lại
```

**Pros:**
- Low maintenance (tự động)
- Không cần biết trước content nào cần cache

**Cons:**
- First user bị "cold start" (latency cao lần đầu)
- TTL đồng loạt expire → spike traffic lên Origin

### 2. Push Strategy (Eager Caching)

```
Khi publish content mới:
Developer/CI → Upload/Push → CDN edge servers
                (proactively)

User → CDN → Serve từ cache (luôn có sẵn)
```

**Pros:**
- Không có cold start
- Content có thể không bao giờ expire (TTL vô hạn)
- Không cần Origin Server highly available

**Cons:**
- Phải actively publish/purge content
- Nếu content đổi thường xuyên: overhead lớn

### So sánh Pull vs Push

| | Pull | Push |
|--|------|------|
| **Maintenance** | Thấp (tự động) | Cao (manual publish) |
| **First user latency** | Cao (cold start) | Thấp |
| **Content freshness** | Có thể stale | Phụ thuộc vào quy trình |
| **Origin dependency** | Cao | Thấp |
| **Best for** | Dynamic content | Static, rarely changing |

## CDN và Caching Strategies

**TTL (Time-To-Live) configuration:**
```
Images (rarely change):     TTL = 1 năm
CSS/JS (hashed filenames):  TTL = 1 năm
HTML pages:                 TTL = 5 phút hoặc no-cache
API responses:              TTL = depends (10s - 5m)
```

**Cache invalidation:**
```
Khi cần update cached content:
1. Purge từ CDN → trigger re-fetch
2. Đổi filename (cache busting): main.abc123.js → main.xyz789.js
```

## CDN Techniques bổ sung

- **Compression**: Gzip/Brotli content → giảm bandwidth
- **Minification**: Thu nhỏ JavaScript/CSS files
- **HTTP/2**: Multiplexing nhiều requests trong 1 connection
- **Optimized SSDs**: Edge servers dùng fast storage

## Khi nào dùng CDN?

✅ **Phù hợp:**
- Serve static content (images, CSS, JS)
- Video streaming (VOD, live)
- Global user base
- Bảo vệ khỏi DDoS

❌ **Không cần:**
- Pure API backends (không có static content)
- Chỉ phục vụ một geographic region
- Highly dynamic content (thay đổi từng request)

## Tóm tắt

```
CDN = Distributed cache gần user

Benefits: Performance, Availability, Security, Cost

Strategies:
├── Pull: Cache khi được request (lazy, low maintenance)
└── Push: Cache trước (eager, low latency)

Techniques: Compression, minification, HTTP/2, SSDs
```

---
**Tiếp theo:** Phase 5 - Data Storage at Global Scale →
