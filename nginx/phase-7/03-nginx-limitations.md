# Bài 3: Giới hạn NGINX — vì sao Cloudflare build Pingora

Năm 2022 Cloudflare publish bài blog "How we built Pingora" — proxy mới viết bằng Rust, thay thế NGINX cho infrastructure cốt lõi. Bài này không nói "NGINX dở", mà phân tích **giới hạn kiến trúc** mà ở scale Cloudflare (hàng tỷ request/ngày), NGINX không cover được.

Hiểu giới hạn = hiểu khi nào nên chọn alternative.

## Vấn đề 1 — Connection pool per-worker, không share

Đây là **giới hạn chính** Cloudflare phải đối mặt.

```text
   NGINX architecture:
   
   Worker 1 ──► Pool 1 (32 keep-alive conn đến backend)
   Worker 2 ──► Pool 2 (32 conn riêng)
   Worker 3 ──► Pool 3 (32 conn riêng)
   Worker 4 ──► Pool 4 (32 conn riêng)
                                              ↓ tổng
                          128 conn đến cùng 1 backend từ 1 NGINX
```

Worker là **process độc lập** — không share memory dễ dàng. Connection pool là một in-memory resource → mỗi worker phải có pool riêng.

### Hệ quả ở Cloudflare scale

- Cloudflare có hàng nghìn edge server, mỗi server vài chục worker.
- 1 origin server thấy: **hàng trăm nghìn connection** từ Cloudflare global.
- Origin tốn RAM/fd cho mỗi connection.
- Đa số connection **idle 99% thời gian** — lãng phí.

→ Cloudflare muốn: **N edge × M worker, nhưng chỉ K connection share** đến origin. Pingora dùng async runtime (Tokio) + shared pool giữa thread.

Cloudflare claim:
- **160× giảm** số new connection đến origin.
- **87% → 99.92%** connection reuse rate.
- **434 năm/ngày** TLS handshake time saved (across all customers).

## Vấn đề 2 — Process per CPU core = thiếu work stealing

NGINX worker = process độc lập. Mỗi worker pin 1 CPU core. Hệ quả:

```text
   Worker 1 (CPU 0): đang xử lý request HEAVY (parse JSON 100MB)
   Worker 2 (CPU 1): idle, không có request
   Worker 3 (CPU 2): idle
   Worker 4 (CPU 3): idle
   
   → CPU 0 100%, CPU 1-3 0%. Worker 2-4 KHÔNG thể "steal" work của 1.
```

Pingora dùng **multi-threading + work stealing** (Tokio runtime): khi 1 thread bận, thread khác lấy task từ queue của nó.

→ Tận dụng CPU đều hơn, đặc biệt với workload có request weight không đều.

## Vấn đề 3 — Hot reload + dynamic config

NGINX reload config:
- `nginx -s reload` → master fork worker mới với config mới.
- Worker cũ tiếp tục xử lý request đang chạy, hết → exit.
- **Không drop connection** trong khi reload.

Hạn chế:
- **Không có API dynamic** — phải reload toàn bộ config khi đổi 1 upstream server.
- Hot-reload mỗi giây gặp issue (memory leak với upstream zone).
- Connection state (cache, rate limit counter) **không persist** qua reload.

NGINX Plus có API dynamic, nhưng paid. Envoy có xDS API (control plane) cho service mesh.

## Vấn đề 4 — Custom logic khó

NGINX có 2 cách extend:
1. **Lua module** (OpenResty) — viết Lua trong config.
2. **C module** — viết module C, compile vào NGINX.

Cả 2 phức tạp:
- Lua đủ cho logic đơn giản, nhưng performance kém C.
- C module = đụng tới NGINX internals, phải hiểu API.
- Test khó, debug khó.

Cloudflare custom logic phức tạp (custom retry, custom load balancing) — viết bằng Rust trong Pingora dễ hơn extend NGINX nhiều.

## Vấn đề 5 — Observability hạn chế

NGINX OSS có:
- `stub_status` — basic counter.
- Access log + error log (text).

Không có:
- Distributed tracing built-in.
- Metric chi tiết theo upstream / location.
- Histograms.
- Health check status API.

Workaround:
- `nginx-vts-module` (3rd party) — vts stats.
- `nginx-prometheus-exporter` — convert stub_status → Prometheus.
- OpenTelemetry tracing module (mới).
- NGINX Plus có dashboard built-in (paid).

Envoy/Pingora built-in observability tốt hơn từ ngày 1.

## Vấn đề 6 — gRPC support hạn chế

NGINX hỗ trợ `grpc_pass` từ 1.13.10 (2018). Nhưng:
- Streaming gRPC (bi-directional) support buggy.
- Header trailer compatibility.
- gRPC-Web bridge phải qua module.

Envoy purpose-built cho gRPC — handle native, bi-directional streaming, retry policies, load balancing per RPC.

## Đường giải quyết của Cloudflare

3 lựa chọn được Cloudflare cân nhắc:

### Option A — Fork NGINX

- Modify NGINX source code cho needs.
- Push patches upstream? Không khả thi (quá specific to Cloudflare).
- Maintain fork = burden khi NGINX upstream cập nhật.

→ Bỏ.

### Option B — Migrate to Envoy

- Envoy có solve được nhiều vấn đề (multi-threaded, xDS, gRPC native).
- Nhưng: kiến trúc Envoy cũng có giới hạn riêng ở Cloudflare scale.
- 3rd party dependency → vẫn có thể đụng giới hạn tương lai.

→ Bỏ.

### Option C — Build from scratch (chọn)

- Pingora bằng **Rust** + Tokio (async runtime).
- Multi-threaded, shared connection pool.
- Custom Rust HTTP library (không dùng `hyper`).
- Work stealing.
- Designed cho Cloudflare specific needs.

Trade-off: 5+ năm dev time, 1 team chuyên trách. Chỉ doanh nghiệp Cloudflare scale làm được.

## So sánh NGINX vs alternatives

| | NGINX OSS | NGINX Plus | Envoy | HAProxy | Pingora |
|---|---|---|---|---|---|
| Language | C | C | C++ | C | Rust |
| Concurrency | Process per core | Process per core | Multi-thread | Multi-thread (recent) | Multi-thread + work stealing |
| Connection pool | Per-worker | Per-worker | Global | Per-process | Global |
| Dynamic config | Reload | API | xDS | Runtime API | Custom |
| Observability | Basic | Dashboard | Rich | Stick | Rich |
| gRPC | OK | OK | Excellent | Limited | Excellent |
| License | BSD | Commercial | Apache 2 | GPL | Internal |
| Maturity | 20+ years | 20+ years | 8 years | 20+ years | 3 years |
| Public availability | OSS | Paid | OSS | OSS | Open source as `pingora-core` |

## Khi nào NGINX **vẫn** là lựa chọn tốt?

Bỏ Pingora hype — NGINX vẫn là **lựa chọn đúng cho 90% công ty**:

| Scenario | NGINX phù hợp? |
|---|---|
| Website + reverse proxy | ✓ Tuyệt vời |
| API gateway scale vừa | ✓ Đủ |
| Static file serving + cache | ✓ Cực giỏi |
| Microservice sidecar | △ Envoy/Linkerd tốt hơn |
| Service mesh phức tạp | ✗ Envoy/Istio |
| Hyperscale CDN (>1B req/day) | ✗ Cloudflare scale = need custom |
| Auto-HTTPS đơn giản | △ Caddy nhanh hơn |
| Network policy K8s | ✗ Cilium/Calico |

## Bài học cho engineer thường

3 takeaway:

1. **Không có proxy "perfect"**. Mỗi tool có trade-off — NGINX simple+mature, Envoy feature-rich+complex, Pingora performance+internal-only.
2. **Đo trước, chọn sau**. Đừng migrate từ NGINX sang Envoy chỉ vì "Cloudflare làm thế". Scale của bạn khác.
3. **Hiểu giới hạn**. Khi NGINX vỡ vì connection pool, bạn biết là pattern bug ở đây — không phải code app của bạn.

## Bonus — alternative khác đáng quan tâm

| Tool | Đặc trưng |
|---|---|
| **Caddy** | Auto-HTTPS, config gọn. Tốt cho dev / SME nhỏ |
| **Traefik** | Auto-discover service Docker/K8s. Tốt cho container-first |
| **HAProxy** | LB chuyên dụng, observability tốt. Production-proven cho TCP/HTTP load balancing |
| **Envoy** | Service mesh, xDS, gRPC native. Cloud-native standard |
| **Linkerd** | Service mesh nhẹ, mTLS auto. Rust + Go. |
| **OpenResty** | NGINX + LuaJIT — extend với Lua dễ hơn module C |
| **Pingora** | Cloudflare. `pingora-core` open-source, framework để build proxy custom. |

## Tóm tắt bài 3

- NGINX có 5 giới hạn chính: per-worker pool, no work stealing, dynamic config kém, custom logic khó, observability basic.
- Cloudflare build Pingora vì NGINX không scale ở mức Cloudflare (160B req/day).
- Tradeoff: Pingora chỉ Cloudflare làm được — đầu tư massive.
- NGINX vẫn là lựa chọn đúng cho 90% công ty — đừng over-engineer.
- Alternative ecosystem: Caddy, Traefik, HAProxy, Envoy, Linkerd, OpenResty, Pingora.

**Bài kế tiếp** → [Bài 4: Tóm tắt toàn khoá NGINX](04-course-summary.md)
