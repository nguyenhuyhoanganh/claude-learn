# Bài 4: CAP Theorem (Định lý CAP)

## CAP Theorem là gì?

> **CAP Theorem** (Eric Brewer, 1999): Trong distributed database, khi có **network partition**, hệ thống **không thể đồng thời đảm bảo cả Consistency lẫn Availability** — phải chọn một.

## Ba thuộc tính

### C — Consistency (Nhất quán)

> Mọi read request nhận được **giá trị mới nhất** (hoặc error).

Tất cả clients thấy cùng dữ liệu tại cùng thời điểm — không có stale data.

### A — Availability (Sẵn sàng)

> Mọi request nhận được **non-error response** (nhưng có thể không phải giá trị mới nhất).

Hệ thống luôn respond, dù data có thể stale.

### P — Partition Tolerance (Chịu đựng phân vùng)

> Hệ thống tiếp tục hoạt động dù có **network partition** (messages bị drop hoặc delay giữa các nodes).

## Trực quan hóa với ví dụ

**Setup:** 3 replica databases chứa counter `inventory = 1` (còn 1 sản phẩm)

```
Normal (no partition):
Replica 1 ←──network──→ Replica 2 ←──network──→ Replica 3
  inventory=1              inventory=1              inventory=1
Tất cả sync → OK!

Network Partition xảy ra:
Replica 1 ←──network──→ Replica 2   ╳   Replica 3 (isolated!)
```

**Scenario:** Service A tăng inventory từ 1 → 2 trên Replica 1, nhưng Replica 3 bị cô lập.

```
Replica 1: inventory = 2
Replica 2: inventory = 2
Replica 3: inventory = 1  ← Không sync được!
```

**Service B query Replica 3 → phải chọn:**

### Option 1: Chọn Availability

```
Replica 3: "Tôi trả lời 1 (dù có thể stale)"
→ Service B nhận: inventory = 1
→ Available: ✅ | Consistent: ❌
```

### Option 2: Chọn Consistency

```
Replica 3: "Tôi không thể đảm bảo data mới nhất → Error"
→ Service B nhận: Error (thử lại sau)
→ Consistent: ✅ | Available: ❌
```

**→ CAP Theorem: Khi có partition, phải chọn C hoặc A.**

## Khi nào partition xảy ra?

**Rất thường xuyên!** Ngay cả 2 servers kết nối với nhau sẽ gặp network issues.

**Thực tế:**
- Không thể có distributed database mà không có Partition Tolerance
- DB chạy trên 1 machine: không có partition → có thể có cả C và A
- DB chạy trên nhiều machines: **phải chọn P → rồi chọn C hoặc A**

```
CA (không có P): Database 1 máy → không scale
CP: Distributed, consistent → sacrifice availability khi partition
AP: Distributed, available → sacrifice consistency khi partition
```

## Khi nào chọn C, khi nào chọn A?

### Chọn Consistency khi: Data Critical

```
Ví dụ: Inventory counter = 1 (còn 1 sản phẩm)

Nếu 2 users cùng thấy inventory = 1 và đặt hàng:
→ Oversell! → Hủy đơn → Customer unhappy
→ Phải đảm bảo chỉ 1 user thấy inventory = 1 khi còn hàng

Chọn Consistency: Trả error nếu không sync được
```

**Use cases CP:**
- Inventory management (không muốn oversell)
- Financial transactions (số dư, payment)
- Booking systems (không muốn double-booking)

### Chọn Availability khi: UX quan trọng hơn accuracy

```
Ví dụ: Like count trên social media post

Nếu hiển thị 9,999 likes thay vì 10,000 (stale data):
→ User không để ý
→ Trả error thì UX xấu hơn nhiều!

Chọn Availability: Trả data stale còn hơn error
```

**Use cases AP:**
- Like/view counts
- Product recommendations
- Search results
- User feeds

## Không phải black/white

Thực tế, **consistency là một dial** — không phải binary:

```
Strong Consistency ←────────────────────────→ Eventual Consistency
          ↑                                              ↑
    Chậm hơn, khó scale                   Nhanh hơn, scale tốt
    (Banks, inventory)                    (Social media, CDN)
```

**Cấu hình phổ biến trong distributed databases:**
```
Write quorum = W, Read quorum = R, Total replicas = N

Strong consistency: W + R > N (overlap guaranteed)
Eventual consistency: W + R ≤ N (possible stale reads)
```

## CAP và Database Choices

| Database | CAP Choice | Use Case |
|----------|-----------|----------|
| **Cassandra** | AP | High availability, eventual consistency |
| **DynamoDB** | AP (configurable) | AWS scale, tunable consistency |
| **MongoDB** | CP (default) | Document store, consistency |
| **Redis** | AP | Cache, speed > consistency |
| **PostgreSQL** | CA (single node) | Financial, strong consistency |
| **Google Spanner** | CP | Global consistency at scale |

## Tóm tắt

```
CAP Theorem:
Khi có Network Partition → Phải chọn: Consistency OR Availability

C = Mọi read nhận giá trị mới nhất (hoặc error)
A = Mọi request nhận response (có thể stale)
P = Phải chịu được partition (distributed system = phải có P)

→ Thực tế: Chọn giữa CP và AP

Chọn Consistency khi: Data critical (inventory, finance, booking)
Chọn Availability khi: UX quan trọng hơn (social, recommendations)

Nhớ: Đây là trade-off quan trọng nhất trong distributed systems!
```

---
**Tiếp theo:** Bài 5 - Unstructured Data Storage →
