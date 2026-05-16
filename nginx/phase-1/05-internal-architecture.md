# Bài 5: NGINX Internal Architecture

## Kiến trúc tổng quan

```
NGINX Process Tree:
├── Master Process (1 process)
│   ├── Cache Management Processes
│   └── Worker Processes (N processes)
│       ├── Worker 1 (CPU core 1)
│       ├── Worker 2 (CPU core 2)
│       ├── Worker 3 (CPU core 3)
│       └── Worker 4 (CPU core 4)
```

---

## Master Process

- Quản lý toàn bộ NGINX
- Khởi động/dừng worker processes
- Reload configuration
- Không xử lý requests trực tiếp

---

## Worker Processes

### Số lượng Worker

Khi set `worker_processes auto` (default), NGINX tạo **1 worker per hardware thread**:

```
Ví dụ:
- 4 physical cores, hyper-threading enabled → 8 hardware threads → 8 workers
- 4 physical cores, hyper-threading disabled → 4 hardware threads → 4 workers
```

### Tại sao 1 worker per CPU core?

**Context switching** là kẻ thù:
- CPU core có thể chạy nhiều processes/threads
- Khi switch giữa processes → phải lưu/restore state → tốn tài nguyên
- Với NGINX xử lý millions of connections, context switching hàng triệu lần = bottleneck

**1 worker = 1 CPU core = không có context switch** giữa workers → efficient!

---

## Connection Flow

```
Client
  ↓ [TCP SYN]
Kernel (SYN Queue)
  ↓ [3-way handshake complete]
Kernel (Accept Queue)
  ↓ [Worker picks up connection]
Worker Process
  ↓ [Read request / parse HTTP / decrypt TLS]
  ↓ [Forward to backend / read from disk]
  ↓ [Write response / re-encrypt]
Client
```

### SYN Queue và Accept Queue

```
Client → [SYN] → Kernel (SYN Queue)
Client ← [SYN-ACK] ←
Client → [ACK] → Kernel (Accept Queue) → Worker picks up
```

- **SYN Queue**: Chờ complete TCP handshake
- **Accept Queue**: Connections sẵn sàng để application process
- Worker **pull** (không phải push) từ Accept Queue

---

## Event-Driven I/O (Không blocking!)

NGINX dùng **asynchronous event-driven** model:

```
Worker nhận request
  ↓
Send I/O request (read file / connect to backend)
  ↓ [Non-blocking! Worker tiếp tục làm việc khác]
  ↓ [Kernel thông báo: "I/O done!"]
  ↓
Worker xử lý tiếp
```

Kết quả: **Mỗi worker có thể handle hàng nghìn concurrent connections**!

---

## CPU-bound Operations trong Worker

Mỗi request đến, worker phải:

1. **TLS Decrypt**: Dùng symmetric key decrypt content → CPU
2. **HTTP Parsing**: Parse headers, find request boundaries → CPU
3. **I/O**: Read file from disk / connect to backend → Async (non-blocking)
4. **TLS Encrypt**: Re-encrypt response → CPU

```
Request Processing Cost:
├── TLS Handshake (asymmetric crypto) → Very expensive
├── TLS Encryption/Decryption (symmetric) → Moderate
├── HTTP Parsing → Light
└── I/O (disk/network) → Async, không block worker
```

---

## Worker Connections

```nginx
events {
    worker_connections 1024;  # Max connections per worker
}
```

Mỗi worker process có connection pool đến backend.

**Quan trọng:** Mỗi worker có **pool riêng** — không share giữa workers.
Đây là một hạn chế của NGINX (Cloudflare sau này phải build alternative vì lý do này).

---

## Tóm tắt

```
NGINX Architecture:
├── Master: 1 process, quản lý workers
└── Workers: 1 per CPU core, xử lý connections
    ├── Event-driven (async I/O)
    ├── CPU pinned (tránh context switch)
    ├── Mỗi worker: hàng nghìn connections
    └── Connection pool to backends (riêng mỗi worker)

Bottleneck:
├── CPU: Encryption/Decryption, HTTP parsing
├── Memory: State per connection (TLS keys, buffers)
└── File descriptors: 1 per connection
```

---
**Tiếp theo:** Phase 2 - Chạy NGINX trong Docker →
