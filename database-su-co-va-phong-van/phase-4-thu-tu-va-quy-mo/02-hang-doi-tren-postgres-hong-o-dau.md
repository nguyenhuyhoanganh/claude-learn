# Bài 17: Hàng đợi chạy trên Postgres hỏng ở đâu

Hàng đợi chạy thẳng trên Postgres. Một hãng đã đẩy nó lên tới **100.000 sự kiện mỗi giây**, không có Kafka nào hết.

Nhưng **mất 6 năm** họ mới tới được mức đó. Và chính họ kể ra những thứ đã phải vượt: **bảng phình, truy vấn chậm dần, index thành nút thắt, bão thử lại**.

Còn một máy Postgres bình thường thì gánh được bao nhiêu?

```text
   Một máy 4 vCPU:  2.885 message mỗi giây, mỗi message 1 KiB.
```

Nói cho sòng phẳng: **phần xử lý trong phép đo đó không làm gì cả.** Nên đây là **trần của đường ống**, chưa phải trần của công việc thật. Công việc thật của bạn — gọi API, ghi database, render ảnh — sẽ kéo con số này xuống, có khi xuống rất nhiều.

Nên câu hỏi đúng **không phải** *"bao nhiêu thì cần Kafka"*, mà là **"nó hỏng ở đâu"**. Postgres làm hàng đợi đụng **ba cái trần**, và mỗi cái một cơ chế khác hẳn nhau.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ |
|---|---|---|
| **Hàng đợi công việc** (job queue) | Bảng chứa việc cần làm; các worker lấy việc ra xử lý | Tủ đựng phiếu việc, thợ tới lấy phiếu |
| **Worker** | Tiến trình lấy việc từ hàng đợi và xử lý | Người thợ |
| **`FOR UPDATE`** | Khoá dòng vừa đọc, ai đọc kiểu này sau phải chờ | Cầm phiếu lên, ai muốn cùng phiếu phải đợi |
| **`SKIP LOCKED`** | Thấy dòng đang bị khoá thì **bỏ qua**, lấy dòng khác | Phiếu này có người cầm rồi thì lấy phiếu kế tiếp |
| **Snapshot Isolation** | Mỗi giao dịch chốt một **ảnh chụp** dữ liệu ngay lúc bắt đầu và chỉ nhìn ảnh đó | Chụp ảnh cái tủ lúc bước vào, rồi làm việc theo ảnh đó |
| **`REPEATABLE READ` của Postgres** | Chính là Snapshot Isolation — **không giống định nghĩa trong sách giáo khoa** | (xem trên) |
| **Serialization failure** | Lỗi khi hai giao dịch cùng sửa một dòng ở mức cách ly cao — bên sau bị huỷ | Hai người cùng sửa một phiếu, người sau bị bảo "làm lại đi" |
| **Rác / dead tuple** | Bản cũ của một dòng sau khi bị sửa, chờ `VACUUM` dọn | Bản nháp đã hết hiệu lực còn nằm trong tủ |
| **HOT update** | Tối ưu: nếu không sửa cột nào nằm trong index **và** còn chỗ trong cùng trang, Postgres khỏi phải cập nhật index | Sửa tại chỗ, khỏi phải sửa mục lục |
| **Partition** (Kafka) | Một dòng dữ liệu con trong một topic; đơn vị của thứ tự và song song | Một làn đường trong xa lộ |
| **Offset** | Con số đánh dấu consumer đã đọc tới đâu trong một partition | Cái kẹp đánh dấu trang |
| **Consumer group** | Nhóm consumer chia nhau đọc một topic, mỗi nhóm có offset riêng | Nhiều lớp học cùng đọc một cuốn sách, mỗi lớp có kẹp trang riêng |

## Trần thứ nhất — Chuyện giành việc

Một bảng `jobs`. Worker đi tìm việc cũ nhất chưa ai làm:

```sql
SELECT * FROM jobs
 WHERE status = 'pending'
 ORDER BY created_at
 LIMIT 1
   FOR UPDATE;
```

Câu này đúng về mặt logic. Khổ nỗi **200 worker cùng chạy**, và cả 200 cùng nhìn thấy **đúng một hàng**:

```text
   worker 1  ──┐
   worker 2  ──┤
   worker 3  ──┼──► cùng nhìn thấy job #1001
   ...         │
   worker 200──┘

   → Một đứa THẮNG (lấy được khoá).
   → 199 đứa kia ĐỨNG CHỜ, rồi khi khoá nhả ra thì phát hiện
     job đã bị nhận, phải quay lại làm lại từ đầu.

   → 199/200 công sức là LÀM KHÔNG CÔNG.
```

**DBOS** — một hãng bán sản phẩm hàng đợi chạy trên Postgres — đo được rằng nếu không chống gì thì **nghẽn quanh mức 100 việc mỗi giây**.

> Nói cho công bằng: họ **không công bố phần cứng lẫn cách đo**. Nên con số đó nên đọc như **bậc độ lớn**, đừng đọc như một mốc chuẩn.

### Thuốc: `SKIP LOCKED`

Postgres có thuốc từ bản **9.5** (đầu năm 2016):

```sql
SELECT * FROM jobs
 WHERE status = 'pending'
 ORDER BY created_at
 LIMIT 1
   FOR UPDATE SKIP LOCKED;
--             ↑ thấy hàng đã bị đứa khác giữ thì BỎ QUA LUÔN,
--               nhảy xuống việc kế tiếp.
```

```text
   TRƯỚC:  200 worker tranh 1 hàng   →  1 thắng, 199 chờ rồi làm lại
   SAU:    200 worker nhận 200 hàng KHÁC NHAU  →  không ai chờ ai
```

Câu lệnh nhận việc hoàn chỉnh, dùng được trong production:

```sql
-- Lấy MỘT LÔ việc và đánh dấu đã nhận, trong đúng một vòng tới database
WITH da_chon AS (
    SELECT id
      FROM jobs
     WHERE status = 'pending'
       AND chay_sau <= now()          -- hỗ trợ lên lịch và backoff
     ORDER BY do_uu_tien DESC, created_at
     LIMIT 20                          -- lấy theo lô, giảm số vòng mạng
       FOR UPDATE SKIP LOCKED
)
UPDATE jobs j
   SET status     = 'running',
       worker_id  = :worker_id,
       nhan_luc   = now(),
       so_lan_thu = j.so_lan_thu + 1
  FROM da_chon
 WHERE j.id = da_chon.id
RETURNING j.*;
```

Ba chi tiết trong câu trên là dấu hiệu của code đã chạy thật:

```text
   ① chay_sau <= now()   → cho phép lên lịch và thử lại có backoff,
                            không cần bảng riêng.
   ② LIMIT 20            → lấy theo lô. Một vòng mạng cho 20 việc
                            thay vì 20 vòng.
   ③ RETURNING           → nhận việc và lấy dữ liệu trong MỘT câu lệnh,
                            không phải SELECT rồi UPDATE.
```

## Trần thứ hai — Giới hạn số việc chạy đồng thời

Trần này xuất hiện khi bạn cần: **toàn hệ thống chỉ chạy tối đa N việc cùng lúc** (ví dụ vì API bên thứ ba giới hạn 10 lượt gọi song song).

Muốn thế thì worker phải **biết cả hệ thống đang chạy mấy việc**, và **con số đó phải đứng yên giữa lúc đếm với lúc lấy**.

DBOS chọn cách **nâng mức cách ly giao dịch lên `REPEATABLE READ`**.

### Nhưng `REPEATABLE READ` của Postgres không phải thứ trong sách giáo khoa

```text
   Sách giáo khoa:  "Repeatable Read = đọc lại thì thấy y như lần đầu"

   Postgres:        REPEATABLE READ chính là SNAPSHOT ISOLATION.
                    Mỗi giao dịch CHỐT MỘT ẢNH CHỤP ngay lúc bắt đầu
                    và chỉ nhìn ảnh đó suốt cả giao dịch.

                    Hai đứa cùng sửa một hàng → ĐỨA SAU BỊ HUỶ THẲNG:
                    "ERROR: could not serialize access due to
                            concurrent update"
```

**Với hàng đợi thì đây là án tử**, vì **mọi worker đều nhắm đúng những hàng mà đứa khác cũng đang nhắm**.

### Chỗ dễ vấp: "đã có `SKIP LOCKED` rồi thì sao hai worker còn đụng nhau được?"

Đây là câu hỏi rất hay, và câu trả lời cho thấy hai cơ chế này hoạt động ở **hai chiều thời gian khác nhau**:

```text
   Thời gian ──────────────────────────────────────────────────►

   Worker A                          Worker B
   ─────────────────────             ─────────────────────
   t0  BEGIN (chốt ảnh chụp)
   t1                                BEGIN (chốt ảnh chụp)
                                     → ảnh chụp của B thấy job#77
                                       ĐANG Ở TRẠNG THÁI 'pending'

   t2  nhận job#77 (khoá nó)
   t3  COMMIT
       → KHOÁ ĐƯỢC NHẢ RA.
         Không còn gì để mà SKIP nữa!

   t4                                chạy SELECT ... FOR UPDATE SKIP LOCKED
                                     → job#77 KHÔNG bị khoá (A commit rồi)
                                     → SKIP LOCKED không bỏ qua nó
                                     → nhưng ẢNH CHỤP của B vẫn thấy nó
                                       'pending' → B LAO VÀO SỬA
                                     → ✗ could not serialize access
```

> **Khoá nhả theo THỜI GIAN THẬT. Ảnh chụp thì DỪNG YÊN từ lúc bắt đầu.**
>
> `SKIP LOCKED` chỉ bảo vệ bạn **trong lúc** đối thủ còn đang giữ khoá. Nó không bảo vệ bạn khỏi **quá khứ đông cứng** trong ảnh chụp của chính mình.

### Và nâng lên `SERIALIZABLE` chỉ tệ thêm

```text
   SERIALIZABLE của Postgres = SNAPSHOT ISOLATION + phần DÒ BẤT THƯỜNG.

   Nó KHÔNG PHẢI một bản "chặt tay hơn" theo kiểu khoá nhiều hơn.
   Nó vẫn giữ nguyên vấn đề ảnh chụp, và CÒN HUỶ GIAO DỊCH NHIỀU HƠN.
```

### Ba cách làm giới hạn đồng thời mà không cần nâng mức cách ly

| Cách | Cơ chế | Ưu / Nhược |
|---|---|---|
| **Chia hàng đợi thành N làn** | Mỗi làn một worker; muốn tối đa 10 việc thì tạo 10 làn | Đơn giản, không tranh chấp. Nhưng phân bố việc không đều |
| **Advisory lock** | `pg_try_advisory_xact_lock(khoa_lan)` với khoá = 1..N; ai lấy được thì chạy | Rất nhẹ, không tạo rác. Nhưng đếm chính xác thì khó |
| **Token ngoài database** | Một bộ đếm trong Redis: `INCR` lấy chỗ, `DECR` trả chỗ | Rất nhanh, nhưng thêm một hệ phải nuôi và phải xử lý worker chết mà chưa trả token |

Cách đầu là cách đơn giản nhất và hầu như luôn đủ dùng. Đừng nâng mức cách ly khi bạn có thể **đổi cách chia việc**.

## Trần thứ ba — Cái ít người nói tới nhất

Đây là trần âm thầm nhất, và cũng là trần giết chết nhiều hệ nhất.

Nhớ lại từ [Bài 12](../phase-2-bo-may-ngam-cua-postgres/05-bo-dem-32-bit-va-cua-ghi-tu-dong.md): **Postgres sửa một hàng là đẻ ra bản sao mới, bản cũ thành rác chờ dọn.**

Bình thường Postgres có một tối ưu tên **HOT** (Heap-Only Tuple) để né việc cập nhật index mỗi lần sửa:

```text
   HOT được áp dụng khi thoả CẢ HAI điều kiện:
      ① Câu lệnh KHÔNG đụng vào cột nào đang nằm trong index
      ② Còn chỗ trống trong CÙNG MỘT TRANG để chứa bản mới

   Được HOT  →  chỉ ghi bản mới vào trang, KHỎI đụng index.
   Mất HOT   →  phải thêm mục mới vào MỌI index của bảng.
```

### Cách làm hàng đợi phổ biến nhất vi phạm điều kiện ① một cách có hệ thống

```text
   Thao tác NHẬN VIỆC là:   UPDATE jobs SET status = 'running' ...

   Mà index tìm việc là:    CREATE INDEX ON jobs (status, created_at)
                                                  ↑
                            CỘT BẠN ĐANG SỬA NẰM NGAY TRONG INDEX.

   → MẤT HOT ở MỌI lần nhận việc.
   → Mỗi việc đi qua hàng đợi sinh ra:
        • 1 bản rác trong bảng
        • 1 mục rác trong MỖI index
     Và một việc thường đổi trạng thái 2–3 lần
     (pending → running → done), nên nhân lên tiếp.
```

### "PostgreSQL 14 có cơ chế dọn rác index tại chỗ mà?"

Có — gọi là **bottom-up index deletion**. Nhưng đọc kỹ tài liệu thì:

```text
   Nó CHỈ áp dụng cho những index KHÔNG BỊ CÂU LỆNH SỬA TỚI.

   → Tức là ĐÚNG CÁI INDEX TÌM VIỆC (status, created_at)
     thì nó KHÔNG ĐỤNG VÀO.
```

Index cứ phình, còn autovacuum thì đốt CPU đi dọn đống rác đó. **Tới một mức, máy dành cho việc dọn nhiều hơn dành cho việc chạy. Đấy mới là lúc nó thành cái trần.**

### Bốn cách né trần thứ ba

**① Index từng phần — mẹo rẻ nhất và hiệu quả nhất**

```sql
-- Thay vì index trên (status, created_at) cho MỌI dòng...
DROP INDEX idx_jobs_status_created;

-- ...chỉ index NHỮNG DÒNG ĐANG CHỜ
CREATE INDEX idx_jobs_pending ON jobs (chay_sau, do_uu_tien)
    WHERE status = 'pending';
```

```text
   Được ba thứ cùng lúc:

   ① Index CHỈ chứa các việc đang chờ — thường chỉ vài nghìn dòng,
      dù bảng có 500 triệu dòng lịch sử.
   ② Khi việc chuyển từ 'pending' sang 'running', nó bị GỠ KHỎI index
      → index tự co lại, không tích rác vô hạn.
   ③ Planner ước tính tốt hơn hẳn (xem Bài 9).
```

**② Tách bảng: hàng đợi nóng và kho lịch sử**

```text
   jobs        →  CHỈ chứa việc chưa xong. Nhỏ, nóng, được VACUUM liên tục.
   jobs_lich_su →  việc đã xong, chuyển sang bằng job nền theo lô.
                   Chỉ INSERT, không UPDATE → không sinh rác.
```

**③ Phân mảnh theo thời gian và `DROP` thay vì `DELETE`**

```sql
-- Mỗi ngày một mảnh. Dọn bằng DROP — tức thì, không sinh rác nào.
DROP TABLE jobs_2026_07_15;

-- So với DELETE 10 triệu dòng: sinh 10 triệu bản rác,
-- autovacuum phải dọn hàng giờ.
```

**④ Nới tay cho autovacuum trên đúng bảng đó**

```sql
ALTER TABLE jobs SET (
    autovacuum_vacuum_scale_factor  = 0.01,   -- dọn khi 1% thay đổi (mặc định 20%)
    autovacuum_vacuum_cost_delay    = 0,      -- không tự kìm tốc độ
    autovacuum_analyze_scale_factor = 0.02,
    fillfactor                      = 70      -- chừa 30% mỗi trang
);
--                                    ↑ fillfactor thấp cho HOT nhiều cơ hội hơn:
--                                      bản mới có chỗ nằm trong CÙNG trang.
```

## Nhìn sang phía bên kia: Kafka né được toàn bộ chuyện trên bằng cách nào

Và tài liệu thiết kế của chính Kafka nói ra lý do.

```text
   ═══ MESSAGING KIỂU CŨ (và Postgres làm hàng đợi) ═══════════════

   Phải KHOÁ TỪNG MESSAGE, rồi ĐÁNH DẤU đã tiêu thụ.
   → Mỗi message tiêu thụ = một lần sửa dữ liệu.


   ═══ KAFKA ══════════════════════════════════════════════════════

   Trạng thái "đã tiêu thụ" chỉ là MỘT CON SỐ cho mỗi partition (offset).
   → Message nằm im trên đĩa, không ai sửa nó cả.
```

Đặt cạnh nhau:

```text
   Tiêu thụ 1 TRIỆU message:

   POSTGRES:  1.000.000 lượt sửa hàng
            + 1.000.000 lượt sửa index
            + 1.000.000 bản rác chờ dọn
            → autovacuum phải dọn từng ấy.

   KAFKA:     con số offset nhích từ  N  →  N + 1.000.000
            → KHÔNG ĐẺ RA BẢN RÁC NÀO.
```

> **Không có rác thì không cần ai đi dọn.** Đó là toàn bộ khác biệt kiến trúc.

### Nhưng cái giá của Kafka là gì?

```text
   ✗ Số consumer chạy song song BỊ CHẶN CỨNG bởi số partition.
     Muốn 100 consumer song song thì phải có ít nhất 100 partition,
     và đổi số partition sau khi chạy là một thao tác đau đớn.

   ✗ Không có "lấy đúng việc này ra làm trước".
     Kafka đọc tuần tự theo offset. Ưu tiên, lên lịch, thử lại có backoff
     — tất cả phải tự dựng ở tầng trên.

   ✗ Không có giao dịch chung với dữ liệu nghiệp vụ của bạn.
     Ghi đơn hàng vào Postgres và đẩy sự kiện vào Kafka là HAI hệ thống
     → phải dùng outbox pattern để không lệch.
```

Vế cuối là lợi thế lớn nhất của hàng đợi chạy trên database, và thường bị bỏ quên: **bạn ghi dữ liệu nghiệp vụ và đẩy việc vào hàng đợi trong CÙNG MỘT giao dịch.** Không lệch được. Không cần outbox.

### Hai thứ nữa Kafka cho, phải nói cho đủ

**① Chịu lỗi tốt hơn ở tầng hạ tầng**

```text
   Kafka:    một broker chết → CHỈ những partition nó đang cầm trịch
             bị ảnh hưởng, và chúng được bầu leader mới.

   Postgres: primary chết = CHẾT TOÀN BỘ ĐƯỜNG GHI.
```

**② Một hiểu lầm cần gỡ**

Nhiều người tưởng Postgres không phục vụ được nhiều **nhóm consumer độc lập**. **Sai.**

```text
   Cùng con máy 4 vCPU đó, phát cho 5 nhóm consumer:
      → đọc được 25.183 message mỗi giây.

   Cái giá KHÔNG PHẢI là "không làm được".
   Cái giá là ĐĨA:

      Giữ 7 ngày ở mức 10 MB/giây  =  5,8 TB
      nằm NGAY TRÊN con database đang phục vụ khách hàng.

   Kafka đẩy đống đó sang chỗ khác. ĐÓ MỚI LÀ THỨ NÓ BÁN.
```

### Chuyện Kafka nặng vận hành cũng nhẹ đi thật rồi

Từ bản **4.0**, Kafka bỏ hẳn ZooKeeper (chuyển sang KRaft). Bạn không phải nuôi hai cụm nữa. Lập luận *"Kafka phức tạp lắm"* đã yếu hơn trước đáng kể.

## Một ca thật rất hay — nhưng phải kể cho đủ

```text
   Prequel bỏ RabbitMQ về hàng đợi Postgres:
      • gỡ được 580 dòng code
      • làm xong trong NỬA NGÀY

   Nghe như một chiến thắng vang dội của Postgres?

   Nhưng LÝ DO THẬT của họ KHÔNG PHẢI thông lượng — mà là prefetch
   (cách RabbitMQ phát trước message cho consumer, gây phân bố việc lệch).

   Và QUY MÔ của họ là VÀI NGHÌN JOB MỖI NGÀY.
   Không phải mỗi giây.
```

Đây là kiểu bằng chứng hay bị dùng sai nhất trong các cuộc tranh luận kiến trúc: một ca thật, kết quả thật, **nhưng ở một quy mô hoàn toàn khác với quy mô người đọc đang có**.

## Vậy chốt thế nào?

**Không nguồn nào đưa ra được một con số duy nhất.** Nhưng có một dữ liệu rất đáng suy nghĩ:

```text
   Aiven — một hãng BÁN DỊCH VỤ KAFKA — tự công bố rằng
   50% các cụm Kafka họ đang quản lý có mức ghi DƯỚI 10 MB/giây.

   Tức là một nửa số cụm Kafka đang chạy trên đời
   nằm trong tầm mà một máy Postgres gánh được.
```

Nên câu hỏi đúng là: **còn bao lâu nữa hệ thống của bạn mới chạm trần?**

```text
   Tăng 50% mỗi năm thì gần 6 NĂM lưu lượng mới gấp 10 lần.

   Sáu năm là quá đủ để:
      • biết rõ mình thật sự cần gì
      • có tiền và người để dựng hệ đúng
      • hoặc phát hiện ra sản phẩm đi hướng khác hẳn
```

### Bảng quyết định

| Tình huống của bạn | Chọn |
|---|---|
| Vài nghìn → vài trăm nghìn việc **mỗi ngày** | **Postgres.** Đừng nghĩ thêm |
| Cần việc và dữ liệu nghiệp vụ **cùng một giao dịch** | **Postgres.** Đây là lợi thế Kafka không có |
| Cần ưu tiên, lên lịch, thử lại có backoff, huỷ việc | **Postgres.** Kafka phải tự dựng hết |
| Dưới ~2.000 việc/giây và đội chưa có người vận hành Kafka | **Postgres** |
| Cần **nhiều nhóm consumer độc lập** đọc cùng dòng dữ liệu | Postgres làm được, nhưng tính kỹ **chi phí đĩa** |
| Cần **giữ lại nhiều ngày** dữ liệu với thông lượng cao | **Kafka.** 5,8 TB không nên nằm trên database phục vụ khách |
| Cần **phát lại lịch sử** từ đầu cho consumer mới | **Kafka.** Đây là thứ nó sinh ra để làm |
| Trên ~10.000 sự kiện/giây, kéo dài | **Kafka**, hoặc chấp nhận đầu tư nhiều năm như hãng ở đầu bài |
| Ghi phải sống sót khi primary chết | **Kafka** |

## Một mẹo giảm độ trễ trên Postgres: đừng hỏi liên tục

Hàng đợi trên database thường được viết theo kiểu **hỏi liên tục** (polling): cứ 1 giây lại chạy câu `SELECT` một lần. Với 50 worker thì đó là **50 câu lệnh mỗi giây chỉ để hỏi "có việc chưa?"** — phần lớn trả về rỗng.

Postgres có sẵn cơ chế báo hiệu:

```sql
-- Bên đẩy việc vào
INSERT INTO jobs (...) VALUES (...);
NOTIFY job_moi;

-- Bên worker: ngủ cho tới khi có tín hiệu, thay vì hỏi mỗi giây
LISTEN job_moi;
```

```text
   Được:  độ trễ từ ~500ms trung bình (polling 1 giây) xuống vài ms,
          và bỏ hẳn hàng nghìn câu lệnh hỏi rỗng mỗi phút.

   Nhưng PHẢI biết ba hạn chế:
      ✗ Tín hiệu KHÔNG BỀN. Worker đang ngắt kết nối thì mất tín hiệu.
        → VẪN PHẢI giữ một vòng hỏi dự phòng, chỉ là thưa hơn nhiều
          (ví dụ 30 giây/lần thay vì 1 giây/lần).
      ✗ KHÔNG hoạt động qua PgBouncer chế độ transaction (xem Bài 13).
      ✗ Tín hiệu chỉ được gửi khi giao dịch COMMIT — đúng như mong muốn,
        nhưng nhớ rằng nó không tới sớm hơn được.
```

## Bẫy thường gặp

| Bẫy | Vì sao hỏng | Cách sửa |
|---|---|---|
| `FOR UPDATE` không có `SKIP LOCKED` | 200 worker tranh 1 hàng, 199 làm không công | Thêm `SKIP LOCKED` |
| Nâng lên `REPEATABLE READ` cho "an toàn" | Là Snapshot Isolation → worker bị huỷ hàng loạt | Chia làn, hoặc advisory lock |
| Nâng tiếp lên `SERIALIZABLE` | Chính là SI + dò bất thường → huỷ **nhiều hơn** | Như trên |
| Index trên cột `status` đang bị `UPDATE` | Mất HOT ở mọi lần nhận việc → index phình vô hạn | **Index từng phần** `WHERE status='pending'` |
| Trông chờ PG14 dọn rác index hộ | Nó **không đụng** index bị câu lệnh sửa | Index từng phần + tách bảng |
| `DELETE` việc cũ theo lô | Sinh hàng triệu bản rác | Phân mảnh theo ngày rồi `DROP` |
| Để autovacuum mặc định trên bảng hàng đợi | Ngưỡng 20% là quá thưa cho bảng biến động liên tục | Hạ `scale_factor` xuống 0.01, `fillfactor` 70 |
| Polling mỗi 100ms với 50 worker | 500 câu lệnh rỗng mỗi giây | `LISTEN/NOTIFY` + vòng dự phòng thưa |
| Dùng `LISTEN/NOTIFY` làm cơ chế duy nhất | Tín hiệu không bền, mất là việc nằm mãi | Luôn giữ vòng hỏi dự phòng |
| Trích ca Prequel để kết luận "Postgres thắng Kafka" | Quy mô của họ là vài nghìn job **mỗi ngày** | Đọc kỹ quy mô trước khi so sánh |
| Dùng con số 2.885 msg/s làm cam kết | Phép đo đó **không xử lý gì cả** | Tự đo với công việc thật của bạn |
| Chọn Kafka vì "sau này sẽ lớn" | Tăng 50%/năm thì gần 6 năm mới gấp 10 | Tính thời điểm chạm trần rồi hãy quyết |

## Nguồn và kiểm chứng

- Phép đo trên **c7i.xlarge (4 vCPU)**, message 1 KiB: hàng đợi **2.885 msg/giây** (p99 ~17,7 ms); pub-sub ghi **5.036 msg/giây**, đọc **25.183 msg/giây** với 5 nhóm consumer. Nguồn cũng nêu ba nút thắt: thông lượng mỗi client đọc, số kết nối, và trần ghi trên một bảng (~8 MiB/giây).
- **Aiven** (hãng bán dịch vụ Kafka) công bố: **50% các cụm Kafka họ quản lý có mức ghi dưới 10 MB/giây**.
- Con số **~100 việc/giây khi không có `SKIP LOCKED`** là của DBOS, **không kèm phần cứng và cách đo** — hãy đọc như bậc độ lớn.
- `SKIP LOCKED` có từ **PostgreSQL 9.5** (tháng 1/2016). **Bottom-up index deletion** có từ **PostgreSQL 14** và chỉ áp dụng cho index không bị câu lệnh sửa tới.
- Kafka bỏ ZooKeeper từ bản **4.0**.

## Tóm tắt bài 17

- Câu hỏi đúng **không phải** *"bao nhiêu thì cần Kafka"* mà là **"nó hỏng ở đâu"**. Có **ba cái trần, ba cơ chế khác nhau**.
- **Trần 1 — giành việc:** 200 worker tranh một hàng. Thuốc là **`SKIP LOCKED`** (có từ 9.5). Không có nó thì nghẽn quanh bậc 100 việc/giây.
- **Trần 2 — giới hạn đồng thời:** nâng lên `REPEATABLE READ` là án tử, vì đó là **Snapshot Isolation** — worker bị huỷ hàng loạt. **`SKIP LOCKED` bảo vệ theo thời gian thật, ảnh chụp thì đông cứng từ lúc bắt đầu.** `SERIALIZABLE` còn tệ hơn.
- **Trần 3 — rác:** nhận việc là `UPDATE status`, mà `status` nằm trong index tìm việc → **mất HOT một cách có hệ thống**. PG14 không cứu được vì nó không đụng index bị sửa. Tới một mức, máy dọn nhiều hơn chạy.
- Thuốc mạnh nhất cho trần 3 là **index từng phần `WHERE status = 'pending'`** — index chỉ chứa việc đang chờ và tự co lại khi việc xong.
- **Kafka né toàn bộ bằng một ý tưởng:** trạng thái đã tiêu thụ chỉ là **một con số offset**, không sửa message nào → **không đẻ rác → không cần dọn**.
- Cái giá của Kafka: song song bị chặn bởi **số partition**, không có ưu tiên/lên lịch sẵn, và **không chung giao dịch với dữ liệu nghiệp vụ**.
- Postgres **làm được** nhiều nhóm consumer (25.183 msg/giây cho 5 nhóm trên 4 vCPU). Cái giá là **đĩa**: 7 ngày ở 10 MB/giây là **5,8 TB** nằm trên database phục vụ khách.
- **50% cụm Kafka trên đời ghi dưới 10 MB/giây** — nằm trong tầm một máy Postgres. Tăng 50%/năm thì gần **6 năm** mới gấp 10 lần.

**Bài kế tiếp** → [Bài 18: 40 nghìn bình luận một giây và ba cánh cửa](03-40-nghin-binh-luan-mot-giay.md)
