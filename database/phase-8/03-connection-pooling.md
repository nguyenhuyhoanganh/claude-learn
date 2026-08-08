# Bài 3: Connection Pooling — vì sao ít kết nối lại nhanh hơn nhiều kết nối

Một đội tăng `max_connections` từ 100 lên 1.000 để "chịu tải tốt hơn". Hệ thống **chậm đi ba lần**.

Đây không phải nghịch lý. Nó là hệ quả trực tiếp của cách PostgreSQL hoạt động, và bài này giải thích chính xác vì sao — cùng công thức để tính đúng con số.

## Một kết nối tốn gì

Trực giác: "kết nối chỉ là một socket TCP, nhẹ thôi."

Thực tế, mở một kết nối PostgreSQL gồm:

```text
   ┌─ 1. BẮT TAY TCP ────────────────────────────────┐
   │  SYN → SYN-ACK → ACK                            │  1 vòng mạng
   ├─ 2. BẮT TAY TLS (nếu bật) ──────────────────────┤
   │  ClientHello → ServerHello → chứng chỉ → khoá   │  2-3 vòng mạng
   ├─ 3. XÁC THỰC ───────────────────────────────────┤
   │  startup → yêu cầu SCRAM → chứng minh → OK      │  2 vòng mạng
   ├─ 4. TẠO TIẾN TRÌNH SERVER  ← ĐẮT NHẤT ──────────┤
   │  postmaster fork() một tiến trình HĐH mới       │  ~1-5 ms CPU
   │  cấp phát vùng nhớ riêng cho nó                 │
   ├─ 5. NẠP CATALOG ────────────────────────────────┤
   │  đọc thông tin schema vào cache của tiến trình  │
   └─────────────────────────────────────────────────┘

   TỔNG: 20-100 ms trong mạng LAN, hàng trăm ms qua Internet
```

So sánh với một truy vấn đơn giản mất **0,5 ms**: chi phí mở kết nối lớn hơn **40-200 lần** so với chính công việc bạn muốn làm.

### Điểm mấu chốt: PostgreSQL là một tiến trình cho mỗi kết nối

```text
   POSTGRESQL                          MYSQL
   ══════════                          ═════
   1 kết nối = 1 TIẾN TRÌNH HĐH        1 kết nối = 1 LUỒNG
   fork() ~1-5 ms                      tạo luồng ~0,1 ms
   ~5-10 MB bộ nhớ riêng               ~256 KB - 1 MB
   Chuyển ngữ cảnh đắt                 Chuyển ngữ cảnh rẻ hơn

   → 1.000 kết nối = 1.000 TIẾN TRÌNH  → 1.000 luồng: nặng nhưng chịu được
     ≈ 5-10 GB RAM chỉ để TỒN TẠI
```

Đây là gốc rễ của mọi vấn đề về connection trên PostgreSQL.

---

## Vì sao nhiều kết nối làm chậm hệ thống

Ba cơ chế, cộng dồn lại:

### 1. Chuyển ngữ cảnh (context switching)

```text
   MÁY 8 LÕI CPU

   20 kết nối hoạt động:
      → mỗi lõi phục vụ ~2,5 tiến trình
      → mỗi tiến trình chạy được một khoảng dài trước khi bị đổi
      → cache CPU (L1/L2/L3) còn nóng

   500 kết nối hoạt động:
      → mỗi lõi phục vụ ~62 tiến trình
      → HĐH đổi tiến trình liên tục
      → mỗi lần đổi: cache CPU BỊ XOÁ SẠCH, TLB bị xả
      → CPU dành phần lớn thời gian để CHUYỂN, không phải để LÀM
```

```text
   ┌──────────────────────────────────────────────────────┐
   │  CÔNG SUẤT HỮU ÍCH THEO SỐ KẾT NỐI                   │
   │                                                      │
   │  thông    ▲                                          │
   │  lượng    │      ╱‾‾‾╲                               │
   │           │    ╱       ╲___                          │
   │           │  ╱              ‾‾‾‾───___               │
   │           │╱                            ‾‾‾───___    │
   │           └──────────────────────────────────────▶   │
   │            10   20   50  100  200  500  1000         │
   │                  ▲                                   │
   │            ĐỈNH ở đây, sau đó GIẢM                   │
   └──────────────────────────────────────────────────────┘
```

### 2. Tranh chấp khoá nội bộ

Mỗi tiến trình PostgreSQL phải giành các khoá nhẹ (*lightweight lock*) để truy cập cấu trúc dữ liệu chung: buffer pool, WAL, bảng khoá. Càng nhiều tiến trình thì càng nhiều tranh chấp, và tranh chấp này **tăng nhanh hơn tuyến tính**.

### 3. Chi phí kết nối rảnh — điều ít ai biết

Ngay cả kết nối **không làm gì** cũng có giá:

```text
   Mỗi khi một transaction bắt đầu, PostgreSQL gọi GetSnapshotData().
   Hàm này phải DUYỆT QUA MỌI KẾT NỐI để xem ai đang chạy transaction nào.

   → Chi phí của MỌI truy vấn tăng theo TỔNG SỐ KẾT NỐI,
     kể cả những kết nối đang ngồi không.
```

PostgreSQL 14 cải thiện đáng kể chỗ này, nhưng nguyên tắc vẫn đúng: **kết nối rảnh không miễn phí**.

### Con số đo được

Andres Freund (một trong những người phát triển chính của PostgreSQL) đã đo trên máy 2×18 lõi:

```text
   Số kết nối hoạt động     Thông lượng
   ────────────────────     ───────────
        48                  1.032.435 TPS
       200                    822.000 TPS
      1000                    521.558 TPS

   → Từ 48 lên 1.000 kết nối: thông lượng GIẢM MỘT NỬA
```

Một trường hợp thường được nhắc trong cộng đồng Oracle: giảm pool từ **2.048 xuống 96** kết nối làm thời gian phản hồi giảm từ ~33 ms xuống ~2 ms.

---

## Connection pool là gì

**Pool** giữ sẵn một tập kết nối đã mở, cho ứng dụng mượn rồi trả lại.

```text
   KHÔNG CÓ POOL                       CÓ POOL
   ═════════════                       ═══════
   request 1 → mở kết nối (50ms)       ┌─────────────────┐
             → truy vấn (0,5ms)        │  POOL: 20 kết   │
             → đóng                    │  nối luôn mở    │
   request 2 → mở kết nối (50ms)       └────────┬────────┘
             → truy vấn (0,5ms)          mượn ▲ │ ▼ trả
             → đóng                    request 1,2,3...N
                                        → truy vấn (0,5ms)
   → 50,5 ms mỗi request               → 0,5 ms mỗi request
                                          → NHANH HƠN 100 LẦN
```

Ngoài tốc độ, pool còn làm một việc quan trọng không kém: **giới hạn số kết nối đồng thời**, tức là bảo vệ database khỏi chính ứng dụng của bạn.

---

## Tính kích thước pool

### Công thức khởi điểm

```text
   pool_size = (số_lõi_CPU × 2) + số_ổ_đĩa_hiệu_dụng
```

| Cấu hình | Tính | Pool |
|---|---|---|
| 4 lõi, 1 SSD | 4×2 + 1 | **9** |
| 8 lõi, 1 SSD | 8×2 + 1 | **17** |
| 16 lõi, NVMe | 16×2 + 1 | **33** |
| 8 lõi, HDD RAID 10 (4 trục) | 8×2 + 4 | **20** |

Số nghe nhỏ đến mức khó tin. Nhưng lý do rất rõ: nếu chỉ có 8 lõi thì **không thể có quá 8 truy vấn thật sự chạy cùng lúc**. Các kết nối còn lại chỉ đang xếp hàng — và xếp hàng trong pool rẻ hơn nhiều so với xếp hàng trong database.

Hệ số `× 2` là để bù cho lúc truy vấn đang chờ I/O (lúc đó CPU rảnh và có thể phục vụ truy vấn khác).

> **Trên SSD nên dùng số NHỎ hơn**, không phải lớn hơn. Phần `+ số_ổ_đĩa` sinh ra từ thời HDD, khi việc chờ đầu đọc di chuyển chiếm phần lớn thời gian. SSD gần như không có thời gian chờ đó, nên không cần nhiều luồng để lấp.

### Định luật Little — cách kiểm tra bằng dữ liệu thật

```text
   L = λ × W

   L = số yêu cầu đang trong hệ thống  (chính là pool size cần thiết)
   λ = tốc độ đến (yêu cầu/giây)
   W = thời gian xử lý trung bình (giây)
```

```text
   Ví dụ: 2.000 truy vấn/giây, mỗi truy vấn trung bình 5 ms

   L = 2.000 × 0,005 = 10 kết nối

   → Pool 10 là đủ. Đặt 100 chỉ làm mọi thứ chậm đi.
```

Lấy số thật từ database:

```sql
SELECT round(sum(calls) / EXTRACT(epoch FROM (now() - stats_reset)))     AS truy_van_moi_giay,
       round(sum(total_exec_time) / sum(calls))::numeric                 AS tb_ms
FROM pg_stat_statements, pg_stat_statements_info;
```

### Phép nhân bị quên: số bản sao ứng dụng

Đây là lỗi phổ biến nhất trong thực tế:

```text
   Cấu hình pool = 20
   Ứng dụng chạy 12 bản sao (pod/container)
   Có 3 dịch vụ cùng dùng database này

   TỔNG KẾT NỐI = 20 × 12 × 3 = 720

   max_connections = 200  →  CẠN KIỆT, và không ai hiểu vì sao
```

Công thức đúng:

```text
   pool_size_mỗi_bản_sao = max_connections_dành_cho_dịch_vụ / số_bản_sao

   Ví dụ: max_connections = 200
          dành 150 cho ứng dụng, 50 cho việc quản trị và sao lưu
          12 bản sao
          → pool = 150 / 12 ≈ 12
```

**Luôn chừa lại vài kết nối cho quản trị.** Không có chúng thì lúc sự cố bạn không vào được database để chẩn đoán. PostgreSQL có sẵn `superuser_reserved_connections` (mặc định 3) cho mục đích này.

---

## Cấu hình HikariCP (Java)

HikariCP là pool phổ biến nhất cho JVM. Sáu tham số cần biết:

```properties
maximumPoolSize=15
minimumIdle=15                    # = maximumPoolSize → pool CỐ ĐỊNH
connectionTimeout=3000            # 3s: chờ lấy kết nối bao lâu thì báo lỗi
idleTimeout=600000                # 10 phút
maxLifetime=1800000               # 30 phút — PHẢI NHỎ HƠN timeout phía database
leakDetectionThreshold=20000      # 20s: cảnh báo nếu ai đó giữ kết nối quá lâu
validationTimeout=2000
```

| Tham số | Vì sao đặt vậy |
|---|---|
| `minimumIdle = maximumPoolSize` | Pool co giãn gây độ trễ bất ngờ khi phải mở kết nối mới đúng lúc cao điểm. Cố định thì ổn định hơn |
| `connectionTimeout` **ngắn** (2-5s) | Thà báo lỗi nhanh còn hơn để hàng đợi dồn lại và sập cả dây chuyền |
| `maxLifetime` < timeout của database/tường lửa | Nếu database đóng kết nối trước, pool sẽ trả về kết nối chết. Đặt nhỏ hơn vài phút |
| `leakDetectionThreshold` | Bắt được chỗ code quên trả kết nối — nguyên nhân số một của "cạn pool" |

Chẩn đoán khi cạn pool:

```text
HikariPool-1 - Connection is not available, request timed out after 3001ms.
```

Thông báo này gần như luôn có **một trong ba** nguyên nhân:

```text
   1. RÒ RỈ KẾT NỐI — code quên đóng
      → bật leakDetectionThreshold, tìm stack trace

   2. TRUY VẤN CHẬM — kết nối bị giữ quá lâu
      → xem pg_stat_activity, tối ưu truy vấn

   3. POOL QUÁ NHỎ THẬT
      → kiểm tra bằng định luật Little; đây là nguyên nhân ÍT gặp nhất
```

Phản xạ đầu tiên của nhiều người là tăng pool. Đó gần như luôn là chữa triệu chứng.

---

## PgBouncer — pool bên ngoài ứng dụng

Khi có nhiều dịch vụ, nhiều ngôn ngữ, hoặc chạy serverless, pool trong ứng dụng không đủ. PgBouncer là một tiến trình nhẹ đứng giữa:

```text
   1.000 kết nối từ ứng dụng
              ▼
      ┌──────────────┐
      │  PgBouncer   │   ← nhẹ, một tiến trình, xử lý hàng nghìn kết nối
      └──────┬───────┘
             ▼
        20 kết nối thật tới PostgreSQL
```

### Ba chế độ, và cái gì hỏng ở mỗi chế độ

| Chế độ | Kết nối được trả lại khi nào | Tỉ lệ gộp | Cái gì hỏng |
|---|---|---|---|
| `session` | Khi client ngắt kết nối | Thấp | Không hỏng gì |
| **`transaction`** | Khi `COMMIT`/`ROLLBACK` | **Cao** | Xem danh sách dưới |
| `statement` | Sau mỗi câu lệnh | Cao nhất | Không dùng được transaction nhiều câu |

`transaction` là chế độ đáng dùng nhất, nhưng phải biết nó **phá vỡ** những gì:

```text
   KHÔNG DÙNG ĐƯỢC Ở CHẾ ĐỘ TRANSACTION
   ═════════════════════════════════════
   ✘ Câu lệnh chuẩn bị sẵn (prepared statement) ở tầng phiên
     → PgBouncer 1.21+ đã hỗ trợ được, bản cũ thì không
   ✘ LISTEN / NOTIFY
   ✘ Bảng tạm (CREATE TEMP TABLE)
   ✘ Con trỏ giữ qua nhiều transaction (WITH HOLD)
   ✘ SET biến ở tầng phiên  ← DÙNG `SET LOCAL` THAY THẾ
   ✘ Khoá tư vấn ở tầng phiên (pg_advisory_lock)
     → dùng pg_advisory_xact_lock thay thế
```

Dòng `SET` đáng chú ý nhất vì nó âm thầm: bạn `SET search_path = ...`, kết nối bị trả về pool, request tiếp theo mượn kết nối đó và **thừa hưởng cấu hình của người trước**. Lỗi này rất khó truy.

Cấu hình mẫu:

```ini
[databases]
mydb = host=127.0.0.1 port=5432 dbname=mydb

[pgbouncer]
pool_mode = transaction
max_client_conn = 2000        ; cho phép ứng dụng mở bao nhiêu
default_pool_size = 20        ; so ket noi THAT toi PostgreSQL
reserve_pool_size = 5
server_idle_timeout = 600
```

Theo dõi:

```sql
-- kết nối tới PgBouncer bằng psql, database đặc biệt `pgbouncer`
SHOW POOLS;
```

```text
 database | user  | cl_active | cl_waiting | sv_active | sv_idle | maxwait
----------+-------+-----------+------------+-----------+---------+---------
 mydb     | app   |        18 |         42 |        20 |       0 |      3
```

`cl_waiting = 42` và `maxwait = 3` giây nghĩa là pool đang quá tải — nhưng nhớ rằng cách chữa **có thể** là tối ưu truy vấn chứ không phải tăng pool.

---

## Vấn đề riêng của serverless

Kiến trúc serverless phá vỡ giả định cơ bản của pool:

```text
   POOL BÌNH THƯỜNG                    SERVERLESS
   ════════════════                    ══════════
   Ứng dụng chạy liên tục              Hàm sinh ra rồi chết
   Pool sống cùng ứng dụng             Mỗi thực thể có pool riêng, sống vài giây
   20 kết nối cho 1000 request         1000 thực thể × 1 kết nối = 1000 kết nối
```

Ba cách xử lý:

| Cách | Là gì |
|---|---|
| **PgBouncer / RDS Proxy** đứng trước | Gộp hàng nghìn kết nối ngắn thành vài chục kết nối thật |
| **Driver qua HTTP** | Neon serverless driver, Cloudflare Hyperdrive — không giữ kết nối TCP |
| **Giới hạn số thực thể đồng thời** | Đặt trần cho hàm, chấp nhận xếp hàng |

---

## Theo dõi kết nối

```sql
-- Tổng quan
SELECT count(*)                                        AS tong,
       count(*) FILTER (WHERE state = 'active')        AS dang_chay,
       count(*) FILTER (WHERE state = 'idle')          AS ranh,
       count(*) FILTER (WHERE state = 'idle in transaction') AS ranh_trong_transaction,
       current_setting('max_connections')::int         AS toi_da
FROM pg_stat_activity;
```

```text
 tong | dang_chay | ranh | ranh_trong_transaction | toi_da
------+-----------+------+------------------------+--------
  147 |        12 |  128 |                      7 |    200
```

Đọc bảng này:

- `dang_chay = 12` trên máy 8 lõi: hợp lý.
- `ranh = 128`: pool quá lớn, nhưng chưa gây hại nghiêm trọng.
- **`ranh_trong_transaction = 7`: đây là con số nguy hiểm.** Mỗi kết nối như vậy đang giữ khoá và **chặn `VACUUM` dọn rác trên toàn database**.

```sql
-- Săn kết nối bỏ quên trong transaction
SELECT pid, now() - xact_start AS mo_bao_lau, left(query, 50) AS cau_lenh_cuoi
FROM pg_stat_activity
WHERE state = 'idle in transaction'
ORDER BY xact_start;
```

Phòng thủ tự động:

```sql
ALTER SYSTEM SET idle_in_transaction_session_timeout = '60s';
SELECT pg_reload_conf();
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Tăng pool khi hệ chậm | Chuyển ngữ cảnh nhiều hơn → **chậm hơn nữa** | Đo bằng định luật Little; tìm truy vấn chậm trước |
| Quên nhân với số bản sao ứng dụng | Cạn `max_connections` mà không hiểu vì sao | `pool = max_connections_được_chia / số_bản_sao` |
| `maxLifetime` ≥ timeout của database/tường lửa | Pool trả về kết nối đã chết | Đặt nhỏ hơn vài phút |
| Không bật phát hiện rò rỉ kết nối | Rò rỉ âm thầm cho tới khi sập | `leakDetectionThreshold` |
| `connectionTimeout` quá dài | Hàng đợi dồn lại, sập dây chuyền | 2-5 giây, thất bại nhanh |
| Dùng `SET` (không `LOCAL`) sau PgBouncer transaction mode | Request sau thừa hưởng cấu hình của request trước | Luôn dùng `SET LOCAL` |
| Không chừa kết nối cho quản trị | Lúc sự cố không vào được database để chẩn đoán | `superuser_reserved_connections` |
| Bỏ qua `idle in transaction` | Chặn `VACUUM`, bảng phình vô hạn | `idle_in_transaction_session_timeout` |
| Serverless nối thẳng vào PostgreSQL | Hàng nghìn kết nối ngắn làm sập database | RDS Proxy / PgBouncer / driver HTTP |

## Tóm tắt bài 3

- Mở một kết nối PostgreSQL tốn **20-100 ms** và tạo hẳn **một tiến trình hệ điều hành** (~5-10 MB) — đắt hơn 40-200 lần so với chính truy vấn.
- **Nhiều kết nối làm hệ thống chậm đi** vì ba cơ chế cộng dồn: chuyển ngữ cảnh xoá cache CPU, tranh chấp khoá nội bộ, và chi phí của cả **kết nối rảnh** qua `GetSnapshotData()`.
- Con số đo được: từ **48 lên 1.000 kết nối, thông lượng giảm một nửa**.
- Công thức khởi điểm: **`(lõi × 2) + số ổ đĩa`** — cho ra những con số nhỏ đến mức khó tin (9-33), và đó là đúng. **Trên SSD nên nhỏ hơn, không phải lớn hơn.**
- Kiểm tra bằng **định luật Little**: `pool = truy_vấn_mỗi_giây × thời_gian_trung_bình`.
- Lỗi phổ biến nhất là **quên nhân với số bản sao ứng dụng**: `20 × 12 bản sao × 3 dịch vụ = 720` kết nối.
- Khi cạn pool, ba nguyên nhân theo thứ tự phổ biến: **rò rỉ kết nối** → **truy vấn chậm** → pool quá nhỏ thật. Tăng pool gần như luôn là chữa triệu chứng.
- **PgBouncer chế độ `transaction`** cho tỉ lệ gộp cao nhất nhưng phá vỡ: câu lệnh chuẩn bị sẵn (bản cũ), `LISTEN/NOTIFY`, bảng tạm, khoá tư vấn phiên, và **`SET` không có `LOCAL`**.
- Con số nguy hiểm nhất trong `pg_stat_activity` là **`idle in transaction`** — nó chặn `VACUUM` trên toàn database.

**Bài kế tiếp** → [Phase 9 — Bài 1: Database Replication là gì](../phase-9/01-database-replication-la-gi.md)
