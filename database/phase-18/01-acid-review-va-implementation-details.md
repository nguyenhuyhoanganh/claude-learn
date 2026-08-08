# Phase 18: ACID — Ôn tập và chi tiết triển khai

Bài cuối của khoá. Nó quay lại ACID — nơi mọi thứ bắt đầu — nhưng lần này với toàn bộ kiến thức về page, index, khoá, MVCC, WAL và nhân bản đã tích luỹ. Bốn chữ cái đó bây giờ không còn là định nghĩa nữa; chúng là **bốn cỗ máy** mà bạn đã mổ xẻ từng bộ phận.

## Bản đồ: mỗi chữ được thực thi ở đâu

```text
   ┌────────────────────────────────────────────────────────────────────┐
   │ A — ATOMICITY                                                      │
   │   Cơ chế : WAL + undo (InnoDB) hoặc nhiều phiên bản (PostgreSQL)   │
   │   Cài đặt: crash recovery lúc khởi động; ROLLBACK                  │
   │   Học ở  : phase-2 bài 2, phase-17 bài 1                           │
   ├────────────────────────────────────────────────────────────────────┤
   │ I — ISOLATION                                                      │
   │   Cơ chế : MVCC (snapshot) hoặc khoá (record/gap/next-key)         │
   │   Cài đặt: isolation level; SSI cho SERIALIZABLE                   │
   │   Học ở  : phase-2 bài 3, phase-8 bài 1, phase-17 bài 8            │
   ├────────────────────────────────────────────────────────────────────┤
   │ C — CONSISTENCY                                                    │
   │   Cơ chế : KHÔNG CÓ cơ chế riêng                                   │
   │   Cài đặt: ràng buộc bạn khai báo + HỆ QUẢ của A và I              │
   │   Học ở  : phase-2 bài 4, phase-14 bài 2                           │
   ├────────────────────────────────────────────────────────────────────┤
   │ D — DURABILITY                                                     │
   │   Cơ chế : WAL + fsync + checkpoint + ghi cả page                  │
   │   Cài đặt: synchronous_commit; innodb_flush_log_at_trx_commit      │
   │   Học ở  : phase-2 bài 2, phase-9 bài 1, phase-17 bài 1            │
   └────────────────────────────────────────────────────────────────────┘
```

Điểm đáng nhắc lại: **C không có cơ chế riêng của nó**. Không có "bộ máy consistency" nào trong database. Nhất quán là **kết quả** của việc thực thi tốt A và I, cộng với các ràng buộc bạn khai báo. Hiểu điều này giải thích vì sao [phase-2 bài 4](../phase-2/04-consistency-va-eventual-consistency.md) phải nói nhiều về khoá ngoại và job đối soát hơn là về "thuật toán consistency".

---

## Atomicity — hai kiến trúc, hai hoá đơn

```text
   POSTGRESQL — NHIỀU PHIÊN BẢN                INNODB — SỬA TẠI CHỖ
   ════════════════════════════                ════════════════════
   UPDATE → tạo TUPLE MỚI trong bảng           UPDATE → ghi đè, đẩy giá trị cũ
            phiên bản cũ vẫn nằm đó                     sang UNDO LOG

   ROLLBACK → ghi "XID 77 đã huỷ"              ROLLBACK → đọc undo log,
              → GẦN NHƯ TỨC THÌ                            GHI LẠI từng dòng
                                                          → chậm theo số dòng

   Hoá đơn : bảng PHÌNH, cần VACUUM            Hoá đơn : undo log phình,
             mọi index phải cập nhật                      đọc dữ liệu cũ chậm
```

Cả hai đều bị **transaction dài** làm hại — chỉ khác chỗ nào phình:

```sql
-- PostgreSQL: kiểm tra bảng có phình không
SELECT relname, n_dead_tup,
       round(100.0*n_dead_tup/NULLIF(n_live_tup+n_dead_tup,0),1) AS pct_chet
FROM pg_stat_user_tables WHERE n_dead_tup > 10000 ORDER BY n_dead_tup DESC;
```

```sql
-- MySQL: kiểm tra undo log có phình không
SELECT name, count FROM information_schema.innodb_metrics
WHERE name LIKE '%undo%' AND status = 'enabled';
```

### Ba thứ chặn việc dọn rác

Nhắc lại vì đây là nguyên nhân số một khiến bảng phình dù mọi thứ có vẻ bình thường:

```sql
-- 1. Transaction đang mở lâu
SELECT pid, now()-xact_start AS mo_bao_lau, state, left(query,50)
FROM pg_stat_activity WHERE xact_start IS NOT NULL ORDER BY xact_start LIMIT 5;

-- 2. Khe nhân bản không hoạt động
SELECT slot_name, active, wal_status FROM pg_replication_slots WHERE NOT active;

-- 3. Transaction chuẩn bị sẵn bị bỏ quên (2PC)
SELECT gid, prepared, age(now(), prepared) FROM pg_prepared_xacts;
```

Ba câu này nên nằm trong bảng theo dõi của mọi hệ thống PostgreSQL.

---

## Isolation — bảng thực tế, không phải bảng chuẩn

```text
   BẢNG CHUẨN ANSI mô tả MỨC TỐI THIỂU mà hệ PHẢI đạt.
   Nó KHÔNG mô tả hệ THẬT SỰ làm gì.
```

| Hệ | Mặc định | `READ UNCOMMITTED` thật? | `REPEATABLE READ` chặn phantom? | Cơ chế |
|---|---|---|---|---|
| **PostgreSQL** | `READ COMMITTED` | Không (nâng thành RC) | **CÓ** | Snapshot |
| **MySQL InnoDB** | `REPEATABLE READ` | Có | Có với `SELECT` thường | **Gap lock** |
| **Oracle** | `READ COMMITTED` | Không hỗ trợ | Không có mức này | Snapshot |
| **SQL Server** | `READ COMMITTED` | **Có** (`NOLOCK`) | Không (trừ khi bật `SNAPSHOT`) | Khoá |

Hai cơ chế, cùng một kết quả:

```text
   CHẶN PHANTOM BẰNG SNAPSHOT (PostgreSQL)
     "lọc bỏ mọi dòng sinh ra sau thời điểm tôi bắt đầu"
     → không khoá gì cả → song song cao
     → nhưng KHÔNG chặn được write skew

   CHẶN PHANTOM BẰNG GAP LOCK (MySQL)
     "khoá luôn các khoảng trống để không ai chèn vào"
     → chặn thật → ít song song hơn
     → gây deadlock khó hiểu ([phase-17 bài 8])
```

### Ba bất thường theo thứ tự khó chặn

```text
   1. DIRTY READ        →  mọi hệ hiện đại đều chặn (trừ SQL Server NOLOCK)
   2. NON-REPEATABLE    →  REPEATABLE READ chặn
   3. PHANTOM           →  PostgreSQL RR chặn; MySQL RR chặn bằng gap lock
   4. LOST UPDATE       →  PostgreSQL RR chặn (lỗi 40001); RC KHÔNG chặn
   5. WRITE SKEW        →  CHỈ SERIALIZABLE chặn
```

Mức 5 là mức mà hầu hết mọi người không biết tồn tại cho tới khi gặp:

```text
   Quy định: ca trực phải có ít nhất 1 bác sĩ. Hiện có 2.
   An:   đếm → 2 → xin nghỉ.  COMMIT
   Bình: đếm → 2 → xin nghỉ.  COMMIT
   → 0 bác sĩ trực

   Cả hai đều đọc đúng, ghi đúng dòng CỦA MÌNH, không ghi đè nhau.
   → không phải lost update
   → CHỈ theo dõi PHỤ THUỘC ĐỌC-GHI mới bắt được
```

---

## Consistency — bốn tầng bảo vệ

```text
   ┌──────────────────────────────────────────────────────────────┐
   │ TẦNG 1 — KIỂU DỮ LIỆU                                        │
   │   INT, DATE, NUMERIC... chặn dữ liệu vô nghĩa ngay từ đầu    │
   │   → đừng TEXT cho MỌI THỨ là bỏ tầng bảo vệ đầu tiên          │
   ├──────────────────────────────────────────────────────────────┤
   │ TẦNG 2 — RÀNG BUỘC                                           │
   │   NOT NULL, CHECK, UNIQUE, FOREIGN KEY                       │
   │   → KHÔNG đường nào phá được: không ứng dụng, không job,     │
   │     không kỹ sư sửa tay lúc khẩn cấp                          │
   ├──────────────────────────────────────────────────────────────┤
   │ TẦNG 3 — TRANSACTION                                         │
   │   Bảo vệ BẤT BIẾN giữa NHIỀU dòng/nhiều bảng                 │
   │   → thứ mà ràng buộc không diễn đạt được                     │
   ├──────────────────────────────────────────────────────────────┤
   │ TẦNG 4 — ĐỐI SOÁT                                            │
   │   Job định kỳ kiểm tra những gì ba tầng trên không giữ được  │
   │   → bộ đếm phi chuẩn hoá, dữ liệu mồ côi xuyên dịch vụ       │
   └──────────────────────────────────────────────────────────────┘
```

Tầng 4 là tầng bị bỏ qua nhiều nhất, và nó là tầng duy nhất bắt được các lỗi mà **không cơ chế nào của database phát hiện được**:

```sql
-- Bộ đếm lệch
SELECT p.id, p.comment_count, count(c.id) AS dem_that
FROM posts p LEFT JOIN comments c ON c.post_id = p.id
GROUP BY p.id, p.comment_count
HAVING p.comment_count <> count(c.id);

-- Dữ liệu mồ côi (khi không thể dùng khoá ngoại — ví dụ xuyên shard)
SELECT o.id FROM orders o
LEFT JOIN users u ON u.id = o.user_id
WHERE u.id IS NULL;

-- Bất biến nghiệp vụ
SELECT id FROM accounts WHERE balance < 0;
```

Quy tắc: **mọi cột phi chuẩn hoá phải đi kèm một truy vấn đối soát**. Viết không được truy vấn đó thì đừng phi chuẩn hoá cột đó.

---

## Durability — nút vặn ở đâu

```text
   POSTGRESQL                          MYSQL INNODB
   ══════════                          ════════════
   synchronous_commit                  innodb_flush_log_at_trx_commit
     off          → mất vài trăm ms      0  → mất ~1s kể cả khi MySQL chết
     local        → mất nếu máy chết     2  → mất ~1s nếu MÁY chết
     on (mặc định)→ không mất            1  → không mất (mặc định)
     remote_write → chờ replica nhận
     remote_apply → chờ replica áp dụng

   ⚡ PostgreSQL vặn được THEO TỪNG TRANSACTION:
      BEGIN; SET LOCAL synchronous_commit = 'remote_apply'; ... COMMIT;
```

Đây là công cụ mạnh và ít được dùng: **chuyển tiền chạy ở mức bền tuyệt đối, ghi log chạy ở mức nhanh — trong cùng một database**.

### Năm tầng có thể nói dối

```text
   1. Ứng dụng             →  "đã commit"  ← chỉ là lời hứa của tầng dưới
   2. Bộ nhớ đệm database  →  mất điện ở đây = MẤT
   3. Page cache của HĐH   →  ⚠ TRẢ VỀ "xong" KHI CHƯA GHI XUỐNG ĐĨA
   4. Bộ đệm của thiết bị  →  ⚠ SSD/RAID cũng có RAM riêng
   5. Chip nhớ vật lý      →  ✔ đến đây mới thật sự bền vững
```

`fsync` ép các tầng 3 và 4 nói thật. Nhưng tầng 4 có thể **vẫn nói dối** nếu ổ đĩa không trung thực:

```bash
docker exec -it pg pg_test_fsync
```

```text
        fdatasync    17948.212 ops/sec    56 usecs/op
```

```text
   Con số HỢP LÝ: 20-100 µs trên NVMe có tụ chống mất điện
   Con số ĐÁNG NGỜ: hàng triệu ops/sec → ổ đĩa đang NÓI DỐI fsync
                    → mọi cam kết durability đều VÔ NGHĨA
```

---

## Ba thứ ACID KHÔNG bảo vệ

Đây là phần quan trọng nhất của bài ôn tập, vì nó vẽ ranh giới:

### 1. Không bảo vệ khỏi logic ứng dụng sai

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance - 100 WHERE id = 2;   -- ← LỖI: phải là +100
COMMIT;
```

```text
   ACID đảm bảo cả hai lệnh CÙNG THÀNH CÔNG hoặc CÙNG THẤT BẠI.
   Nó KHÔNG biết bạn viết sai dấu.
   → Bạn vừa trừ tiền CẢ HAI tài khoản, một cách hoàn toàn "đúng ACID".
```

### 2. Không bảo vệ khỏi mất dữ liệu do con người

```sql
DELETE FROM users;   -- quên mệnh đề WHERE
COMMIT;
```

```text
   ACID đảm bảo lệnh này được thực hiện ĐẦY ĐỦ và BỀN VỮNG.
   Và nó được NHÂN BẢN sang mọi replica trong ~200 ms.

   → Chỉ PITR ([phase-17 bài 1]) mới cứu được: quay ngược về
     thời điểm TRƯỚC khi lệnh đó chạy.
   → Replica KHÔNG phải bản sao lưu.
```

### 3. Không tự động mở rộng ra nhiều máy

```text
   ACID là đảm bảo TRONG MỘT database instance.
   Vượt ra ngoài nó:
     → 2PC (chặn, khó vận hành)
     → Saga (không có cô lập)
     → hoặc THIẾT KẾ ĐỂ KHÔNG CẦN ([phase-17 bài 4])
```

---

## Bảng tra: chọn mức đảm bảo theo dữ liệu

| Loại dữ liệu | Isolation | Durability | Nhân bản | Ràng buộc |
|---|---|---|---|---|
| Số dư tài khoản | `READ COMMITTED` + `FOR UPDATE` | `on` | Đồng bộ | `CHECK (balance >= 0)` + sổ cái |
| Đặt chỗ, vé | `READ COMMITTED` + `FOR UPDATE` | `on` | Đồng bộ | `UNIQUE` trên chỗ |
| Tồn kho | Cập nhật có điều kiện | `on` | Đồng bộ | `CHECK (qty >= 0)` |
| Đơn hàng | `READ COMMITTED` | `on` | Đồng bộ | Khoá ngoại đầy đủ |
| Hồ sơ người dùng | `READ COMMITTED` | `on` | Bất đồng bộ | `UNIQUE (email)` |
| Báo cáo, xuất dữ liệu | `REPEATABLE READ` | — | Đọc từ replica | — |
| Đếm lượt thích | `READ COMMITTED` | `off` được | Bất đồng bộ | Job đối soát |
| Nhật ký sự kiện | `READ COMMITTED` | **`off`** | Bất đồng bộ | Không cần |
| Phiên đăng nhập | — | Redis `everysec` | — | TTL |

Bảng này là kết tinh của cả khoá: **một hệ thống thật cần nhiều mức đảm bảo khác nhau cho các loại dữ liệu khác nhau**. Áp một mức duy nhất cho tất cả thì vừa chậm vừa không đủ an toàn ở đúng chỗ cần.

---

## Danh sách kiểm tra vận hành

```text
   ┌─ ATOMICITY ─────────────────────────────────────────────────┐
   │ □ idle_in_transaction_session_timeout đã đặt                │
   │ □ Cảnh báo transaction mở > 5 phút                          │
   │ □ Cảnh báo khe nhân bản không hoạt động                     │
   │ □ Theo dõi n_dead_tup / pct_chet trên các bảng lớn          │
   │ □ autovacuum_vacuum_scale_factor chỉnh riêng cho bảng lớn   │
   └─────────────────────────────────────────────────────────────┘
   ┌─ ISOLATION ─────────────────────────────────────────────────┐
   │ □ Biết rõ isolation level mặc định của hệ đang dùng         │
   │ □ Có vòng lặp thử lại cho lỗi 40001 và deadlock             │
   │ □ Khoá theo THỨ TỰ nhất quán (chống deadlock)               │
   │ □ Theo dõi pg_stat_database.deadlocks                       │
   └─────────────────────────────────────────────────────────────┘
   ┌─ CONSISTENCY ───────────────────────────────────────────────┐
   │ □ Khoá ngoại được khai báo (không bỏ "cho nhanh")           │
   │ □ CHECK cho mọi bất biến diễn đạt được                      │
   │ □ MỌI cột phi chuẩn hoá có truy vấn đối soát                │
   │ □ Job đối soát chạy định kỳ và CÓ CẢNH BÁO                  │
   └─────────────────────────────────────────────────────────────┘
   ┌─ DURABILITY ────────────────────────────────────────────────┐
   │ □ Đã chạy pg_test_fsync, con số HỢP LÝ                      │
   │ □ full_page_writes = on                                     │
   │ □ Sao lưu ĐẦY ĐỦ + WAL archive (PITR), không chỉ replica    │
   │ □ ĐÃ DIỄN TẬP PHỤC HỒI trong 3 tháng gần đây                │
   │ □ Bản sao lưu được MÃ HOÁ                                   │
   └─────────────────────────────────────────────────────────────┘
```

Dòng "đã diễn tập phục hồi" là dòng quan trọng nhất trong bốn khối. **Một bản sao lưu chưa từng được phục hồi thử thì chưa phải là bản sao lưu** — nó chỉ là một file mà bạn hy vọng dùng được.

---

## Ba mươi giây tổng kết cả khoá

Nếu phải tóm tắt toàn bộ khoá trong một khung tư duy:

```text
   1. DATABASE ĐẾM PAGE, KHÔNG ĐẾM DÒNG.
      Mọi câu hỏi về hiệu năng đều quy về: "phải đọc bao nhiêu page?"
      ([phase-3 bài 1])

   2. INDEX LÀ BẢN SAO ĐÃ SẮP XẾP — và nó CÓ GIÁ.
      Nhanh khi đọc, chậm khi ghi, tốn đĩa, tốn RAM.
      Chỉ đáng khi lọc ra dưới ~10% số dòng.
      ([phase-4])

   3. MỌI ĐẢM BẢO ĐỀU CÓ NÚT VẶN.
      Isolation, durability, nhất quán đọc — đều chỉnh được,
      và chỉnh được THEO TỪNG TRANSACTION.
      ([phase-2], [phase-9])

   4. TRANH CHẤP GIẢI BẰNG THỨ TỰ, KHÔNG BẰNG SỐ LƯỢNG.
      Deadlock sinh ra từ thứ tự khoá khác nhau, không từ số khoá.
      ([phase-8 bài 1])

   5. MỌI ĐẶC TÍNH KIẾN TRÚC LÀ MỘT ĐÁNH ĐỔI.
      PostgreSQL vs MySQL, B+Tree vs LSM, bi quan vs lạc quan —
      không cái nào "tốt hơn", chỉ có "hợp hơn với tải của bạn".
      ([phase-17])

   6. LEO HẾT THANG TRƯỚC KHI NHẢY.
      Đo đạc → index → query → pool → cấu hình → máy lớn hơn →
      cache → replica → partition → tách chức năng → SHARDING.
      Chín nấc đầu quay đầu được. Nấc thứ mười thì không.
      ([phase-7 bài 3])
```

## Đọc tiếp

| Khoá | Nội dung |
|---|---|
| [sql-interview](../../sql-interview/README.md) | Tầng trên: **viết** SQL cho đúng và nhanh |
| [database-su-co-va-phong-van](../../database-su-co-va-phong-van/README.md) | Đi từ **sự cố thật** ngược về nguyên nhân |
| [orm-n-plus-1](../../orm-n-plus-1/README.md) | Vì sao ORM sinh N+1 và mỗi query thừa tốn bao nhiêu page |
| [backend-scaling-cases](../../backend-scaling-cases/README.md) | Áp dụng ở tầng hệ thống: pool, khoá, hàng đợi |
| [redis](../../redis/README.md) | Đối chiếu: hệ lưu trữ **trong RAM** đánh đổi khác hẳn |

## Tóm tắt

- **C không có cơ chế riêng** — nó là hệ quả của A + I cộng với các ràng buộc bạn khai báo. Đây là điều hay bị hiểu sai nhất về ACID.
- **Atomicity có hai kiến trúc**: PostgreSQL nhiều phiên bản (rollback tức thì, bảng phình) và InnoDB sửa tại chỗ (bảng gọn, rollback theo số dòng). Cả hai đều bị **transaction dài** làm hại, chỉ khác chỗ phình.
- **Bảng isolation chuẩn mô tả mức tối thiểu, không mô tả hệ thật.** PostgreSQL chặn phantom bằng **snapshot**, MySQL bằng **gap lock** — cùng kết quả, hai cơ chế khác nhau, và cơ chế thứ hai sinh ra deadlock khó hiểu.
- **Write skew là bất thường mức 5** mà chỉ `SERIALIZABLE` chặn được — hầu hết mọi người không biết nó tồn tại cho tới khi gặp.
- **Consistency có bốn tầng**: kiểu dữ liệu → ràng buộc → transaction → **đối soát**. Tầng thứ tư bị bỏ qua nhiều nhất và là tầng duy nhất bắt được lỗi mà database không phát hiện được.
- **Durability là nút vặn**, và PostgreSQL vặn được **theo từng transaction** — chuyển tiền bền tuyệt đối, ghi log nhanh, trong cùng một database.
- **ACID không bảo vệ** khỏi: logic ứng dụng sai · lệnh xoá nhầm của con người (chỉ **PITR** cứu được, replica thì không) · và nó **không tự mở rộng ra nhiều máy**.
- Dòng quan trọng nhất trong danh sách kiểm tra: **đã diễn tập phục hồi chưa**. Một bản sao lưu chưa từng được phục hồi thử thì chưa phải là bản sao lưu.

---

*Hết khoá. Sáu điều trong phần "ba mươi giây tổng kết" là thứ đáng mang theo — phần còn lại tra lại được bất cứ lúc nào.*
