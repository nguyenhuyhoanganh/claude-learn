# Bài 0: Giới thiệu khoá học — chúng ta sẽ học gì và xây gì?

Khoá học này thực dụng. Mục tiêu cuối cùng: bạn có thể **tự dựng một NGINX production-grade** đứng trước backend, biết khi nào dùng tính năng nào, biết các trade-off, và biết cấu hình ra một file `nginx.conf` không xấu hổ với reviewer cấp cao.

Trước khi đi vào bài đầu tiên, ta cần thống nhất bức tranh tổng thể: NGINX giải quyết bài toán gì, khoá học đi qua những phase nào, và một vài thuật ngữ rất dễ hiểu lầm.

## Bài toán gốc — vì sao chúng ta cần NGINX?

Tưởng tượng bạn vừa viết xong một backend service (Node.js / Go / Python — chọn ngôn ngữ nào tuỳ bạn) chạy ở `0.0.0.0:3001`, trả JSON cho client. Bạn muốn đưa nó "lên internet".

Hệ thống tối thiểu nhất:

```text
       Internet                Your server
   ───────────────►   ┌──────────────────────────┐
   Client (browser)   │  app.js  :3001  (HTTP)    │
                      │       │                   │
                      │       ▼                   │
                      │  PostgreSQL :5432         │
                      └──────────────────────────┘
```

Có **5 vấn đề** sẽ đập vào mặt bạn ngay khi traffic tăng:

1. **Encryption** — `http://example.com:3001` không có TLS, browser cảnh báo "Not Secure", và nội dung đi qua mạng dạng plain text.
2. **Port phơi ra** — client phải nhớ `:3001`. Xấu xí và lộ thông tin nội bộ.
3. **Single point of failure** — server chết là app chết. Cần nhiều instance.
4. **Phân phối tải** — khi nhân bản app thành 3 instance, client phải tự chọn cái nào? Không khả thi.
5. **Trộn vô số trách nhiệm vào app** — rate limit, cache, log truy cập, route theo URL... nhồi hết vào code = không bảo trì được.

NGINX là **một layer trung gian** đứng giữa client và backend, giải quyết cả 5 vấn đề trên ở **bên ngoài code app** của bạn.

```text
       Internet            ┌─────────────┐       ┌───────────┐
   ───────────────►        │             │──────►│ app :3001 │
   Client (browser)        │  NGINX      │       └───────────┘
   https://example.com ───►│   :443      │       ┌───────────┐
                           │  (TLS,      │──────►│ app :3001 │
                           │   LB,       │       └───────────┘
                           │   cache,    │       ┌───────────┐
                           │   route)    │──────►│ app :3001 │
                           └─────────────┘       └───────────┘
```

→ Client chỉ nói chuyện với 1 endpoint. NGINX lo phần còn lại.

## Khoá học sẽ đi qua 7 phase

```text
Phase 1 — Fundamentals: NGINX là gì, use cases, Layer 4/7, TLS, kiến trúc nội bộ
Phase 2 — Docker:       Dựng NGINX + 3 backend + 2 LB trong Docker
Phase 3 — Timeouts:     11 loại timeout (frontend + backend), tránh Slow Loris, tối ưu connection
Phase 4 — Configs:      Web server, Layer 7 proxy, Layer 4 proxy, HTTPS, TLS 1.3, HTTP/2
Phase 5 — WebSockets:   Scale long-lived connection với NGINX (Layer 4 vs Layer 7)
Phase 6 — Q&A:          Scale NGINX, bao nhiêu backend là vừa
Phase 7 — Bonus:        Socket connection deep-dive, Proxy vs Reverse, giới hạn → Cloudflare
```

Mỗi phase tự nó là một module hoàn chỉnh: bạn có thể quay lại đọc lẻ bất kỳ phase nào sau khi hoàn thành lần đầu.

## Hai thuật ngữ siêu dễ nhầm

Có **2 cặp** thuật ngữ trong NGINX gây hiểu lầm cho gần như mọi người mới bắt đầu. Nhớ kỹ ngay từ đầu để tránh viết config sai.

### Cặp 1: "Frontend" và "Backend" — nghĩa **trong ngữ cảnh NGINX**

```text
   Client ───[Frontend side]───► NGINX ───[Backend side]───► Upstream Server
              (client ↔ NGINX)              (NGINX ↔ app)
```

- **Frontend** trong NGINX = **phía mặt tiền tiếp khách**, tức là tương tác giữa **client và NGINX**.
- **Backend** trong NGINX = **phía hậu trường**, tức là tương tác giữa **NGINX và upstream** (các app server thật sự xử lý request).

> ⚠️ "Frontend" ở đây **KHÔNG** liên quan đến React/Vue/HTML app. Nó là một mặt của NGINX. Khi tài liệu NGINX nói "frontend timeout" thì nghĩa là timeout phía client-NGINX, không phải timeout của trình duyệt.

### Cặp 2: "Proxy" và "Reverse Proxy"

```text
Forward Proxy (proxy thường):
   Client ──► [Proxy] ──► Server
   ↑ Client biết proxy. Server KHÔNG biết client thật.
   (VD: VPN, công ty chặn web, anonymizer)

Reverse Proxy:
   Client ──► [Reverse Proxy] ──► Backend Server
   ↑ Client KHÔNG biết backend thật. Server biết proxy.
   (VD: NGINX, Cloudflare, AWS ELB)
```

NGINX gần như luôn được dùng làm **reverse proxy** — đứng trước server để che giấu kiến trúc backend khỏi client. Khoá này bàn về reverse proxy là chính. (Bài bonus cuối khoá sẽ đào sâu sự khác biệt này.)

## "Upstream" — từ vựng bạn sẽ gặp 1000 lần

Trong cấu hình NGINX, các backend server được gọi là **upstream**:

```nginx
upstream my_app {
    server app1:3001;
    server app2:3001;
    server app3:3001;
}

server {
    listen 80;
    location / {
        proxy_pass http://my_app;
    }
}
```

"Upstream" = "thượng nguồn" — vì từ góc nhìn NGINX, request đi **ngược lên** đến server thật để lấy dữ liệu, rồi đi **xuôi dòng** trở về client.

## Những thứ chúng ta sẽ xây thật (không chỉ lý thuyết)

- Phase 2: `docker-compose.yml` với **3 Node.js app + 2 NGINX load balancer**, mọi thứ chạy local trong 1 lệnh.
- Phase 4: Cài NGINX trên Linux thật (Docker), bật HTTPS với cert từ **Let's Encrypt**, bật **TLS 1.3** + **HTTP/2**.
- Phase 5: Build WebSocket server, đứng NGINX trước nó với cả **Layer 4** và **Layer 7** — so sánh khả năng scale.

Code mẫu sẽ ở mức "có thể paste vào production sau khi đổi domain". Không có placeholder kiểu `<your-server>`.

## Yêu cầu kiến thức nền

Bạn nên đã có trước:
- Hiểu cơ bản HTTP (GET/POST, header, status code).
- Biết Docker là gì, dùng được `docker run` và đọc `docker-compose.yml`.
- Quen với terminal Linux/macOS.

Không cần biết NGINX trước. Không cần biết TLS sâu (sẽ học). Không cần kiến thức networking chuyên sâu (sẽ giải thích những phần cần).

## Một số con số đáng nhớ về NGINX

Để bạn có "anchor" trước khi đi vào chi tiết:

| Chỉ số | Giá trị tham khảo |
|---|---|
| Bộ nhớ idle một instance NGINX | ~2-5 MB |
| Số connection đồng thời/worker (mặc định) | 512 — có thể tune lên ~65k |
| Throughput trên 1 core, static file nhỏ | ~50,000-100,000 req/s |
| Latency thêm vào khi làm reverse proxy | < 1 ms trong cùng máy/mạng |
| Phiên bản TLS khuyến nghị | TLS 1.3 (1.2 vẫn chấp nhận) |
| Port mặc định | 80 (HTTP), 443 (HTTPS) |

→ NGINX cực **nhẹ** và **nhanh**. Bài 5 sẽ giải thích vì sao.

## Tóm tắt bài 0

- NGINX là một layer trung gian giải quyết 5 vấn đề "đưa app lên internet": encryption, scale, LB, route, ẩn backend.
- 7 phase từ fundamentals → Docker thực hành → timeouts → configs sâu → WebSockets → Q&A → bonus.
- 2 thuật ngữ phải nhớ: **frontend = client↔NGINX**, **backend = NGINX↔upstream**; **proxy ≠ reverse proxy**.
- Upstream = server backend trong từ vựng NGINX.

**Bài kế tiếp** → [Bài 1: NGINX là gì? Web server hay reverse proxy hay cả hai?](01-nginx-la-gi.md)
