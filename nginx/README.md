# Nginx

> Nginx từ reverse proxy cơ bản tới cấu hình production chịu tải.

35 bài: kiến trúc worker/event của Nginx, cú pháp cấu hình, server block và location, reverse proxy và load balancing, TLS, cache, rate limit, nén, log, và các mẫu cấu hình thật kèm bẫy thường gặp.

**35 bài** trong 7 phần.

## Mục lục

### Phase 1

| Bài | Nội dung |
|---|---|
| [00](phase-1/00-gioi-thieu.md) | Bài 0: Giới thiệu khoá học — chúng ta sẽ học gì và xây gì? |
| [01](phase-1/01-nginx-la-gi.md) | Bài 1: NGINX là gì? Web server hay reverse proxy hay cả hai? |
| [02](phase-1/02-nginx-use-cases.md) | Bài 2: NGINX use cases — đi từ "app trần" lên "kiến trúc mong muốn" |
| [03](phase-1/03-layer4-vs-layer7.md) | Bài 3: Layer 4 vs Layer 7 proxy — chọn đúng tầng OSI |
| [04](phase-1/04-tls-termination-passthrough.md) | Bài 4: TLS termination vs TLS passthrough — đặt cert ở đâu |
| [05](phase-1/05-internal-architecture.md) | Bài 5: Kiến trúc nội bộ NGINX — master, worker, event loop |

### Phase 2

| Bài | Nội dung |
|---|---|
| [01](phase-2/01-tong-quan.md) | Bài 1: Tổng quan phase-2 — chạy NGINX trên Docker |
| [02](phase-2/02-nginx-webserver-container.md) | Bài 2: NGINX web server container đầu tiên — serve HTML tự custom |
| [03](phase-2/03-three-node-apps.md) | Bài 3: 3 Node app + NGINX load balancer trong custom network |
| [04](phase-2/04-two-nginx-load-balancers.md) | Bài 4: 2 NGINX load balancer cùng pool — pattern và hạn chế |
| [05](phase-2/05-docker-networking.md) | Bài 5: Docker networking deep-dive — bridge, DNS, multi-network |

### Phase 3

| Bài | Nội dung |
|---|---|
| [01](phase-3/01-tong-quan-timeouts.md) | Bài 1: Tổng quan NGINX timeouts — bản đồ 11 timeout phải nhớ |
| [02](phase-3/02-client-header-body-timeout.md) | Bài 2: client_header_timeout + client_body_timeout — chống Slow Loris |
| [03](phase-3/03-send-keepalive-timeout.md) | Bài 3: send_timeout + keepalive_timeout — chiều ngược và TCP keep-alive |
| [04](phase-3/04-lingering-resolver-timeout.md) | Bài 4: lingering_timeout + resolver_timeout — close graceful & DNS lookup |
| [05](phase-3/05-proxy-connect-timeout.md) | Bài 5: proxy_connect_timeout — NGINX bắt tay backend |
| [06](phase-3/06-proxy-send-read-timeout.md) | Bài 6: proxy_send_timeout + proxy_read_timeout — truyền dữ liệu với backend |
| [07](phase-3/07-proxy-next-upstream-keepalive-backend.md) | Bài 7: proxy_next_upstream_timeout + backend keepalive + tổng kết phase |

### Phase 4

| Bài | Nội dung |
|---|---|
| [01](phase-4/01-tong-quan.md) | Bài 1: Tổng quan phase-4 — cấu hình NGINX sâu |
| [02](phase-4/02-nginx-web-server.md) | Bài 2: NGINX as web server — serve static content production-grade |
| [03](phase-4/03-nginx-layer7-proxy.md) | Bài 3: NGINX as Layer 7 reverse proxy — routing, block, header |
| [04](phase-4/04-nginx-layer4-proxy.md) | Bài 4: NGINX as Layer 4 proxy — stream context cho TCP/UDP |
| [05](phase-4/05-https.md) | Bài 5: Enable HTTPS với Let's Encrypt — từ HTTP plain đến browser "secure" |
| [06](phase-4/06-tls13-http2.md) | Bài 6: TLS 1.3 + HTTP/2 — tune lên SSL Labs A+ |

### Phase 5

| Bài | Nội dung |
|---|---|
| [01](phase-5/01-intro-websockets.md) | Bài 1: WebSocket protocol — vì sao tồn tại và hoạt động ra sao? |
| [02](phase-5/02-layer4-vs-layer7-websocket.md) | Bài 2: Layer 4 vs Layer 7 proxy cho WebSocket |
| [03](phase-5/03-websocket-server.md) | Bài 3: Build WebSocket server với Node.js — chuẩn bị test NGINX |
| [04](phase-5/04-nginx-layer4-websocket.md) | Bài 4: NGINX as Layer 4 WebSocket proxy — stream context |
| [05](phase-5/05-nginx-layer7-websocket.md) | Bài 5: NGINX as Layer 7 WebSocket proxy — routing và serve HTML cùng port |

### Phase 6

| Bài | Nội dung |
|---|---|
| [01](phase-6/01-scale-nginx.md) | Bài 1: Scale NGINX — bao giờ và bằng cách nào? |
| [02](phase-6/02-how-many-backends.md) | Bài 2: Bao nhiêu backend là vừa? — câu hỏi không có công thức |

### Phase 7

| Bài | Nội dung |
|---|---|
| [01](phase-7/01-socket-connections.md) | Bài 1: Socket connections — đào sâu kernel data structures |
| [02](phase-7/02-proxy-vs-reverse-proxy.md) | Bài 2: Proxy vs Reverse Proxy — đào sâu khái niệm |
| [03](phase-7/03-nginx-limitations.md) | Bài 3: Giới hạn NGINX — vì sao Cloudflare build Pingora |
| [04](phase-7/04-course-summary.md) | Bài 4: Tổng kết toàn khoá NGINX |

## Nên bắt đầu từ đâu

| Bạn đang ở tình huống | Đọc từ |
|---|---|
| Mới dùng Nginx | phase đầu — hiểu mô hình worker trước khi sửa cấu hình |
| Cần đặt Nginx trước ứng dụng | phần reverse proxy và load balancing |
| Chuẩn bị lên production | phần TLS, cache, rate limit |

---

*Mục lục này sinh từ cấu trúc thư mục và tiêu đề thật của từng bài. Thêm bài mới thì cập nhật lại bảng tương ứng.*
