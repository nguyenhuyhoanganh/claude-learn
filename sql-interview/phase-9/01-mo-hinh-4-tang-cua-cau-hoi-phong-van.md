# Bài 1: Mô hình bốn tầng của câu hỏi phỏng vấn

Bạn vừa ngồi xuống, ghế còn ấm. Người phỏng vấn lật sổ, ngẩng lên, hỏi đúng một câu. Câu hỏi ngắn tới mức bạn tưởng mình trả lời được ngay.

> *"Index có làm chậm INSERT không?"*

Sáu chữ. Không mẹo, không đánh đố. Vậy mà nó loại người đều đặn ở mọi vòng phỏng vấn.

**Câu trả lời của bạn đúng. Và bạn vẫn trượt.**

Vì thứ họ chấm nằm ở tầng dưới của câu hỏi. Bài này giải mã cái tầng đó — và nó áp dụng cho **mọi** câu hỏi phỏng vấn kỹ thuật, không riêng SQL.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa trong bài này |
|---|---|
| **Tầng (bậc thang)** | Mỗi câu hỏi ngắn thực ra là **bốn câu hỏi lồng nhau**, hỏi sâu dần |
| **Ngưỡng lật** | Con số mà **vượt qua nó thì lựa chọn đúng đảo chiều** (ví dụ: index vượt RAM) |
| **Đánh đổi đủ hai vế** | Nói cả **được gì** và **mất gì** — thiếu một vế thì chưa phải đánh đổi |
| **Con số neo** | Một con số cụ thể bạn **tự đo được**, dùng để chứng minh thay vì mô tả |
| **Quy trình** | Các bước cụ thể *"mở X ra xem, thấy Y thì làm Z"* — khác với ý kiến |
| **Hỏi ngược** | Nhận ra đề bài **thiếu dữ kiện** và hỏi lại trước khi trả lời |
| **Vết sẹo** | Kinh nghiệm **đã trả giá** — thứ không tra cứu được trong 10 giây |

## Bốn tầng của một câu hỏi

Mỗi câu hỏi ngắn thực ra là một **cái thang**. Người phỏng vấn hỏi câu đầu, gật đầu, ghi một dòng, rồi hỏi tiếp — mỗi lần một sâu hơn, cho tới khi bạn hết chỗ để lấy câu trả lời ra.

```text
TẦNG 1 — ĐỊNH NGHĨA          "Nó là gì?"
   Nguồn: đọc tài liệu 10 phút.
   Ai cũng trả lời được. KHÔNG ai được điểm ở đây.
   Nó chỉ để loại người không biết gì.

TẦNG 2 — CON SỐ              "Chậm hơn bao nhiêu? Nhanh hơn bao nhiêu?"
   Nguồn: đã từng bấm giờ đo.
   "Chậm hơn" là mô tả. "Chậm hơn 10%" là bằng chứng.

TẦNG 3 — ĐÁNH ĐỔI            "Biết chậm rồi mà vẫn dùng, vì sao?"
   Nguồn: đã từng phải CHỌN.
   Phải có ĐỦ HAI VẾ: được gì và mất gì, kèm ngưỡng lật.

TẦNG 4 — QUY TRÌNH           "Bảng này ghi 5.000 dòng/giây, 12 index. Làm gì?"
   Nguồn: đã từng phải DỌN.
   Không phải một ý kiến. Là các bước cụ thể, đo cái gì, ngưỡng nào.
```

**Bốn câu đó không đo bạn biết bao nhiêu về index. Chúng đo một thứ khác hẳn:**

> **Họ không hỏi bạn biết gì. Họ hỏi bạn đã mất gì.**

Người **biết** thì kể được định nghĩa. Người **đã trả giá** thì kể được con số. Định nghĩa tra 10 giây là có; vết sẹo thì không tra được.

## Ví dụ mẫu: leo hết bốn tầng với câu "Index có làm chậm INSERT không?"

### Tầng 1 — định nghĩa

> *"Có ạ. Mỗi lần thêm một dòng, database phải cập nhật thêm cây index nữa. Ghi vào một chỗ thành ghi vào nhiều chỗ."*

Đúng. Bảng có 3 index thì một dòng mới phải đi vào 4 nơi: bảng, và 3 cây index — mỗi cây phải xếp đúng thứ tự, không được sai.

Người phỏng vấn gật đầu, ghi một dòng. **Bạn chưa được điểm nào.**

### Tầng 2 — con số

> *"Chậm hơn bao nhiêu? Bạn đo bao giờ chưa?"*

Đây là chỗ rất nhiều người ngã, và ngã rất êm.

> *"Trên bảng bình thường, mỗi index thêm khoảng 10% thời gian ghi một dòng. Ba index thì chậm hơn chừng một phần ba. Nhưng con số đó phụ thuộc vào khoá: nếu khoá là chuỗi ngẫu nhiên như UUID v4 thì mỗi dòng mới rơi vào một trang khác nhau, phải đọc trang đó từ đĩa lên, và con số phình lên nhiều lần. Em đo bằng cách bật đồng hồ, chèn 100.000 dòng vào bảng chưa có index rồi chèn lại vào bảng đã có, lấy hiệu."*

Chú ý ba thứ trong câu trả lời đó:
- **Một con số** (10% mỗi index).
- **Một điều kiện làm con số thay đổi** (khoá ngẫu nhiên vs tuần tự).
- **Cách bạn đo** — đây là phần khiến người phỏng vấn không hỏi vặn được.

```sql
-- Cách đo, để nói ra được khi bị hỏi
CREATE TEMP TABLE t_khong_index (id BIGINT, a TEXT, b TEXT, c TIMESTAMPTZ);
CREATE TEMP TABLE t_co_index    (LIKE t_khong_index);
CREATE INDEX ON t_co_index (a);
CREATE INDEX ON t_co_index (b);
CREATE INDEX ON t_co_index (c);

\timing on
INSERT INTO t_khong_index SELECT i, md5(i::text), md5((i*7)::text), now()
FROM generate_series(1, 100000) i;      -- ví dụ: 412 ms

INSERT INTO t_co_index SELECT i, md5(i::text), md5((i*7)::text), now()
FROM generate_series(1, 100000) i;      -- ví dụ: 1.284 ms  → chậm 3,1 lần
```

**Tầng 1 đóng lại bằng một con số, không phải bằng chữ "chậm".**

### Tầng 3 — đánh đổi

> *"Biết chậm rồi mà vẫn đánh index, vì sao?"*

Câu này ai cũng nói được: *"vì đọc nhanh hơn"*. Nhưng nói "đọc nhanh hơn" mà không nói **nhanh hơn bao nhiêu** thì vẫn chưa trả lời được câu vừa hỏi. **Nhanh hơn không tự nó bù được chậm hơn.**

> *"Không index, tìm một dòng trong một triệu dòng là phải đọc hết một triệu dòng. Có index, máy đi thẳng 4–5 bước là tới. Đo trên bảng một triệu dòng: quét toàn bảng khoảng 420 ms, dùng index khoảng 3 ms — nhanh hơn 140 lần cho cùng một câu. Vậy phép đổi là: em trả thêm khoảng 10% cho mỗi lần ghi, và nhận lại 140 lần cho mỗi lần đọc. Bảng nào đọc nhiều hơn ghi thì đây là món hời tới mức không cần nghĩ. Nhưng chiều ngược lại cũng có: bảng ghi liên tục mà gần như không ai đọc — ví dụ bảng ghi nhật ký — thì mỗi index chỉ còn là tiền mất, ở đó phép đổi này lỗ."*

**Tầng 2 đóng lại bằng một đánh đổi có ĐỦ HAI VẾ, không phải bằng câu "còn tuỳ".**

Đây là điểm then chốt: *"còn tuỳ"* là câu trả lời của người chưa từng chọn. *"Được X, mất Y, ngưỡng lật ở Z"* là câu trả lời của người đã chọn.

### Tầng 4 — quy trình

> *"Bảng này ghi 5.000 dòng mỗi giây, đang có 12 index. Làm gì?"*

Ứng viên định nói "bỏ bớt index" — nhưng **bỏ cái nào?** 12 cái đó không giống nhau, và bỏ nhầm một cái là một màn hình nào đó chậm đi 10 lần. Không ai dám.

Câu trả lời tốt bắt đầu bằng một chữ: **"Đo."**

> *"Mọi database đều có bảng thống kê ghi lại index nào được dùng bao nhiêu lần. Em mở nó ra trước khi động vào gì cả. Con số hay gặp là 3 đến 5 phần 10 — bảng sống vài năm thì thường có 3–5 index trong 10 cái chưa bao giờ được quét, chúng ngồi đó ăn thời gian ghi. Bỏ những cái đó trước, không rủi ro gì."*

```sql
-- PostgreSQL: index chưa bao giờ được dùng
SELECT s.schemaname, s.relname AS bang, s.indexrelname AS index_name,
       s.idx_scan AS so_lan_quet,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS kich_thuoc
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.idx_scan = 0
  AND NOT i.indisunique          -- giữ lại unique: nó là ràng buộc, không phải để tra
  AND NOT i.indisprimary
ORDER BY pg_relation_size(s.indexrelid) DESC;
```

> *"Còn một chỗ nữa: index trên cột A và index trên (A, B) là hai cái, nhưng cái đầu thường thừa vì index gộp dùng được từ cột trái nhất đi vào. Bỏ nó là bớt một lần ghi mà không mất gì."*

```sql
-- Tìm index bị "phủ" bởi index gộp khác
SELECT a.indexrelid::regclass AS co_the_bo,
       b.indexrelid::regclass AS vi_da_co
FROM pg_index a JOIN pg_index b
  ON a.indrelid = b.indrelid AND a.indexrelid <> b.indexrelid
WHERE a.indkey::int2[] <@ b.indkey::int2[]        -- cột của a là tiền tố của b
  AND array_length(a.indkey::int2[],1) < array_length(b.indkey::int2[],1)
  AND NOT a.indisunique AND NOT a.indisprimary;
```

> *"Và ngưỡng để nói cho gọn: dưới 5 index thì đừng nghĩ, cứ đánh. Trên 10 thì phải ngồi đo, không được đoán. Khoảng giữa thì nhìn tỷ lệ đọc trên ghi. Làm đúng vậy trên bảng ghi 5.000 dòng một giây thì thường bỏ được 3–4 index, thời gian ghi tụt khoảng 30%, mà không màn hình nào chậm đi."*

**Tầng 3 đóng lại bằng một quy trình, không phải bằng một ý kiến.**

## Bản mẫu 30 giây

Sau khi leo hết bốn tầng, câu trả lời đầy đủ gói được trong 30 giây:

> *"Có, mỗi index thêm khoảng 10% thời gian ghi một dòng — em từng đo bằng cách chèn 100.000 dòng vào bảng có và không có index. Nhưng đổi lại tra cứu nhanh hơn khoảng 140 lần trên bảng một triệu dòng, nên bảng đọc nhiều hơn ghi thì quá hời. Bảng ghi 5.000 dòng một giây thì em không đoán — em mở `pg_stat_user_indexes` xem cái nào `idx_scan = 0` thì bỏ, và bỏ luôn index đơn nào đã là tiền tố của index gộp khác. Dưới 5 index thì cứ đánh, trên 10 thì phải đo."*

**Ba mươi giây đó có: một con số, một tỷ giá, và một quy trình.** Không câu nào là "còn tuỳ". Đó là khác biệt giữa người biết và người đã làm.

## Hai kỹ thuật quyết định điểm số

### ① Hỏi ngược khi thiếu dữ kiện

Rất nhiều câu hỏi phỏng vấn **cố tình thiếu dữ kiện**. Người phỏng vấn nhả dữ kiện từng chút, và chờ xem **khi nào bạn nhận ra câu hỏi này chưa đủ để trả lời**.

```text
Hỏi: "Sao LIKE '%abc%' lại chậm?"

Ứng viên A trả lời ngay: "Vì index không dùng được nên quét cả bảng."
   → Đúng. Nhưng đó là câu ai đọc tài liệu cũng nói được.

Ứng viên B hỏi ngược trước: "Cho em hỏi hai điều: người dùng gõ đầu chuỗi
   hay giữa chuỗi? Và bảng đó khoảng bao nhiêu dòng? Vì gõ đầu chuỗi thì
   chỉ cần bỏ dấu phần trăm phía trước là index dùng được; giữa chuỗi thì
   phải đánh trigram, chịu index nặng và ghi chậm hơn; còn trăm triệu dòng
   và cần xếp hạng thì nên tách hệ tìm kiếm riêng."
   → Ứng viên B được điểm cao hơn hẳn.
```

Ngoài đời, **yêu cầu nào cũng thiếu dữ kiện**. Người phỏng vấn không đo bạn biết bao nhiêu — họ đo **bạn có nhận ra mình đang thiếu dữ kiện hay không**.

Ba câu hỏi ngược dùng được cho gần như mọi câu hỏi SQL:

```text
① "Bảng đó khoảng bao nhiêu dòng?"          → quyết định mọi thứ về hiệu năng
② "Tỷ lệ đọc/ghi thế nào?"                   → quyết định đánh đổi index
③ "Đây là hệ nào, phiên bản nào?"            → hành vi mặc định khác nhau
```

### ② Nói "em chưa đo" đúng cách

Đây là câu ăn điểm nhiều nhất trong cả buổi phỏng vấn, và hầu hết ứng viên không dám nói.

```text
❌ "Chắc là READ COMMITTED ạ."
   → Đoán bừa. Người phỏng vấn hỏi tiếp một câu là lộ ngay.

❌ "Cái này còn tuỳ ạ."
   → Câu của người chưa từng phải chọn. Không có thông tin nào.

✅ "Em chưa đo cái này trên hệ đang dùng. Nhưng em sẽ đo thế này:
    chạy SHOW transaction_isolation để xem mặc định, rồi mở hai phiên
    song song, một bên UPDATE chưa commit, bên kia SELECT, xem nó thấy gì."
   → Đây là câu ĐƯỢC điểm, không phải mất điểm.
```

Nghe hai kiểu trả lời là biết ngay ai đã làm việc thật:

| Người chưa trả giá | Người đã trả giá |
|---|---|
| "Còn tuỳ dự án" | "Ngưỡng lật là ở X" |
| "Nó nhanh hơn" | "Nhanh hơn 140 lần, em đo trên bảng 1 triệu dòng" |
| "Chắc là..." | "Em chưa đo, và em sẽ đo thế này" |
| "Best practice là..." | "Bọn em từng dính vụ này, mất một đêm" |
| "Cái đó tốt hơn" | "Được X, mất Y, chọn X vì hệ này đọc nhiều" |

> **Câu trả lời sai không giết bạn. Đoán bừa thì có.**

## Cách xây "vết sẹo" khi bạn chưa có

Nếu bạn còn ít kinh nghiệm, ba tầng trên nghe như bất khả thi. Không hẳn — bạn **tự tạo được vết sẹo** trong một buổi tối:

```sql
-- ① Dựng bảng 1 triệu dòng và tự đo mọi thứ trong bài này
CREATE TABLE thu (id BIGSERIAL PRIMARY KEY, a TEXT, b INT, c TIMESTAMPTZ);
INSERT INTO thu (a, b, c)
SELECT md5(i::text), i % 1000, now() - (i || ' minutes')::interval
FROM generate_series(1, 1000000) i;

-- ② Đo trước/sau khi có index
\timing on
EXPLAIN ANALYZE SELECT * FROM thu WHERE a = md5('500000');   -- Seq Scan
CREATE INDEX ON thu (a);
EXPLAIN ANALYZE SELECT * FROM thu WHERE a = md5('500000');   -- Index Scan

-- ③ Tự tạo lại từng cái bẫy trong series này
SELECT * FROM thu WHERE lower(a) = md5('500000');            -- mất index
SELECT * FROM thu WHERE a LIKE '%abc%';                       -- mất index
EXPLAIN ANALYZE SELECT * FROM thu ORDER BY id OFFSET 900000 LIMIT 20;  -- offset sâu

-- ④ Mở hai phiên psql song song, tự dựng lost update và deadlock
```

Một buổi tối làm hết những thứ này cho bạn **con số thật để nói**, và đó chính xác là thứ tầng 2 đòi hỏi. Và khi kể, hãy kể trung thực: *"Em dựng thử trên máy để hiểu, chưa gặp trên production"* — vẫn hơn rất nhiều so với đọc thuộc.

## Quy trình trả lời một câu hỏi ngắn

```text
① NGHE HẾT CÂU. Đừng cắt lời để trả lời sớm.

② TỰ HỎI: câu này có thiếu dữ kiện không?
   Thiếu → hỏi ngược 1–2 câu (10 giây, được rất nhiều điểm).

③ TRẢ LỜI TẦNG 1 gọn trong 1 câu. Đừng dài dòng ở đây.

④ TỰ LEO LÊN TẦNG 2 mà không cần họ hỏi:
   "...và em từng đo, con số khoảng..."

⑤ NÊU ĐÁNH ĐỔI ĐỦ HAI VẾ + ngưỡng lật.

⑥ NẾU HỌ ĐƯA MỘT TÌNH HUỐNG CỤ THỂ → trả lời bằng QUY TRÌNH,
   không bằng ý kiến. "Em mở X ra xem, thấy Y thì làm Z."

⑦ HẾT KIẾN THỨC THÌ DỪNG ĐÚNG CHỖ:
   "Em chưa đo cái này. Em sẽ đo thế này: ..."
```

Bước ④ rất quan trọng: **tự leo lên tầng 2 mà không đợi được hỏi**. Nó cho người phỏng vấn thấy bạn biết câu hỏi thật nằm ở đâu, và tiết kiệm thời gian cho cả hai.

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Người phỏng vấn hỏi một câu bạn **hoàn toàn không biết**. Im lặng 5 giây rồi.

**Đây là khoảnh khắc quyết định, và có ba cách phản ứng:**

```text
   ❌ ĐOÁN BỪA
      "Chắc là READ COMMITTED ạ."
      → Họ hỏi thêm một câu là lộ. Và giờ họ nghi ngờ CẢ những câu
        bạn trả lời đúng trước đó.

   ❌ ĐẦU HÀNG
      "Dạ em không biết ạ."
      → Đúng nhưng lãng phí. Bạn vừa bỏ qua cơ hội cho họ thấy
        BẠN SUY NGHĨ THẾ NÀO khi thiếu kiến thức.

   ✅ NÓI THẬT + CHO THẤY CÁCH BẠN SẼ TÌM RA
      "Em chưa gặp ca này. Nhưng em nghĩ nó liên quan tới [khái niệm gần nhất
       bạn biết]. Em sẽ kiểm bằng cách [câu lệnh / thí nghiệm cụ thể].
       Anh cho em hỏi thêm: [câu hỏi thu hẹp phạm vi]?"
```

**Công thức ba phần, dùng được cho mọi câu bí:**

```text
   ① NEO vào thứ bạn CÓ biết
      "Em chưa làm với Oracle, nhưng trong Postgres thì cơ chế tương đương là..."

   ② NÓI CÁCH BẠN SẼ ĐO
      "Em sẽ mở hai phiên song song, một bên UPDATE chưa commit,
       bên kia SELECT, xem nó thấy gì."

   ③ HỎI NGƯỢC để thu hẹp
      "Trường hợp anh đang nghĩ tới là đọc hay ghi ạ?"
```

> Câu ② là câu **được điểm**. Nó chứng minh bạn có **phương pháp**, và phương pháp thì áp dụng được cho cả những thứ bạn chưa gặp.

> **Tình huống 2:** Bạn mới đi làm hai năm, chưa có "vết sẹo" nào để kể. Phỏng vấn hỏi tầng 2 và tầng 3 thì lấy gì trả lời?

**Tự tạo vết sẹo trong một buổi tối. Đây là kịch bản cụ thể:**

```sql
-- ═══ Dựng bảng 1 triệu dòng (2 phút) ═══
CREATE TABLE thu (
    id BIGSERIAL PRIMARY KEY, a TEXT, b INT, c TIMESTAMPTZ
);
INSERT INTO thu (a, b, c)
SELECT md5(i::text), i % 1000, now() - (i || ' minutes')::interval
FROM generate_series(1, 1000000) i;

-- ═══ THÍ NGHIỆM 1: index nhanh hơn bao nhiêu LẦN? ═══
\timing on
EXPLAIN ANALYZE SELECT * FROM thu WHERE a = md5('500000');
--  Seq Scan ... 420 ms          ← GHI CON SỐ NÀY LẠI
CREATE INDEX ON thu (a);
EXPLAIN ANALYZE SELECT * FROM thu WHERE a = md5('500000');
--  Index Scan ... 3 ms          ← nhanh hơn 140 LẦN. ĐÂY LÀ CON SỐ CỦA BẠN.

-- ═══ THÍ NGHIỆM 2: index làm chậm INSERT bao nhiêu %? ═══
CREATE TABLE thu2 (LIKE thu INCLUDING ALL);   -- có index
CREATE TABLE thu3 (LIKE thu);                  -- không index
INSERT INTO thu3 SELECT * FROM thu LIMIT 100000;   -- 412 ms
INSERT INTO thu2 SELECT * FROM thu LIMIT 100000;   -- 468 ms  → +13%

-- ═══ THÍ NGHIỆM 3: tự tay giết index ═══
EXPLAIN ANALYZE SELECT * FROM thu WHERE lower(a) = md5('500000');  -- Seq Scan!
EXPLAIN ANALYZE SELECT * FROM thu WHERE a LIKE '%abc%';            -- Seq Scan!

-- ═══ THÍ NGHIỆM 4: OFFSET sâu chậm bao nhiêu? ═══
EXPLAIN ANALYZE SELECT * FROM thu ORDER BY id LIMIT 20;               -- 0.1 ms
EXPLAIN ANALYZE SELECT * FROM thu ORDER BY id OFFSET 900000 LIMIT 20; -- 180 ms
```

```text
   ═══ THÍ NGHIỆM 5: tự tay dựng LOST UPDATE (mở HAI cửa sổ psql) ═══

   Phiên A                          Phiên B
   ────────────────────             ────────────────────
   BEGIN;                           BEGIN;
   SELECT ton FROM t WHERE id=1;    SELECT ton FROM t WHERE id=1;
   -- thấy 1                        -- CŨNG thấy 1
   UPDATE t SET ton=0 WHERE id=1;   
   COMMIT;                          UPDATE t SET ton=0 WHERE id=1;
                                     COMMIT;
   → Bán 2 lần, tồn kho chỉ giảm 1. BẠN VỪA TỰ TAY TẠO RA NÓ.

   Rồi làm lại với FOR UPDATE và xem phiên B ĐỨNG CHỜ.
```

**Sau buổi tối đó, bạn có sáu con số thật để nói.** Và khi kể, hãy kể trung thực:

> *"Em dựng thử trên máy để hiểu cơ chế, đo được nhanh hơn khoảng 140 lần trên bảng một triệu dòng. Em chưa gặp ca này trên production."*

Câu đó **vẫn hơn rất nhiều** so với đọc thuộc định nghĩa — vì nó cho thấy bạn **chủ động đi đo**.

## Bẫy thường gặp

| Bẫy | Vì sao mất điểm | Cách sửa |
|---|---|---|
| Dừng lại ở định nghĩa | Đó là tầng ai cũng qua được | Tự leo lên tầng 2 |
| Trả lời "còn tuỳ" | Câu của người chưa từng chọn | Nêu **ngưỡng lật** cụ thể |
| Nói "nhanh hơn" không có số | Mô tả, không phải bằng chứng | Kèm con số + cách đo |
| Đoán bừa khi không biết | Hỏi tiếp một câu là lộ | "Em chưa đo, em sẽ đo thế này" |
| Trả lời ngay khi thiếu dữ kiện | Bỏ lỡ điểm quan trọng nhất | Hỏi ngược 1–2 câu trước |
| Nêu đánh đổi chỉ một vế | Chưa phải đánh đổi | Đủ **được gì / mất gì** |
| Đưa ý kiến cho câu hỏi tình huống | Họ cần quy trình | "Em mở X, thấy Y thì Z" |
| Kể lý thuyết dài dòng | Tốn thời gian, không ghi điểm | Ngắn ở tầng 1, sâu ở tầng 3–4 |
| Giấu việc mình chưa có kinh nghiệm | Người phỏng vấn nhận ra ngay | Nói thật + nêu cách bạn sẽ học |

## Tóm tắt bài 1

- Mỗi câu hỏi ngắn là một **cái thang bốn bậc**: định nghĩa → con số → đánh đổi → quy trình.
- **Tầng 1 không ai được điểm** — nó chỉ để loại người không biết gì. Điểm nằm ở tầng 2 trở lên.
- Thứ họ đo không phải *"bạn biết gì"* mà là *"**bạn đã mất gì**"*. Định nghĩa tra 10 giây là có; vết sẹo thì không.
- Tầng 2 đóng bằng **con số + cách đo**. Tầng 3 đóng bằng **đánh đổi đủ hai vế + ngưỡng lật**. Tầng 4 đóng bằng **quy trình cụ thể**.
- **"Còn tuỳ" là câu của người chưa từng chọn.** Thay bằng ngưỡng lật.
- Hai kỹ thuật quyết định điểm: **hỏi ngược khi thiếu dữ kiện**, và nói **"em chưa đo, và em sẽ đo thế này"** thay vì đoán bừa.
- Chưa có vết sẹo? **Tự tạo trong một buổi tối** — dựng bảng một triệu dòng và tái hiện từng cái bẫy trong series này.

**Bài kế tiếp** → [Bài 2: Mười hai câu hỏi ngắn và đáp án 30 giây](02-muoi-hai-cau-hoi-ngan-va-dap-an-30-giay.md)
