# Bài 1: Pipelining là gì và vì sao cần?

Đã có `getItem(id)` để lấy 1 item. Nhưng landing page cần **danh sách 10-30 item**. Vòng `for` gọi `getItem` 30 lần là sai. Đây là lúc phải biết về **pipelining** — kỹ thuật batch nhiều lệnh trong một round-trip mạng, có thể tăng throughput **50-100x** cho bulk operation.

## Bài toán: lấy nhiều item

Carousel "Most Expensive" có 10 item. Naive:

```ts
async function getItemsNaive(ids: string[]): Promise<Item[]> {
  const items: Item[] = [];
  for (const id of ids) {
    const it = await getItem(id);
    if (it) items.push(it);
  }
  return items;
}
```

10 `getItem` tuần tự. Mỗi round-trip ~0.5ms (cùng AZ). Tổng: ~5ms để lấy 10 item.

Với 100 item: ~50ms — đã đủ chậm để user cảm thấy.

Với 10,000 item (admin tool batch): ~5 giây — không chấp nhận được.

## Vấn đề thật: network round-trip

```text
Client                                    Redis
  │  ─── SET key val ─────────────────▶    │   ~0.05ms xử lý
  │                                         │
  │   ◀──────────── OK ────────────────     │   
  │                                         │
  │  ─── GET key ────────────────────▶     │   ~0.05ms xử lý
  │                                         │
  │   ◀──────────── val ───────────────     │
```

Mỗi câu lệnh:
- Server xử lý: ~50 μs
- Network RTT (cùng AZ): ~500 μs ← **bottleneck**

→ 90% thời gian là chờ network, không phải tính toán. Nếu gửi 100 lệnh tuần tự, **mỗi cái chờ ack rồi mới gửi tiếp** → 100 × 500 μs = 50ms phí.

## Giải pháp: pipeline

```text
Client                                    Redis
  │  ─── GET k1 ─────────────────────▶    │
  │  ─── GET k2 ─────────────────────▶    │   xử lý
  │  ─── GET k3 ─────────────────────▶    │   tuần tự
  │  ─── GET k4 ─────────────────────▶    │
  │  ─── GET k5 ─────────────────────▶    │
  │                                         │
  │   ◀── [v1, v2, v3, v4, v5] ────────    │
```

Gửi **liền** 5 lệnh không chờ ack. Redis xử lý tuần tự (vẫn single-threaded), nhưng client tiết kiệm 4 round-trip.

5 lệnh pipeline = **~1 RTT** thay vì 5. Càng nhiều lệnh, càng tiết kiệm.

## Benchmark thực tế

```bash
redis-benchmark -t set -n 100000 -P 1     # không pipeline
SET: 50,000 req/s

redis-benchmark -t set -n 100000 -P 10    # pipeline batch 10
SET: 400,000 req/s    # → 8x

redis-benchmark -t set -n 100000 -P 100   # pipeline batch 100
SET: 1,500,000 req/s  # → 30x
```

Cùng 1 Redis, cùng 1 client connection — chỉ thêm pipelining đã 30x throughput.

## Pipeline KHÔNG phải transaction

Lưu ý quan trọng:

| Khía cạnh | Pipeline | Transaction (MULTI/EXEC) |
|---|---|---|
| Mục đích | Batch để giảm RTT | Atomic group lệnh |
| Số RTT | 1 | 1 |
| Có atomic giữa các lệnh? | **KHÔNG** — client khác có thể xen | **CÓ** — block atomic |
| Có thể có lệnh khác nhau? | Có | Có |
| Nếu một lệnh fail? | Lệnh khác vẫn chạy | Tương tự (MULTI không rollback) |

Pipeline **chỉ là optimization mạng**, không có guarantee atomic. Hai client cùng pipeline có thể bị xen lẫn ở Redis side.

→ Khi cần atomic giữa các lệnh → dùng `MULTI/EXEC` (sẽ học phase-17). Khi chỉ cần tốc độ → pipeline.

## Hiểu sâu hơn: tại sao Redis xử lý pipeline đúng?

Redis nhận **stream byte** từ TCP socket. Pipeline gửi N lệnh = N command frames đầy tiếp đầu vào socket.

Redis event loop:
1. Đọc bytes có sẵn từ socket buffer.
2. Parse RESP, tách N lệnh.
3. Xử lý từng lệnh **tuần tự**.
4. Buffer N reply.
5. Flush reply ra socket (1 lần).

→ Client thấy N reply trong 1 round-trip. Server không "biết" đây là pipeline — chỉ xử lý byte đến.

**Hệ quả tốt**: client cũ chưa nâng cấp lib vẫn dùng được pipeline qua redis-cli pipe mode hoặc tự gửi byte. Pipeline là feature **của giao thức**, không phải feature riêng của Redis hay lib.

## Hệ quả xấu: queue lệnh lớn → mem spike

Nếu bạn pipeline **100,000 lệnh**:
- Client buffer hết 100k command bytes trước khi gửi.
- Server buffer hết 100k reply trước khi gửi về.

→ Cả hai side đều có thể OOM nếu pipeline quá lớn. Best practice: **chunk batch 100-10,000 lệnh**, không phải 1M.

## Khi nào KHÔNG dùng pipeline?

1. **Cần kết quả lệnh trước để quyết lệnh sau**:
   ```ts
   const userId = await client.get('current:user');
   if (userId) {
     await client.hGet(`users#${userId}`, 'email');
   }
   ```
   Lệnh thứ 2 phụ thuộc kết quả thứ 1 → **không thể** pipeline. Phải tuần tự hoặc dùng Lua.

2. **Lệnh đã nhanh và ít** (vd 2-3 lệnh): overhead pipeline setup nhỏ nhưng vẫn có. Không đáng để pipeline 2 lệnh.

3. **Lệnh chậm trên server** (vd `SORT` lớn, Lua script vô hạn): pipeline không giúp vì bottleneck là server CPU. Cần fix lệnh chậm trước.

4. **Throughput đã đủ**: nếu app ít traffic, không cần optimize sớm.

## Lợi ích phụ ngoài tốc độ

Pipeline còn:
- **Giảm CPU client**: 1 syscall `send()` thay vì N → tiết kiệm overhead.
- **Giảm CPU server**: 1 syscall `read()` đọc nhiều byte cùng lúc.
- **Giảm load LB / proxy**: ít connection event hơn.

## Mô hình tinh thần đơn giản

> Pipeline = "đừng chờ confirm, gửi tiếp ngay".  
> Giống như nhân viên giao hàng giao 10 gói liền thay vì giao 1 gói, chạy về kho lấy 1 gói tiếp.

## Tóm tắt bài 1

- Pipeline = gửi N lệnh trong 1 round-trip → tiết kiệm (N-1) RTT.
- Bottleneck thường là network (~500μs/RTT), không phải server (~50μs/lệnh).
- Benchmark thực: 10-50x throughput tuỳ batch size.
- **Không atomic** — pipeline khác transaction MULTI/EXEC.
- Chunk batch 100-10k, đừng pipeline 1M lệnh một lần.
- Không dùng pipeline khi lệnh sau phụ thuộc kết quả lệnh trước.

**Bài kế tiếp** → [Bài 2: Pipeline trong node-redis — Promise.all vs multi()](02-pipeline-trong-node-redis.md)
