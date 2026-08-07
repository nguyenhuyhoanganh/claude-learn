# Phase 18: ACID — Ôn tập và chi tiết triển khai

Bài cuối của khoá. Nó quay lại ACID — nơi mọi thứ bắt đầu — nhưng lần này với toàn bộ kiến thức về page, index, khoá, MVCC, WAL và nhân bản đã tích luỹ. Bốn chữ cái đó bây giờ không còn là định nghĩa nữa; chúng là **bốn cỗ máy** mà bạn đã mổ xẻ từng bộ phận.

## Bản đồ: mỗi chữ được thực thi ở đâu

```text
   ┌────────────────────────────────────────────────────────────────────┐
   │ A — ATOMICITY                                                      │
   │   Co che : WAL + undo (InnoDB) hoac nhieu phien ban (PostgreSQL)   │
   │   Cai dat: crash recovery luc khoi dong; ROLLBACK                  │
   │   Hoc o  : phase-2 bai 2, phase-17 bai 1                           │
   ├────────────────────────────────────────────────────────────────────┤
   │ I — ISOLATION                                                      │
   │   Co che : MVCC (snapshot) hoac khoa (record/gap/next-key)         │
   │   Cai dat: isolation level; SSI cho SERIALIZABLE                   │
   │   Hoc o  : phase-2 bai 3, phase-8 bai 1, phase-17 bai 8            │
   ├────────────────────────────────────────────────────────────────────┤
   │ C — CONSISTENCY                                                    │
   │   Co che : KHONG CO co che rieng                                   │
   │   Cai dat: rang buoc ban khai bao + HE QUA cua A va I              │
   │   Hoc o  : phase-2 bai 4, phase-14 bai 2                           │
   ├────────────────────────────────────────────────────────────────────┤
   │ D — DURABILITY                                                     │
   │   Co che : WAL + fsync + checkpoint + ghi ca page                  │
   │   Cai dat: synchronous_commit; innodb_flush_log_at_trx_commit      │
   │   Hoc o  : phase-2 bai 2, phase-9 bai 1, phase-17 bai 1            │
   └────────────────────────────────────────────────────────────────────┘
```

Điểm đáng nhắc lại: **C không có cơ chế riêng của nó**. Không có "bộ máy consistency" nào trong database. Nhất quán là **kết quả** của việc thực thi tốt A và I, cộng với các ràng buộc bạn khai báo. Hiểu điều này giải thích vì sao [phase-2 bài 4](../phase-2/04-consistency-va-eventual-consistency.md) phải nói nhiều về khoá ngoại và job đối soát hơn là về "thuật toán consistency".

---

## Atomicity — hai kiến trúc, hai hoá đơn

```text
   POSTGRESQL — NHIEU PHIEN BAN                INNODB — SUA TAI CHO
   ════════════════════════════                ════════════════════
   UPDATE → tao TUPLE MOI trong bang           UPDATE → ghi de, day gia tri cu
            phien ban cu van nam do                     sang UNDO LOG

   ROLLBACK → ghi "XID 77 da huy"              ROLLBACK → doc undo log,
              → GAN NHU TUC THI                            GHI LAI tung dong
                                                          → cham theo so dong

   Hoa don : bang PHINH, can VACUUM            Hoa don : undo log phinh,
             moi index phai cap nhat                      doc du lieu cu cham
```

Cả hai đều bị **transaction dài** làm hại — chỉ khác chỗ nào phình:

```sql
-- PostgreSQL: kiem tra bang co phinh khong
SELECT relname, n_dead_tup,
       round(100.0*n_dead_tup/NULLIF(n_live_tup+n_dead_tup,0),1) AS pct_chet
FROM pg_stat_user_tables WHERE n_dead_tup > 10000 ORDER BY n_dead_tup DESC;
```

```sql
-- MySQL: kiem tra undo log co phinh khong
SELECT name, count FROM information_schema.innodb_metrics
WHERE name LIKE '%undo%' AND status = 'enabled';
```

### Ba thứ chặn việc dọn rác

Nhắc lại vì đây là nguyên nhân số một khiến bảng phình dù mọi thứ có vẻ bình thường:

```sql
-- 1. Transaction dang mo lau
SELECT pid, now()-xact_start AS mo_bao_lau, state, left(query,50)
FROM pg_stat_activity WHERE xact_start IS NOT NULL ORDER BY xact_start LIMIT 5;

-- 2. Khe nhan ban khong hoat dong
SELECT slot_name, active, wal_status FROM pg_replication_slots WHERE NOT active;

-- 3. Transaction chuan bi san bi bo quen (2PC)
SELECT gid, prepared, age(now(), prepared) FROM pg_prepared_xacts;
```

Ba câu này nên nằm trong bảng theo dõi của mọi hệ thống PostgreSQL.

---

## Isolation — bảng thực tế, không phải bảng chuẩn

```text
   BANG CHUAN ANSI mo ta MUC TOI THIEU ma he PHAI dat.
   No KHONG mo ta he THAT SU lam gi.
```

| Hệ | Mặc định | `READ UNCOMMITTED` thật? | `REPEATABLE READ` chặn phantom? | Cơ chế |
|---|---|---|---|---|
| **PostgreSQL** | `READ COMMITTED` | Không (nâng thành RC) | **CÓ** | Snapshot |
| **MySQL InnoDB** | `REPEATABLE READ` | Có | Có với `SELECT` thường | **Gap lock** |
| **Oracle** | `READ COMMITTED` | Không hỗ trợ | Không có mức này | Snapshot |
| **SQL Server** | `READ COMMITTED` | **Có** (`NOLOCK`) | Không (trừ khi bật `SNAPSHOT`) | Khoá |

Hai cơ chế, cùng một kết quả:

```text
   CHAN PHANTOM BANG SNAPSHOT (PostgreSQL)
     "loc bo moi dong sinh ra sau thoi diem toi bat dau"
     → khong khoa gi ca → song song cao
     → nhung KHONG chan duoc write skew

   CHAN PHANTOM BANG GAP LOCK (MySQL)
     "khoa luon cac khoang trong de khong ai chen vao"
     → chan that → it song song hon
     → gay deadlock kho hieu ([phase-17 bai 8])
```

### Ba bất thường theo thứ tự khó chặn

```text
   1. DIRTY READ        →  moi he hien dai deu chan (tru SQL Server NOLOCK)
   2. NON-REPEATABLE    →  REPEATABLE READ chan
   3. PHANTOM           →  PostgreSQL RR chan; MySQL RR chan bang gap lock
   4. LOST UPDATE       →  PostgreSQL RR chan (loi 40001); RC KHONG chan
   5. WRITE SKEW        →  CHI SERIALIZABLE chan
```

Mức 5 là mức mà hầu hết mọi người không biết tồn tại cho tới khi gặp:

```text
   Quy dinh: ca truc phai co it nhat 1 bac si. Hien co 2.
   An:   dem → 2 → xin nghi.  COMMIT
   Binh: dem → 2 → xin nghi.  COMMIT
   → 0 bac si truc

   Ca hai deu doc dung, ghi dung dong CUA MINH, khong ghi de nhau.
   → khong phai lost update
   → CHI theo doi PHU THUOC DOC-GHI moi bat duoc
```

---

## Consistency — bốn tầng bảo vệ

```text
   ┌──────────────────────────────────────────────────────────────┐
   │ TANG 1 — KIEU DU LIEU                                        │
   │   INT, DATE, NUMERIC... chan du lieu vo nghia ngay tu dau    │
   │   → dung TEXT cho MOI THU la bo tang bao ve dau tien          │
   ├──────────────────────────────────────────────────────────────┤
   │ TANG 2 — RANG BUOC                                           │
   │   NOT NULL, CHECK, UNIQUE, FOREIGN KEY                       │
   │   → KHONG duong nao pha duoc: khong ung dung, khong job,     │
   │     khong ky su sua tay luc khan cap                          │
   ├──────────────────────────────────────────────────────────────┤
   │ TANG 3 — TRANSACTION                                         │
   │   Bao ve BAT BIEN giua NHIEU dong/nhieu bang                 │
   │   → thu ma rang buoc khong dien dat duoc                     │
   ├──────────────────────────────────────────────────────────────┤
   │ TANG 4 — DOI SOAT                                            │
   │   Job dinh ky kiem tra nhung gi ba tang tren khong giu duoc  │
   │   → bo dem phi chuan hoa, du lieu mo coi xuyen dich vu       │
   └──────────────────────────────────────────────────────────────┘
```

Tầng 4 là tầng bị bỏ qua nhiều nhất, và nó là tầng duy nhất bắt được các lỗi mà **không cơ chế nào của database phát hiện được**:

```sql
-- Bo dem lech
SELECT p.id, p.comment_count, count(c.id) AS dem_that
FROM posts p LEFT JOIN comments c ON c.post_id = p.id
GROUP BY p.id, p.comment_count
HAVING p.comment_count <> count(c.id);

-- Du lieu mo coi (khi khong the dung khoa ngoai — vi du xuyen shard)
SELECT o.id FROM orders o
LEFT JOIN users u ON u.id = o.user_id
WHERE u.id IS NULL;

-- Bat bien nghiep vu
SELECT id FROM accounts WHERE balance < 0;
```

Quy tắc: **mọi cột phi chuẩn hoá phải đi kèm một truy vấn đối soát**. Viết không được truy vấn đó thì đừng phi chuẩn hoá cột đó.

---

## Durability — nút vặn ở đâu

```text
   POSTGRESQL                          MYSQL INNODB
   ══════════                          ════════════
   synchronous_commit                  innodb_flush_log_at_trx_commit
     off          → mat vai tram ms      0  → mat ~1s ke ca khi MySQL chet
     local        → mat neu may chet     2  → mat ~1s neu MAY chet
     on (mac dinh)→ khong mat            1  → khong mat (mac dinh)
     remote_write → cho replica nhan
     remote_apply → cho replica ap dung

   ⚡ PostgreSQL van duoc THEO TUNG TRANSACTION:
      BEGIN; SET LOCAL synchronous_commit = 'remote_apply'; ... COMMIT;
```

Đây là công cụ mạnh và ít được dùng: **chuyển tiền chạy ở mức bền tuyệt đối, ghi log chạy ở mức nhanh — trong cùng một database**.

### Năm tầng có thể nói dối

```text
   1. Ung dung             →  "da commit"  ← chi la loi hua cua tang duoi
   2. Bo nho dem database  →  mat dien o day = MAT
   3. Page cache cua HDH   →  ⚠ TRA VE "xong" KHI CHUA GHI XUONG DIA
   4. Bo dem cua thiet bi  →  ⚠ SSD/RAID cung co RAM rieng
   5. Chip nho vat ly      →  ✔ den day moi that su ben vung
```

`fsync` ép các tầng 3 và 4 nói thật. Nhưng tầng 4 có thể **vẫn nói dối** nếu ổ đĩa không trung thực:

```bash
docker exec -it pg pg_test_fsync
```

```text
        fdatasync    17948.212 ops/sec    56 usecs/op
```

```text
   Con so HOP LY: 20-100 µs tren NVMe co tu chong mat dien
   Con so DANG NGO: hang trieu ops/sec → o dia dang NOI DOI fsync
                    → moi cam ket durability deu VO NGHIA
```

---

## Ba thứ ACID KHÔNG bảo vệ

Đây là phần quan trọng nhất của bài ôn tập, vì nó vẽ ranh giới:

### 1. Không bảo vệ khỏi logic ứng dụng sai

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance - 100 WHERE id = 2;   -- ← LOI: phai la +100
COMMIT;
```

```text
   ACID dam bao ca hai lenh CUNG THANH CONG hoac CUNG THAT BAI.
   No KHONG biet ban viet sai dau.
   → Ban vua tru tien CA HAI tai khoan, mot cach hoan toan "dung ACID".
```

### 2. Không bảo vệ khỏi mất dữ liệu do con người

```sql
DELETE FROM users;   -- quen menh de WHERE
COMMIT;
```

```text
   ACID dam bao lenh nay duoc thuc hien DAY DU va BEN VUNG.
   Va no duoc NHAN BAN sang moi replica trong ~200 ms.

   → Chi PITR ([phase-17 bai 1]) moi cuu duoc: quay nguoc ve
     thoi diem TRUOC khi lenh do chay.
   → Replica KHONG phai ban sao luu.
```

### 3. Không tự động mở rộng ra nhiều máy

```text
   ACID la dam bao TRONG MOT database instance.
   Vuot ra ngoai no:
     → 2PC (chan, kho van hanh)
     → Saga (khong co co lap)
     → hoac THIET KE DE KHONG CAN ([phase-17 bai 4])
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
   │ □ idle_in_transaction_session_timeout da dat                │
   │ □ Canh bao transaction mo > 5 phut                          │
   │ □ Canh bao khe nhan ban khong hoat dong                     │
   │ □ Theo doi n_dead_tup / pct_chet tren cac bang lon          │
   │ □ autovacuum_vacuum_scale_factor chinh rieng cho bang lon   │
   └─────────────────────────────────────────────────────────────┘
   ┌─ ISOLATION ─────────────────────────────────────────────────┐
   │ □ Biet ro isolation level mac dinh cua he dang dung         │
   │ □ Co vong lap thu lai cho loi 40001 va deadlock             │
   │ □ Khoa theo THU TU nhat quan (chong deadlock)               │
   │ □ Theo doi pg_stat_database.deadlocks                       │
   └─────────────────────────────────────────────────────────────┘
   ┌─ CONSISTENCY ───────────────────────────────────────────────┐
   │ □ Khoa ngoai duoc khai bao (khong bo "cho nhanh")           │
   │ □ CHECK cho moi bat bien dien dat duoc                      │
   │ □ MOI cot phi chuan hoa co truy van doi soat                │
   │ □ Job doi soat chay dinh ky va CO CANH BAO                  │
   └─────────────────────────────────────────────────────────────┘
   ┌─ DURABILITY ────────────────────────────────────────────────┐
   │ □ Da chay pg_test_fsync, con so HOP LY                      │
   │ □ full_page_writes = on                                     │
   │ □ Sao luu DAY DU + WAL archive (PITR), khong chi replica    │
   │ □ DA DIEN TAP PHUC HOI trong 3 thang gan day                │
   │ □ Ban sao luu duoc MA HOA                                   │
   └─────────────────────────────────────────────────────────────┘
```

Dòng "đã diễn tập phục hồi" là dòng quan trọng nhất trong bốn khối. **Một bản sao lưu chưa từng được phục hồi thử thì chưa phải là bản sao lưu** — nó chỉ là một file mà bạn hy vọng dùng được.

---

## Ba mươi giây tổng kết cả khoá

Nếu phải tóm tắt toàn bộ khoá trong một khung tư duy:

```text
   1. DATABASE DEM PAGE, KHONG DEM DONG.
      Moi cau hoi ve hieu nang deu quy ve: "phai doc bao nhieu page?"
      ([phase-3 bai 1])

   2. INDEX LA BAN SAO DA SAP XEP — va no CO GIA.
      Nhanh khi doc, cham khi ghi, ton dia, ton RAM.
      Chi dang khi loc ra duoi ~10% so dong.
      ([phase-4])

   3. MOI DAM BAO DEU CO NUT VAN.
      Isolation, durability, nhat quan doc — deu chinh duoc,
      va chinh duoc THEO TUNG TRANSACTION.
      ([phase-2], [phase-9])

   4. TRANH CHAP GIAI BANG THU TU, KHONG BANG SO LUONG.
      Deadlock sinh ra tu thu tu khoa khac nhau, khong tu so khoa.
      ([phase-8 bai 1])

   5. MOI DAC TINH KIEN TRUC LA MOT DANH DOI.
      PostgreSQL vs MySQL, B+Tree vs LSM, bi quan vs lac quan —
      khong cai nao "tot hon", chi co "hop hon voi tai cua ban".
      ([phase-17])

   6. LEO HET THANG TRUOC KHI NHAY.
      Do dac → index → query → pool → cau hinh → may lon hon →
      cache → replica → partition → tach chuc nang → SHARDING.
      Chin nac dau quay dau duoc. Nac thu muoi thi khong.
      ([phase-7 bai 3])
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
