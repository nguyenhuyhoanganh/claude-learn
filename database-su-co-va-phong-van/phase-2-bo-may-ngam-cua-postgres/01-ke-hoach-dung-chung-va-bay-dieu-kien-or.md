# Bài 8: Kế hoạch dùng chung và cái bẫy của một điều kiện OR

Cùng một câu lệnh. Không ai sửa một dòng code nào.

Lúc chạy nhanh, nó hết **0,042 ms**. Lúc chạy chậm, **71,971 ms**.

Chuyện bắt đầu từ thứ ai cũng từng viết: một API trả danh sách đơn hàng, có bộ lọc thời gian nhưng **không bắt buộc**. Có thì lọc, không có thì trả hết.

Chạy ngon trên máy dev suốt mấy tuần. Lên production, độ trễ dựng đứng. Thủ phạm có tên: **kế hoạch dùng chung (generic plan)**.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ |
|---|---|---|
| **Planner / Optimizer** (bộ lập kế hoạch) | Phần của database quyết định câu lệnh sẽ chạy theo đường nào: quét cả bảng hay dùng index, ghép bảng theo thứ tự nào | Ứng dụng bản đồ: cùng điểm đến, nó chọn giúp bạn đi đường nào |
| **Execution Plan** (kế hoạch chạy) | Kết quả của planner — cây các bước máy sẽ thực hiện | Lộ trình cụ thể: rẽ trái, đi 2km, vào cao tốc |
| **Prepared Statement** | Câu lệnh được "chuẩn bị" sẵn với các tham số để trống (`$1`, `?`), rồi thực thi nhiều lần với giá trị khác nhau | Tờ đơn in sẵn, mỗi lần chỉ điền chỗ trống |
| **Custom Plan** (kế hoạch riêng) | Kế hoạch lập **cho đúng giá trị tham số của lần chạy này** | Xem đúng tình hình giao thông hôm nay rồi mới chọn đường |
| **Generic Plan** (kế hoạch dùng chung) | Kế hoạch lập **một lần, dùng cho mọi giá trị tham số** | Một lộ trình cố định, không cần biết hôm nay đường nào tắc |
| **Index Cond** | Điều kiện được dùng để **nhảy thẳng tới đúng chỗ** trong cây index | Tra từ điển: mở thẳng tới vần "M" |
| **Filter** | Điều kiện chỉ dùng để **loại bỏ dòng sau khi đã lấy lên** | Đọc từng trang rồi mới xem từ này có phải từ cần tìm không |
| **Rows Removed by Filter** | Số dòng bị lấy lên rồi vứt đi | Số trang đã lật qua mà không dùng được |
| **Buffers / trang dữ liệu** | Đơn vị đọc của database, 8 KB mỗi trang | Số trang giấy phải lật |
| **Cost** (chi phí ước tính) | Con số **không có đơn vị** mà planner dùng để so sánh các đường đi. Nó là **ước tính**, không phải thời gian thật | Điểm số trên giấy, không phải kết quả chạy thử |

## Câu lệnh sinh ra tai nạn

Đây là kiểu code mà ai cũng viết ít nhất một lần. API nhận một tham số lọc thời gian **tuỳ chọn**: có thì lọc, không có thì trả hết.

Viết hai câu lệnh riêng thì phải nhân đôi code. Nên đa số gộp lại thành một điều kiện `OR` duy nhất:

```sql
SELECT * FROM don_hang
 WHERE ($1::timestamptz IS NULL OR ngay_tao >= $1)
 ORDER BY ngay_tao DESC
 LIMIT 10;
```

Đọc rất xuôi: *"nếu tham số rỗng thì vế đầu đúng, cả điều kiện đúng, trả hết. Nếu có giá trị thì vế đầu sai, còn lại là so sánh với mốc thời gian."*

Gọn, sạch, chạy ngon trên máy dev. Và nó là quả bom hẹn giờ.

## Chuyện gì thật sự xảy ra khi một câu lệnh chạy

Muốn hiểu cái bẫy thì phải biết một câu lệnh đi qua bao nhiêu chặng. Đây là chỗ **đa số hiểu sai ngay từ đầu**:

```text
   ┌──────────────────────────────────────────────────────────────┐
   │  ① PARSE      — đọc cú pháp, kiểm tra viết có đúng ngữ pháp  │
   │  ② ANALYZE    — tra tên bảng, tên cột có thật không          │
   │  ③ REWRITE    — viết lại nếu đụng View, Rule                 │
   │  ④ PLAN       — QUYẾT ĐỊNH ĐI ĐƯỜNG NÀO  ← chặng đắt & quan  │
   │                                              trọng nhất       │
   │  ⑤ EXECUTE    — chạy thật                                    │
   └──────────────────────────────────────────────────────────────┘
```

**Lệnh `PREPARE` chỉ cắt giúp bạn ba chặng đầu.** Tài liệu chính thức của PostgreSQL nói thẳng: khi `EXECUTE` chạy, câu lệnh **vẫn được lập kế hoạch lại**.

Đây là chỗ ngược hẳn với trực giác. Gần như ai cũng nghĩ *"prepared statement thì càng chạy càng nhanh, chuẩn bị sẵn một lần rồi dùng mãi"*. Không phải.

## Luật 5 lần chạy đầu

Lập lại kế hoạch mỗi lần thì tốn CPU. Nên PostgreSQL có một mẹo:

```text
   Lần chạy 1 ─┐
   Lần chạy 2  │
   Lần chạy 3  ├─ Lập KẾ HOẠCH RIÊNG cho từng lần, dùng ĐÚNG giá trị
   Lần chạy 4  │  tham số của lần đó. Ghi lại chi phí ước tính mỗi lần.
   Lần chạy 5 ─┘

   Lần chạy 6 ──► Tính chi phí ước tính TRUNG BÌNH của 5 lần trên.
                  Dựng thử một KẾ HOẠCH DÙNG CHUNG cho mọi giá trị.
                  So hai con số trên giấy:
                     • Kế hoạch dùng chung rẻ hơn?  → dùng nó MÃI MÃI
                     • Đắt hơn?                      → tiếp tục lập riêng
```

Con số 5 đó ở đâu ra? **Không dựa trên nghiên cứu nào cả.** Trong mã nguồn PostgreSQL, hàm `choose_custom_plan()` trong tệp `plancache.c` có đúng dòng chú thích này:

```c
/* Generate custom plans until we have done at least 5 (arbitrary) */
if (plansource->num_custom_plans < 5)
    return true;
```

Chữ **`arbitrary`** — *chọn đại*. Dòng chú thích đó nằm nguyên từ 2012 tới giờ.

### Vì sao máy dev không bao giờ thấy gì

Đây là chi tiết giải thích toàn bộ hiện tượng "chỉ chậm trên production":

```text
   MÁY DEV:
      Prepared statement sống theo KẾT NỐI.
      Bạn bấm chạy vài lần rồi tắt.
      Kết nối chết TRƯỚC KHI chạm mốc 5.
      → Luôn luôn dùng kế hoạch riêng. Luôn luôn nhanh.

   PRODUCTION:
      Một kết nối trong pool sống HÀNG GIỜ, phục vụ hàng nghìn lượt.
      Nó vượt mốc 5 chỉ trong vài giây.
      → Lật sang kế hoạch dùng chung, và ở đó mãi.
```

Và bạn **không thoát được bằng cách không gõ chữ `PREPARE`**: driver JDBC, Npgsql, psycopg, và hầu hết ORM đều **tự động dùng prepared statement sau lưng bạn**.

```java
// Bạn viết thế này...
jdbcTemplate.query("SELECT * FROM don_hang WHERE (? IS NULL OR ngay_tao >= ?)", ...);

// ...driver PostgreSQL JDBC tự chuyển sang server-side prepared statement
// sau prepareThreshold lần (mặc định 5). Bạn không gõ chữ PREPARE nào.
```

## Vì sao kế hoạch dùng chung làm hỏng điều kiện OR

Nghe luật 5 lần thì vẫn hợp lý. Vấn đề nằm ở đúng bốn chữ: **"cho mọi giá trị"**.

### Khi lập kế hoạch RIÊNG

Planner **nhìn thấy giá trị thật** của tham số — ví dụ `$1 = '2026-01-01'`:

```text
   Điều kiện:  ($1 IS NULL  OR  ngay_tao >= $1)
                    ↓
   Planner biết $1 = '2026-01-01', nên vế đầu là SAI, chắc chắn.
                    ↓
   Điều kiện rút gọn còn:  ngay_tao >= '2026-01-01'
                    ↓
   Dạng này Index DÙNG ĐƯỢC ĐỂ NHẢY.
   Postgres nhảy thẳng tới đúng chỗ trong cây rồi đọc tiếp.
```

```text
   Index Scan using idx_ngay_tao on don_hang
     Index Cond: (ngay_tao >= '2026-01-01')      ← nằm ở Index Cond
     Buffers: shared hit=4
     Execution Time: 0.042 ms
```

### Khi lập kế hoạch DÙNG CHUNG

Kế hoạch này phải chạy **đúng cho cả những lần tham số thật sự rỗng**. Nên planner **bị cấm giả định giá trị tham số**:

```text
   Điều kiện:  ($1 IS NULL  OR  ngay_tao >= $1)
                    ↓
   Planner KHÔNG biết $1 là gì. Vế "$1 IS NULL" không chứng minh
   được là sai. Nên CẢ ĐIỀU KIỆN OR phải giữ nguyên.
                    ↓
   Mà điều kiện OR có một nhánh KHÔNG đụng tới cột được index
   ($1 IS NULL không liên quan gì tới cột ngay_tao)
                    ↓
   → HẾT CỬA dùng index để NHẢY.
   → Điều kiện tụt xuống thành BỘ LỌC (Filter).
```

### Cái bẫy thứ hai: kế hoạch vẫn ghi "Index Scan" mà vẫn chậm

Đây là chỗ đánh lừa nhiều người nhất. Bạn mở `EXPLAIN` ra, thấy dòng `Index Scan`, và kết luận "index vẫn được dùng, chắc không phải lỗi ở đây".

**Index vẫn được dùng thật. Nhưng nó tụt từ vai trò TÌM KIẾM xuống vai trò SẮP XẾP.**

```text
   ┌─── VAI TRÒ TÌM KIẾM (Index Cond) ────────────────────────────┐
   │  Nhảy thẳng tới vị trí đầu tiên thoả điều kiện, đọc tiếp.    │
   │  Chạm 4 trang dữ liệu. Xong.                                 │
   └──────────────────────────────────────────────────────────────┘

   ┌─── VAI TRÒ SẮP XẾP (Filter) ─────────────────────────────────┐
   │  Index chỉ còn dùng để lấy dòng THEO ĐÚNG THỨ TỰ ngay_tao.   │
   │  Postgres lê từ đầu index, lôi TỪNG DÒNG lên,                │
   │  rồi mới hỏi từng dòng: "có khớp không?"                     │
   │  Chạm 4.786 trang. Đọc ~37 MB. Để trả về đúng 10 dòng.       │
   └──────────────────────────────────────────────────────────────┘
```

**Cách phân biệt chỉ cần soi hai chữ trong `EXPLAIN`:**

```text
   ✓ KẾ HOẠCH TỐT
     Index Scan using idx_ngay_tao on don_hang
       Index Cond: (ngay_tao >= '2026-01-01')     ← ĐIỀU KIỆN Ở ĐÂY
       Buffers: shared hit=4
       Execution Time: 0.042 ms

   ✗ KẾ HOẠCH XẤU
     Index Scan using idx_ngay_tao on don_hang
       Filter: (($1 IS NULL) OR (ngay_tao >= $1))   ← TỤT XUỐNG ĐÂY
       Rows Removed by Filter: 525600               ← DẤU HIỆU CHẾT NGƯỜI
       Buffers: shared hit=4786
       Execution Time: 71.971 ms
```

Con số `525.600` đáng dừng lại. Thử nhân:

```text
   365 × 24 × 60 = 525.600
```

**Đúng bằng số phút của một năm.** Bảng đó có một dòng mỗi phút. Nghĩa là PostgreSQL vừa **đi bộ qua nguyên một năm dữ liệu** rồi mới chạm tới dòng đầu tiên hợp lệ.

## Chi tiết đáng sợ hơn con số đó

**PostgreSQL chọn kế hoạch bằng cách so ƯỚC TÍNH với ƯỚC TÍNH. Nó không bao giờ đo thời gian chạy thật.**

Vì sao? Vì muốn đối chiếu thì phải chạy cả hai kế hoạch rồi bấm giờ — tức trả giá gấp đôi cho **mọi** câu lệnh trong hệ thống.

Hệ quả: **một kế hoạch chậm gấp nghìn lần vẫn thắng, miễn con số ước tính của nó nhỏ hơn.**

### Bằng chứng: thread trên mailing list chính thức năm 2019

Một kỹ sư ở BMC Software chạy PostgreSQL 9.6, câu lệnh của họ có **51 tham số** với chuỗi `OR` dài dằng dặc. Bản 9.6 chưa có công tắc nào để ép, nên đây đúng là **chế độ mặc định tự lật**.

```text
                       Chi phí ước tính      Thời gian chạy thật
                       (trên giấy)           (đo thật)
   ─────────────────────────────────────────────────────────────
   Kế hoạch riêng      402                   3,497 ms
   Kế hoạch dùng chung 12,68                 5.544,701 ms
   ─────────────────────────────────────────────────────────────
                       RẺ ĐI 32 LẦN          CHẬM ĐI ~1.586 LẦN
```

Hai con số đi **ngược hẳn nhau**. Rẻ hơn 32 lần trên giấy, chậm hơn một nghìn rưỡi lần khi chạy thật. (Tiêu đề của chính thread đó ghi tỷ lệ tệ nhất họ gặp là **158.155 lần**.)

Người trả lời trong luồng đó là **Tom Lane** — chính người viết ra cơ chế này. Ông nói, đại ý:

> *Về nguyên tắc, một kế hoạch dùng chung không bao giờ có thể thực sự tốt hơn kế hoạch riêng. Rẻ hơn trên giấy là **dấu hiệu của lỗi ước lượng**.*

Câu đó đáng đọc hai lần. Kế hoạch dùng chung có ít thông tin hơn kế hoạch riêng — nó không thể tốt hơn. Nếu nó *trông* rẻ hơn, thì chính con số ước tính đang sai.

## Đọc tới đây dễ nghĩ PostgreSQL làm ẩu — không phải vậy

Trước bản 9.2, prepared statement **luôn luôn** dùng kế hoạch dùng chung, và thường tệ hơn hẳn. Cơ chế 5 lần chính là **bản vá** cho chuyện đó.

Và cả hai mặt đều có thật. Một ví dụ hai chiều:

```text
   CÔNG TY A (Prefect — nền tảng điều phối luồng công việc)
   Database hết bộ nhớ 2 LẦN trong 4 NGÀY.
   Nguyên nhân: kế hoạch dùng chung không biết trước giá trị tham số
   nên KHÔNG CẮT BỚT ĐƯỢC PARTITION — phải ôm hết mọi mảnh bảng.
   Cách dập: ép Postgres không lật sang kế hoạch dùng chung.

   CŨNG CHÍNH HỌ xác nhận:
   Bật đúng công tắc đó cho một database khác, đơn giản hơn,
   thì ĐỘ TRỄ LẠI XẤU ĐI THẤY RÕ — vì ở đó việc lập kế hoạch
   mỗi lần mới là chi phí lớn.
```

Không có câu trả lời đúng cho mọi hệ. Đó là lý do PostgreSQL để nó tự chọn.

## Bốn cách chữa, kèm cái giá

### ① Ép không lật sang kế hoạch dùng chung (PostgreSQL 12+)

```sql
-- Cho một phiên
SET plan_cache_mode = force_custom_plan;

-- Cho một người dùng cụ thể (thường là user của API)
ALTER ROLE api_user SET plan_cache_mode = force_custom_plan;

-- Ba giá trị có thể đặt:
--   auto               (mặc định — luật 5 lần)
--   force_custom_plan  (luôn lập riêng, luôn thấy giá trị tham số)
--   force_generic_plan (luôn dùng chung — hiếm khi muốn)
```

| Được | Mất |
|---|---|
| Không bao giờ dính bẫy này | Trả chi phí lập kế hoạch **mỗi lần chạy** |
| Luôn tận dụng được giá trị tham số | Với câu lệnh đơn giản chạy hàng chục nghìn lượt/giây, chi phí này đáng kể |
| Đặt được ở mức role/session, không phải sửa code | Không giải quyết gốc rễ |

**Đây là thuốc giảm đau tốt, không phải thuốc chữa.** Dùng ngay khi đang cháy, rồi đi sửa câu lệnh.

### ② Viết lại: bỏ hẳn OR

Cách chữa gốc rễ. Với đúng kiểu viết trong bài, có thể thay bằng một mốc "vô cực":

```sql
SELECT * FROM don_hang
 WHERE ngay_tao >= COALESCE($1, '-infinity'::timestamptz)
 ORDER BY ngay_tao DESC
 LIMIT 10;
```

Hết `OR` nên **kế hoạch nào cũng nhảy được bằng index** — kể cả kế hoạch dùng chung.

Nhưng cách này có hai chỗ vướng phải nói rõ:

```text
   ✗ Cột CHO PHÉP RỖNG: dòng có ngay_tao = NULL sẽ bị loại,
     trong khi câu gốc (không truyền tham số) lẽ ra trả cả nó.
     → Đổi hành vi mà không ai nhận ra.

   ✗ Kiểu SỐ NGUYÊN: không có giá trị "vô cực" nào để điền.
     Với BIGINT bạn phải dùng cận biên (-9223372036854775808),
     nhìn rất xấu và dễ sai.
```

### ③ Viết hai câu lệnh riêng

Xấu về mặt code, đúng về mặt hiệu năng:

```java
// Rõ ràng, không mẹo, và mỗi câu có kế hoạch tối ưu của riêng nó
if (tuNgay == null) {
    return repo.layMoiDon(limit);
} else {
    return repo.layDonTuNgay(tuNgay, limit);
}
```

Với 2 tham số tuỳ chọn thì bạn có 4 nhánh; với 3 tham số thì 8 nhánh. Ở mức đó, hãy chuyển sang cách ④.

### ④ Dựng câu lệnh động

Chỉ ghép vào những điều kiện thật sự có giá trị:

```java
var sql = new StringBuilder("SELECT * FROM don_hang WHERE 1=1");
var params = new ArrayList<>();

if (tuNgay != null)   { sql.append(" AND ngay_tao >= ?");  params.add(tuNgay); }
if (trangThai != null){ sql.append(" AND trang_thai = ?"); params.add(trangThai); }

sql.append(" ORDER BY ngay_tao DESC LIMIT ?");
params.add(limit);
```

Đây là cách mà mọi thư viện query builder nghiêm túc (jOOQ, QueryDSL, MyBatis `<if>`) đang làm, và là lý do chúng tồn tại. Xem thêm [Không dùng ORM thì dùng gì](../../orm-n-plus-1/05-khong-dung-orm-thi-dung-gi.md).

Lưu ý: mỗi tổ hợp điều kiện sinh ra một câu lệnh khác nhau, nên bộ nhớ đệm kế hoạch có nhiều mục hơn. Với số tham số hợp lý (dưới ~5) thì không thành vấn đề.

## Cái bẫy KHÔNG nằm ở prepared statement

Đây là điều đáng nhớ nhất bài, và là chỗ transcript hay bài blog thường dừng lại quá sớm.

Cùng thí nghiệm đó, khi thử lại bằng **CTE với giá trị cứng, không có tham số nào**, câu lệnh **vẫn dính** — mất **108.996 ms**:

```sql
-- Không có tham số nào cả. Giá trị nằm ngay trong câu lệnh.
WITH tham_so AS (SELECT '2026-01-01'::timestamptz AS tu_ngay)
SELECT d.* FROM don_hang d, tham_so t
 WHERE (t.tu_ngay IS NULL OR d.ngay_tao >= t.tu_ngay)
 ORDER BY d.ngay_tao DESC LIMIT 10;
```

Vì sao? Vì planner lập kế hoạch **trước khi** CTE chạy — nên tại thời điểm lập kế hoạch, nó **vẫn không nhìn thấy giá trị**.

> **Gốc rễ không phải prepared statement. Gốc rễ là: điều kiện `OR` mà planner không nhìn thấy giá trị lúc lập kế hoạch.**

Prepared statement chỉ là cách phổ biến nhất tạo ra tình huống đó.

## Công cụ: xem trước kế hoạch dùng chung mà không cần chạy 6 lần

PostgreSQL 16 thêm một tuỳ chọn cực kỳ hữu ích cho việc này:

```sql
EXPLAIN (GENERIC_PLAN)
SELECT * FROM don_hang
 WHERE ($1::timestamptz IS NULL OR ngay_tao >= $1)
 ORDER BY ngay_tao DESC LIMIT 10;
```

Nó cho bạn xem **kế hoạch dùng chung sẽ trông thế nào**, ngay lập tức, không cần chạy thật và không cần đợi tới lần thứ 6. Đây là thứ nên chạy cho mọi câu lệnh có tham số tuỳ chọn trước khi lên production.

### Phát hiện trên hệ đang chạy

```sql
-- ① Tìm câu lệnh có ĐỘ LỆCH lớn giữa min và max thời gian chạy.
--    Kế hoạch bị lật thường lộ ra ở đây: cùng một câu, hai thế giới.
SELECT substring(query, 1, 80) AS cau_lenh,
       calls,
       round(min_exec_time::numeric, 2)  AS nhanh_nhat_ms,
       round(mean_exec_time::numeric, 2) AS trung_binh_ms,
       round(max_exec_time::numeric, 2)  AS cham_nhat_ms,
       round((max_exec_time / NULLIF(min_exec_time, 0))::numeric, 0) AS ty_le_lech
  FROM pg_stat_statements
 WHERE calls > 100
 ORDER BY (max_exec_time / NULLIF(min_exec_time, 0)) DESC NULLS LAST
 LIMIT 20;
```

```ini
# ② Bật auto_explain để BẮT TẠI TRẬN kế hoạch của những câu chậm
shared_preload_libraries = 'auto_explain,pg_stat_statements'
auto_explain.log_min_duration = '500ms'
auto_explain.log_analyze = on
auto_explain.log_buffers = on
```

Khi có bản ghi, hãy soi đúng ba dòng: `Index Cond` có còn không, `Filter` có xuất hiện không, và `Rows Removed by Filter` là bao nhiêu.

## Bẫy thường gặp

| Bẫy | Vì sao hỏng | Cách sửa |
|---|---|---|
| Gộp bộ lọc tuỳ chọn thành `(? IS NULL OR cot = ?)` | Kế hoạch dùng chung không rút gọn được `OR` → index tụt xuống Filter | Câu lệnh động, hoặc `COALESCE` với mốc biên |
| Nghĩ "không gõ `PREPARE` thì không dính" | Driver tự chuyển sang prepared statement sau ~5 lần | Kiểm `prepareThreshold` của driver; dùng `EXPLAIN (GENERIC_PLAN)` |
| Thấy dòng `Index Scan` rồi yên tâm | Index có thể chỉ đang dùng để **sắp xếp**, không phải để tìm | Soi `Index Cond` vs `Filter` |
| Bỏ qua `Rows Removed by Filter` | Đây là dấu hiệu rõ nhất của việc đi bộ qua dữ liệu | Con số này lớn = đang quét, dù ghi Index Scan |
| Test trên máy dev rồi kết luận nhanh | Kết nối dev chết trước lần thứ 6, không bao giờ lật kế hoạch | Chạy câu lệnh ít nhất 6 lần trên **cùng một kết nối** |
| Bật `force_custom_plan` toàn cục | Câu lệnh đơn giản chạy rất nhiều lượt sẽ tốn chi phí lập kế hoạch | Đặt ở mức role/session cho đúng luồng có vấn đề |
| Thay `OR` bằng `COALESCE` mà quên cột cho phép rỗng | Mất dòng có giá trị `NULL`, đổi hành vi âm thầm | Kiểm tra `NULL` trước khi đổi |
| Tin vào con số `cost` | `cost` là ước tính, không phải thời gian. Rẻ hơn trên giấy có thể là dấu hiệu ước lượng sai | Luôn đối chiếu bằng `EXPLAIN (ANALYZE, BUFFERS)` |

## Nguồn và kiểm chứng

- Dòng chú thích `arbitrary` nằm trong `src/backend/utils/cache/plancache.c`, hàm `choose_custom_plan()`.
- Vụ BMC Software 2019: thread *"Generic Plans for Prepared Statement are 158155 times slower than Custom Plans"* trên `pgsql-performance`. Chi phí ước tính **402 → 12,68**; thời gian chạy thật **3,497 ms → 5.544,701 ms**.
- `plan_cache_mode` có từ PostgreSQL 12. `EXPLAIN (GENERIC_PLAN)` có từ PostgreSQL 16.
- PostgreSQL 17 có thêm khả năng biến một số dạng `OR` thành `= ANY(...)` — nhưng **chỉ áp dụng cho `OR` trên cùng một cột** (`a = 1 OR a = 2`), không cứu được dạng `param IS NULL OR cot >= param` trong bài này.

## Tóm tắt bài 8

- **`PREPARE` chỉ tiết kiệm ba chặng đầu** (đọc cú pháp, tra tên, viết lại). Chặng lập kế hoạch **vẫn chạy lại**.
- Sau **5 lần chạy đầu** (con số ghi thẳng trong mã nguồn là *"arbitrary"* — chọn đại), PostgreSQL so chi phí ước tính rồi có thể lật sang **kế hoạch dùng chung vĩnh viễn**.
- Kế hoạch dùng chung **bị cấm giả định giá trị tham số**, nên điều kiện `OR` không rút gọn được → index **tụt từ vai trò tìm kiếm xuống vai trò sắp xếp**.
- **Thấy `Index Scan` không có nghĩa là ổn.** Phải soi `Index Cond` (tốt) hay `Filter` + `Rows Removed by Filter` (xấu).
- **PostgreSQL so ước tính với ước tính, không bao giờ đo thời gian thật.** Nên kế hoạch chậm nghìn lần vẫn thắng nếu con số trên giấy nhỏ hơn.
- **Máy dev không bao giờ thấy** vì kết nối chết trước lần thứ 6. Production có kết nối sống hàng giờ.
- **Gốc rễ không phải prepared statement** — thử bằng CTE với giá trị cứng vẫn dính. Gốc rễ là `OR` mà planner không thấy giá trị lúc lập kế hoạch.
- Chữa: `plan_cache_mode = force_custom_plan` để dập lửa; viết lại bỏ `OR` hoặc dựng câu lệnh động để chữa gốc.

**Bài kế tiếp** → [Bài 9: Bảng thống kê mà planner đọc, và không ai mở ra xem](02-bang-thong-ke-planner-khong-ai-mo-ra-xem.md)
