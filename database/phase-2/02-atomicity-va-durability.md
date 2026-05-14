# Bài 2: Atomicity và Durability

## Atomicity - Tính nguyên tử

### Định nghĩa

**Atomicity** nghĩa là tất cả các query trong một transaction phải thành công. Nếu bất kỳ query nào thất bại, **toàn bộ transaction phải bị rollback** - không có trạng thái "nửa vời".

Tên gọi "atomicity" lấy từ khái niệm nguyên tử (atom) - thứ không thể chia nhỏ hơn. Một transaction là một đơn vị công việc không thể tách rời.

### Tại sao Atomicity quan trọng?

Xét ví dụ chuyển tiền:

```
Bảng ACCOUNTS:
┌────┬─────────┐
│ id │ balance │
├────┼─────────┤
│  1 │  1000   │
│  2 │   500   │
└────┴─────────┘

Transaction chuyển $100 từ account 1 sang account 2:
  Query 1: UPDATE accounts SET balance = balance - 100 WHERE id = 1
  Query 2: UPDATE accounts SET balance = balance + 100 WHERE id = 2
```

**Kịch bản thảm họa (không có Atomicity):**
1. Query 1 thực thi thành công → account 1 còn $900
2. **Database crash!**
3. Restart lại → account 1 chỉ còn $900, account 2 vẫn $500
4. **$100 biến mất!** Dữ liệu bị corrupt.

**Với Atomicity:**
- Khi database restart, nó phát hiện transaction chưa commit
- Tự động **rollback** → account 1 trở lại $1000
- Dữ liệu nhất quán

### Điều gì xảy ra khi database crash?

```
Timeline:
BEGIN
  Query 1 ✓
  Query 2 ✓
  ...
  Query 50 ✓
  *** CRASH ***    ← Database khởi động lại
                   ← Detect transaction chưa commit
                   ← Rollback tất cả 50 query
```

Quá trình rollback sau crash có thể **cực kỳ chậm** (hàng giờ) nếu transaction dài. Database phải hoàn tác từng thay đổi một.

> **Best Practice**: Tránh transaction dài. Transaction càng ngắn, rủi ro càng thấp và rollback càng nhanh.

### Trade-off: Ghi disk ngay vs Ghi memory trước

Đây là câu hỏi thiết kế quan trọng mà mỗi database engine quyết định khác nhau:

| Chiến lược | Ví dụ | Commit | Rollback |
|---|---|---|---|
| Ghi disk ngay khi execute | PostgreSQL | Rất nhanh (chỉ đánh dấu "committed") | Chậm (phải undo từng write) |
| Ghi memory, flush khi commit | Một số NoSQL | Chậm (flush tất cả ra disk) | Rất nhanh (xóa memory) |

**PostgreSQL** chọn chiến lược 1: mỗi query đã ghi xuống disk rồi, commit chỉ cần đánh dấu "transaction X đã committed" — cực kỳ nhanh.

---

## Durability - Tính bền vững

### Định nghĩa

**Durability** đảm bảo rằng: sau khi một transaction đã được **commit**, dữ liệu phải được lưu vĩnh viễn vào storage **không phụ thuộc vào bất kỳ sự kiện nào tiếp theo** (mất điện, crash, restart).

```
Cam kết của Durability:
"Nếu tôi nói với bạn là đã commit thành công,
 thì dù bạn rút phích cắm ngay lúc đó,
 khi khởi động lại, dữ liệu vẫn phải còn đó."
```

### Tại sao Durability khó?

Để đảm bảo durability, database phải ghi dữ liệu xuống **persistent storage** (SSD/HDD). Nhưng disk I/O chậm hơn RAM rất nhiều.

Một số database (đặc biệt là in-memory databases) hy sinh durability để đổi lấy tốc độ:
- Redis (mặc định): Ghi vào RAM, snapshot xuống disk định kỳ
- Nếu crash trong khoảng giữa 2 snapshot → mất dữ liệu
- Redis cho phép cấu hình mức độ durability

### Write-Ahead Log (WAL)

WAL là kỹ thuật chính để đảm bảo durability với hiệu năng tốt.

**Vấn đề:** Ghi trực tiếp vào data files (B-Tree, indexes...) rất chậm vì cấu trúc phức tạp.

**Giải pháp WAL:**

```
Luồng write thông thường:
Client → Database → Data files (chậm, phức tạp)

Luồng write với WAL:
Client → Database → WAL log (nhanh, đơn giản) → flush to disk
                  → Data files (background, không cần ngay)

Khi crash:
Restart → Đọc WAL log → Replay lại các thay đổi → Khôi phục state
```

WAL log chỉ ghi **delta changes** (những gì thay đổi), không phải toàn bộ data → compact và nhanh.

### OS Cache - Cái bẫy nguy hiểm

Đây là vấn đề ít được biết đến nhưng rất quan trọng:

```
Database → OS system call "write to disk"
              ↓
         OS nói "OK, done!"
              ↓
         Thực ra: OS chỉ ghi vào OS Cache (RAM)
              ↓
         OS sẽ flush xuống disk sau... khi nào đó
```

**Vấn đề:** OS báo "đã ghi thành công" nhưng thực tế chỉ nằm trong RAM. Nếu crash ngay lúc này → mất dữ liệu, dù database đã báo "committed".

**Giải pháp: `fsync()`**

Database dùng lệnh `fsync()` để **bỏ qua OS cache** và ép ghi trực tiếp xuống disk:

```
fsync() flow:
Database → fsync("wal_segment") → OS bị ép flush xuống disk ngay
                                → Chậm hơn, nhưng đảm bảo durability
```

Trade-off: `fsync()` chậm hơn nhiều → database phải dùng khéo, chỉ dùng khi commit.

### Redis và Durability

Redis cung cấp ba mức độ durability:

```
Mức 1 (Nhanh nhất, kém an toàn nhất):
  - Không fsync
  - Có thể mất đến 1 giây dữ liệu
  - Phù hợp: logs, caching

Mức 2 (Cân bằng):
  - fsync mỗi giây
  - Mất tối đa 1 giây dữ liệu
  - Phù hợp: hầu hết use cases

Mức 3 (Chậm nhất, an toàn nhất):
  - fsync sau mỗi write
  - Gần như không mất dữ liệu
  - Phù hợp: dữ liệu tài chính, critical data
```

### Tóm tắt

| Thuộc tính | Atomicity | Durability |
|---|---|---|
| Mục tiêu | Đảm bảo "tất cả hoặc không có gì" | Đảm bảo committed data không bị mất |
| Giải quyết vấn đề | Crash giữa chừng | Mất điện sau commit |
| Cơ chế | Rollback log | WAL + fsync |
| Trade-off | Long transaction → slow rollback | Durability → slower writes |

---

**Tiếp theo:** 03-isolation-va-read-phenomena.md →
