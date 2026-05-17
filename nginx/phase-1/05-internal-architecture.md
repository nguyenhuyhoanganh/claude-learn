# Bài 5: Kiến trúc nội bộ NGINX — master, worker, event loop

Đến đây ta đã biết NGINX **làm gì**. Bài này trả lời **bằng cách nào** NGINX xử lý hàng vạn connection đồng thời với vài MB RAM. Hiểu được kiến trúc này là chìa khoá để tune NGINX đúng và debug khi gặp bottleneck (CPU, file descriptor, accept queue).

## Tổng quan — process tree

Khi bạn `systemctl start nginx`, hệ thống có gì?

```text
   PID 1234  nginx: master process
       │
       ├── PID 1235  nginx: worker process    (pinned CPU 0)
       ├── PID 1236  nginx: worker process    (pinned CPU 1)
       ├── PID 1237  nginx: worker process    (pinned CPU 2)
       ├── PID 1238  nginx: worker process    (pinned CPU 3)
       │
       ├── PID 1239  nginx: cache manager process    (nếu bật cache)
       └── PID 1240  nginx: cache loader process     (start-up only)
```

- **Master process**: 1 process duy nhất, **không xử lý request**.
- **Worker process**: N process (mặc định = số CPU thread). **Đây là nơi xử lý mọi request**.
- **Cache manager**: nếu bật `proxy_cache`, có 1-2 process phụ quản lý cache eviction.

> Có thể xem live bằng `ps aux | grep nginx` hoặc `pstree -p $(pidof nginx | head -c 4)`.

## Master process — boss không làm việc trực tiếp

Master là **process boot strap**. Nhiệm vụ:

| Việc | Khi nào |
|---|---|
| Đọc và validate `nginx.conf` | Lúc start hoặc `nginx -s reload` |
| Bind socket trên port (80/443) | Lúc start (cần `root` để bind port < 1024) |
| Fork ra worker process | Lúc start hoặc reload |
| Phân quyền xuống user `nginx`/`www-data` | Sau khi bind |
| Theo dõi worker (khi worker chết → spawn lại) | Liên tục |
| Nhận signal: `HUP` (reload), `USR2` (binary upgrade), `WINCH` (graceful stop) | Khi admin gửi |

```bash
# Reload config mà không drop connection nào
nginx -s reload         # tương đương kill -HUP <master_pid>

# Stop graceful (worker xong việc rồi mới chết)
nginx -s quit           # tương đương kill -QUIT <master_pid>

# Stop ngay
nginx -s stop           # tương đương kill -TERM <master_pid>
```

Vì sao có master riêng? Hai lý do:
1. **Bind port low (80/443)** cần root. Sau khi bind, drop privilege xuống user thường — worker chạy ít quyền hơn = an toàn hơn.
2. **Hot reload không drop request**: master fork worker mới với config mới, worker cũ tiếp tục xử lý request đang chạy, hết → tự kết thúc.

## Worker process — đâu là cối xay thật sự

Worker là nơi mọi cuộc đời của connection thực sự xảy ra.

### `worker_processes auto` nghĩa là gì?

```nginx
worker_processes auto;       # default — 1 worker / hardware thread
worker_processes 4;          # cố định 4 worker
worker_processes 1;          # 1 worker, hữu ích cho debug
```

`auto` = `số hardware thread`. Trên CPU có hyper-threading (Intel, AMD) hoặc SMT, **mỗi core vật lý = 2 hardware thread** → 4 core = 8 hardware thread = 8 worker.

> Trên Apple Silicon (M-series) hoặc khi disable hyper-threading: 4 core vật lý = 4 hardware thread = 4 worker.

### Vì sao 1 worker / CPU?

Đây là quyết định kiến trúc cốt lõi. Lý do là **context switch**:

```text
Nhiều thread cạnh tranh trên 1 CPU core:
   Thread A đang chạy code parse HTTP...
       │
       │ [10ms tick] kernel preempt
       ▼
   Lưu state A vào RAM (~200 byte registers)
       │
   Restore state B từ RAM
       │
   Thread B chạy được vài chục μs...
       │
       │ [tick] preempt
       ▼
   Lưu B, restore A...
   
   → Mỗi context switch tốn vài μs + cache miss
   → Khi có hàng triệu lần/giây = bottleneck thật
```

**Pin 1 worker / CPU**: worker đó "sống trọn đời" trên 1 CPU core, không context switch giữa các worker. Cache CPU (L1/L2) luôn warm cho dữ liệu của worker đó.

Cấu hình bonus để pin cứng:

```nginx
worker_processes  auto;
worker_cpu_affinity auto;     # NGINX tự pin worker vào CPU
```

→ Trên Linux dùng `taskset` hoặc cgroup tương đương.

## Connection flow — từ TCP SYN đến HTTP response

Đây là **dòng đời** một request, từ packet đầu tiên đến byte cuối cùng. Hiểu được luồng này = hiểu được NGINX tune ở đâu.

```text
┌──────────────────────────────────────────────────────────────┐
│ Client (browser)                                             │
│   │                                                          │
│   │  TCP SYN                                                 │
│   ▼                                                          │
├──────────────────────────────────────────────────────────────┤
│ Kernel (Linux network stack)                                 │
│                                                              │
│   ┌──────────────┐    SYN-ACK    ┌──────────────────┐        │
│   │  SYN Queue   │ ─────────────►│ (incomplete)      │       │
│   └──────────────┘               └──────────────────┘        │
│         ↓ (client ACK done)                                  │
│   ┌──────────────┐                                           │
│   │ Accept Queue │  ← worker pull connection bằng accept()   │
│   └──────────────┘                                           │
├──────────────────────────────────────────────────────────────┤
│ NGINX Worker (1 trong N)                                     │
│                                                              │
│   1. accept() → có file descriptor (fd) cho connection mới   │
│   2. Đăng ký fd với epoll: "thông báo khi có data đến"       │
│   3. Quay lại event loop, xử lý các connection khác đang sẵn │
│                                                              │
│   [Khi epoll báo "fd này có data"]                           │
│   4. read(fd) → bytes thô                                    │
│   5. Decrypt TLS nếu HTTPS                                   │
│   6. Parse HTTP request                                      │
│   7. Match server/location block                             │
│   8. proxy_pass → kết nối upstream (async)                   │
│      hoặc đọc file disk (async, dùng sendfile)               │
│                                                              │
│   [Khi upstream/disk báo "data về rồi"]                      │
│   9. Build HTTP response                                     │
│  10. Encrypt TLS nếu HTTPS                                   │
│  11. write(fd) → send về client                              │
│  12. Nếu keep-alive: giữ fd, chờ request tiếp                │
│      Nếu close: shutdown(), close(fd)                        │
└──────────────────────────────────────────────────────────────┘
```

### Hai queue trong kernel — SYN queue và Accept queue

Khi `listen()`, kernel cấp 2 queue cho socket:

| Queue | Chứa gì | Khi nào di chuyển sang queue tiếp |
|---|---|---|
| **SYN queue** (`tcp_max_syn_backlog`) | Connection đang ở giữa 3-way handshake (mới có SYN từ client) | Khi client gửi ACK cuối → handshake xong |
| **Accept queue** (`somaxconn`) | Connection đã handshake xong, **chờ** application `accept()` | Khi worker call `accept()` |

```text
   client SYN  ──────►  [SYN Queue]
                            ▼ kernel gửi SYN-ACK, chờ ACK
   client ACK  ──────►  3-way handshake done
                            ▼
                       [Accept Queue]  ◄── worker accept()
```

**Tuning quan trọng**:

```bash
# Tăng accept queue
sysctl -w net.core.somaxconn=65535
```

Và trong nginx.conf:

```nginx
server {
    listen 443 ssl backlog=65535;     # NGINX-side backlog
}
```

Nếu Accept queue **đầy** mà worker accept không kịp → kernel drop SYN → client lỗi `Connection refused` hoặc timeout. Đây là một dạng "NGINX có vẻ live mà client connect không được" — kiểm tra `ss -lnt` hoặc `nstat | grep ListenDrops`.

### Worker accept connection ra sao?

Có **2 mô hình**:

1. **All workers listen cùng port** — kernel phân phối connection (Linux ≥ 3.9 với `SO_REUSEPORT`). NGINX bật bằng `listen 443 ssl reuseport;`.
2. **Master accept, worker phân phối** — mô hình cũ. NGINX không thực sự dùng nữa.

`reuseport` chia tải đều hơn, latency thấp hơn. **Khuyến nghị bật**.

```nginx
server {
    listen 443 ssl reuseport;
}
```

## Event-driven I/O — bí mật scale của NGINX

NGINX **không spawn thread/process cho mỗi connection**. Một worker giữ **hàng nghìn** connection trong RAM cùng lúc, xử lý theo event loop:

```text
while (true) {
    events = epoll_wait();          // chờ kernel báo "fd nào sẵn sàng"
    for each event in events {
        switch (event.fd) {
            case listening_socket:
                accept() new connection;
                register new fd with epoll;
                break;
            case existing connection ready to read:
                read() bytes;
                process partial request;
                if response ready, write();
                break;
            case upstream connection ready:
                read from upstream;
                forward to client;
                break;
        }
    }
}
```

Trên Linux, hệ thống signal "fd này có data" là **`epoll`**. Trên BSD/macOS là **`kqueue`**. Trên Solaris là **`/dev/poll`**. NGINX chọn tự động.

### Vì sao event loop nhanh?

```text
Mô hình thread-per-connection (Apache cũ):
   10,000 connection → 10,000 thread
                    → mỗi thread ~1 MB stack
                    → 10 GB RAM
                    → context switch hàng triệu lần/giây
                    → TỬ
   
Mô hình event-driven (NGINX):
   10,000 connection → 4 worker
                    → mỗi connection chỉ vài KB state
                    → 50-100 MB RAM
                    → epoll báo "fd nào sẵn sàng" → worker xử lý chính xác
                    → KHÔNG context switch giữa connection
                    → ⚡ nhanh
```

### Pull, không phải push

Một điểm tinh tế: **kernel không tự push data lên app**. Kernel **chứa data trong buffer**, đợi app `read()`. NGINX worker là bên chủ động kéo (`pull`) data ra khi epoll báo "fd này có thể read được".

Khái niệm tương đương ở phía backend: NGINX **kết nối** đến backend, đăng ký fd của backend với epoll. Khi backend gửi response, kernel báo "fd backend có data". Worker đọc, đóng gói, gửi về client.

> Linux có io_uring (Linux 5.1+) — mô hình mới hơn, cho phép kernel **proactively** completion thay vì readiness. NGINX có hỗ trợ thử nghiệm. Tăng performance trên workload nặng I/O.

## CPU-bound vs I/O-bound trong NGINX

Mỗi request có **một hỗn hợp** giữa:

| Phần | Đặc tính | Cost |
|---|---|---|
| TLS handshake (asymmetric crypto) | CPU-bound | Đắt nhất — ms-level |
| TLS encrypt/decrypt (symmetric AES/ChaCha20) | CPU-bound | Trung bình — μs-level |
| HTTP parsing | CPU-bound | Nhẹ |
| Đọc file static (sendfile) | I/O-bound | Async, không block worker |
| Gọi upstream backend | I/O-bound | Async, không block worker |
| Cache lookup (đĩa) | I/O-bound | Async |

**Hệ quả**: nếu workload nhiều HTTPS handshake (cert RSA 2048, không session resumption) → CPU bound → cần thêm core hoặc tune session ticket. Nếu workload là proxy đến backend chậm → I/O bound → cần worker pool đủ lớn.

> Phase-4 bài 6 đi sâu vào ECDSA cert + TLS 1.3 1-RTT để giảm CPU cost handshake.

## Worker connections — giới hạn cứng

```nginx
events {
    worker_connections 1024;    # default
}
```

Mỗi worker tối đa **1024 file descriptor** mở đồng thời. Bao gồm:
- Connection từ client.
- Connection sang upstream.
- File đang đọc/ghi.

→ 1 client request kèm 1 upstream connection = 2 fd / 1 request. Worker 1024 = ~500 concurrent client.

**Tune lên production**:

```nginx
events {
    worker_connections 65535;
    use epoll;                  # mặc định trên Linux, có thể khai báo rõ
    multi_accept on;            # accept nhiều conn 1 lần trong 1 vòng event
}
```

Đi kèm OS limit:

```bash
# /etc/security/limits.conf
nginx soft nofile 65535
nginx hard nofile 65535

# kernel
sysctl -w fs.file-max=200000
```

**Capacity max** = `worker_processes × worker_connections`. Với 4 worker × 65535 = ~262k concurrent connection trên 1 NGINX instance.

## Cache manager + cache loader

Khi bật `proxy_cache_path`, có thêm 2 process phụ:

| Process | Vai trò |
|---|---|
| **cache loader** | Chạy 1 lần khi start, scan cache hiện có trên disk, load index vào RAM |
| **cache manager** | Chạy liên tục, xoá file cũ (eviction theo `max_size`, `inactive=`) |

Cả hai **không xử lý request** — chỉ làm housekeeping. Worker mới là bên đọc/ghi cache.

## Hạn chế kiến trúc — connection pool không share

Mỗi worker có **connection pool riêng** đến upstream:

```text
   Worker 1 ──► upstream connection pool (size N)
   Worker 2 ──► upstream connection pool (size N)
   Worker 3 ──► upstream connection pool (size N)
   Worker 4 ──► upstream connection pool (size N)
   
   → Tổng = 4N connection đến upstream
```

Không có cách "share pool giữa worker". Đây là một **hạn chế thật sự** với workload có:
- Backend rất ít (1-2 server) → mỗi server bị 4N connection thay vì N.
- Cần cache key globally consistent → cần shared memory `keys_zone`.

Đây là **một trong những lý do Cloudflare phải tự build alternative** (Pingora — Rust async runtime với shared resources). Phase-7 sẽ đi sâu.

## Cách quan sát NGINX ngoài đời

```bash
# Số worker hiện tại
ps -ef | grep "nginx: worker" | grep -v grep | wc -l

# Connection state
ss -ant | awk '{print $1}' | sort | uniq -c

# Backlog drop / Accept queue
nstat -az | grep -E "ListenDrops|ListenOverflows"

# Live request rate (nếu bật stub_status)
curl http://127.0.0.1/nginx_status
# Active connections: 291
# server accepts handled requests
#  16630948 16630948 31070465
# Reading: 6 Writing: 179 Waiting: 106
```

Trong production, **bật `stub_status`** trên một internal endpoint là việc đầu tiên cần làm.

## Tóm tắt bài 5

- **Master**: 1 process boot/reload/monitor; không xử lý request.
- **Worker**: N process = số CPU thread; **mỗi worker pin 1 CPU**, không context switch nhau.
- **Connection flow**: kernel queue (SYN → Accept) → worker accept → epoll event loop → process → response.
- **Event-driven + async I/O** = mỗi worker xử lý hàng vạn connection trong vài MB RAM.
- **CPU-bound**: TLS, HTTP parsing. **I/O-bound**: backend, disk — async, không block worker.
- Hạn chế: connection pool riêng từng worker, không share toàn instance — Cloudflare phải build Pingora vì lý do này.

**Bài kế tiếp** → [Phase 2 — Bài 1: Tổng quan setup Docker với NGINX](../phase-2/01-tong-quan.md)
