# Bài 9: Đối chiếu nguồn — cái gì đúng, cái gì cần đính chính, và cách tự kiểm chứng

Phase này được viết từ một loạt bảy video về các loại index. Nguồn đó **rất tốt** — nghiên cứu kỹ, con số thật, cấu trúc lập luận chặt. Nhưng nó là lời nói, và lời nói thì có chỗ vấp, chỗ đơn giản hoá quá tay, chỗ nói mạnh hơn sự thật.

Bài này làm ba việc:

1. **Liệt kê những gì kiểm chứng được là đúng** — để bạn tin phần còn lại.
2. **Đính chính chín chỗ** — kèm cách tự kiểm bằng lệnh chạy được.
3. **Dạy cách kiểm chứng** một nguồn kỹ thuật bất kỳ, vì kỹ năng đó có giá hơn cả nội dung.

Đây cũng là mẫu bạn nên dùng khi đọc bất kỳ tài liệu kỹ thuật nào: **không tin, không bác — mà đo**.

---

## Phần 1 — Những gì kiểm chứng được là đúng

### Lịch sử và con số phần cứng

| Nội dung nguồn | Kiểm chứng |
|---|---|
| Cây B ra đời **1970** | ✅ Bayer & McCreight, báo cáo nội bộ Boeing Scientific Research Labs 1970, công bố *Acta Informatica* 1972 |
| Hai kỹ sư làm tại **Boeing** | ✅ Đúng. Chữ "B" thì chính McCreight nói vui là không có đáp án chính thức |
| Seek **30 ms** + quay **8 ms** = **38 ms** | ✅ Khớp ổ IBM 3330 (1970): seek trung bình 30 ms, 3.600 vòng/phút → độ trễ quay trung bình ~8,3 ms |
| Một rãnh chứa **13.030 byte** | ✅ Đúng đặc tả IBM 3330 — con số này rất riêng, cho thấy nguồn có tra cứu thật |
| Cây nhị phân 1 triệu khoá = **20 tầng** | ✅ `log₂(10⁶) = 19,93` |
| 20 × 38 ms = **760 ms** | ✅ |
| SSD tra một trang ~**100 micro giây**, nhanh hơn ~**400 lần** | ✅ `38 / 0,1 = 380` |
| Bộ nhớ chính thời đó **vài trăm KB** | ✅ Phù hợp lớp máy IBM System/360-370 |
| Trang 4 KB của hệ điều hành, dòng đệm CPU **64 byte** | ✅ Cả hai vẫn đúng hôm nay |

### Toán học của bitmap

| Nội dung nguồn | Kiểm chứng |
|---|---|
| 80 triệu dòng × 4 giá trị = **320 triệu bit ≈ 40 MB** | ✅ `320.000.000 / 8 = 40.000.000 byte` |
| Cột ít giá trị nén rất mạnh, 40 MB → **vài trăm KB** | ✅ Đúng nguyên lý RLE/WAH/Roaring |
| CPU xử **64 bit một nhịp**, 80 triệu dòng ≈ **1,25 triệu nhịp** | ✅ `80.000.000 / 64 = 1.250.000` |
| **PostgreSQL không có bitmap index** | ✅ **Đúng hoàn toàn** — và đây là điểm mạnh nhất của nguồn, vì phần lớn tài liệu tiếng Việt nhầm chỗ này |
| Bitmap khoá cả cụm khi ghi → cấm dùng cho OLTP | ✅ Đúng, khớp cảnh báo chính thức của Oracle |

### BRIN và vụ án chậm 400 lần

| Nội dung nguồn | Kiểm chứng |
|---|---|
| BRIN cắt bảng thành dải **128 trang** | ✅ `pages_per_range` mặc định = 128 |
| Mỗi dải chỉ lưu **min và max**, không con trỏ | ✅ Với opclass `minmax` |
| 700 KB thay cho 8 GB, nhỏ hơn ~**11.000 lần** | ✅ `8 GB / 700 KB ≈ 11.700` |
| `CLUSTER` **không chạm index**, nó ghi lại bảng theo thứ tự | ✅ |
| `REINDEX` không chữa được BRIN chậm | ✅ Vì nguyên nhân nằm ở **bảng**, không ở index |
| Đo bằng `pg_stats.correlation`, dưới **0,9** là báo động | ✅ Ngưỡng hợp lý, và đây là chỉ số đúng |
| Loại index này **không bao giờ báo lỗi** khi thành vô dụng | ✅ Kết quả vẫn đúng 100%, chỉ mất khả năng loại bớt |

### Index đảo và vector

| Nội dung nguồn | Kiểm chứng |
|---|---|
| PostgreSQL có **6 loại index dựng sẵn** | ✅ btree, hash, gist, spgist, gin, brin |
| 4 triệu bài → ~**600.000 từ phân biệt** | ✅ Hợp lý theo quy luật Zipf |
| Bộ tách từ mặc định cắt **"Hà Nội"** thành hai từ | ✅ Kiểm được bằng một câu `SELECT` |
| Từ điển bỏ stop word → **vĩnh viễn không tìm lại được** | ✅ |
| Đổi từ điển = **dựng lại toàn bộ index** | ✅ |
| 4 triệu × 1.536 × 4 byte = **24 GB** | ✅ `= 24,576 × 10⁹ byte` |
| **6,1 tỷ phép nhân** cho một lượt tra | ✅ `4.000.000 × 1.536 = 6,144 × 10⁹` |
| HNSW nhanh hơn ~**900 lần**, recall ~**95%** | ✅ `2.800 ms / 3 ms ≈ 933`; recall 95% đúng với `ef_search` mặc định |
| Nhiều chiều → phép loại trừ mất tác dụng | ✅ Beyer et al. 1999 |
| Hash index mất thứ tự vì hàm băm **cố tình** phá thứ tự | ✅ |
| Hash không có index phủ, phải heap fetch mọi dòng | ✅ |

**Tổng: 26 điểm kiểm chứng được là đúng.** Đó là tỷ lệ rất cao cho một nguồn nói.

---

## Phần 2 — Chín chỗ cần đính chính

### Đính chính 1 — "12 triệu dòng, 4 lần so, mỗi lần bỏ đi một nửa"

**Nguồn nói:** *"Máy đi vào cây, so 1 lần rẽ trái, so lần nữa rẽ phải, 4 lần so là tới nơi. 12 triệu dòng, 4 lần so, vì mỗi lần so bỏ đi một nửa số dòng còn lại."*

**Vấn đề:** câu này lẫn **cây nhị phân** vào **cây B**, mà đó chính là chỗ khác nhau quan trọng nhất giữa hai cấu trúc — tức là bài 2 tồn tại để phủ định đúng câu này.

**Đúng là:**

```text
Cây B KHÔNG chia đôi. Mỗi tầng nó chia cho FANOUT (vài trăm).

  12 triệu dòng, fanout ~250:
    số TẦNG      = log₂₅₀(12.000.000) ≈ 2,9  → 3 tầng (3 lần đọc trang)
    số PHÉP SO   ≈ 3 × log₂(250)      ≈ 24   → nhiều hơn hẳn "4"

  Nếu "mỗi lần bỏ một nửa" thì cần log₂(12.000.000) ≈ 24 lần so — trùng
  với con số phép so ở trên, nhưng đó là 24 phép so nằm TRONG 3 lần đọc trang,
  không phải 24 lần chạm đĩa.
```

**Vì sao chỗ này quan trọng:** toàn bộ lý do cây B tồn tại là **tách rời "phép so" khỏi "lần đọc trang"**. Nói "mỗi lần so bỏ một nửa" là vô tình xoá mất chính phát minh đó.

**Tự kiểm:**

```sql
CREATE EXTENSION IF NOT EXISTS pageinspect;
SELECT level, count(*) AS so_trang
  FROM generate_series(1, (pg_relation_size('idx_orders_id')/8192)::int - 1) blk,
       LATERAL bt_page_stats('idx_orders_id', blk)
 GROUP BY level ORDER BY level DESC;
-- Đếm số TẦNG thật của cây. Bảng chục triệu dòng thường ra 3-4, không phải 20.
```

### Đính chính 2 — "Postgres, MySQL, cả 3 đều vậy"

**Nguồn nói:** *"Máy chọn hộ bạn và luôn chọn cùng một thứ: cây B. Postgres, MySQL, cả 3 đều vậy."*

**Vấn đề:** hai chỗ. Thứ nhất, chỉ kể tên **hai** hệ mà nói "cả 3" — chỗ nói vấp. Thứ hai, quan trọng hơn: **"luôn chọn B-Tree" không đúng tuyệt đối**.

**Đúng là:**

| Hệ / engine | Mặc định |
|---|---|
| PostgreSQL | btree |
| MySQL InnoDB | B+Tree — và `USING HASH` bị **bỏ qua im lặng** |
| MySQL **MEMORY** | **HASH** |
| Oracle | B-Tree, nhưng bitmap là **câu lệnh riêng** `CREATE BITMAP INDEX` |
| SQL Server | B+Tree; columnstore phải khai riêng |

Điều **đúng ở mọi hệ** là: với bảng nghiệp vụ thông thường, mặc định là B-Tree, và **không hệ nào hỏi bạn**. Đó mới là luận điểm cần giữ.

### Đính chính 3 — "Cây B thua chưa tới 1%"

**Nguồn nói:** *"Ba chữ KHÔNG đó hiếm hơn bạn nghĩ, và cây B thua chưa tới 1%."*

**Vấn đề:** thiếu vế **"1% của cái gì"** — mà đó là toàn bộ chỗ đáng tranh luận.

**Đúng là:**

```text
Đo riêng thao tác tra index      : hash nhanh hơn 30-60%
Đo cả câu truy vấn từ ứng dụng   : chênh lệch dưới 1%
   (vì parse/plan 30-80 µs, mạng 200-500 µs, heap fetch 50-200 µs
    đều lớn hơn chênh lệch 0,5-1 µs kia rất nhiều)
```

Nói đầy đủ: **cây B thua đáng kể ở một thao tác chiếm chưa tới 1% thời gian**. Câu của nguồn đúng về kết luận, thiếu ở đường đi.

### Đính chính 4 — "Tìm 'bảo hàn' thì không bao giờ trả lời được"

**Nguồn nói:** *"Bạn vừa chuyển sang một cấu trúc không trả lời được câu hỏi đó. Không bao giờ trả lời được."*

**Vấn đề:** quá mạnh — và sai đúng với ví dụ mà nguồn chọn. "bảo hàn" là một **tiền tố** của "bảo hành", mà tiền tố thì index đảo **làm được**.

**Đúng là:**

```sql
-- Tiền tố: LÀM ĐƯỢC bằng toán tử :*
SELECT * FROM posts
 WHERE to_tsvector('simple', noi_dung) @@ to_tsquery('simple', 'bảo & hàn:*');
--                                                                   ▲▲
-- Chạy được vì danh sách từ trong GIN đã sắp thứ tự → nhảy tới rồi đọc xuôi.
```

Thứ **thật sự** không làm được bằng index đảo là **chuỗi nằm giữa từ** (`"phone"` trong `"smartphone"`) — và cho việc đó có `pg_trgm`.

Nên câu đúng phải là: *"Index đảo trả lời được **từ** và **tiền tố của từ**, không trả lời được **chuỗi nằm giữa từ**."*

### Đính chính 5 — "Index không hề biết hai từ đó đi với nhau"

**Nguồn nói:** *"Nó cắt 'Hà Nội' thành hai từ rời hẳn. Và cái index không hề biết hai từ đó đi với nhau, không biết một chút nào."*

**Vấn đề:** đúng ở tầng "danh sách từ", nhưng bỏ sót một thứ `tsvector` **có lưu**: **vị trí**.

```sql
SELECT to_tsvector('simple', 'Cửa hàng ở Hà Nội bảo hành');
--  'bảo':6 'cửa':1 'hà':4 'hàng':2 'nội':5 'ở':3
--                    ▲▲▲        ▲▲▲
--        vị trí 4 và 5 — index BIẾT chúng đứng cạnh nhau
```

Nên tìm kiếm theo **cụm** là làm được, từ PostgreSQL 9.6:

```sql
SELECT * FROM posts
 WHERE to_tsvector('simple', noi_dung) @@ phraseto_tsquery('simple', 'Hà Nội');
-- sinh ra:  'hà' <-> 'nội'   ("đứng ngay sau")
-- → bài về "Hà Tĩnh" + "nội thất" KHÔNG còn khớp nữa
```

Cái thật sự thiếu là **hiểu biết về ranh giới từ ghép tiếng Việt** — muốn có phải cài bộ tách từ riêng. Đó là một khẳng định hẹp hơn và đúng hơn.

### Đính chính 6 — "Mỗi lượt sửa là một dòng mới ghi vào cuối bảng"

**Nguồn nói:** *"Postgres không sửa tại chỗ, mỗi lượt là một dòng mới và nó ghi vào cuối bảng."*

**Vấn đề:** đúng trong tình huống của vụ án, nhưng **không phải luôn luôn** — và ngoại lệ lại chính là công cụ phòng bệnh tốt nhất.

**Đúng là:** PostgreSQL trước hết thử **HOT update** (Heap-Only Tuple). Nếu **không cột nào đang được index bị sửa** *và* trang hiện tại **còn chỗ trống**, bản mới nằm **ngay trong trang cũ** — correlation không suy suyển.

```text
UPDATE sửa cột KHÔNG được index + trang còn chỗ  →  HOT: ở lại trang cũ  ✓
UPDATE sửa cột ĐANG được index                   →  đi trang khác        ✗
Trang đã đầy                                     →  đi trang khác        ✗
```

Hệ quả thực dụng rất đáng tiền:

```sql
ALTER TABLE giao_dich SET (fillfactor = 85);   -- chừa 15% chỗ trống mỗi trang
-- → giữ được HOT update lâu hơn → giữ correlation → BRIN sống lâu hơn
```

```sql
-- Đo tỷ lệ HOT update thật của bảng
SELECT relname, n_tup_upd, n_tup_hot_upd,
       round(100.0 * n_tup_hot_upd / NULLIF(n_tup_upd,0), 1) AS phan_tram_hot
  FROM pg_stat_user_tables WHERE relname = 'giao_dich';
```

### Đính chính 7 — "Đó là một định lý, không phải một thiếu sót"

**Nguồn nói (về lời nguyền số chiều):** *"Không phải chưa ai nghĩ ra cái cây tốt hơn. Là trong nhiều chiều thì không tồn tại cái cây nào. Đó là một định lý, không phải một thiếu sót."*

**Vấn đề:** không có định lý nào **cấm** cả. Có một **kết quả tiệm cận** rất mạnh, và một kẽ hở mà cả ngành đang sống nhờ nó.

**Đúng là:**

- Kết quả Beyer et al. (1999) nói: với dữ liệu phân bố **đủ đều** và số chiều tăng, tỷ số `d_max/d_min → 1`, nên phép loại trừ mất tác dụng và cây **suy biến** về quét toàn bộ.
- **Nhưng dữ liệu thật hiếm khi trải đều.** Embedding thật nằm trên một mặt cong có **số chiều nội tại** (intrinsic dimension) thấp hơn nhiều — thường vài chục, không phải 1.536.
- Đó chính là kẽ hở HNSW khai thác. Bằng chứng: HNSW chạy rất tốt trên embedding thật và **chạy kém hẳn** trên vector ngẫu nhiên đều.

Nói cho chuẩn: **không phải "không tồn tại cây nào", mà là "không tồn tại phép loại trừ chính xác nào còn rẻ"** — nên người ta đổi sang xấp xỉ.

### Đính chính 8 — Con số index nhỏ không khớp giữa hai tập

**Nguồn nói:** tập 4 giới thiệu tập sau là *"loại index chỉ nặng **20 KB** thay cho 8 GB"*; tập 5 thì nói **700 KB**.

**Đúng là:** con số phụ thuộc `pages_per_range` và cỡ bảng. Với bảng 34 GB, `pages_per_range = 128`:

```text
34 GB / 8 KB = 4.194.304 trang
4.194.304 / 128 = 32.768 dải
32.768 × (2 giá trị + overhead) ≈ 700 KB     ← khớp con số của tập 5
```

Để ra 20 KB thì bảng phải nhỏ hơn nhiều hoặc `pages_per_range` lớn hơn nhiều. **700 KB là con số đúng cho tình huống được kể.**

### Đính chính 9 — "Kho dữ liệu cỡ thường làm được chừng 2.000 lượt tìm nhỏ mỗi giây"

**Nguồn nói** (ở phần về tỷ lệ dùng lại): *"Một kho dữ liệu cỡ thường làm được chừng 2.000 lượt tìm nhỏ mỗi giây."*

**Vấn đề:** con số này đúng cho **đĩa quay**, không đúng cho máy chủ hôm nay.

**Đúng là:**

```text
Tra một dòng qua index (point lookup), PostgreSQL:

  HDD, dữ liệu không nằm RAM  :   ~200 – 2.000 lượt/giây
  SSD/NVMe, không nằm RAM     : ~10.000 – 50.000 lượt/giây
  Dữ liệu nằm gọn trong RAM   : ~50.000 – 200.000 lượt/giây (một node)
```

Luận điểm của nguồn — *"1.000 câu hỏi khác nhau đắt hơn 2,1 triệu câu hỏi giống nhau"* — **vẫn đúng nguyên**, chỉ là ngưỡng gãy nằm cao hơn con số 2.000 rất nhiều. Bài học không đổi; con số thì nên cập nhật.

---

## Phần 3 — Bảng tổng hợp đính chính

| # | Chỗ nguồn nói | Mức độ | Đúng là |
|---|---|---|---|
| 1 | "4 lần so, mỗi lần bỏ một nửa" | **Nặng** — xoá mất chính phát minh của cây B | Cây B chia cho **fanout**, không chia đôi. 3 tầng ≈ 24 phép so |
| 2 | "Postgres, MySQL, cả 3 đều vậy" | Nhẹ + thiếu chính xác | MySQL MEMORY mặc định HASH; Oracle bitmap là lệnh riêng |
| 3 | "Cây B thua chưa tới 1%" | Thiếu vế | 1% **của cả câu truy vấn**; riêng bước tra thì hash nhanh hơn 30-60% |
| 4 | "'bảo hàn' không bao giờ trả lời được" | **Nặng** — sai đúng với ví dụ đã chọn | Tiền tố làm được bằng `:*`; chỉ **chuỗi giữa từ** mới cần trigram |
| 5 | "Index không biết hai từ đi với nhau" | Trung bình | `tsvector` **có lưu vị trí**; `phraseto_tsquery` / `<->` làm được |
| 6 | "Mỗi lượt sửa ghi vào cuối bảng" | Trung bình | **HOT update** giữ dòng ở trang cũ; `fillfactor` là thuốc phòng |
| 7 | "Đó là một định lý" | Trung bình | Kết quả **tiệm cận**, và **số chiều nội tại** là kẽ hở HNSW sống nhờ |
| 8 | "20 KB" vs "700 KB" | Nhẹ | 700 KB là con số đúng cho bảng 34 GB, `pages_per_range=128` |
| 9 | "2.000 lượt tìm/giây" | Nhẹ, lỗi thời | SSD: 10.000-50.000; trong RAM: 50.000-200.000 |

**Không có chỗ nào sai tới mức làm hỏng bài học.** Bảy kết luận lớn của nguồn đều đứng vững. Chín chỗ trên là chỗ cần nói chính xác hơn khi bạn dùng lại nội dung này trong phỏng vấn — vì đúng những chỗ này là chỗ người phỏng vấn giỏi sẽ hỏi vặn.

---

## Phần 4 — Cách tự kiểm chứng một nguồn kỹ thuật

Đây là phần đáng mang đi nhất của bài.

### Bốn loại phát biểu, bốn cách kiểm

| Loại | Ví dụ trong nguồn này | Cách kiểm |
|---|---|---|
| **Con số lịch sử** | "Cây B ra đời 1970", "rãnh 13.030 byte" | Tra bài báo gốc và đặc tả phần cứng. Con số càng riêng biệt càng dễ kiểm |
| **Phép tính** | "320 triệu bit = 40 MB", "6,1 tỷ phép nhân" | **Tự bấm lại**. Đây là loại rẻ nhất và bắt được nhiều lỗi nhất |
| **Hành vi của hệ** | "Postgres không có bitmap index" | **Chạy thử một câu lệnh.** Không tranh luận |
| **Khẳng định tuyệt đối** | "không bao giờ", "luôn luôn", "đó là định lý" | **Nghi ngờ mặc định.** Tìm đúng một phản ví dụ |

Dòng cuối bắt được **ba trong chín** chỗ ở phần 2. Trong tài liệu kỹ thuật, chữ **"không bao giờ"** gần như luôn là chỗ đáng đào.

### Bộ lệnh tự kiểm cho chính phase này

```sql
-- 1. PostgreSQL có mấy loại index? (nguồn nói 6)
SELECT amname FROM pg_am WHERE amtype = 'i' ORDER BY amname;

-- 2. Bitmap index có tồn tại không? (nguồn nói không)
CREATE BITMAP INDEX x ON t (c);        -- ERROR: syntax error at or near "BITMAP"

-- 3. Index đảo biến câu của bạn thành cái gì?
SELECT to_tsvector('english', 'bảo hành 12 tháng chính hãng');

-- 4. Tiền tố có tìm được không? (nguồn nói không bao giờ)
SELECT to_tsvector('simple','bảo hành') @@ to_tsquery('simple','bảo & hàn:*');  -- t

-- 5. Cụm từ có tìm được không? (nguồn ngụ ý không)
SELECT to_tsvector('simple','Hà Nội') @@ phraseto_tsquery('simple','Hà Nội');   -- t

-- 6. Cây B của bạn cao mấy tầng? (nguồn ngụ ý "4 lần so")
CREATE EXTENSION IF NOT EXISTS pageinspect;
SELECT max(level) + 1 AS so_tang FROM generate_series(1, 200) b,
       LATERAL bt_page_stats('ten_index_cua_ban', b);

-- 7. Correlation của cột bạn đang đánh BRIN là bao nhiêu?
SELECT attname, correlation FROM pg_stats WHERE tablename = 'bang_cua_ban';

-- 8. Tỷ lệ HOT update — nguồn nói "luôn ghi vào cuối bảng"
SELECT relname, n_tup_upd, n_tup_hot_upd FROM pg_stat_user_tables;
```

Tám lệnh, chạy trong dưới một phút, và chúng kiểm được **năm trong chín** chỗ đính chính ở trên.

### Tự kiểm luôn cả những gì phase này **thêm vào**

Công bằng thì bài này cũng phải soi chính nó. Ngoài nội dung nguồn, phase 10 thêm khá nhiều khẳng định — và mỗi cái đều **kèm số phiên bản** để bạn kiểm, đúng theo câu hỏi số 1 ở dưới.

| Khẳng định phase này thêm | Có từ phiên bản | Lệnh tự kiểm |
|---|---|---|
| Cắt đuôi khoá dẫn đường (suffix truncation) | PostgreSQL 12 | `SELECT version();` rồi so cỡ index cột chuỗi dài trước/sau khi nâng cấp |
| Khử trùng lặp trong B-Tree | PostgreSQL 13 | `SELECT reloptions FROM pg_class WHERE relname='ten_index';` → `deduplicate_items` |
| Fastpath chèn ở lá phải cùng | PostgreSQL 11 | Đo thời gian chèn 1 triệu dòng khoá tăng dần vs khoá ngẫu nhiên |
| `REINDEX ... CONCURRENTLY` | PostgreSQL 12 | Gõ thử; bản cũ báo lỗi cú pháp |
| `minmax_multi_ops`, `bloom` cho BRIN | PostgreSQL 14 | `SELECT opcname FROM pg_opclass JOIN pg_am ON ... WHERE amname='brin';` |
| `INCLUDE` cho GiST / SP-GiST | PG 12 / PG 14 | Gõ thử `CREATE INDEX ... USING gist (a) INCLUDE (b);` |
| `phraseto_tsquery` và toán tử `<->` | PostgreSQL 9.6 | `SELECT phraseto_tsquery('simple','Hà Nội');` |
| `hnsw.iterative_scan` | pgvector 0.8 | `SHOW hnsw.iterative_scan;` — bản cũ báo lỗi tham số lạ |
| `halfvec` | pgvector 0.7 | `SELECT '[1,2,3]'::halfvec;` |
| SP-GiST radix tree nhỏ hơn B-Tree trên cột URL | mọi bản | Tạo cả hai trên cùng cột rồi so `pg_relation_size` |
| `DROP INDEX` khoá cả đọc | mọi bản | Chạy `DROP INDEX` trong một transaction chưa commit, rồi `SELECT` từ phiên khác |
| LSM-tree khuếch đại ghi thấp hơn B-Tree | — (kiến trúc) | Không kiểm được bằng một lệnh; đây là khẳng định **có điều kiện**, xem ghi chú dưới |

**Ghi chú về dòng cuối** — và đây là loại khẳng định cần thận trọng nhất trong cả phase. So sánh B-Tree với LSM-tree **không có một con số đúng duy nhất**: nó phụ thuộc tỷ lệ đọc/ghi, kiểu compaction (leveled hay size-tiered), cỡ khoá, và mức nén. Con số "10-30 lần" cho khuếch đại ghi của compaction là **khoảng thường gặp trong tài liệu RocksDB**, không phải hằng số. Cách nói an toàn và vẫn đúng: *"LSM dời chi phí từ lúc ghi sang lúc đọc và lúc compaction"* — nêu **hướng của đánh đổi** thay vì nêu một tỷ số.

Nguyên tắc chung rút ra: **khẳng định kèm số phiên bản thì kiểm được bằng một lệnh; khẳng định về kiến trúc thì chỉ nêu được hướng, không nêu được tỷ số.** Trộn hai loại đó với nhau là cách nhanh nhất để nói sai mà nghe rất chắc.

### Ba câu hỏi nên đặt cho mọi nguồn kỹ thuật

1. **"Con số này của phiên bản nào?"** — Hash index của PostgreSQL 9.6 và của PostgreSQL 10 là hai câu chuyện khác nhau. `minmax_multi` chỉ có từ PG 14. Một khẳng định không kèm phiên bản là một khẳng định chưa hoàn chỉnh.
2. **"Đây là cách LƯU hay cách CHẠY?"** — Câu này một mình phân biệt được bitmap index với Bitmap Index Scan, hash index với hash join, index đảo với `Recheck Cond`. Rất nhiều nhầm lẫn trong ngành gói gọn ở chỗ lẫn hai tầng này.
3. **"Điều kiện ngầm của nó là gì?"** — Mọi cấu trúc rẻ đều đứng trên một điều kiện không ai viết ra. BRIN cần correlation. GIN cần từ điển cố định. Bitmap cần bảng chỉ đọc. HNSW cần dữ liệu có cấu trúc. **Hỏi được câu này là bạn đã ở tầng khác.**

---

## Tóm tắt bài 9

- **26 điểm kiểm chứng được là đúng**, gồm cả những con số rất riêng (rãnh 13.030 byte của IBM 3330, 128 trang mỗi dải BRIN, 6 loại index của PostgreSQL) — dấu hiệu nguồn có tra cứu thật.
- **Chín chỗ cần đính chính**, trong đó hai chỗ nặng: *"mỗi lần so bỏ một nửa"* (xoá mất chính phát minh của cây B) và *"'bảo hàn' không bao giờ trả lời được"* (tiền tố thì làm được bằng `:*`).
- Không chỗ nào làm hỏng bài học. Bảy kết luận lớn đều đứng vững — chỉ cần nói chính xác hơn ở đúng những chỗ người phỏng vấn giỏi sẽ hỏi vặn.
- Bốn loại phát biểu, bốn cách kiểm: **con số lịch sử** → tra nguồn gốc; **phép tính** → tự bấm lại; **hành vi của hệ** → chạy thử; **khẳng định tuyệt đối** → tìm một phản ví dụ.
- Chữ **"không bao giờ"** và **"luôn luôn"** trong tài liệu kỹ thuật gần như luôn là chỗ đáng đào — riêng nguyên tắc này bắt được ba trong chín chỗ trên.
- Phase này cũng tự soi chính nó: mọi khẳng định **thêm vào ngoài nguồn** đều kèm **số phiên bản** và **lệnh tự kiểm**. Riêng khẳng định về **kiến trúc** (B-Tree vs LSM) thì chỉ nêu được **hướng của đánh đổi**, không nêu được tỷ số — trộn hai loại đó là cách nhanh nhất để nói sai mà nghe rất chắc.
- Ba câu hỏi cho mọi nguồn: **"phiên bản nào?"**, **"cách LƯU hay cách CHẠY?"**, **"điều kiện ngầm là gì?"**.

**Quay lại** → [Mục lục series](../README.md) · **Xem lại bản đồ** → [Bài 8](08-ban-do-chon-index-theo-hinh-dang-cau-hoi.md)
