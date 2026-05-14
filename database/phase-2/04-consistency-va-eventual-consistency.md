# Bài 4: Consistency và Eventual Consistency

## Consistency trong ACID là gì?

**Consistency** (Tính nhất quán) là thuộc tính khó hiểu nhất trong ACID vì nó có hai nghĩa khác nhau:

1. **Consistency in Data** — Dữ liệu lưu trong database có nhất quán không?
2. **Consistency in Reads** — Khi đọc dữ liệu, kết quả có nhất quán không?

---

## Loại 1: Consistency in Data (Tính nhất quán của dữ liệu)

### Định nghĩa

Dữ liệu trong database phải luôn tuân thủ các **quy tắc bất biến** (invariants) mà bạn định nghĩa. Đây là responsibility của **developer/DBA**, không phải database.

### Ví dụ thực tế: Instagram

```
Bảng PICTURES:
┌────┬──────┬───────────┐
│ id │ blob │ num_likes │
├────┼──────┼───────────┤
│  1 │  ... │     5     │  ← Inconsistent! (thực ra chỉ có 2 likes)
│  2 │  ... │     3     │
└────┴──────┴───────────┘

Bảng LIKES:
┌─────────┬──────────────┐
│ user_id │ picture_id   │
├─────────┼──────────────┤
│  john   │      1       │  ← Chỉ có 2 records cho picture 1
│  edmund │      1       │
│  john   │      2       │
│  bob    │      4       │  ← picture_id=4 không tồn tại! (Orphan)
└─────────┴──────────────┘
```

**Hai loại inconsistency:**
1. `pictures.num_likes = 5` nhưng COUNT từ LIKES table = 2 → **Số liệu sai**
2. User "bob" like `picture_id=4` nhưng picture đó không tồn tại → **Orphaned record**

### Ai đảm bảo Consistency in Data?

**Database đảm bảo qua:**
- **Foreign Keys + CASCADE:** Xóa picture → tự động xóa likes tương ứng
- **Constraints:** `CHECK (num_likes >= 0)`, `UNIQUE`, `NOT NULL`
- **Triggers:** Tự động update `num_likes` khi thêm/xóa likes

**Nhưng quan trọng hơn — Atomicity và Isolation:**
- Nếu không có Atomicity → crash giữa chừng để lại dữ liệu nửa vời
- Nếu không có Isolation → concurrent updates làm dữ liệu không nhất quán

```
Không có Atomicity:
BEGIN
  INSERT INTO likes (user_id=john, pic_id=1)
  UPDATE pictures SET num_likes=num_likes+1 WHERE id=1
  *** CRASH ***
  → likes có record, nhưng num_likes chưa tăng → Inconsistent!

Có Atomicity:
Sau restart: Cả hai thay đổi đều bị rollback → Consistent!
```

---

## Loại 2: Consistency in Reads (Tính nhất quán khi đọc)

### Định nghĩa

Sau khi một transaction **commit** một thay đổi, các transaction mới phải đọc được **giá trị mới nhất** đó.

### Khi nào Consistency in Reads bị vi phạm?

Với **một database server duy nhất** → không có vấn đề.

Nhưng khi **scale out** (thêm replica nodes):

```
                 ┌──────────────────────┐
                 │   PRIMARY (Leader)   │
                 │  value_X = "new"     │ ← Đã update
                 └──────────┬───────────┘
                            │ Replication (async, có độ trễ)
              ┌─────────────┴──────────────┐
              ▼                            ▼
   ┌─────────────────┐          ┌─────────────────┐
   │  REPLICA 1      │          │  REPLICA 2      │
   │  value_X = "old"│          │  value_X = "old"│
   │  (chưa sync)    │          │  (chưa sync)    │
   └─────────────────┘          └─────────────────┘

Client A writes: value_X = "new" → Primary (SUCCESS)
Client B reads: value_X từ Replica 1 → Đọc được "old" ← INCONSISTENT!
```

**Đây gọi là Eventual Consistency:** Giá trị cũ chỉ là tạm thời. Sau vài milliseconds, replica sẽ sync và trả về giá trị mới.

---

## Eventual Consistency - Khái niệm và Hiểu lầm

### Eventual Consistency là gì?

> "Hệ thống **không nhất quán tức thời**, nhưng **sẽ nhất quán** sau một khoảng thời gian."

Đây **không phải** khái niệm chỉ dành cho NoSQL. **Cả relational database đều bị** khi scale out.

### Khi nào bạn bị Eventual Consistency?

**1. Khi có Read Replicas:**
```
Write → Primary
Read → Replica (lag vài ms đến vài giây)
```

**2. Khi có Cache:**
```
Write → Database
Read → Cache (stale data cho đến khi cache expire/invalidate)
```

**Quy tắc:** Bất cứ khi nào dữ liệu tồn tại ở **hai nơi** → Bạn đang đối mặt với eventual consistency.

### Eventual Consistency có chấp nhận được không?

**Tùy use case:**

| Use case | Có chấp nhận? |
|---|---|
| Hiển thị số likes (Kylie Jenner's photo) | ✅ Có (ai quan tâm 7M hay 7.001M?) |
| Hiển thị tồn kho sản phẩm | ⚠️ Tùy (hơi stale thường OK) |
| Kiểm tra số dư trước khi giao dịch | ❌ Không (phải đọc từ primary) |
| Rút tiền (double spend protection) | ❌ Tuyệt đối không |

### Giải pháp khi cần Strong Consistency

**Synchronous Replication:**
```
Client writes → Primary → Ghi WAL → Chờ replica confirm → Return success
                                      ↑
                              Replica phải commit xong mới return
                              
Ưu: Đọc từ replica luôn nhất quán
Nhược: Write chậm hơn (phải chờ replica)
```

**Read from Primary:**
```sql
-- PostgreSQL: Luôn đọc từ primary cho dữ liệu critical
-- Trong application code:
-- connection.setReadPreference('primary') -- cho critical reads
-- connection.setReadPreference('secondary') -- cho reads bình thường
```

---

## Consistency và NoSQL

### Misconception phổ biến

> "NoSQL không có consistency"

**Thực tế:**
- NoSQL **vẫn có** Consistency in Data — chỉ là không enforce theo cách relational database làm (foreign keys, joins)
- NoSQL **vẫn bị** Eventual Consistency in Reads khi scale
- Nhiều NoSQL databases (MongoDB 4+, DynamoDB) có transactions với ACID

```
MongoDB Example:
collection "users": { id: 1, follower_count: 150 }
collection "follows": [ {follower: A, following: 1}, {follower: B, following: 1}, ... ]

Nếu không dùng transactions:
- Xóa user 1 mà không xóa follows → Orphaned records
- Đây là Inconsistency in Data — xảy ra ở cả NoSQL!
```

### Eventual Consistency vs Corrupt Data

Đây là điểm rất quan trọng:

```
Eventual Consistency:
- Dữ liệu đúng ở primary
- Replica đọc giá trị cũ → SẼ nhất quán sau vài giây
- Có thể chờ được

Corrupt Data (No Atomicity):
- Dữ liệu SAI ngay trên primary
- Không có gì "eventually" fix được
- Cần manual intervention hoặc backup restore
```

**Kết luận:** Eventual Consistency chỉ có ý nghĩa khi dữ liệu gốc đã nhất quán. Nếu mất Atomicity, không có Eventual Consistency nào cứu được.

---

## Tổng kết ACID

```
ACID = Atomicity + Consistency + Isolation + Durability

┌─────────────────┬──────────────────────────────────────────┐
│ Atomicity       │ Tất cả hoặc không có gì                  │
│                 │ → Ngăn partial writes                    │
├─────────────────┼──────────────────────────────────────────┤
│ Consistency     │ Dữ liệu luôn nhất quán                   │
│                 │ → Được đảm bảo bởi A, I, D               │
├─────────────────┼──────────────────────────────────────────┤
│ Isolation       │ Transactions không ảnh hưởng lẫn nhau    │
│                 │ → 4 isolation levels                     │
├─────────────────┼──────────────────────────────────────────┤
│ Durability      │ Committed data không bao giờ mất         │
│                 │ → WAL + fsync                            │
└─────────────────┴──────────────────────────────────────────┘
```

---

**Tiếp theo:** 05-acid-thuc-hanh-voi-postgres.md →
