# Bài 2: Bao nhiêu backend là vừa? — câu hỏi không có công thức

Q: "Tôi có N client WebSocket muốn connect — cần đúng N server backend?"

A: **Không. Phụ thuộc workload.**

Bài này phân tích cách suy nghĩ về số lượng backend — không có công thức tuyệt đối, nhưng có **khung suy luận** để bạn tự ra quyết định cho hệ thống của mình.

## Trực giác sai phổ biến

> "1000 user = cần 1000 backend (mỗi user 1)."

Sai. Backend **share** giữa nhiều user:
- HTTP request typical < 100ms → 1 backend xử lý hàng nghìn req/giây.
- WebSocket idle 99% thời gian — backend giữ connection không tốn CPU.
- Memory thường là bottleneck đầu tiên, không phải concurrency.

## CPU-bound vs I/O-bound

Workload có 2 dạng cơ bản. Phân biệt = khác biệt cốt lõi cho capacity planning.

### CPU-bound

```text
Request → backend xử lý heavy:
   - JSON parsing/serialization lớn
   - Image processing
   - ML inference
   - Cryptography
   - Compression
```

Backend bị **CPU saturated** trước memory. Capacity tỉ lệ với CPU core.

**Tính**: nếu 1 request = 50ms CPU, 1 core làm 20 req/s. 100k req/s = 5000 core = 100 server 50 core.

### I/O-bound

```text
Request → backend chờ:
   - DB query
   - Call API ngoài
   - Đọc/ghi file
   - Network downstream
```

Backend chờ I/O — CPU idle. Capacity tỉ lệ với **memory + connection pool + thread/coroutine**.

**Tính**: nếu 1 request = 200ms chờ + 5ms CPU, 1 core làm rất nhiều request đồng thời (async). Capacity = số coroutine/thread bandwidth.

→ Đa số web app là **I/O-bound** — phụ thuộc DB. Backend Node.js/Go đơn giản 1 instance làm 5-10k req/s.

## WebSocket — tính riêng

WebSocket khác HTTP: connection **long-lived**, không "khép" sau request.

```text
   1 WS connection = 1 fd + ~10 KB state
   1 instance Node.js có thể giữ:
      - 10k connection (~100 MB) — dễ
      - 100k connection (~1 GB + ulimit cao) — possible
      - 1M connection — cần tune extreme (uWebSockets.js, Erlang Phoenix)
```

**Phụ thuộc**:
- User idle 99% thời gian (chat) → 1 backend giữ rất nhiều.
- User active liên tục (game) → ít hơn vì CPU cost.

### Heuristic cho WS

| Workload | Connection/instance |
|---|---|
| Chat (idle nhiều) | 50k-200k |
| Live notification (push thỉnh thoảng) | 100k-500k |
| Multiplayer game (10 msg/s/user) | 1k-10k |
| Real-time dashboard (1 msg/s) | 50k-100k |

Production starting point: **10k-50k connection / instance**. Đo, tune từ đó.

## Decision matrix — bao nhiêu backend?

3 yếu tố quan trọng nhất:

### 1. Peak QPS / connection

```text
Peak QPS = users × actions/user/sec
   - Web app 10k user, 1 action/10sec = 1000 QPS
   - Chat 100k user, 1 msg/10sec = 10k msg/sec

Per-backend capacity (đo bằng load test):
   - Simple API Node.js: 5k QPS/instance
   - Heavy API (JSON parse + DB): 1k QPS/instance
   - ML inference: 50 QPS/instance
```

→ **Backend count = ceil(peak QPS / per-instance capacity) × safety_factor (1.5x)**.

### 2. Failure tolerance

Một backend chết, còn lại có gánh nổi 100% traffic?

```text
   N backend, mỗi cái N/(N-1) capacity.
   1 chết → còn N-1, gánh 100% = 100/(N-1) % mỗi cái.

   N=3: 1 chết → 2 còn lại gánh 150% → over capacity!
   N=5: 1 chết → 4 còn lại gánh 125% → OK nếu tune 80%.
   N=10: 1 chết → 9 gánh 111% → an toàn.
```

→ **Tối thiểu 3 backend** cho HA. Càng nhiều càng resilient.

### 3. Deploy strategy

Rolling deploy: take 1 instance offline → deploy → next. Trong khi 1 offline, còn N-1 phải gánh.

Blue/Green: cần 2× capacity tạm thời.

Canary: 1 instance ở version mới, N-1 ở cũ → cần N ≥ 3.

→ Theo strategy, **buffer 25-50%** capacity vào số backend.

## Công thức tổng

```text
   minBackends = max(3, ceil(peakQPS / instanceCapacity) × failoverFactor)
   
   Trong đó:
      - 3 = HA minimum
      - failoverFactor = 1.3 (N+1 redundancy) hoặc 1.5 (rolling)
      - instanceCapacity từ load test thực tế, không guess
```

## Anti-pattern — không phải càng nhiều càng tốt

| Anti-pattern | Hệ quả |
|---|---|
| Spawn 100 backend "cho chắc" | Lãng phí tiền + complexity vận hành |
| Backend giữ nhiều state in-memory | Sticky LB cứng, scale ngang khó |
| 1 backend riêng cho 1 user (multi-tenancy sai) | Cost nổ |
| Auto-scale aggressive với cold-start chậm | Spike → backend mới chưa warm → user slow |

## "Vertical" cũng applies cho backend

Tương tự NGINX, có thể vertical scale backend trước khi horizontal:

```text
   8 cores, 16 GB → 32 cores, 64 GB
   Throughput tăng ~ 4x (nếu code không bottleneck thread)
```

Đặc biệt Node.js single-thread: vertical chỉ tăng nếu app dùng worker thread / cluster mode.

## Monitor — chỉ số phải theo

| Metric | Khi nào lo |
|---|---|
| Backend CPU sustained | > 70% → scale up/out |
| Backend memory | > 80% sustained → scale up |
| GC pause (Java/Go/Node) | > 100ms/phút → tune GC |
| DB connection pool utilization | > 80% → tăng pool hoặc scale DB |
| HTTP p99 latency | spike > baseline 3x → bottleneck đâu đó |
| Error rate (5xx) | > 0.1% → có vấn đề |
| NGINX upstream `Status.fail` | > 0 sustained → backend chết |

## Use case: bài toán transcript gốc

Câu hỏi từ transcript: "10 client WebSocket — cần 10 server?"

**Trả lời cụ thể**:

- 10 client connection, idle 99% (chat) → **1 backend đủ thừa**. 1 instance Node.js giữ 50k+ connection.
- 10 client streaming video realtime → **2-3 backend** (mỗi backend gánh 3-5 client) — load test thật mới biết.
- 10 client trading bot, mỗi cái 1000 msg/s → **2-3 backend** (CPU đáng kể).

→ Không "1 client = 1 backend". Suy nghĩ theo **workload character + capacity**.

## Heuristic cuối cùng

```text
Starting point cho hệ thống mới:
   1. 3 backend instance (HA minimum)
   2. Cùng size container/VM (đơn giản auto-scale)
   3. Setup auto-scale theo CPU 60% threshold
   4. Load test, đo capacity thực
   5. Adjust theo data, không guess
```

90% công ty bắt đầu thế và đủ cho năm đầu.

## Tóm tắt bài 2

- Không có "N client = N backend" — phụ thuộc workload (CPU/IO/state).
- Yếu tố: peak QPS, failure tolerance, deploy strategy.
- HA minimum: 3 backend. Buffer 25-50%.
- WS: 10k-50k connection/instance là starting point thực tế.
- **Đo bằng load test, không guess** — đây là chìa khoá.
- 90% app: 3-10 backend đủ cho năm đầu, scale theo data.

**Bài kế tiếp** → [Phase 7 — Bài 1: Socket connections deep-dive (bonus OS)](../phase-7/01-socket-connections.md)
