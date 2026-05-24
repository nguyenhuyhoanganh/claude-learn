# Bài 1: NGINX là gì? Web server hay reverse proxy hay cả hai?

## Định nghĩa ngắn

> **NGINX** (đọc là **Engine-X**) là một **server đa năng viết bằng C**, hoạt động cùng lúc như **web server, reverse proxy, load balancer, API gateway, và TCP/UDP proxy**, nổi tiếng vì tốc độ cao + bộ nhớ thấp + cấu hình tường minh.

Đọc lại định nghĩa trên — có **3 ý chính** cần bóc tách:

1. **Server** — một process lắng nghe trên cổng mạng, nhận request, trả response. Không phải library, không phải framework.
2. **Đa năng** — một binary `nginx`, qua cấu hình, làm được nhiều vai trò khác nhau. Bạn không cần cài 3 phần mềm khác nhau cho 3 vai trò.
3. **C** — chạy native, không có VM/garbage collector → nhanh và dùng ít RAM.

## Hai vai trò chính của NGINX

NGINX có **rất nhiều** vai trò, nhưng đa số người mới gặp NGINX qua 1 trong 2 vai trò sau:

### Vai trò 1 — Web server (serve nội dung)

```text
   Client (browser)
   ───[GET /index.html]──►   NGINX  ──[đọc disk]──► /var/www/index.html
                              │
   ◄───[200, HTML content]────┘
```

NGINX lắng nghe trên HTTP endpoint (mặc định cổng 80, cổng 443 nếu HTTPS) và **phục vụ web content**:

- **Static content** — HTML, CSS, JavaScript, ảnh, PDF... đọc thẳng từ ổ đĩa.
- **Dynamic content** — qua FastCGI/uWSGI (PHP-FPM cho PHP, uwsgi cho Python).

Đây là vai trò "kinh điển nhất" — đại đa số người mới gặp NGINX trong cấu hình serve static file của một single-page app, hoặc đứng trước PHP-FPM cho WordPress.

### Vai trò 2 — Reverse proxy (trung gian đứng trước backend)

```text
   Client (browser)
   ───[GET /api/users]──►  NGINX  ──[forward]──► Node.js / Go / Python app :3001
                            │
                            └── thêm header, cache, log, route, retry...
   ◄───[response]───────────
```

NGINX **không tự xử lý request**, mà chuyển tiếp tới một (hoặc nhiều) backend server. Trong quá trình đó, NGINX có thể:

- **Load balance** — chia request đều giữa nhiều backend.
- **Route** — `/api/v1/...` đi backend A, `/api/v2/...` đi backend B.
- **Cache** — lưu lại response để lần sau trả ngay không cần hỏi backend.
- **TLS terminate** — giải mã HTTPS ở NGINX, gửi HTTP nội bộ tới backend.
- **Rate limit / Auth / Rewrite** — chặn request xấu trước khi đến backend.

Khoá học này tập trung **chủ yếu vào vai trò reverse proxy** vì đó là use case dominant của NGINX trong môi trường server hiện đại.

## NGINX trên bản đồ web server

Để định vị, NGINX không phải duy nhất:

| Web server | Năm | Ngôn ngữ | Mạnh ở | Yếu / Trade-off |
|---|---|---|---|---|
| Apache HTTPD | 1995 | C | Module phong phú, `.htaccess`, dynamic | Mỗi connection 1 thread → tốn RAM khi tải cao |
| **NGINX** | **2004** | **C** | **Event-driven, ít RAM, reverse proxy mạnh, config tường minh** | **Module động ít hơn Apache, cấu hình `if` hạn chế** |
| Caddy | 2015 | Go | Auto-HTTPS qua Let's Encrypt, config gọn | Cộng đồng nhỏ hơn, ít plugin |
| HAProxy | 2001 | C | LB chuyên dụng, TCP+HTTP, observability tốt | Không serve static content |
| Envoy | 2016 | C++ | Service mesh, HTTP/2/gRPC, observability | Phức tạp, cần control plane |
| Traefik | 2015 | Go | Tự discover service Docker/K8s | Overhead Go, cấu hình ẩn |

Trong môi trường **Kubernetes**, bạn có thể gặp NGINX Ingress Controller, Envoy (Istio), hoặc Traefik. Trong môi trường **VM/bare-metal**, NGINX gần như là default.

## Vì sao NGINX ra đời? — Vấn đề C10K

NGINX được **Igor Sysoev** viết năm **2002** tại Rambler (cổng tìm kiếm Nga), public 2004. Bài toán Igor giải là **C10K problem** — làm sao một server xử lý đồng thời **10,000 connection**?

Apache thời đó dùng kiến trúc **process-per-connection** hoặc **thread-per-connection**:

```text
Apache (prefork MPM):
   10,000 connection → 10,000 process
                    → mỗi process ~2-4 MB RAM
                    → 20-40 GB RAM chỉ để giữ connection!
                    → Context switch giữa 10,000 thread → CPU chết
```

NGINX dùng **event-driven, asynchronous** (giống Node.js sau này):

```text
NGINX:
   10,000 connection → 4-8 worker process (theo CPU core)
                    → mỗi worker xử lý hàng nghìn connection trong event loop
                    → Vài chục MB RAM, không context switch lung tung
```

Hệ quả: NGINX có thể serve **gấp 5-10 lần** số connection so với Apache trên cùng phần cứng. Đây là lý do NGINX bùng nổ từ 2008 trở đi khi Web 2.0 đòi hỏi nhiều concurrent connection (long-polling, comet, AJAX).

> Bài 5 sẽ đào sâu kiến trúc event-loop và worker process này.

## NGINX có "miễn phí" không?

Có **2 phiên bản**:

| | NGINX Open Source | NGINX Plus (F5) |
|---|---|---|
| License | BSD-like (free) | Thương mại, trả phí |
| Tính năng cơ bản | Đầy đủ | Đầy đủ |
| Active health check | Phải tự script hoặc dùng module | Built-in |
| Dynamic config qua API | Hạn chế | Built-in, hot reload |
| JWT authentication | Phải dùng Lua/nginx-jwt | Built-in |
| Live monitoring dashboard | Không | Built-in |
| Support | Cộng đồng | F5 commercial support |

> **F5 Networks** mua lại NGINX Inc. năm 2019 với giá 670 triệu USD. Sản phẩm thương mại hoá tên là **NGINX Plus**.

Trong khoá học này, ta dùng **NGINX Open Source** — đủ cho 95% use case. Plus chỉ cần khi bạn ở enterprise scale với yêu cầu nghiêm ngặt về support.

## Vì sao nói "NGINX nhanh"?

Bốn lý do bổ sung lẫn nhau:

1. **Viết bằng C** — không có VM, không GC. Mọi thao tác là native machine code.
2. **Event-driven** — một worker xử lý hàng nghìn connection bằng `epoll` (Linux) / `kqueue` (BSD/macOS), không dùng thread.
3. **Asynchronous I/O** — đọc file đĩa, gọi backend, ghi socket... đều non-blocking; worker không "ngồi chờ".
4. **Zero-copy + sendfile** — khi serve static file, dữ liệu đi thẳng từ kernel page cache đến socket buffer, không phải copy qua user space.

```text
Cách kém:                              Cách NGINX (sendfile):
disk → kernel buf → user buf →        disk → kernel buf ──────► socket
       kernel buf → socket             (zero-copy)
       (4 lần copy)                    (2 lần copy, 0 lần qua user)
```

Trên 1 CPU core, NGINX serve **~50,000-100,000 req/s** cho file nhỏ. Trên server 8 core, dễ vượt **500,000 req/s** — đủ cho đa số trang web vừa và lớn.

## NGINX **không** làm gì? (giới hạn)

| Vấn đề | NGINX có làm? |
|---|---|
| Serve static content | ✓ Cực giỏi |
| Reverse proxy HTTP/HTTPS | ✓ Cực giỏi |
| Reverse proxy TCP/UDP (Postgres, MySQL, gRPC raw) | ✓ Có (stream module) |
| Cache HTTP response | ✓ Có |
| Rate limit, basic auth, IP whitelist | ✓ Có |
| Compression (gzip, brotli) | ✓ Có |
| Auto-HTTPS (Let's Encrypt) | ✗ Phải dùng certbot ngoài hoặc dùng Caddy |
| Service mesh / mTLS giữa microservices | ✗ Nên dùng Envoy/Istio |
| Distributed tracing built-in | ✗ Cần module thêm |
| WAF (Web Application Firewall) | ✗ Free version không có, phải dùng ModSecurity hoặc commercial |
| Logic phức tạp (DSL) | △ Có nhưng `if` rất hạn chế; phức tạp → Lua module |

**Quy tắc rút ra**: NGINX cực mạnh ở **L4/L7 proxy + serve static + cache**, nhưng không tham vọng làm "swiss-army knife". Khi cần logic phức tạp (rule routing dynamic, WAF, mTLS service mesh), người ta thường đặt một layer khác phía trên hoặc thay bằng Envoy.

## Vài hiểu lầm cần dẹp ngay

| Hiểu lầm | Thực tế |
|---|---|
| "NGINX là load balancer, không phải web server" | Sai — NGINX **đồng thời** là web server, reverse proxy, LB. Một config có thể dùng tất cả. |
| "NGINX chỉ chạy HTTP" | Sai — `stream` module proxy TCP/UDP cho database, mail, gRPC raw. |
| "NGINX và Apache có thể thay thế lẫn nhau" | Phần lớn có thể, nhưng Apache có `.htaccess` dynamic mà NGINX không có. Đa số người chuyển từ Apache sang NGINX, hiếm khi ngược. |
| "NGINX phức tạp" | Cấu hình NGINX đơn giản hơn Apache rõ rệt — declarative, nested block. Phức tạp nằm ở các tính năng nâng cao (cache key, rewrite). |
| "NGINX cần Linux" | NGINX chạy trên Linux, macOS, BSD, Windows. Production: Linux. Dev: cả 3. |
| "NGINX = nginx-plus" | NGINX Open Source là phiên bản chính, miễn phí. Plus là một phiên bản trả phí của F5. |

## Khi nào KHÔNG nên chọn NGINX?

- **Cần auto-HTTPS đơn giản tuyệt đối** — Caddy tốt hơn, không cần script.
- **Service mesh trong K8s với mTLS + observability sâu** — Envoy/Istio purpose-built.
- **WAF cấp enterprise** — cần Cloudflare, AWS WAF, hoặc ModSecurity bundle.
- **Logic routing siêu phức tạp** (rewrite phụ thuộc body, lookup database động) — cần API gateway thật (Kong, Tyk).
- **Workload thuần TCP/UDP cực cao throughput** — HAProxy hoặc Envoy có thể ngang/hơn.

Nhưng cho **90% trường hợp đời thực** — đứng trước backend Node/Python/Go/Rails của một công ty vừa và nhỏ, NGINX là lựa chọn an toàn nhất.

## Tóm tắt bài 1

- NGINX = web server **+** reverse proxy **+** load balancer, viết bằng C, ra đời 2004 để giải bài toán C10K.
- Hai vai trò chính: **serve content** (static/dynamic) và **reverse proxy** (đứng trước backend).
- Nhanh nhờ: C native + event-driven + async I/O + sendfile zero-copy.
- Có giới hạn rõ: không phải swiss-army knife, không tham auto-HTTPS hay service mesh.
- Mã nguồn mở, dùng được free; Plus là bản thương mại của F5.

**Bài kế tiếp** → [Bài 2: NGINX use cases — 6 vai trò trong kiến trúc thực tế](02-nginx-use-cases.md)
