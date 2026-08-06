# Bài 4: "Dùng khoá ngoại có làm chậm không?"

Người phỏng vấn lật sang trang mới, hỏi một câu nghe rất hiền lành:

> *"Dùng khoá ngoại có làm chậm không?"*

Bảy chữ, không từ nào khó. Bạn trả lời được ngay. Vấn đề là **câu trả lời đúng vẫn chưa cứu được bạn** — vì câu hỏi này thiếu mất một chữ, và chữ thiếu đó làm con số chênh nhau **hơn một nghìn lần**.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ |
|---|---|---|
| **Khoá chính** (Primary Key) | Cột định danh duy nhất một dòng trong bảng | Số căn cước: mỗi người một số, không trùng |
| **Khoá ngoại** (Foreign Key, FK) | Cột ở bảng con trỏ tới khoá chính của bảng cha, kèm luật *"giá trị này phải tồn tại bên kia"* | Đơn hàng ghi số căn cước của khách — số đó phải là người có thật |
| **Bảng cha / bảng con** | Cha là bảng được trỏ tới (`khach_hang`), con là bảng trỏ đi (`don_hang`) | Cha: danh sách khách. Con: các đơn của họ |
| **Ràng buộc** (Constraint) | Luật database tự kiểm tra ở mọi lệnh ghi, không nhờ ứng dụng | Bảo vệ ở cổng: ai không đúng giấy tờ thì không cho vào |
| **Toàn vẹn tham chiếu** (Referential Integrity) | Đảm bảo không có dòng con nào trỏ vào một dòng cha không tồn tại | Không có đơn hàng nào thuộc về một khách không có thật |
| **Dòng mồ côi** (Orphan row) | Dòng con trỏ tới một dòng cha đã bị xoá | Đơn hàng của một khách đã bị xoá khỏi hệ thống |
| **Index** | Cấu trúc tra cứu giúp tìm dòng mà không phải đọc cả bảng | Mục lục cuốn sách |
| **Quét toàn bảng** (Sequential/Full Scan) | Đọc từng dòng từ đầu tới cuối vì không có mục lục để tra | Không có mục lục thì phải lật từng trang |
| **B-Tree** | Cấu trúc cây mà index dùng; tra một khoá tốn 3–4 bước nhảy | Tra từ điển: mở giữa, hẹp dần, 3–4 lần là tới |
| **Cascade** | Luật tự động: xoá cha thì tự xoá con theo (`ON DELETE CASCADE`) | Xoá khách thì mọi đơn của khách bay theo |

## Tầng 1 — Định nghĩa: có chậm, vì database phải kiểm tra thêm

Ứng viên trả lời:

> *"Có chậm, vì mỗi lần thêm một dòng con, database phải kiểm tra xem dòng cha có tồn tại thật không."*

Đúng, hoàn toàn đúng, không sai chữ nào.

Người phỏng vấn gật đầu, **không khen, không chê**, chỉ ghi một dòng vào sổ rồi hỏi tiếp. Đó là lúc bạn nên lo — chứ không phải lúc họ nói bạn sai.

Vì câu trả lời đó dừng ở **định nghĩa**. Nó đúng, nhưng chưa cho người phỏng vấn biết bạn đã chạm vào cái giá thật hay chưa.

Hãy nắm cho chắc khoá ngoại thực sự làm gì. Với bảng:

```sql
CREATE TABLE khach_hang (
    id    BIGINT PRIMARY KEY,
    ten   TEXT NOT NULL
);

CREATE TABLE don_hang (
    id           BIGINT PRIMARY KEY,
    khach_hang_id BIGINT NOT NULL REFERENCES khach_hang(id),
    --                             ↑ đây là khoá ngoại
    tong_tien    NUMERIC(15,2)
);
```

Dòng `REFERENCES khach_hang(id)` bắt database **canh hai chiều**:

```text
   CHIỀU ĐI VÀO (thêm/sửa dòng CON)
   ────────────────────────────────
   INSERT INTO don_hang (khach_hang_id) VALUES (999);
      → DB tự chạy: "khách 999 có tồn tại không?"
      → Không có → từ chối, báo lỗi vi phạm ràng buộc.

   CHIỀU ĐI RA (xoá/sửa khoá dòng CHA)
   ────────────────────────────────
   DELETE FROM khach_hang WHERE id = 42;
      → DB tự chạy: "còn đơn hàng nào của khách 42 không?"
      → Còn → từ chối (hoặc xoá theo, nếu đặt ON DELETE CASCADE).
```

Hai chiều này tốn chi phí **hoàn toàn khác nhau**, và đó chính là tầng 2.

## Tầng 2 — Con số: "chậm bao nhiêu?"

Người phỏng vấn hỏi rất ngắn:

> *"Chậm bao nhiêu?"*

Không phải *chậm hay không*, mà là **bao nhiêu phần trăm**. **Không có con số nghĩa là bạn chưa từng đo.**

### Chiều thêm dòng con: rẻ hơn bạn tưởng

Thêm một dòng vào bảng con, database làm thêm đúng một việc: **tra khoá chính của bảng cha** xem dòng đó có thật không.

Tra khoá chính là thao tác **rẻ nhất mà database có**:

```text
   Cây B-Tree của khoá chính, bảng cha 5 triệu dòng:

        [gốc]                        ← bước 1
        ╱   ╲
   [nhánh] [nhánh]                   ← bước 2
     ╱ ╲     ╱ ╲
   [lá][lá][lá][lá]                  ← bước 3: tìm thấy

   3 lần đọc trang, và gần như luôn nằm sẵn trong RAM vì khoá chính
   của bảng cha là thứ nóng nhất trong cả database.
```

Con số đo được trên bảng vài triệu dòng: **thêm khoá ngoại làm lệnh ghi chậm thêm khoảng 5–10%**.

Cách tự đo, để nói ra được khi bị hỏi vặn:

```sql
CREATE TABLE cha (id BIGINT PRIMARY KEY, ten TEXT);
INSERT INTO cha SELECT i, md5(i::text) FROM generate_series(1, 1000000) i;

CREATE TABLE con_khong_fk (id BIGSERIAL PRIMARY KEY, cha_id BIGINT);
CREATE TABLE con_co_fk    (id BIGSERIAL PRIMARY KEY,
                           cha_id BIGINT REFERENCES cha(id));

\timing on
INSERT INTO con_khong_fk (cha_id) SELECT (i % 1000000) + 1
  FROM generate_series(1, 200000) i;      -- ví dụ: 612 ms

INSERT INTO con_co_fk (cha_id) SELECT (i % 1000000) + 1
  FROM generate_series(1, 200000) i;      -- ví dụ: 668 ms  →  +9%
```

Nên nếu **chỉ xét lệnh thêm dòng**, câu trả lời là: *có chậm, chậm không đáng kể*. Người phỏng vấn ghi con số đó vào sổ.

### Một chi phí ẩn ở chiều thêm dòng mà rất ít người biết

Nói được điều này là bạn vượt hẳn mặt bằng ứng viên.

Khi PostgreSQL kiểm tra khoá ngoại lúc thêm dòng con, nó không chỉ *đọc* dòng cha — nó **khoá nhẹ dòng cha lại** bằng một loại khoá tên `FOR KEY SHARE`. Mục đích: chặn không cho ai xoá dòng cha đó trong lúc giao dịch của bạn còn dở.

Khoá đó rất nhẹ, nhiều giao dịch cùng giữ nó được. Nhưng nó **xung đột với `FOR UPDATE`**:

```text
   Giao dịch A: INSERT don_hang (khach_hang_id = 42)
                → giữ FOR KEY SHARE trên khach_hang#42

   Giao dịch B: SELECT * FROM khach_hang WHERE id = 42 FOR UPDATE
                → PHẢI CHỜ A commit
```

Hậu quả thực tế: nếu bạn có một dòng cha **nóng** — ví dụ một tài khoản ví mà hàng nghìn giao dịch con trỏ tới — thì mọi lệnh thêm dòng con đều chạm vào dòng cha đó, và các luồng cập nhật dòng cha bị xếp hàng theo. Đây là một trong những nguyên nhân kẹt khoá khó tìm nhất, vì trong code bạn **không hề viết một lệnh khoá nào**.

## Tầng 3 — Đánh đổi: "thế còn xoá một dòng ở bảng cha thì sao?"

Đây là chỗ mọi thứ đổi chiều, và cũng là chỗ gần như ai cũng trượt.

> *"Vẫn 5% chứ?"*

Người phỏng vấn dừng bút.

### Sự thật ít người biết: PostgreSQL KHÔNG tự tạo index cho khoá ngoại

```text
   PostgreSQL tự tạo index cho:
      ✓ Khoá chính (PRIMARY KEY)
      ✓ Ràng buộc duy nhất (UNIQUE)
      ✗ Khoá ngoại (FOREIGN KEY)  ← KHÔNG. Không một cái nào.
```

Vì sao? Vì index ở phía **cha** (khoá chính) là thứ bắt buộc phải có để kiểm tra chiều đi vào — và nó đã có sẵn. Còn index ở phía **con** chỉ cần khi bạn đi ngược chiều, và PostgreSQL không tự quyết định hộ bạn chuyện đó.

Vấn đề là bạn **luôn** đi ngược chiều mỗi khi xoá hoặc sửa khoá của dòng cha:

```sql
DELETE FROM khach_hang WHERE id = 42;
```

Để chạy câu này, database phải chắc chắn **không còn dòng con nào trỏ tới khách 42**. Nó buộc phải hỏi:

```sql
SELECT 1 FROM don_hang WHERE khach_hang_id = 42;
```

Không có index trên `don_hang.khach_hang_id` thì nó chỉ còn một cách: **quét sạch bảng con**.

```text
   Bảng con 10 triệu dòng

   CÓ index trên khach_hang_id:      3 bước nhảy   →   ~3 mili-giây
   KHÔNG có index:                   10 triệu dòng →   ~4 GIÂY

                                     Chênh nhau khoảng 1.300 lần.
```

Và nó còn tệ hơn con số đó, vì lệnh `DELETE` này **giữ khoá trên dòng cha suốt 4 giây**. Mọi giao dịch khác đụng tới khách 42 xếp hàng phía sau. Nếu là một job xoá 1.000 khách, bạn vừa khoá bảng con trong hơn một tiếng.

Cách chữa là **một dòng lệnh**, và gần như không ai nhớ làm:

```sql
CREATE INDEX CONCURRENTLY idx_don_hang_khach_hang_id
    ON don_hang (khach_hang_id);
--  ↑ CONCURRENTLY: tạo index mà KHÔNG khoá bảng.
--    Chậm hơn, nhưng chạy được trên production giờ cao điểm.
```

### Câu lệnh tìm mọi khoá ngoại đang thiếu index

Đây là thứ nên chạy trên mọi database bạn đang vận hành. Nói được câu lệnh này trong phỏng vấn là ăn trọn tầng 4:

```sql
-- PostgreSQL: liệt kê khoá ngoại KHÔNG có index phía bảng con
SELECT c.conrelid::regclass  AS bang_con,
       a.attname             AS cot_khoa_ngoai,
       c.confrelid::regclass AS bang_cha,
       pg_size_pretty(pg_relation_size(c.conrelid)) AS kich_thuoc_bang_con
FROM pg_constraint c
JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON TRUE
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
WHERE c.contype = 'f'
  AND NOT EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = c.conrelid
        AND (i.indkey::smallint[])[0:array_length(c.conkey,1)-1] = c.conkey
  )
ORDER BY pg_relation_size(c.conrelid) DESC;
```

Kết quả thường làm người ta giật mình: một hệ chạy vài năm gần như luôn có **5 tới 15** khoá ngoại thiếu index, và chúng nằm im cho tới ngày có người chạy một lệnh xoá.

### MySQL thì khác — và đây là chỗ rất nhiều người trả lời sai

**InnoDB tự động tạo index cho cột khoá ngoại nếu chưa có.** Nó bắt buộc phải có index đó mới cho phép tạo ràng buộc.

```text
   PostgreSQL:  tạo FK  →  KHÔNG có index phía con  →  bạn phải tự tạo
   MySQL/InnoDB: tạo FK  →  TỰ TẠO index phía con    →  không dính bẫy này
```

Nên nếu người phỏng vấn hỏi *"hệ nào?"* mà bạn trả lời được sự khác biệt này, bạn vừa chứng minh mình đọc tài liệu của cả hai chứ không học thuộc một bài blog.

Nhưng đừng mừng vội với MySQL: index tự tạo đó chỉ có **một cột đầu tiên của khoá ngoại**, và InnoDB có một hạn chế riêng — nó kiểm tra khoá ngoại theo **từng dòng một** (row-by-row), nên các lệnh ghi hàng loạt vào bảng con có ràng buộc thường chậm hơn PostgreSQL đáng kể.

## Tầng 4 — Quy trình: bốn tình huống thực tế

### ① `ON DELETE CASCADE`: tiện, và nguy hiểm đúng bằng mức tiện

```sql
khach_hang_id BIGINT REFERENCES khach_hang(id) ON DELETE CASCADE
```

Xoá một khách → mọi đơn của khách tự bay theo. Nghe rất gọn. Hai vấn đề:

```text
   ① Nó CHẠY TRONG CÙNG MỘT TRANSACTION.
      Xoá một khách có 50.000 đơn = một transaction xoá 50.000 dòng,
      giữ khoá trên từng dòng đó, sinh 50.000 dòng rác chờ dọn,
      và ghi tất cả vào nhật ký ghi.

   ② Nó LAN THEO DÂY CHUYỀN.
      khach_hang → don_hang → chi_tiet_don → lich_su_van_chuyen → ...
      Xoá một dòng có thể quét sạch bốn bảng mà bạn không hề nhìn thấy
      trong câu lệnh mình vừa gõ.
```

Với dữ liệu nghiệp vụ quan trọng, hai lựa chọn an toàn hơn:

| Lựa chọn | Cú pháp | Ý nghĩa |
|---|---|---|
| **Chặn hẳn** (mặc định) | `ON DELETE NO ACTION` / `RESTRICT` | Không cho xoá cha khi còn con. Buộc người ta phải xử lý con trước |
| **Ngắt liên kết** | `ON DELETE SET NULL` | Giữ dòng con nhưng bỏ trỏ. Dùng khi con vẫn có ý nghĩa độc lập |
| **Xoá mềm** | Không xoá, chỉ đặt `da_xoa = true` | Cách phổ biến nhất trong hệ nghiệp vụ. Xem [Soft delete hay xoá thật](../../sql-interview/phase-6/03-soft-delete-hay-xoa-that.md) |

Khác biệt nhỏ giữa `NO ACTION` và `RESTRICT`: `NO ACTION` cho phép hoãn kiểm tra tới cuối transaction (nếu khai báo `DEFERRABLE`), `RESTRICT` thì kiểm ngay lập tức, không hoãn được.

### ② Thêm khoá ngoại vào bảng đang chạy production

Câu `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` **quét toàn bộ bảng con để kiểm tra dữ liệu cũ**, và giữ khoá suốt thời gian đó. Trên bảng 100 triệu dòng, đó là vài phút cả hệ thống đứng hình.

PostgreSQL cho phép tách làm hai bước:

```sql
-- Bước 1: thêm ràng buộc nhưng CHƯA kiểm tra dữ liệu cũ.
-- Nhanh, chỉ khoá trong tích tắc. Từ đây mọi dòng MỚI đều bị kiểm.
ALTER TABLE don_hang
  ADD CONSTRAINT fk_don_hang_khach
  FOREIGN KEY (khach_hang_id) REFERENCES khach_hang(id)
  NOT VALID;

-- Bước 2: kiểm tra dữ liệu cũ, dùng khoá NHẸ HƠN,
-- không chặn đọc/ghi thông thường. Chạy được giờ thấp điểm.
ALTER TABLE don_hang VALIDATE CONSTRAINT fk_don_hang_khach;
```

Nhớ tạo index trước khi chạy bước 2 — nếu không bước 2 cũng chậm.

### ③ Vì sao một số công ty lớn bỏ hẳn khoá ngoại?

Đây là câu hỏi vặn hay gặp, và trả lời được cả hai phía là ghi điểm.

| Lý do họ bỏ | Có hợp lý không |
|---|---|
| **Sharding**: bảng cha và bảng con nằm ở hai máy khác nhau | **Hợp lý** — khoá ngoại không hoạt động xuyên máy chủ |
| **Bảng phân mảnh (partitioned)**: trỏ tới bảng phân mảnh có nhiều hạn chế | Hợp lý một phần, tuỳ phiên bản |
| **Ghi cực nóng**: muốn bỏ mọi chi phí kiểm tra | Hợp lý ở quy mô rất lớn, sau khi đã đo |
| **Nhập dữ liệu hàng loạt**: bỏ ràng buộc rồi bật lại sau | Hợp lý — nhưng là tạm thời, không phải vĩnh viễn |
| *"Ứng dụng tự đảm bảo toàn vẹn rồi"* | **Không hợp lý.** Ứng dụng có nhiều phiên bản chạy song song, có job nền, có script chạy tay lúc 2h sáng, có consumer đọc từ queue. Chỉ cần một đường bỏ sót là dữ liệu rác vĩnh viễn |

Câu chốt đáng nói: **dữ liệu sống lâu hơn ứng dụng.** Code được viết lại năm năm một lần; dữ liệu rác thì nằm đó mãi mãi. Ràng buộc nằm trong database là thứ duy nhất mọi đường ghi đều phải đi qua.

Nếu buộc phải bỏ khoá ngoại (ví dụ vì sharding), phải thay bằng một cơ chế khác chứ không phải bỏ trắng:

```text
   ① Job đối soát chạy định kỳ, tìm dòng con mồ côi và báo động.
   ② Test tích hợp bắt buộc phủ mọi đường ghi.
   ③ Gom mọi đường ghi vào một cửa duy nhất ở tầng repository.
```

### ④ Đo thật trên hệ của bạn

```sql
-- Xem chi phí thật của một lệnh xoá dòng cha, TRƯỚC khi chạy nó thật
EXPLAIN (ANALYZE, BUFFERS)
DELETE FROM khach_hang WHERE id = 42;

-- Nhìn hai chỗ:
--   • "Trigger for constraint fk_...: time=..."  ← chi phí kiểm khoá ngoại
--   • Có "Seq Scan on don_hang" không?           ← nếu có, bạn đang thiếu index
```

Dòng `Trigger for constraint` là thứ rất ít người biết là có tồn tại trong output của `EXPLAIN ANALYZE`. Nó tách riêng thời gian kiểm tra ràng buộc ra khỏi thời gian của chính lệnh xoá — nghĩa là bạn đo được chính xác cái giá của khoá ngoại, không phải đoán.

## Bảng tổng: chi phí khoá ngoại theo từng thao tác

| Thao tác | Việc DB làm thêm | Chi phí | Có index phía con thì sao |
|---|---|---|---|
| `INSERT` dòng con | Tra khoá chính bảng cha + khoá nhẹ dòng cha | **+5–10%** | Không liên quan |
| `UPDATE` cột khoá ngoại | Như trên | **+5–10%** | Không liên quan |
| `UPDATE` cột khác của dòng con | Không làm gì thêm | **0%** | Không liên quan |
| `DELETE` dòng cha | Tìm dòng con trỏ tới nó | **3 ms** với index | **4 giây** không index (~1.300×) |
| `UPDATE` khoá chính dòng cha | Như trên | Như trên | Như trên |
| `DELETE` dòng con | Không làm gì thêm | **0%** | Không liên quan |
| `ADD CONSTRAINT` | Quét cả bảng con | Vài phút + khoá | Dùng `NOT VALID` rồi `VALIDATE` |

Nhìn bảng này là thấy ngay vì sao câu hỏi ban đầu thiếu dữ kiện: **hai dòng trong cùng bảng chênh nhau hơn một nghìn lần**, mà câu hỏi không hề nói tới thao tác nào.

## Bẫy thường gặp

| Bẫy | Vì sao hỏng | Cách sửa |
|---|---|---|
| Tưởng PostgreSQL tự tạo index cho FK | Xoá dòng cha = quét toàn bảng con | `CREATE INDEX CONCURRENTLY` trên cột FK |
| Trả lời "có chậm" mà không có con số | Dừng ở tầng 1 | +5–10% khi thêm con; ~1.300× khi xoá cha thiếu index |
| Dùng `ON DELETE CASCADE` cho bảng lớn | Một lệnh xoá kéo theo hàng chục nghìn dòng trong một transaction | `RESTRICT` hoặc xoá mềm; xoá con theo lô |
| `ADD CONSTRAINT` thẳng trên bảng lớn | Khoá bảng vài phút | `NOT VALID` → tạo index → `VALIDATE CONSTRAINT` |
| Bỏ FK vì "ứng dụng tự lo" | Job/script/consumer không đi qua ứng dụng | Giữ FK; nếu buộc bỏ thì phải có job đối soát |
| Không biết `INSERT` con khoá nhẹ dòng cha | Kẹt khoá bí ẩn khi dòng cha nóng | Tránh dòng cha siêu nóng; hoặc tách bảng |
| Nhập dữ liệu hàng loạt mà để nguyên FK | Mỗi dòng một lượt kiểm | Bỏ ràng buộc → nhập → tạo lại với `NOT VALID` + `VALIDATE` |
| Đặt FK trỏ tới cột không phải khoá chính | Cột đó phải có ràng buộc `UNIQUE`, nếu không DB từ chối | Trỏ tới khoá chính, hoặc thêm `UNIQUE` |

## Bản chất câu hỏi: một câu bị tách làm đôi

Nhìn lại hai câu vừa rồi:

```text
   ① "Chậm bao nhiêu?"           → thao tác THÊM DÒNG CON
   ② "Xoá dòng cha thì sao?"     → thao tác XOÁ DÒNG CHA
```

Hai câu đó không phải hai câu hỏi. **Nó là một câu hỏi bị tách làm đôi:**

> *"Dùng khoá ngoại có làm chậm không, và **chậm ở thao tác nào**?"*

Thêm dòng con và xoá dòng cha chênh nhau hơn một nghìn lần, mà câu hỏi ban đầu **không hề nói rõ**.

Họ không đo bạn biết bao nhiêu. Họ đo **bạn có hỏi lại không**. Câu hỏi thiếu dữ kiện, và người giỏi nhận ra rồi hỏi ngược trước khi trả lời một chữ nào.

Quay lại câu bạn tự trả lời lúc đầu bài. Nếu câu đó là *"Có"* hoặc *"Không"*, thì nó chưa sai — **nó chỉ chưa hỏi lại**.

## Bản mẫu 30 giây

> *"Cho em hỏi lại: **chậm ở thao tác nào** ạ? Vì hai thao tác chênh nhau hơn nghìn lần.*
>
> *Nếu là **thêm dòng con**: database tra thêm khoá chính bảng cha, một lần đi cây 3–4 bước, đo trên bảng vài triệu dòng thì chậm thêm khoảng 5 đến 10%. Em chấp nhận cái giá đó, vì đổi lại không bao giờ có dòng mồ côi. Có một chi tiết ít người biết là Postgres còn khoá nhẹ dòng cha bằng `FOR KEY SHARE`, nên nếu dòng cha rất nóng thì nó gây xếp hàng.*
>
> *Còn nếu là **xoá dòng cha** thì hoàn toàn khác: Postgres **không tự tạo index cho khoá ngoại** — nó chỉ tự tạo cho khoá chính và ràng buộc duy nhất. Không có index thì để xoá một dòng cha nó phải quét sạch bảng con. Bảng con 10 triệu dòng là 4 giây thay vì 3 mili-giây. MySQL thì không dính bẫy này vì InnoDB tự tạo index đó.*
>
> *Nên việc đầu tiên em làm khi nhận một database lạ là chạy một câu truy vấn trên `pg_constraint` để liệt kê mọi khoá ngoại đang thiếu index phía con — hệ chạy vài năm thường có 5 tới 15 cái. Và em cũng dùng `EXPLAIN (ANALYZE)` để đọc dòng `Trigger for constraint`, đó là chỗ đo được chính xác cái giá của ràng buộc."*

## Tóm tắt bài 4

- Khoá ngoại canh **hai chiều**: thêm con thì kiểm cha có tồn tại; xoá cha thì kiểm còn con nào không. **Hai chiều có chi phí khác nhau hoàn toàn.**
- Thêm dòng con: **+5–10%**, rẻ, vì tra khoá chính là thao tác rẻ nhất database có.
- Xoá dòng cha thiếu index phía con: **quét toàn bảng**, ~4 giây thay vì ~3 ms — chênh khoảng **1.300 lần**.
- **PostgreSQL không tự tạo index cho khoá ngoại. MySQL/InnoDB thì có.** Đây là khác biệt hay bị trả lời sai.
- `INSERT` dòng con **khoá nhẹ dòng cha** (`FOR KEY SHARE`) — nguồn gốc của những vụ kẹt khoá không thấy lệnh khoá nào trong code.
- Thêm ràng buộc trên bảng lớn: dùng **`NOT VALID` rồi `VALIDATE CONSTRAINT`**, đừng khoá bảng vài phút.
- Bỏ khoá ngoại chỉ hợp lý khi **sharding** hoặc **nhập liệu hàng loạt tạm thời** — không phải vì "ứng dụng tự lo". **Dữ liệu sống lâu hơn ứng dụng.**

**Bài kế tiếp** → [Bài 5: "Bạn sinh mã đơn hàng thế nào?"](05-sinh-ma-don-hang-the-nao.md)
