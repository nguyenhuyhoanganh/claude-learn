# Bài 7: Index vector — loại index cố tình trả lời sai, và vì sao đó là thiết kế đúng

Khách gõ vào ô tìm kiếm năm chữ: **"áo khoác chống nước đi phượt"**. Trang trả về **0 sản phẩm**.

Mà trong kho có **200 cái đúng ý họ**.

Không sản phẩm nào chứa đủ năm chữ đó. Cái thì ghi *"jacket chống thấm"*, cái thì *"áo gió leo núi"*, cái thì *"áo mưa du lịch"*. Cái mục lục từ ở [bài 6](06-index-dao-va-tim-kiem-toan-van.md) không có mục nào khớp năm chữ — **không khớp nổi**.

Vì người mua **không gõ từ khoá. Họ gõ một cái ý.** Và không có mục lục từ nào chứa nổi một cái ý.

Đây đúng là câu hỏi thứ ba mà [bài 1](01-may-chon-ho-ban-b-tree-va-hinh-dang-cau-hoi.md) đã kê ra: *chứa từ này*, *gần chỗ này*, *giống ý này*. Hai câu đầu đã xong. Còn đúng câu này — và nó khác hẳn hai câu kia, vì **cấu trúc trả lời nó không hề cố gắng trả lời đúng**.

---

## Phần 1 — Biến một cái ý thành một chỗ đứng

Máy không hiểu ý. Nên cách duy nhất để nó so hai ý với nhau là **biến mỗi ý thành một toạ độ**.

Một mô hình nhúng (embedding model) đọc câu của bạn rồi trả về một dãy số:

```text
"áo khoác chống nước đi phượt"
        │
        ▼  mô hình nhúng
[0.0231, -0.1847, 0.0092, ..., 0.0418]     ← 1.536 con số
        │
        ▼
một ĐIỂM trong không gian 1.536 chiều — không phải một chuỗi
```

Luật duy nhất của không gian đó:

> **Ý gần nhau thì điểm gần nhau.**

```text
        (không gian ý, vẽ ép xuống 2 chiều cho dễ nhìn)

              • áo mưa du lịch
        • áo gió leo núi
             ★ ← câu tìm của khách
        • jacket chống thấm
                        • áo khoác dạ công sở
                                            • nồi cơm điện
```

Nên "tìm sản phẩm giống ý" thành **"tìm điểm gần nhất"**. Hết. Chỉ có một luật đó.

Ba cách đo khoảng cách, và **chọn sai là kết quả sai im lặng**:

| Toán tử (pgvector) | Phép đo | Dùng khi |
|---|---|---|
| `<->` | Khoảng cách Euclid (L2) | Vector chưa chuẩn hoá, dữ liệu hình học |
| `<=>` | Khoảng cách cosin | **Mặc định cho văn bản** — chỉ quan tâm hướng, không quan tâm độ dài |
| `<#>` | Tích vô hướng âm | Nhanh nhất khi vector **đã chuẩn hoá** (lúc đó tương đương cosin) |

Nghe như xong rồi. **Chưa xong.** Cả bài này nằm ở chỗ: **"gần nhất" trong 1.536 chiều là một bài toán khác hẳn.**

---

## Phần 2 — Giá của câu trả lời đúng tuyệt đối

Nó luôn có sẵn. Và nó không hề rẻ.

```text
4.000.000 sản phẩm × 1.536 số × 4 byte (float32)
= 24.576.000.000 byte
≈ 24 GB    ← chỉ để ĐỰNG toạ độ, chưa tính gì khác
```

Muốn đúng tuyệt đối thì **không có đường tắt nào**: phải đo khoảng cách từ câu tìm tới **cả 4 triệu điểm**, không được bỏ một điểm nào. Vì bạn không có cách nào biết trước điểm nào gần mà không đo.

```text
Mỗi phép đo (cosin, chưa chuẩn hoá) : 1.536 phép nhân + cộng dồn
Nhân với 4.000.000 điểm             : 6.144.000.000 phép nhân
                                       ── cho ĐÚNG MỘT lượt tra
```

Đo thật trên một máy chủ thường:

```text
  quét toàn bộ (brute force)   : ~2,8 giây / câu tìm
  50 người cùng tìm            : trang đứng hẳn
```

```sql
-- Không có index: đây là plan bạn sẽ thấy
EXPLAIN SELECT id FROM products ORDER BY embedding <=> :q LIMIT 10;
-- Seq Scan on products ... (cost=... rows=4000000)
```

> **Chốt khối 1.** Câu trả lời đúng **luôn có**, và giá của nó **đúng bằng đọc hết 24 GB**. Không hơn không kém. Mọi thứ còn lại của bài này là các cách trả ít tiền hơn — bằng cách mua ít hàng hơn.

---

## Phần 3 — Vậy thì đánh index đi, như sáu bài trước?

Đây là chỗ mọi thứ vỡ. Và nó **vỡ ngay**.

Trong **hai chiều** thì chuyện rất dễ, và đó chính là cây R của bài 1: chia mặt phẳng thành ô, câu tìm rơi vào một ô, và **mọi ô nằm xa hơn khoảng cách tốt nhất hiện có thì bỏ qua hết**.

```text
2 chiều — phép loại trừ chạy tốt:

  ┌────┬────┬────┐
  │    │ ●  │    │   đã tìm được điểm cách 3 km.
  ├────┼────┼────┤   → mọi ô có biên xa hơn 3 km: BỎ, không cần mở.
  │ ●  │ ★  │ ●  │   → thường loại được 90-99% số ô.
  ├────┼────┼────┤
  │    │    │    │
  └────┴────┴────┘
```

Cách đó **chỉ đúng khi số chiều còn nhỏ**. Lên vài chục chiều nó bắt đầu yếu. Lên **1.536 chiều thì nó hết tác dụng hẳn**.

### Vì sao: trong nhiều chiều, mọi điểm gần như cách nhau như nhau

Đây là hiện tượng **lời nguyền số chiều** (curse of dimensionality), và nó có công bố hẳn hoi: Beyer, Goldstein, Ramakrishnan, Shaft — *"When Is 'Nearest Neighbor' Meaningful?"* (1999).

Kết quả cốt lõi: khi số chiều tăng, **tỷ số giữa khoảng cách xa nhất và gần nhất tiến về 1**.

```text
Lấy 1.000.000 điểm ngẫu nhiên, đo tỷ số (xa nhất / gần nhất):

    2 chiều  :  d_max / d_min ≈ 45      → phân biệt rất rõ
   10 chiều  :  ≈ 4,2                   → còn phân biệt được
  100 chiều  :  ≈ 1,4                   → bắt đầu nhoè
 1.536 chiều :  ≈ 1,05                  → gần như KHÔNG phân biệt được
```

Đọc dòng cuối cho kỹ: **điểm gần nhất và điểm xa nhất chỉ chênh nhau khoảng 5%**.

Mà phép loại trừ của mọi cấu trúc cây dựa trên đúng một câu: *"vùng này chắc chắn xa hơn thứ tôi đang có, bỏ đi"*. Chênh 5% thì **không có vùng nào đủ xa để bỏ qua**.

```text
        2 chiều                     1.536 chiều
  ┌────┬────┬────┐            ┌────┬────┬────┐
  │ BỎ │ mở │ BỎ │            │ mở │ mở │ mở │
  ├────┼────┼────┤            ├────┼────┼────┤
  │ BỎ │ ★  │ BỎ │            │ mở │ ★  │ mở │   → loại được 0 vùng
  ├────┼────┼────┤            ├────┼────┼────┤   → cây tụt về đúng
  │ BỎ │ BỎ │ BỎ │            │ mở │ mở │ mở │      quét toàn bộ,
  └────┴────┴────┘            └────┴────┴────┘      cộng thêm chi phí đi cây
```

Còn một cách nhìn trực quan nữa cho cùng hiện tượng: trong không gian nhiều chiều, **gần như toàn bộ thể tích của hình cầu nằm sát vỏ**.

```text
Tỷ lệ thể tích nằm trong lớp vỏ ngoài cùng 10% bán kính:

    3 chiều  : 1 − 0,9³    = 27%
   10 chiều  : 1 − 0,9¹⁰   = 65%
  100 chiều  : 1 − 0,9¹⁰⁰  = 99,997%
 1.536 chiều : ≈ 100%

  → mọi điểm đều nằm ở "vỏ", tức là gần như cách tâm đúng bằng nhau.
```

> **Chốt khối 2.** **Không phải chưa ai nghĩ ra cái cây tốt hơn.** Là trong nhiều chiều thì **không tồn tại cái cây nào** loại bớt được. Đây là tính chất của không gian, không phải thiếu sót của ngành.

> **Đính chính nguồn.** Bản gốc nói *"Đó là một định lý, không phải một thiếu sót"*. Nói cho chuẩn: đây **không phải một định lý cấm** kiểu "chứng minh được là không thể". Đó là một **kết quả tiệm cận** — với dữ liệu phân bố đủ "đều" và số chiều đủ lớn, mọi cấu trúc phân hoạch không gian **suy biến về quét toàn bộ**. Kẽ hở còn lại và người ta khai thác thật: **dữ liệu thật hiếm khi trải đều**, nó thường nằm trên một mặt cong có **số chiều nội tại** thấp hơn nhiều (intrinsic dimension). HNSW sống được chính nhờ kẽ hở đó — nên nó chạy tốt trên embedding thật mà chạy kém trên dữ liệu ngẫu nhiên đều.

---

## Phần 4 — Đường còn lại: bỏ hẳn chữ "đúng"

Còn đúng một đường: **thôi đòi câu trả lời đúng**. Chuyển từ *nearest neighbor* sang *approximate nearest neighbor* (**ANN** — láng giềng gần **xấp xỉ**).

### HNSW: đi cầu thang trong một mạng lưới

**HNSW** = *Hierarchical Navigable Small World*. Nó dựng một **mạng lưới nhiều tầng**, mỗi điểm nối với một số điểm khác.

```text
Tầng 2 (rất ít điểm, mỗi bước nhảy rất xa):
    ●───────────────────────●───────────────────●

Tầng 1 (đông hơn, bước ngắn hơn):
    ●─────●───────●─────●───●──────●─────●──────●

Tầng 0 (toàn bộ 4 triệu điểm, bước rất ngắn):
    ●─●─●─●─●─●─●─●─●─●─●─●─●─●─●─●─●─●─●─●─●─●
```

Cách tra:

```text
1. Vào tầng trên cùng, tại một điểm bất kỳ.
2. Nhìn các hàng xóm. Nhảy sang hàng xóm NÀO GẦN CÂU TÌM HƠN.
3. Lặp lại tới khi không hàng xóm nào gần hơn nữa  → tụt xuống tầng dưới.
4. Lặp lại ở tầng dưới (bước ngắn hơn, tinh hơn).
5. Tới tầng 0 thì gom ef_search ứng viên tốt nhất, trả về LIMIT k.
```

Ý tưởng giống hệt **danh sách bỏ qua (skip list)**: tầng trên để đi xa nhanh, tầng dưới để đi chính xác. Đó cũng là cách bạn tìm đường trong thành phố lạ — đi cao tốc trước, rồi mới xuống đường nhánh.

```text
Cả đường đi đó chỉ chạm khoảng vài nghìn điểm trên 4 triệu:

  brute force : 4.000.000 phép đo  →  2.800 ms
  HNSW        :     ~3.000 phép đo →      3 ms      → nhanh hơn ~900 lần
```

**Và đây là cái giá:** nó **không bảo đảm tìm ra điểm gần nhất thật**. Nó chỉ tìm ra một điểm **rất gần**. Vì bước "nhảy sang hàng xóm gần hơn" là một thuật toán **tham lam** — nó có thể mắc kẹt ở một cực tiểu địa phương.

```text
Đo được: recall ≈ 95%   (không phải 100%)

  → cứ 20 kết quả đáng ra phải có, nó bỏ sót 1.
```

> **Chốt khối 3.** Và chỗ khó chịu nằm ở đây: **không ai chỉ ra được nó bỏ sót cái nào.** Muốn biết thì phải chạy brute force để so — tức là phải làm đúng cái việc mà bạn vừa bỏ 24 GB tiền ra để tránh.

### Đo recall thật (đừng tin con số mặc định)

```sql
-- 1. Đáp án đúng tuyệt đối cho 100 câu tìm mẫu (tắt index)
SET enable_indexscan = off;
CREATE TABLE dap_an_dung AS
SELECT q.id AS query_id, p.id AS product_id
  FROM cau_tim_mau q
 CROSS JOIN LATERAL (
      SELECT id FROM products ORDER BY embedding <=> q.embedding LIMIT 10
 ) p;
RESET enable_indexscan;

-- 2. Kết quả của index, rồi so
SET hnsw.ef_search = 40;
WITH kq_index AS (
  SELECT q.id AS query_id, p.id AS product_id
    FROM cau_tim_mau q
   CROSS JOIN LATERAL (
        SELECT id FROM products ORDER BY embedding <=> q.embedding LIMIT 10
   ) p
)
SELECT round(100.0 * count(*) FILTER (WHERE d.product_id IS NOT NULL)
             / count(*), 2) AS recall_phan_tram
  FROM kq_index k
  LEFT JOIN dap_an_dung d USING (query_id, product_id);
```

Đây là phép đo mà **hầu như không đội nào chạy**, và nó là phép đo duy nhất cho bạn biết mình đang mua tỷ giá nào.

### Ba núm vặn của HNSW

```sql
CREATE INDEX ON products
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

SET hnsw.ef_search = 40;   -- chỉnh lúc chạy, mỗi phiên
```

| Tham số | Ý nghĩa | Tăng lên thì |
|---|---|---|
| `m` | Số hàng xóm mỗi điểm ở tầng 0 | Recall ↑, index to ↑, dựng lâu ↑ |
| `ef_construction` | Số ứng viên xét lúc **dựng** | Recall ↑, thời gian dựng ↑↑, tra không đổi |
| `hnsw.ef_search` | Số ứng viên xét lúc **tra** | Recall ↑, thời gian tra ↑ |

`ef_search` là núm quý nhất: **chỉnh được lúc chạy, không phải dựng lại index**. Nên quy trình đúng là dựng index một lần với `m`/`ef_construction` khá, rồi **dò `ef_search` theo recall mục tiêu**.

```text
Đo trên 4 triệu vector 1.536 chiều:

  ef_search =  10  →  recall 82%  →  1,1 ms
  ef_search =  40  →  recall 95%  →  3,0 ms
  ef_search = 100  →  recall 98%  →  6,4 ms
  ef_search = 400  →  recall 99,7% → 21  ms
  brute force      →  recall 100% →  2.800 ms

  → 100% đắt gấp 130 lần 99,7%. Đây là tỷ giá bạn phải tự chọn.
```

### IVFFlat: cách còn lại, và khi nào nó hợp hơn

```sql
CREATE INDEX ON products
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 2000);
SET ivfflat.probes = 40;
```

Ý tưởng khác hẳn: gom 4 triệu điểm thành `lists` cụm (k-means), mỗi cụm có một tâm. Lúc tra, chỉ mở `probes` cụm có tâm gần nhất.

| | HNSW | IVFFlat |
|---|---|---|
| Tốc độ tra ở cùng recall | **Nhanh hơn 2-5 lần** | Chậm hơn |
| Thời gian dựng index | Chậm (hàng giờ với 4 triệu) | **Nhanh hơn nhiều** |
| Kích thước index | To hơn | Nhỏ hơn |
| Cần dữ liệu sẵn lúc dựng? | Không | **Có** — phải có đủ dữ liệu để chạy k-means |
| Dữ liệu thêm liên tục | Chịu được tốt | Chất lượng **giảm dần**, phải dựng lại định kỳ |
| Núm chỉnh lúc chạy | `ef_search` | `probes` |

Quy tắc chọn: **mặc định HNSW.** Chọn IVFFlat khi bộ nhớ eo hẹp, hoặc khi bạn nạp lại toàn bộ dữ liệu theo lô định kỳ (lúc đó dựng lại index cũng là chuyện bình thường).

Quy tắc đặt `lists` cho IVFFlat: `√n` với `n` dưới 1 triệu, `n/1000` với `n` lớn hơn — và `probes ≈ √lists` là điểm khởi đầu hợp lý.

---

## Phần 5 — Ba cái bẫy thật khi đưa vào production (phần mở rộng ngoài transcript)

### Bẫy 1 — Index chỉ được dùng khi có `ORDER BY ... LIMIT`

```sql
-- ✅ Dùng index
SELECT * FROM products ORDER BY embedding <=> :q LIMIT 10;

-- ❌ KHÔNG dùng index — quét toàn bộ
SELECT * FROM products WHERE embedding <=> :q < 0.3;

-- ❌ KHÔNG dùng index — toán tử không khớp opclass của index
--    (index dựng bằng vector_cosine_ops mà truy vấn dùng <->)
SELECT * FROM products ORDER BY embedding <-> :q LIMIT 10;
```

Dòng cuối là cái bẫy im lặng nhất trong cả bài: **toán tử trong `ORDER BY` phải khớp opclass lúc `CREATE INDEX`**. Lệch một ký tự (`<=>` vs `<->`) là index bị bỏ qua, không cảnh báo, và câu lệnh vẫn trả về kết quả — chỉ là mất 2,8 giây thay vì 3 mili giây.

### Bẫy 2 — Lọc kèm điều kiện: bài toán khó nhất của vector search

```sql
SELECT * FROM products
 WHERE danh_muc = 'ao-khoac' AND con_hang
 ORDER BY embedding <=> :q LIMIT 10;
```

Câu này nghe rất bình thường. Nó là **bài toán khó nhất** của mọi hệ vector, vì hai bước đánh nhau:

```text
Lọc TRƯỚC (pre-filter):
  lọc ra 12.000 sản phẩm áo khoác → rồi tìm gần nhất trong đó
  → nhưng đồ thị HNSW được dựng trên TOÀN BỘ 4 triệu điểm;
    đi trong đồ thị mà bỏ qua 99,7% số điểm thì đường đi đứt đoạn
    → recall tụt thảm hại, có khi về 20%

Lọc SAU (post-filter):
  lấy 10 điểm gần nhất toàn cục → rồi lọc theo danh mục
  → rất có thể còn 0 kết quả, vì 10 điểm gần nhất đều là quần áo khác
```

Ba cách xử lý thật:

```sql
-- Cách 1: lấy dư rồi lọc (đơn giản, đủ dùng khi bộ lọc không quá hẹp)
SELECT * FROM (
    SELECT * FROM products ORDER BY embedding <=> :q LIMIT 500
) t WHERE danh_muc = 'ao-khoac' AND con_hang LIMIT 10;

-- Cách 2: index riêng cho từng nhánh lọc lớn (partial index)
CREATE INDEX ON products USING hnsw (embedding vector_cosine_ops)
    WHERE danh_muc = 'ao-khoac';

-- Cách 3: pgvector 0.8+ — quét lặp, tự nới rộng khi lọc xong còn quá ít
SET hnsw.iterative_scan = relaxed_order;
SET hnsw.max_scan_tuples = 40000;
```

Cách 3 là câu trả lời hiện đại: pgvector tự đi tiếp trong đồ thị cho tới khi đủ `LIMIT` **sau khi lọc**, thay vì dừng ở lô đầu tiên.

### Bẫy 3 — Bộ nhớ, và cách trả ít tiền hơn

HNSW muốn nhanh thì **cả index phải nằm trong RAM**. Với 4 triệu vector 1.536 chiều, index HNSW cỡ **30-40 GB**. Đó là một máy chủ đắt tiền chỉ để chạy ô tìm kiếm.

Ba cách hạ giá, xếp theo mức độ mất mát:

```sql
-- 1. halfvec — float16 thay cho float32: đúng một nửa dung lượng
ALTER TABLE products ADD COLUMN embedding_half halfvec(1536)
    GENERATED ALWAYS AS (embedding::halfvec(1536)) STORED;
CREATE INDEX ON products USING hnsw (embedding_half halfvec_cosine_ops);
--   24 GB → 12 GB, recall gần như không đổi. Nên làm gần như luôn luôn.

-- 2. Giảm số chiều ngay từ mô hình (Matryoshka embedding)
--    text-embedding-3-large cho phép cắt 3072 → 1024 chiều
--    mà chỉ mất vài phần trăm chất lượng.

-- 3. Nhị phân hoá — mỗi chiều còn 1 bit, dùng làm bước lọc thô
CREATE INDEX ON products USING hnsw (
    (binary_quantize(embedding)::bit(1536)) bit_hamming_ops);
--   24 GB → 0,75 GB (nhỏ hơn 32 lần), rồi xếp hạng lại (rerank)
--   top 200 bằng vector gốc. Đây là mẫu chuẩn ở quy mô lớn.
```

Mẫu **lọc thô rồi xếp hạng lại** (coarse filter → rerank) là kiến trúc chuẩn của mọi hệ tìm kiếm lớn, và nó đáng nhớ vượt ra ngoài phạm vi vector.

Một giới hạn kỹ thuật nên biết: pgvector **không dựng được index HNSW cho vector quá 2.000 chiều** (`vector`), nên nếu mô hình của bạn cho 3.072 chiều thì phải cắt bớt, hoặc chuyển sang `halfvec` (trần 4.000 chiều).

---

## Phần 6 — Chỗ khó chịu nhất, và nó chốt luôn cả bảy bài

Suốt sáu bài trước, tôi kể như thể ta đang đi tìm một cấu trúc **vừa nhanh vừa đúng**. Bài này bỏ hẳn vế "đúng". Nghe như một bước lùi.

**Nhưng không phải.** Đọc lại sáu bài đó đi:

```text
Bài 2  B-Tree      : chỉ giải được câu hỏi bằng THỨ TỰ. Ngoài ra không có cửa.
Bài 3  Hash        : vứt luôn thứ tự, mất ORDER BY, mất index phủ.
Bài 4  Bitmap      : nhanh khủng khiếp khi đọc, KHOÁ cả cụm hàng nghìn dòng khi ghi.
Bài 5  BRIN        : thôi loại bớt mà KHÔNG BÁO một tiếng nào.
Bài 6  Index đảo   : từ nào từ điển bỏ thì VĨNH VIỄN không tìm lại được.
```

**Không bài nào trong số đó đòi index phải đúng.** Yêu cầu duy nhất từ bài 1 tới giờ chỉ có **một câu**:

> **Rẻ hơn đọc hết.**

B-Tree **tình cờ** đúng luôn, nên không ai để ý là vế "đúng" **chưa bao giờ được đòi**. Mặc định đúng 9/10 lần thì nó tự xoá mình khỏi tầm mắt bạn — đúng như bài 1 đã nói.

**HNSW chỉ là cái đầu tiên nói thẳng ra điều đó.** Nó không tệ hơn năm cấu trúc kia; nó chỉ **trung thực hơn** về thứ nó bán cho bạn.

Và nếu đã vậy thì câu hỏi cuối cùng của cả loạt bài không phải *"index nào đúng nhất"*, mà là:

> **"Với câu hỏi này, tôi chấp nhận trả bao nhiêu để đổi lấy bao nhiêu phần đúng?"**

Với `WHERE id = 42` thì tỷ giá là 100% đúng, giá gần như bằng 0 — nên đừng nghĩ. Với `ORDER BY embedding <=> q LIMIT 10` thì 100% đúng đắt gấp 900 lần 95% đúng — và **bạn phải tự chọn tỷ giá đó**, không ai chọn hộ.

---

## Câu hỏi phỏng vấn

**"Vì sao không dùng B-Tree hay R-Tree cho vector search?"**
Vì phép loại trừ của cây dựa trên *"vùng này chắc chắn xa hơn, bỏ đi"*. Trong 1.536 chiều, tỷ số giữa khoảng cách xa nhất và gần nhất tiến về 1 (Beyer et al., 1999), nên **không vùng nào đủ xa để bỏ** — cây suy biến về quét toàn bộ, cộng thêm chi phí đi cây. Đây là tính chất của không gian nhiều chiều, không phải thiếu sót cài đặt.

**"HNSW đánh đổi cái gì?"**
Đổi **độ đúng** lấy **tốc độ**: recall ~95% ở `ef_search` mặc định, đổi lấy nhanh hơn ~900 lần. Chỉnh được bằng `ef_search` **lúc chạy** mà không phải dựng lại index. Và điểm mấu chốt: **không ai chỉ ra được nó bỏ sót cái nào** trừ khi bạn chạy brute force để so — nên phải **đo recall trên chính dữ liệu của mình**.

**"Vector search kèm bộ lọc `WHERE` thì xử lý sao?"**
Nêu đúng thế lưỡng nan pre-filter / post-filter: lọc trước làm đồ thị HNSW đứt đoạn nên recall tụt; lọc sau thì rất có thể còn 0 kết quả. Ba lối ra: lấy dư rồi lọc, partial index cho từng nhánh lọc lớn, hoặc `iterative_scan` của pgvector 0.8+. Nói được cả ba là dấu hiệu đã làm thật.

**"Khi nào dùng full-text search, khi nào dùng vector?"**
Full-text trả lời *"chứa từ này"* — chính xác, giải thích được, rẻ. Vector trả lời *"giống ý này"* — chịu được cách diễn đạt khác, nhưng xấp xỉ và tốn bộ nhớ. Câu trả lời của hệ thống thật thường là **cả hai** (hybrid search): chạy song song rồi hợp nhất thứ hạng bằng **RRF** (Reciprocal Rank Fusion). Đây là kiến trúc mặc định của tìm kiếm sản phẩm hiện đại.

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Toán tử trong `ORDER BY` khác opclass lúc tạo index | Index bị bỏ qua **im lặng**, chậm 900 lần | `vector_cosine_ops` ↔ `<=>`, `vector_l2_ops` ↔ `<->` |
| Dùng `WHERE khoang_cach < 0.3` thay cho `ORDER BY ... LIMIT` | Không dùng index | Luôn `ORDER BY ... LIMIT` |
| Không đo recall, tin con số trong blog | Kết quả thiếu mà không ai biết | Dựng bộ đáp án brute force và đo định kỳ |
| Lọc `WHERE` rồi thắc mắc sao ít kết quả | Pre-filter làm đứt đồ thị | Lấy dư / partial index / `iterative_scan` |
| Index HNSW không vừa RAM | Mỗi lượt tra chạm đĩa, chậm hàng chục lần | `halfvec`, giảm chiều, nhị phân hoá + rerank |
| Dựng IVFFlat trên bảng rỗng rồi mới nạp dữ liệu | Cụm k-means vô nghĩa, recall rất thấp | Nạp dữ liệu trước, dựng index sau |
| Đổi mô hình nhúng mà giữ nguyên vector cũ | Hai không gian khác nhau, kết quả vô nghĩa | Đổi mô hình = tính lại **toàn bộ** vector |
| So vector chưa chuẩn hoá bằng `<#>` | Kết quả sai lệch theo độ dài vector | Chuẩn hoá trước, hoặc dùng `<=>` |

---

## Tóm tắt bài 7

- Máy không hiểu ý, nên cách duy nhất để so hai ý là **biến mỗi ý thành một toạ độ** trong không gian nhiều chiều. Luật duy nhất: **ý gần nhau thì điểm gần nhau**.
- Câu trả lời **đúng tuyệt đối luôn có sẵn**, và giá của nó đúng bằng **đọc hết 24 GB** — 6,1 tỷ phép nhân, ~2,8 giây mỗi lượt tra.
- Trong 1.536 chiều, **mọi điểm gần như cách nhau như nhau** (xa nhất/gần nhất ≈ 1,05), nên **không tồn tại cây nào loại bớt được**. Đây là tính chất của không gian, không phải thiếu sót của ngành.
- Đường còn lại là **bỏ chữ "đúng"**: HNSW dựng mạng lưới nhiều tầng, đi cầu thang từ bước dài tới bước ngắn, chạm vài nghìn điểm trên 4 triệu → **nhanh hơn ~900 lần, recall ~95%**.
- Núm quý nhất là `ef_search` — chỉnh **lúc chạy**, không phải dựng lại index. Và **phải tự đo recall**, vì không ai chỉ ra được nó bỏ sót cái nào.
- Ba bẫy production: **toán tử phải khớp opclass**, **lọc kèm `WHERE` là bài toán khó nhất** (pre/post-filter), và **bộ nhớ** (chữa bằng `halfvec`, giảm chiều, nhị phân hoá + rerank).
- Chốt cả bảy bài: **chưa bài nào đòi index phải đúng.** Yêu cầu duy nhất từ đầu tới giờ là **"rẻ hơn đọc hết"**. B-Tree tình cờ đúng luôn nên không ai để ý. HNSW chỉ là cái đầu tiên **nói thẳng ra**.

**Bài kế tiếp** → [Bài 8: Bản đồ chọn index theo hình dạng câu hỏi](08-ban-do-chon-index-theo-hinh-dang-cau-hoi.md)
