# Bài 6: Index đảo — tìm một từ trong 4 triệu bài viết mất 8 ms, mà thiếu một chữ cái là trả về 0

Bảng **4 triệu bài viết**. Khách gõ vào ô tìm kiếm hai chữ **"bảo hành"**. Máy trả về **12.400 kết quả trong 8 mili giây**. Đúng như bạn đã đặt hàng.

Vì tuần trước bạn đã đánh index toàn văn cho cột nội dung. Trước đó chính câu lệnh này quét sạch 4 triệu dòng, mất **26 giây**. Giờ nó 8 mili giây — nhanh hơn **3.000 lần**.

Rồi một khách khác gõ nhanh, **thiếu đúng một chữ cái ở cuối**: **"bảo hàn"**.

Máy trả về **0 kết quả**.

Không phải ít kết quả. Là **không có gì**. Trong khi cái cách chậm 26 giây kia (`LIKE '%bảo hàn%'`) thì tìm ra đủ 12.400 bài.

Bạn không làm gì sai. Bạn chỉ vừa chuyển sang một cấu trúc **không trả lời được câu hỏi đó** — và không có thông báo nào nói cho bạn biết.

---

## Phần 1 — Nó lưu cái gì (và không lưu cái gì)

Trước hết phải thấy rõ: **nó không lưu bài viết của bạn**. Nó cũng **không lưu chuỗi chữ của bạn**. Không một chữ nào.

B-Tree lưu **giá trị của cột**, xếp theo thứ tự, một dòng một mục. Index đảo (**inverted index**) làm đúng cái tên của nó: **nó đảo ngược quan hệ lại**.

```text
Cách nghĩ xuôi (cách bảng lưu):
  bài 1  → [bảo, hành, 12, tháng, chính, hãng]
  bài 7  → [bảo, hành, tận, nơi]
  bài 9  → [chính, sách, đổi, trả, bảo, hành]

Index đảo (cách index lưu):
  "12"     → [1, 44, 902, ...]
  "bảo"    → [1, 7, 9, 204, 887, ...]      ← danh sách số hiệu bài (posting list)
  "chính"  → [1, 9, 33, ...]
  "hành"   → [1, 7, 9, 55, ...]
  "tháng"  → [1, 33, ...]
```

**Mỗi từ một mục, mỗi mục mang một danh sách số hiệu bài.** Hết. Chỉ có vậy.

Nghe đơn giản, và chính chỗ đơn giản đó quyết định cả bài này:

> **Đơn vị nhỏ nhất mà nó biết là MỘT TỪ.**

Trong PostgreSQL:

```sql
CREATE INDEX idx_posts_fts ON posts
    USING GIN (to_tsvector('simple', noi_dung));

SELECT * FROM posts
 WHERE to_tsvector('simple', noi_dung) @@ to_tsquery('simple', 'bảo & hành');
```

`GIN` = **G**eneralized **In**verted iNdex. Nó không chỉ dùng cho văn bản — cùng cấu trúc đó phục vụ `jsonb`, mảng, và trigram. Mọi câu hỏi dạng *"cái này **chứa** phần tử kia không?"* đều rơi vào GIN.

---

## Phần 2 — Vì sao nó nhanh tới mức đó

4 triệu bài viết cộng lại khoảng **12 GB chữ**. Và lúc trả lời câu hỏi, nó chạm vào đúng **0 byte** trong 12 GB đó. Nghe vô lý mà đúng.

**Lúc tạo index**, máy đọc từng bài đúng một lần, cắt ra thành từng từ, rồi bỏ trùng:

```text
  4.000.000 bài  →  ~600.000 từ khác nhau
```

600.000, không phải 4 triệu — vì **người ta viết rất nhiều bài bằng rất ít từ**. Đây là quy luật Zipf, và nó là toàn bộ lý do tìm kiếm toàn văn khả thi:

```text
Phân bố tần suất từ (Zipf):

  từ #1    "và"      xuất hiện trong 3.900.000 bài   ████████████████
  từ #2    "của"                     3.100.000 bài   █████████████
  từ #10   "sản phẩm"                  890.000 bài   ████
  từ #100  "bảo hành"                   12.400 bài   ▌
  từ #10000 "chống thấm"                    340 bài  ▏
  từ #500000 "nẹp nhôm V25"                   2 bài  ▏

  → vài trăm từ chiếm phần lớn văn bản,
    hàng trăm nghìn từ còn lại rất hiếm → danh sách rất ngắn → tra rất rẻ
```

Danh sách 600.000 từ đó lại **xếp theo thứ tự** (bên trong GIN là một B-Tree trên các từ), nên tra một từ trong đó là chuyện nhỏ: `log₂₀₀(600.000) ≈ 2,5` → **3 lần đọc trang**.

Tra ra rồi, **nó không mở bài nào cả**. Cái mục đó đã mang sẵn danh sách số hiệu của 12.400 bài chứa từ ấy. Nó đọc đúng một dòng.

Còn tìm hai từ cùng lúc thì lấy hai danh sách rồi **giao nhau**:

```text
  "bảo"  → [1, 7, 9, 204, 887, 1201, ...]   (28.000 bài)
  "hành" → [1, 7, 9, 55, 887, 3300, ...]    (31.000 bài)
  ────────────────────────────────────────── giao
  kết quả  [1, 7, 9, 887, ...]              (12.400 bài)

  Cả hai danh sách đã sắp thứ tự → giao nhau bằng một lần duyệt song song,
  chi phí tuyến tính theo danh sách NGẮN HƠN, không phải theo số bài.
```

Hai phép đó gọn tới mức **8 mili giây là dư sức**.

> **Chốt khối 1.** Nó nhanh **không phải vì đọc nhanh hơn**. Nó nhanh vì **nó không đọc bài viết nào**. Nó chỉ tra một cái mục lục đã dựng sẵn từ trước.

### Bên trong GIN: hai dạng lưu và một cái bẫy về ghi

Đây là chỗ giải thích vì sao GIN nhanh khi đọc mà **rất chậm khi ghi**.

```text
Mỗi từ, tuỳ độ dài danh sách, được lưu một trong hai dạng:

  từ hiếm  ("nẹp nhôm V25", 2 bài)
    → POSTING LIST: danh sách ctid nén thẳng vào cùng trang với từ

  từ phổ biến ("và", 3,9 triệu bài)
    → POSTING TREE: một B-Tree RIÊNG chỉ để chứa danh sách ctid
```

Và đây là cái giá: **một bài viết 500 từ, khi `INSERT`, phải chèn vào ~300 mục khác nhau** trong index (300 từ phân biệt). Với B-Tree thì một `INSERT` là một lần chèn; với GIN là hàng trăm.

PostgreSQL giảm đau bằng **`fastupdate`** (mặc định bật): các mục mới được gom vào một **danh sách chờ (pending list)** ghi tuần tự, rồi hợp nhất vào index sau.

```text
  INSERT → [pending list, ghi tuần tự, rất nhanh]
                    │
                    │ khi vượt gin_pending_list_limit (mặc định 4 MB)
                    │ hoặc khi VACUUM chạy
                    ▼
              [index GIN thật]
```

Cái bẫy: **truy vấn phải quét cả pending list**, tuần tự, không index. Nên nếu pending list phình lên, truy vấn tìm kiếm **đột nhiên chậm hẳn** — và nguyên nhân không nằm ở câu lệnh nào cả.

```sql
-- Bảng ghi rất nhiều mà tìm kiếm phải luôn nhanh: tắt fastupdate
ALTER INDEX idx_posts_fts SET (fastupdate = off);

-- Hoặc giữ fastupdate nhưng hạ trần để hợp nhất thường xuyên hơn
ALTER INDEX idx_posts_fts SET (gin_pending_list_limit = '512kB');

-- Hợp nhất ngay lập tức
SELECT gin_clean_pending_list('idx_posts_fts');
```

| | GIN | GiST (cho cùng bài toán full-text) |
|---|---|---|
| Tốc độ đọc | **Nhanh hơn ~3 lần** | Chậm hơn |
| Tốc độ ghi | Chậm (giảm đau bằng `fastupdate`) | **Nhanh hơn** |
| Kích thước | To hơn | Nhỏ hơn |
| Kết quả | Chính xác | **Có thể sai dương** → phải kiểm lại |
| Nên dùng khi | Đọc nhiều, ghi ít (đa số) | Ghi rất nhiều, dữ liệu đổi liên tục |

---

## Phần 3 — Vì sao "bảo hàn" trả về 0

Cái mục lục đó có 600.000 mục, và **mỗi mục là một từ hoàn chỉnh**.

```text
  "bảo"      ✓ có mục
  "hành"     ✓ có mục
  "bảo hành" ✓ có (nếu bộ tách từ nhận nó là một cụm)
  "hàn"      ✓ có mục (từ khác, nghĩa khác)
  "bảo hàn"  ✗ KHÔNG PHẢI MỘT TỪ → không có mục nào
```

Không có mục thì **không có gì để tra**. Và máy **cũng không quay lại quét 4 triệu bài để kiểm cho chắc** — làm vậy thì mất luôn ý nghĩa của index. Nó tra mục lục rồi trả về rỗng.

Đây là chỗ khó chịu nhất, vì **nó không giống một lỗi**. Không thông báo, không cảnh báo, chỉ là "không có kết quả nào" — cái mà người dùng đọc thành *"shop này không bán món đó"*.

Và **mọi câu hỏi nhỏ hơn một từ đều rơi vào đúng cái lỗ này**:

```text
  ✗ nửa mã sản phẩm      : "SKU-8842" mà gõ "8842"
  ✗ 4 số đầu số điện thoại: "0987" trong "0987654321"
  ✗ tiền tố người ta gõ dở: "bảo hàn" khi đang gõ "bảo hành"
  ✗ chuỗi con giữa từ    : "phone" trong "smartphone"
  ✗ tìm theo biển số     : "29A" trong "29A-123.45"
```

> **Chốt khối 2.** Index đảo trả lời được câu hỏi **"Bài nào chứa TỪ này?"**. Nó **chưa bao giờ** trả lời câu hỏi **"Bài nào chứa CHUỖI này?"**. Hai câu hỏi khác nhau, và chúng chỉ trùng nhau khi chuỗi bạn tìm tình cờ là một từ trọn vẹn.

### Đính chính quan trọng: "không bao giờ trả lời được" là quá mạnh

> **Đính chính nguồn.** Bản gốc nói *"Không bao giờ trả lời được"*. Đúng với **chuỗi nằm giữa từ**, nhưng **sai với tiền tố** — và tiền tố lại chính là ví dụ "bảo hàn" mà bản gốc dùng.

PostgreSQL có toán tử tiền tố `:*` ngay trong `tsquery`:

```sql
SELECT * FROM posts
 WHERE to_tsvector('simple', noi_dung) @@ to_tsquery('simple', 'bảo & hàn:*');
--                                                                  ▲▲
--                   "bắt đầu bằng hàn" → khớp "hành", "hàn", "hàng"
```

Nó chạy được vì danh sách từ trong GIN **đã sắp thứ tự** — tìm tiền tố chính là nhảy tới vị trí rồi đọc xuôi, đúng như bài 1 đã nói về B-Tree. Đây là cách chuẩn để làm **gợi ý khi đang gõ (type-ahead)**.

Còn thứ **thật sự** không làm được bằng index đảo là **chuỗi nằm giữa từ** — và cho việc đó có một cấu trúc khác hẳn.

### Trigram: cấu trúc cho câu hỏi "chứa CHUỖI này"

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_posts_trgm ON posts USING GIN (noi_dung gin_trgm_ops);

SELECT * FROM posts WHERE noi_dung ILIKE '%bảo hàn%';   -- giờ dùng được index
```

Ý tưởng: cắt chuỗi thành **mọi cụm 3 ký tự liên tiếp**, rồi index chính các cụm đó.

```text
  "bảo hành"  →  {"  b", " bả", "bảo", "ảo ", "o h", " hà", "hàn", "ành", "nh "}

  Tìm "%bảo hàn%":
    cắt câu tìm thành trigram → {" bả", "bảo", "ảo ", "o h", " hà", "hàn"}
    → giao các danh sách → ra tập ứng viên → kiểm lại bằng ILIKE thật
```

Và đây là bảng đánh đổi phải thuộc:

| | GIN + `tsvector` | GIN + `pg_trgm` |
|---|---|---|
| Trả lời | "chứa **từ** này" | "chứa **chuỗi** này" |
| `LIKE '%giữa%'` | ❌ | ✅ |
| Gõ sai chính tả | ❌ | ✅ (`similarity()`, `%` operator) |
| Chuỗi ngắn dưới 3 ký tự | — | ❌ không tạo nổi trigram |
| Kích thước index | ~1× dữ liệu | **~3-10× dữ liệu** |
| Tốc độ ghi | chậm | **chậm hơn nữa** |
| Xếp hạng liên quan | ✅ `ts_rank` | ❌ chỉ có độ tương tự chuỗi |

Nhiều hệ thống thật dùng **cả hai**: `tsvector` cho tìm kiếm chính, `pg_trgm` cho gợi ý và sửa lỗi chính tả.

---

## Phần 4 — Khối đắt nhất: ai quyết định "thế nào là một từ"

Nếu đơn vị của nó là một từ, thì **phải có ai đó quyết định thế nào là một từ**. Người quyết định là **hai thành phần**, và cả hai được chọn **ngay lúc bạn gõ câu lệnh tạo index**, rồi **đông cứng lại trong đó**.

### Thành phần 1 — Bộ tách từ (parser)

Bộ tách từ mặc định cắt theo **khoảng trắng và dấu câu**. Với tiếng Anh thì tạm ổn. **Với tiếng Việt thì không.**

```sql
SELECT to_tsvector('simple', 'Cửa hàng ở Hà Nội bảo hành 12 tháng');
```

```text
 '12':7  'bảo':5  'cửa':1  'hà':4  'hàng':2  'nội':5  'ở':3  'tháng':8
                            ▲▲▲▲              ▲▲▲▲▲
                    "Hà Nội" bị cắt thành HAI mục rời hẳn nhau,
                    và index KHÔNG HỀ BIẾT hai từ đó đi với nhau.
```

Hệ quả:

```sql
-- Tìm "Hà Nội" thật ra là tìm bài nào có chữ "Hà" VÀ có chữ "Nội"
to_tsquery('simple', 'hà & nội')
```

Một bài viết về **"Hà Tĩnh"** và **"nội thất"** khớp hoàn hảo. Không lỗi nào cả. Đây không phải bug — đó là hệ quả trực tiếp của việc bộ tách từ không biết tiếng Việt.

**Chữa được một phần** bằng tìm kiếm theo cụm (từ PostgreSQL 9.6):

```sql
SELECT * FROM posts
 WHERE to_tsvector('simple', noi_dung) @@ phraseto_tsquery('simple', 'Hà Nội');
-- sinh ra: 'hà' <-> 'nội'   (toán tử "đứng ngay sau")
```

`<->` yêu cầu hai từ **đứng liền nhau đúng thứ tự**, dùng thông tin vị trí lưu sẵn trong `tsvector`. `<2>` nghĩa là cách nhau 2 vị trí. Đây là công cụ mà rất ít người biết, và nó giải quyết phần lớn nỗi đau tiếng Việt.

> **Đính chính nguồn.** Bản gốc dừng ở *"index không hề biết hai từ đó đi với nhau"* — đúng ở tầng danh sách từ, nhưng chưa đủ: `tsvector` **có lưu vị trí** của từng từ (`'hà':4 'nội':5`), nên tìm kiếm theo cụm bằng `<->` là làm được. Cái thật sự không có là **hiểu biết về ranh giới từ ghép tiếng Việt** — muốn có phải cài bộ tách từ riêng.

### Thành phần 2 — Quyển từ điển (dictionary)

Nó làm hai việc, và cả hai đều **không thể hoàn tác**:

**Bỏ từ dừng (stop words)** — những từ nó cho là vô nghĩa:

```sql
SELECT to_tsvector('english', 'The cat is on the mat and it is black');
```

```text
 'black':9  'cat':2  'mat':6
 → "the", "is", "on", "and", "it" bị VỨT BỎ hoàn toàn.
```

**Từ nào bị bỏ lúc dựng index thì vĩnh viễn không tìm lại được.** Ban nhạc "The The", bài hát "Let It Be", mã sản phẩm "IT-2024" — tất cả biến mất.

**Cắt gốc từ (stemming)**:

```text
  running, runs, ran   →  run
  organization         →  organ      ← và đây là chỗ nó phản chủ
```

Thuật toán cắt gốc (Snowball/Porter) làm việc bằng luật hình thái, không bằng nghĩa. Nên `organization` và `organ` gộp làm một mục — tìm "organ" ra cả bài về "organization".

### Và đây là chỗ khó chịu nhất: bạn tự nhìn thấy được, chỉ bằng một câu lệnh

Không cần tin lời ai. Đưa cho nó một câu và xem nó trả về gì:

```sql
SELECT to_tsvector('english', 'bảo hành 12 tháng chính hãng');
```

```text
 '12':3  'bảo':1  'chính':5  'hành':2  'hãng':6  'tháng':4
```

Nó **không trả về câu của bạn**. Nó trả về một **danh sách gốc từ kèm số thứ tự**, và câu của bạn **đã biến mất**.

> Nghĩa là thứ bạn đang tra **không phải dữ liệu của bạn**. Nó là **một bản ghi lại các quyết định về dữ liệu của bạn**, chốt vào đúng cái ngày bạn tạo index.

Hai hệ thống, cùng 4 triệu bài viết y hệt nhau, hai quyển từ điển khác nhau → **hai kết quả khác nhau cho cùng một câu tìm, và cả hai đều đúng**.

> **Chốt khối 3.** Đổi bộ tách từ hay đổi quyển từ điển là **phải dựng lại toàn bộ index** — 2,4 GB, hàng chục phút — **và mọi kết quả tìm kiếm đổi theo**. Đây là quyết định khó đảo ngược nhất trong cả loạt bài này.

---

## Phần 5 — Làm cho nó chạy được với tiếng Việt (phần mở rộng ngoài transcript)

Đây là công thức thực dụng, xếp theo thứ tự nên làm.

### Bước 1 — Chọn cấu hình `simple`, không phải `english`

```sql
-- SAI với tiếng Việt: bỏ stop word tiếng Anh, cắt gốc theo luật tiếng Anh
to_tsvector('english', noi_dung)

-- ĐÚNG: 'simple' chỉ hạ chữ thường và tách theo khoảng trắng, không cắt gốc
to_tsvector('simple', noi_dung)
```

### Bước 2 — Gỡ dấu để tìm được cả khi người dùng gõ không dấu

```sql
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TEXT SEARCH CONFIGURATION vi (COPY = simple);
ALTER TEXT SEARCH CONFIGURATION vi
    ALTER MAPPING FOR hword, hword_part, word WITH unaccent, simple;

SELECT to_tsvector('vi', 'Bảo hành chính hãng');
-- 'bao':1 'chinh':3 'hang':2,4   ← giờ gõ "bao hanh" cũng khớp
```

Cẩn thận một cái bẫy tiếng Việt ở đây: gỡ dấu làm **"hàng"** và **"hãng"** gộp thành **"hang"**, cùng với **"háng"** và **"hang"**. Đây là đánh đổi có thật, và cách xử lý chuẩn là **index cả hai bản**:

```sql
ALTER TABLE posts ADD COLUMN tsv_co_dau     tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', noi_dung)) STORED;
ALTER TABLE posts ADD COLUMN tsv_khong_dau  tsvector
    GENERATED ALWAYS AS (to_tsvector('vi',     noi_dung)) STORED;

CREATE INDEX ON posts USING GIN (tsv_co_dau);
CREATE INDEX ON posts USING GIN (tsv_khong_dau);
-- → gõ có dấu thì khớp chính xác hơn, gõ không dấu vẫn ra kết quả
```

Dùng **cột sinh (`GENERATED ... STORED`)** thay vì `to_tsvector(...)` trực tiếp trong index là thực hành tốt: truy vấn ngắn hơn, không sợ viết lệch biểu thức làm index không được dùng. Cùng nguyên tắc với [phase-5 bài 7](../phase-5/07-email-va-chuan-hoa-du-lieu-truoc-khi-so-trung.md).

### Bước 3 — Đánh trọng số theo vùng và xếp hạng

```sql
ALTER TABLE posts ADD COLUMN tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('vi', coalesce(tieu_de, '')),  'A') ||
    setweight(to_tsvector('vi', coalesce(tom_tat, '')),  'B') ||
    setweight(to_tsvector('vi', coalesce(noi_dung, '')), 'D')
) STORED;

SELECT tieu_de,
       ts_rank('{0.1, 0.2, 0.4, 1.0}', tsv, query) AS diem,
       ts_headline('vi', noi_dung, query,
                   'StartSel=<b>, StopSel=</b>, MaxWords=30') AS trich_doan
  FROM posts, phraseto_tsquery('vi', 'bảo hành chính hãng') query
 WHERE tsv @@ query
 ORDER BY diem DESC
 LIMIT 20;
```

- `setweight` cho **tiêu đề nặng hơn nội dung** — khớp ở tiêu đề đáng giá hơn khớp ở đoạn cuối bài.
- `ts_rank` tính điểm liên quan; `ts_rank_cd` còn xét **độ gần nhau** của các từ.
- `ts_headline` sinh đoạn trích có tô đậm — đúng thứ Google hiển thị dưới mỗi kết quả.

### Bước 4 — Biết ngưỡng phải rời khỏi PostgreSQL

| Nhu cầu | PostgreSQL FTS đủ? |
|---|---|
| Tìm kiếm trong site, dưới ~10 triệu tài liệu | **Đủ, và đỡ được cả một hệ thống** |
| Xếp hạng theo `ts_rank` + lọc theo cột SQL khác | **Đủ, và tốt hơn Elasticsearch** vì join được |
| Gợi ý khi gõ, sửa lỗi chính tả | Đủ, bằng `pg_trgm` + `:*` |
| Tách từ tiếng Việt chuẩn (từ ghép) | **Không** — cần bộ tách từ riêng |
| Đồng nghĩa, phân tích ngữ nghĩa, học từ hành vi | **Không** — Elasticsearch / vector (bài 7) |
| Trên 100 triệu tài liệu, tìm kiếm là nghiệp vụ chính | **Không** — hệ chuyên dụng |

Nguyên tắc chọn: **nếu tìm kiếm là *một tính năng*, dùng PostgreSQL. Nếu tìm kiếm là *sản phẩm*, dùng hệ chuyên dụng.** Cái giá của hệ chuyên dụng không phải tiền máy chủ, mà là **đồng bộ hai nguồn dữ liệu** — và đó là loại lỗi khó nhất trong nghề.

---

## Phần 6 — GIN không chỉ cho văn bản

Cùng một cấu trúc phục vụ mọi câu hỏi dạng "chứa":

```sql
-- 1. Mảng: bài nào có thẻ trong danh sách này
CREATE INDEX ON posts USING GIN (the_tags);
SELECT * FROM posts WHERE the_tags && ARRAY['khuyen-mai','tet'];  -- giao
SELECT * FROM posts WHERE the_tags @> ARRAY['khuyen-mai'];        -- chứa

-- 2. JSONB: đơn nào có metadata.kenh = 'app'
CREATE INDEX ON don_hang USING GIN (metadata);                    -- đủ toán tử
CREATE INDEX ON don_hang USING GIN (metadata jsonb_path_ops);     -- nhỏ hơn, nhanh hơn, chỉ @>
SELECT * FROM don_hang WHERE metadata @> '{"kenh":"app"}';

-- 3. Trigram cho LIKE '%giữa%'  (đã nói ở phần 3)
CREATE INDEX ON products USING GIN (ten gin_trgm_ops);

-- 4. Kết hợp cột thường vào GIN để lọc nhiều điều kiện một lần
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE INDEX ON posts USING GIN (tsv, trang_thai, tac_gia_id);
```

Dòng cuối rất đáng giá: nó cho phép lọc *"bài đã xuất bản, của tác giả X, chứa từ Y"* trong **một** lần đi index thay vì giao ba tập kết quả.

Khác biệt giữa `jsonb_ops` và `jsonb_path_ops` đáng nhớ cho phỏng vấn: mặc định index **cả khoá lẫn giá trị** (to, phục vụ nhiều toán tử); `jsonb_path_ops` index **băm của cả đường dẫn** (nhỏ hơn ~2-3 lần, nhanh hơn, nhưng **chỉ** phục vụ `@>`).

---

## Câu hỏi phỏng vấn

**"`WHERE ten LIKE '%iphone%'` chậm, xử lý sao?"**
Đừng trả lời *"đánh index"* — B-Tree vô dụng với `%` ở đầu. Trả lời theo hình dạng câu hỏi:
- Nếu thật sự cần **chuỗi con** → `pg_trgm` + GIN, và nói kèm cái giá: index to gấp 3-10 lần, ghi chậm hơn.
- Nếu thật ra người dùng đang **tìm theo từ** → `tsvector` + GIN là đúng hơn, nhẹ hơn, lại xếp hạng được.
- Nếu chỉ cần **tiền tố** → B-Tree với `text_pattern_ops` là đủ, rẻ nhất.
Ba câu trả lời cho ba hình dạng — đó là điều bài 1 đã đặt nền.

**"Full-text search của PostgreSQL có thay được Elasticsearch không?"**
Thay được cho phần lớn ứng dụng dưới ~10 triệu tài liệu, và **tốt hơn** khi bạn cần lọc/join với dữ liệu quan hệ trong cùng một câu lệnh. Không thay được khi cần đồng nghĩa, phân tích ngữ nghĩa, tách từ ngôn ngữ phức tạp, hoặc quy mô rất lớn. Vế quan trọng nhất phải nói ra: **cái giá thật của Elasticsearch là đồng bộ hai nguồn dữ liệu**, không phải tiền máy chủ.

**"Vì sao `INSERT` vào bảng có GIN chậm hơn hẳn?"**
Một bài 500 từ phải chèn vào ~300 mục index khác nhau, trong khi B-Tree chỉ chèn một lần. PostgreSQL giảm đau bằng `fastupdate` + pending list, nhưng đổi lại **truy vấn phải quét pending list tuần tự** — nên pending list phình là tìm kiếm chậm. Cách xử lý: `gin_pending_list_limit`, hoặc tắt `fastupdate` với bảng đọc nhiều.

**"Tại sao tìm 'bảo hàn' ra 0 kết quả mà `LIKE '%bảo hàn%'` lại ra 12.400?"**
Vì đơn vị nhỏ nhất của index đảo là **một từ trọn vẹn**; "bảo hàn" không phải một từ nên không có mục nào để tra, và máy không quay lại quét bảng. Với **tiền tố** thì dùng được `to_tsquery('bảo & hàn:*')`; với **chuỗi giữa từ** thì phải đổi cấu trúc sang trigram.

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng `to_tsvector('english', ...)` cho tiếng Việt | Cắt gốc theo luật tiếng Anh, bỏ nhầm từ | Dùng `simple` hoặc cấu hình riêng |
| Viết `to_tsvector(noi_dung)` không nêu cấu hình | Phụ thuộc `default_text_search_config`, đổi server là đổi kết quả, và index **không được dùng** | Luôn nêu rõ cấu hình, và dùng cột sinh `STORED` |
| Biểu thức trong `WHERE` khác biểu thức lúc `CREATE INDEX` | Index bị bỏ qua im lặng | Cột sinh + index trên cột đó |
| Kỳ vọng FTS tìm được chuỗi con | Trả về 0, người dùng tưởng hết hàng | `pg_trgm` cho chuỗi con, `:*` cho tiền tố |
| Quên rằng stop word bị **xoá vĩnh viễn** | Không tìm được "The The", "IT", "C" | Cấu hình `simple` không có stop word |
| Đổi cấu hình từ điển trên bảng đang chạy | Kết quả tìm kiếm đổi ngầm, dữ liệu cũ/mới không đồng nhất | Dựng lại toàn bộ index, có kế hoạch |
| Đánh `pg_trgm` cho từ khoá dưới 3 ký tự | Không sinh nổi trigram → vẫn quét bảng | Kết hợp thêm tiền tố B-Tree |
| Dùng GIN trên bảng ghi rất nhiều mà không chỉnh `fastupdate` | Tìm kiếm chậm dần không rõ lý do | Theo dõi và chỉnh `gin_pending_list_limit` |

---

## Tóm tắt bài 6

- Index đảo **không lưu bài viết**, nó lưu **từ → danh sách bài chứa từ đó**. 4 triệu bài rút xuống ~600.000 từ phân biệt (quy luật Zipf), nên tra một từ chỉ tốn 3 lần đọc trang.
- Nó nhanh **không phải vì đọc nhanh hơn**, mà vì **nó không đọc bài nào cả** — chỉ tra mục lục rồi giao hai danh sách đã sắp.
- **Đơn vị nhỏ nhất của nó là một từ.** Mọi câu hỏi nhỏ hơn một từ — nửa mã sản phẩm, 4 số đầu điện thoại, tiền tố gõ dở — đều rơi vào lỗ đen và trả về rỗng **mà không báo lỗi**.
- Nhưng **tiền tố thì làm được** bằng `to_tsquery('hàn:*')`, và **cụm từ** làm được bằng `phraseto_tsquery` / toán tử `<->`. Thứ thật sự không làm được là **chuỗi nằm giữa từ** — đó là việc của `pg_trgm`.
- **Bộ tách từ + quyển từ điển được chốt cứng vào lúc tạo index.** Tiếng Việt bị cắt "Hà Nội" thành hai từ rời; stop word bị xoá vĩnh viễn; stemming gộp `organization` với `organ`.
- Thứ bạn đang tra **không phải dữ liệu của bạn** — nó là **bản ghi lại các quyết định về dữ liệu của bạn**, chốt vào ngày bạn tạo index. Đổi quyết định = dựng lại toàn bộ index và mọi kết quả đổi theo.
- GIN ghi chậm vì một bài 500 từ phải chèn ~300 mục; `fastupdate` + pending list giảm đau nhưng làm truy vấn chậm nếu pending list phình.
- Trước khi tin nó, hãy chạy `SELECT to_tsvector(...)` trên **chính dữ liệu của bạn** và nhìn xem câu của bạn đã biến thành cái gì.

**Bài kế tiếp** → [Bài 7: Index vector, HNSW và câu trả lời cố tình sai](07-index-vector-hnsw-va-cau-tra-loi-gan-dung.md)
