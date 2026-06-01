# Bài 4: CDN — Content Delivery Network (Mạng phân phối nội dung)

## Vấn đề: Khoảng cách vật lý = Độ trễ (Distance = Latency)

Dù có multi-region deployment với GSLB (bài 1), ta vẫn không thoát khỏi vấn đề **vật lý**: ánh sáng chỉ đi được khoảng 200,000 km/giây, gói tin phải đi qua cáp quang xuyên lục địa, mỗi switch ở giữa đều thêm độ trễ.

**Ví dụ tính toán: User ở Brazil, server ở US-East (latency 200ms)**

```text
TCP Handshake (3 lần round-trip):        3 × 200ms = 600ms
HTTP Request + Response:                              400ms
Load 10 assets riêng lẻ:                10 × 200ms = 2000ms
                                                  ─────────
TỔNG cộng:                                      ~3 giây!
```

→ User thấy trang chậm.

📊 **Google Analytics thống kê: 53% mobile user bỏ trang nếu load > 3 giây**. Mất khách hàng chỉ vì latency vật lý.

## CDN là gì?

> **CDN** (Content Delivery Network — Mạng phân phối nội dung) = Mạng lưới servers **phân tán toàn cầu**, cache nội dung tại các vị trí gần user — gọi là **edge servers** (server biên) hoặc **Points of Presence (PoP)**.

```text
User (Brazil)  ── (DNS) ──►  CDN Edge Server (São Paulo)
                                    │
                            Serve content đã cache!
                            (latency 50ms thay vì 200ms)
```

CDN có hàng nghìn edge server đặt rải rác ở các thành phố lớn trên toàn thế giới. User được route về edge server gần nhất.

**Tính toán lại với CDN (latency 50ms):**

```text
TCP Handshake:           3 × 50ms = 150ms
HTTP Request + Response:             100ms
Load 10 assets:         10 × 50ms = 500ms
                                  ─────────
TỔNG cộng:                       ~750ms  ✅ (tuyệt vời!)
```

→ Cải thiện **gấp 4 lần** chỉ nhờ giảm khoảng cách vật lý!

## Các loại content mà CDN phục vụ

CDN thích hợp cho các loại content sau:

- **Static assets**: HTML, CSS, JavaScript, font.
- **Hình ảnh và thumbnail**.
- **Video stream**: VOD (Video On Demand) và Live Streaming.
- **Files để download**: PDF, software installer.
- **API response** (một số response có thể cache được, vd: danh sách sản phẩm hot).

CDN **không phù hợp** cho:
- Dynamic content thay đổi theo từng user (vd: dashboard cá nhân).
- API trả về dữ liệu real-time.

## CDN đóng góp gì cho Quality Attributes?

| Quality Attribute | Cơ chế |
|---|---|
| **Performance** | Gần user về địa lý → latency thấp, bandwidth cao |
| **Availability** | Origin server gặp vấn đề ít ảnh hưởng (content vẫn được phục vụ từ CDN) |
| **Security** | DDoS attack bị phân tán khắp hàng nghìn CDN server |
| **Cost** | Giảm traffic đến origin server → giảm hoá đơn server gốc |

**CDN và DDoS protection** là cặp đôi đặc biệt:

```text
Attacker gửi 1 triệu request mỗi giây nhằm sập website:

Không có CDN:
   1M req/s ─────► Origin Server  → Sập hoàn toàn

Có CDN:
   1M req/s
       ↓
   Phân tán khắp hàng nghìn CDN server toàn cầu
       ↓
   Mỗi server chỉ nhận ~1000 req/s → trong khả năng xử lý
       ↓
   Origin Server không bị ảnh hưởng (CDN absorb DDoS hộ)
```

→ CDN giống như "lá chắn" tự nhiên chống DDoS.

## 2 chiến lược Cache trong CDN

CDN có 2 cách quyết định khi nào cache content:

### Chiến lược 1: Pull Strategy (Lazy Caching — cache khi cần)

CDN chỉ lấy content về cache **khi có user đầu tiên request**.

```text
Lần đầu user request (cache miss — không có trong cache):
   User → CDN → CDN không có content
            → CDN tự pull (kéo) từ Origin Server (chậm 1 lần)
            → Serve cho user + lưu vào cache

Lần sau request (cache hit — có trong cache):
   User → CDN → Serve từ cache ngay (cực nhanh)

Khi TTL (time-to-live) hết:
   CDN → kiểm tra Origin Server xem có version mới chưa
       → Nếu content không đổi: refresh TTL, tiếp tục dùng cache cũ
       → Nếu có version mới: fetch mới và cache lại
```

**Ưu điểm:**
- Maintenance thấp (CDN tự xử lý hết).
- Không cần biết trước content nào sẽ được cache (tự động).

**Nhược điểm:**
- **User đầu tiên bị "cold start"** — chịu latency cao (vì CDN phải pull từ origin).
- Khi TTL của nhiều file expire đồng loạt → spike traffic về Origin (thundering herd).

### Chiến lược 2: Push Strategy (Eager Caching — cache trước)

Developer / CI/CD **chủ động đẩy** content lên CDN trước khi user request.

```text
Khi publish content mới:
   Developer / CI ──Upload / Push──► CDN edge server
                  (làm chủ động lúc deploy)

Khi user request:
   User → CDN → Serve từ cache ngay (luôn có sẵn, kể cả user đầu tiên)
```

**Ưu điểm:**
- Không có cold start → **mọi user đều nhanh**.
- Content có thể không bao giờ expire (TTL vô hạn).
- Không cần Origin Server highly available (sau khi push lên CDN xong, Origin có thể tắt).

**Nhược điểm:**
- Phải actively publish / purge content (overhead vận hành).
- Nếu content đổi thường xuyên → tốn công sức push liên tục.

### So sánh Pull vs Push

| Tiêu chí | Pull (Lazy) | Push (Eager) |
|---|---|---|
| **Maintenance** | Thấp (tự động) | Cao (cần publish thủ công / CI) |
| **First user latency** | Cao (cold start) | Thấp |
| **Content freshness** | Có thể stale (cũ) trong khoảng TTL | Phụ thuộc vào quy trình publish |
| **Phụ thuộc Origin** | Cao (Origin phải up khi cache miss) | Thấp (sau push thì độc lập) |
| **Phù hợp với** | Dynamic content thay đổi vừa phải | Static content, ít thay đổi |

→ Trong thực tế, nhiều CDN cho phép **mix cả 2** chiến lược tuỳ loại content.

## CDN và chiến lược Caching

### Cấu hình TTL (Time-To-Live) phù hợp cho từng loại

```text
Hình ảnh (ít thay đổi):              TTL = 1 năm
CSS/JS (đã có hash trong filename):  TTL = 1 năm
HTML pages:                          TTL = 5 phút hoặc no-cache
API responses:                       TTL = tuỳ (10 giây - 5 phút)
User-specific content:               TTL = không cache
```

### Cache Invalidation (Vô hiệu hoá cache)

Khi cần update content đã cache, có 2 cách:

1. **Purge từ CDN** → trigger re-fetch lần tới.
2. **Cache busting bằng đổi tên file** (kỹ thuật phổ biến):
   ```text
   Trước: main.js  → đổi sau khi build thành: main.abc123.js
   Sau update: main.xyz789.js (hash mới)
   
   → URL thay đổi → CDN xem như file mới → tự động fetch
   ```

Cache busting là cách hiện đại nhất — không phải gọi API purge, không phải lo timing.

## Các kỹ thuật bổ sung của CDN

Ngoài cache, CDN hiện đại còn cung cấp:

- **Compression (nén)**: Gzip/Brotli content trên đường truyền → giảm bandwidth.
- **Minification (rút gọn)**: Loại bỏ space, comment trong JavaScript/CSS.
- **HTTP/2 multiplexing**: Gửi nhiều request trong 1 connection.
- **Optimized SSDs**: Edge server dùng ổ SSD fast cho cache.
- **Image optimization tự động**: Convert JPEG → WebP/AVIF tuỳ browser.
- **Edge computing**: Chạy code (Cloudflare Workers, AWS Lambda@Edge) ngay tại edge.

## Khi nào nên dùng CDN?

✅ **Phù hợp:**
- Serve static content (hình ảnh, CSS, JS).
- Video streaming (VOD, live).
- User toàn cầu (global user base).
- Cần bảo vệ khỏi DDoS attack.
- Muốn giảm chi phí bandwidth của origin.

❌ **Không cần thiết:**
- API backend thuần (không có static content).
- Chỉ phục vụ user trong một region nhỏ (vd: chỉ Việt Nam).
- Content highly dynamic, thay đổi từng request (chat, real-time game).

## Các nhà cung cấp CDN phổ biến

- **Cloudflare** — Phổ biến nhất cho web, có free tier rộng rãi.
- **AWS CloudFront** — Tích hợp tốt với hệ sinh thái AWS.
- **Google Cloud CDN** — Tích hợp với GCP.
- **Azure CDN** — Của Microsoft.
- **Akamai** — Lâu đời, enterprise-grade.
- **Fastly** — Real-time purge, edge compute mạnh.

## Tóm tắt bài 4

```text
CDN = Distributed cache đặt gần user về địa lý

4 Lợi ích chính:
├── Performance     — Latency thấp, bandwidth cao (gần user)
├── Availability    — Phục vụ được khi origin có sự cố
├── Security        — DDoS bị phân tán → giảm tác động
└── Cost            — Giảm tải về origin server

2 chiến lược cache:
├── Pull (Lazy)     — Cache khi có request đầu tiên
│                     Maintenance thấp, có cold start
│                     Tốt cho dynamic content
│
└── Push (Eager)    — Cache trước khi user request
                      Không cold start, cần publish chủ động
                      Tốt cho static content ít đổi

Kỹ thuật bổ sung: compression, minification, HTTP/2, edge compute
```

Hoàn thành Phase 4. Bạn đã nắm được 4 building block quan trọng nhất: Load Balancer, Message Broker, API Gateway, CDN. Phase 5 sẽ về **Data Storage** — cách lưu trữ dữ liệu ở quy mô toàn cầu.

---
**Bài kế tiếp**: [Phase 5 - Data Storage at Global Scale](../phase-5/01-relational-databases-acid.md) →
