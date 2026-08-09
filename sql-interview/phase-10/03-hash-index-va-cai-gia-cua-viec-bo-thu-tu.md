# Bài 3: Hash index — món hàng bạn đang mua mà không biết mình đang mua

Vòng phỏng vấn thứ hai. Người đối diện mở sổ ra, chưa hỏi gì về thuật toán cả. Ông ấy hỏi một câu nghe như chuyện phiếm về một cột trong bảng:

> *"Cột `email` của bạn chỉ tra bằng dấu bằng thôi, không bao giờ tra khoảng. Vậy dùng **index băm (hash index)** cho nhanh chứ?"*

Câu này nghe như một câu hỏi về **tốc độ**. Nó không phải. Nó là câu hỏi về **thứ bạn đang bỏ đi mà không biết là mình đang bỏ**.

Ứng viên trả lời ngay, và trả lời rất đúng sách:

> *"Index băm tra một phát ra ngay — `O(1)`. Còn cây B phải đi xuống từng tầng — `O(log n)`. Mà cột này chỉ so bằng, không bao giờ hỏi lớn hơn hay nằm giữa. Vậy thì phần thứ tự của cây B là thừa. Bỏ nó đi, lấy cái nhanh hơn."*

Nghe rất hợp lý. Và đó là chỗ người phỏng vấn **dừng lại**. Ông gật đầu, không nói đúng cũng không nói sai, ghi một dòng vào sổ, rồi hỏi tiếp một câu nghe rất bình thường.

Bài này đi qua đúng ba câu hỏi tiếp theo của ông ấy, rồi đào xuống dưới: hash index thật sự là cái gì bên trong, khi nào nó **thật sự** thắng, và vì sao gần như mọi database đều chọn B-Tree làm mặc định dù hash "nhanh hơn về lý thuyết".

---

## Phần 1 — Hash index bên trong là cái gì

Trước khi nói nó mất gì, phải thấy rõ nó **là** gì. Ba mảnh ghép.

### Hàm băm: biến giá trị thành một con số

```text
hash('an@shop.vn')      = 3_918_402_119
hash('binh@shop.vn')    =   842_003_771
hash('an1@shop.vn')     = 1_205_776_530   ← lệch 1 ký tự, số văng đi rất xa
```

Ba tính chất, và **cả ba đều là cố ý**:

1. **Cùng đầu vào luôn cho cùng đầu ra.** Nếu không thì không tra lại được.
2. **Đầu ra rải đều.** 10 triệu email phải rơi tương đối đều vào các ngăn, không dồn cục.
3. **Đầu ra **phá huỷ** thứ tự đầu vào.** `'an@...'` đứng trước `'binh@...'` theo bảng chữ cái, nhưng mã băm của chúng thì không. **Đây không phải khiếm khuyết — đây chính là việc của hàm băm.** Muốn rải đều thì buộc phải xoá thứ tự đi.

Ghi nhớ dòng cuối. Toàn bộ phần còn lại của bài là hệ quả của nó.

### Ngăn (bucket): chỗ đặt mã băm

Mã băm là số rất lớn, còn số ngăn thì hữu hạn. Lấy phần dư:

```text
số ngăn = 1.024

hash('an@shop.vn')   = 3_918_402_119  →  % 1024  →  ngăn 967
hash('binh@shop.vn') =   842_003_771  →  % 1024  →  ngăn 891
```

Tra một email = tính băm (vài chục nano giây) → ra đúng số ngăn → đọc **một trang** → so từng mục trong trang đó. Xong.

```text
        ┌────────────────────────────────────────┐
        │ ngăn 0   │ ngăn 1   │ ... │ ngăn 1023  │  ← mỗi ngăn = 1 trang 8 KB
        └────┬─────┴──────────┴─────┴────────────┘
             │
     ┌───────▼───────────────────────────┐
     │ (3918402119, ctid 42:7)           │
     │ (1774829110, ctid 91:3)           │  ← các mục cùng rơi vào ngăn này
     │ (2098447301, ctid 12:1)           │
     └───────────────────────────────────┘
```

### Va chạm và trang tràn: chỗ `O(1)` bắt đầu nói dối

Hai giá trị khác nhau có thể cùng rơi vào một ngăn (**va chạm — collision**). Ngăn đầy thì database móc thêm **trang tràn (overflow page)**:

```text
  ngăn 967  ─→ [trang chính, đầy]  ─→ [trang tràn 1]  ─→ [trang tràn 2]
                     1 lần đọc          2 lần đọc          3 lần đọc
```

```text
Số lần đọc trang thực tế khi tra hash index:

  ngăn không tràn        : 1  ← đây là cái "O(1)" mà sách nói
  ngăn có 1 trang tràn   : 2
  ngăn dồn cục nặng      : 3, 4, 5 ...
```

Nên `O(1)` là **trung bình có điều kiện**, không phải bảo đảm. PostgreSQL chống dồn cục bằng **linear hashing**: khi tỷ lệ lấp đầy vượt ngưỡng, nó tách từng ngăn một (không dựng lại cả index), tự động và im lặng. Nhưng nếu dữ liệu bị lệch nặng — ví dụ 30% số dòng có cùng một giá trị — thì không hàm băm nào cứu được, mọi dòng đó **buộc phải** nằm cùng một ngăn.

> **Đây là điểm yếu cấu trúc, không phải lỗi cài đặt.** Với B-Tree, dữ liệu lệch không thành vấn đề: cây vẫn cân bằng vì nó cân theo *số lượng*, không cân theo *giá trị*.

### Thực tế đo được: `O(1)` thắng `O(log n)` bao nhiêu?

Đây là con số mà mọi người bỏ qua khi trích Big-O:

```text
Bảng 50 triệu dòng, index nằm trong RAM (buffer pool đủ lớn):

  B-Tree :  4 lần đọc trang (RAM) + ~40 phép so    ≈ 1,4 micro giây
  Hash   :  1 lần đọc trang (RAM) + 1 lần băm      ≈ 0,6 micro giây

  Chênh: ~0,8 micro giây MỖI LƯỢT TRA.
```

Bây giờ đặt con số đó cạnh phần còn lại của một câu truy vấn thật:

```text
  parse + plan câu lệnh          :   30 – 80 micro giây
  round-trip mạng app ↔ database :  200 – 500 micro giây
  heap fetch (đọc dòng thật)     :   50 – 200 micro giây
  ─────────────────────────────────────────────────────
  chênh lệch hash vs btree       :    0,8 micro giây   ← 0,2% tổng thời gian
```

> **Đính chính nguồn.** Bản gốc nói *"cây B thua chưa tới 1%"*. Con số đó đúng về tinh thần nhưng thiếu vế quan trọng: **1% của cái gì**. Nếu đo riêng thao tác tra index thì hash nhanh hơn 30-60%; nếu đo cả câu truy vấn từ app thì chênh lệch tụt về dưới 1%. Người phỏng vấn giỏi sẽ hỏi đúng chỗ này.

---

## Phần 2 — Câu hỏi thứ hai: món hàng thứ hai bạn vừa vứt đi

Người phỏng vấn hỏi tiếp:

> *"Được. Vậy màn hình danh sách của bạn — cái sắp theo ngày tạo mới nhất rồi lấy 20 dòng đầu — nó chạy thế nào trên index băm?"*

```sql
SELECT * FROM customers ORDER BY ngay_tao DESC LIMIT 20;
```

**Nó không chạy.** Index băm không giữ thứ tự nào cả, vì hàm băm **cố tình** đánh tan thứ tự đi. Hai giá trị kề nhau ra hai chỗ cách xa nhau.

Và đây là chỗ đáng nhớ nhất của bài:

> **Một index B-Tree bán cho bạn HAI món chứ không phải một:**
> - Món thứ nhất: **"Dòng nằm ở đâu?"**
> - Món thứ hai: **"Các dòng xếp theo thứ tự nào?"**

Món thứ hai đắt hơn bạn tưởng rất nhiều:

```text
Bảng 10 triệu dòng, lấy 20 dòng mới nhất:

CÓ thứ tự (B-Tree trên ngay_tao):
  nhảy tới lá cuối cùng → đi ngược 20 mục → dừng
  → đọc ~4 trang index + 20 heap fetch     ≈ 0,3 ms

KHÔNG có thứ tự (hash, hoặc không index):
  đọc hết 10.000.000 dòng
  → sort toàn bộ (hoặc top-N heapsort)
  → vứt đi 9.999.980 dòng
  → ~80.000 lần đọc trang + sort           ≈ 4.000 ms

  chậm hơn khoảng 13.000 lần.
```

Nhìn kỹ dòng cuối: chênh lệch ở món thứ nhất là **0,8 micro giây có lợi cho hash**; chênh lệch ở món thứ hai là **4 giây có lợi cho B-Tree**. Đó là tỷ lệ **1 ăn 5 triệu**.

Và món thứ hai không chỉ phục vụ `ORDER BY`. Nó phục vụ cả một họ:

| Truy vấn | B-Tree | Hash |
|---|---|---|
| `WHERE email = ?` | ✅ | ✅ |
| `WHERE ngay_tao > ?` | ✅ | ❌ quét bảng |
| `WHERE gia BETWEEN ? AND ?` | ✅ | ❌ |
| `WHERE ten LIKE 'Nguyễn%'` | ✅ | ❌ |
| `ORDER BY ngay_tao DESC LIMIT 20` | ✅ | ❌ |
| `MIN(gia)` / `MAX(gia)` | ✅ (đọc lá đầu/cuối) | ❌ quét bảng |
| `GROUP BY` (nhóm theo thứ tự sẵn) | ✅ có thể | ❌ |
| Merge join giữa hai bảng | ✅ | ❌ |
| Khoá ngoại `ON DELETE CASCADE` | ✅ | ✅ |
| `UNIQUE` | ✅ | ❌ **PostgreSQL không hỗ trợ** |
| Index nhiều cột | ✅ | ❌ **PostgreSQL chỉ cho 1 cột** |

Hai dòng cuối ít người biết, và chúng chặn hash index ở rất nhiều thiết kế thật: bạn **không thể** dùng hash index để ép ràng buộc duy nhất trên `email`, và **không thể** làm hash index trên `(customer_id, status)`.

---

## Phần 3 — Câu hỏi thứ ba: món thứ ba

> *"Được, vậy bỏ hẳn cái màn hình đó đi. Câu tra bằng email nhưng lấy về cả tên và ngày tạo — hai bên chạy khác nhau chỗ nào?"*

```sql
SELECT ten, ngay_tao FROM customers WHERE email = ?;
```

**B-Tree chứa được cột phụ đi kèm.** Tra xong là có đủ, trả lời thẳng, **không phải quay lại bảng lần nào**. Đó là *covering index* (index phủ):

```sql
-- Cách 1: đưa cột phụ vào khoá (chúng tham gia sắp xếp, index to hơn)
CREATE INDEX ON customers (email, ten, ngay_tao);

-- Cách 2: INCLUDE — cột chỉ "chở theo" ở tầng lá, không tham gia sắp xếp
CREATE INDEX ON customers (email) INCLUDE (ten, ngay_tao);
```

**Hash index thì không.** Nó chỉ giữ mã băm và một con trỏ. Muốn lấy `ten` với `ngay_tao`, nó **luôn** phải cầm con trỏ đó quay về bảng, **cho từng dòng một**.

```text
B-Tree phủ:   [tra index] ─────────────────────► xong
              1 lần đọc trang

Hash:         [tra index] ──► [heap fetch] ────► xong
              1 lần đọc      1 lần đọc NGẪU NHIÊN
                             (trang bất kỳ trong 80.000 trang)
```

Bước heap fetch là **đọc ngẫu nhiên** — trang đó có thể không nằm trong RAM. Chi phí thật:

```text
  heap fetch trúng buffer pool  : ~0,1 micro giây
  heap fetch trượt, phải đọc SSD: ~100 micro giây     ← gấp 1.000 lần

  Với bảng lớn hơn RAM, tỷ lệ trượt 20-50% là bình thường.
  Kỳ vọng: 0,3 × 100 = ~30 micro giây MỖI DÒNG.
```

Đặt lại lên bàn cân:

> **Băm tiết kiệm 0,8 micro giây ở bước tra, rồi trả lại 30 micro giây bằng một lần đọc heap thêm — cho mọi dòng, mọi lần chạy.**

Đây là một đánh đổi **đủ hai vế**. Và vế thứ hai lớn hơn vế thứ nhất khoảng 40 lần.

---

## Phần 4 — Vậy hash index thắng ở đâu? (chỗ transcript không kể)

Nói cho công bằng: hash index **có** chỗ thắng thật, và nó nằm ở nơi ít ai nhìn — **kích thước**.

B-Tree phải lưu **nguyên giá trị khoá** để còn so sánh mà sắp thứ tự. Hash index chỉ lưu **mã băm 4 byte**, bất kể giá trị gốc dài bao nhiêu.

```text
Bảng 10 triệu dòng, cột `url` TEXT trung bình 180 byte:

  B-Tree : ~10.000.000 × (180 + 12 overhead) ≈ 1.920 MB  →  thực tế ~2,1 GB
  Hash   : ~10.000.000 × (4 + 8 ctid + overhead) ≈ 220 MB →  thực tế ~340 MB

  Nhỏ hơn khoảng 6 lần.
```

Và kích thước không phải chuyện thẩm mỹ — nó quyết định **index có nằm vừa RAM hay không**, mà đó mới là ngưỡng lật thật sự của hiệu năng:

```text
  RAM dành cho buffer pool: 1 GB

  B-Tree 2,1 GB → không vừa → mỗi lần tra có thể phải đọc đĩa
  Hash   340 MB → vừa thoải mái → luôn trong RAM

  Lúc này hash nhanh hơn B-Tree KHÔNG PHẢI 0,8 micro giây,
  mà là cả trăm micro giây.
```

Nên bảng điều kiện đầy đủ để hash thắng gồm **bốn chữ KHÔNG và một chữ CÓ**:

```text
  ❌ KHÔNG cần thứ tự    (ORDER BY, MIN/MAX, merge join)
  ❌ KHÔNG cần khoảng    (>, <, BETWEEN, LIKE 'x%')
  ❌ KHÔNG cần index phủ (truy vấn chỉ tra ra ctid rồi vẫn phải về heap)
  ❌ KHÔNG cần UNIQUE / nhiều cột / khoá ngoại
  ✅ CÓ khoá rất dài, và index đang không vừa RAM
```

Bốn chữ KHÔNG đó hiếm hơn bạn nghĩ. Nhưng khi cả năm điều kiện cùng đúng — ví dụ bảng `cache` với khoá là URL dài, chỉ tra bằng `=`, không bao giờ liệt kê — thì hash index là lựa chọn đúng và bạn nên biết gọi tên nó ra.

```sql
-- Trường hợp hash index thật sự hợp lý
CREATE TABLE trang_cache (
    url        TEXT PRIMARY KEY,   -- ràng buộc unique do B-Tree của PK lo
    noi_dung   BYTEA,
    het_han_at TIMESTAMPTZ
);
CREATE INDEX idx_cache_url_hash ON trang_cache USING HASH (url);
-- ...nhưng ở đây PK đã có B-Tree rồi, nên hash thành thừa.
-- Bài học: rất nhiều lần bạn tưởng cần hash, hoá ra đã có sẵn B-Tree.
```

Một cách thay thế **thường tốt hơn** và không cần hash index chút nào:

```sql
-- Index B-Tree trên MD5 của khoá dài: khoá luôn 16 byte, cây thấp, vẫn có thứ tự
CREATE INDEX idx_cache_url_md5 ON trang_cache (md5(url));

SELECT * FROM trang_cache
 WHERE md5(url) = md5('https://rat-dai...')   -- đi index
   AND url      = 'https://rat-dai...';       -- so lại bản gốc, loại trùng băm
```

Cách này giữ được mọi món hàng của B-Tree (unique, nhiều cột, phủ) mà vẫn có khoá hẹp. Nói ra được phương án này trong phỏng vấn là dấu hiệu bạn đã nghĩ tới vế "cái giá".

---

## Phần 5 — Ba chỗ chữ "hash" gây nhầm nghiêm trọng

Đây là phần mở rộng ngoài transcript, và là chỗ gây hiểu nhầm nhiều nhất trong thực tế.

### 1. Hash **index** ≠ Hash **join**

Hai thứ hoàn toàn khác nhau, chỉ trùng chữ:

| | Hash index | Hash join |
|---|---|---|
| Là gì | **Cách lưu** trên đĩa | **Thuật toán chạy** trong RAM |
| Ai tạo | Bạn, bằng `CREATE INDEX` | Optimizer, tự chọn mỗi lần chạy |
| Sống bao lâu | Vĩnh viễn tới khi `DROP` | Vài mili giây rồi vứt |
| Thấy ở đâu | `\di`, `pg_indexes` | `EXPLAIN` → `Hash Join` |

Bạn thấy `Hash Join` trong `EXPLAIN` **không** có nghĩa là có hash index nào cả. Postgres dựng bảng băm tạm trong RAM từ bảng nhỏ hơn rồi quét bảng lớn qua nó. Đây là plan phổ biến nhất cho join bảng lớn, và nó chẳng liên quan gì tới cấu trúc index của bạn.

### 2. Hash index ≠ Adaptive Hash Index của InnoDB

MySQL/InnoDB **có** một thứ tên gần giống: *Adaptive Hash Index* (AHI). Khác biệt:

- Bạn **không tạo được nó**, và **không xoá được** (chỉ bật/tắt cả hệ bằng `innodb_adaptive_hash_index`).
- Nó **nằm trong RAM**, không ghi xuống đĩa, mất khi restart.
- InnoDB tự dựng nó khi thấy một tiền tố B-Tree bị tra đi tra lại rất nhiều.
- Nó **nằm trên** B-Tree, không thay thế B-Tree.

Và trên InnoDB, câu lệnh này **bị bỏ qua im lặng**:

```sql
CREATE INDEX idx ON t (col) USING HASH;   -- InnoDB: nhận, rồi tạo B+Tree
```

Không lỗi, không cảnh báo. Bạn nghĩ mình có hash index, thực tế bạn có B+Tree. Chỉ engine `MEMORY` mới thật sự tạo hash.

### 3. Hash index của database ≠ hash map trong ngôn ngữ

Trong RAM, hash map thắng cây gần như tuyệt đối — đó là lý do trực giác của mọi lập trình viên nói "hash nhanh hơn". Nhưng trên đĩa, hai chi phí sau xuất hiện và đảo ngược cán cân:

```text
  Trong RAM                          Trên đĩa (database)
  ─────────────────────              ──────────────────────────────────
  truy cập ngẫu nhiên gần như        truy cập ngẫu nhiên đắt gấp
  miễn phí                           1.000 lần truy cập tuần tự

  rehash cả bảng = vài ms            rehash = ghi lại hàng GB + WAL

  không cần bền vững                 phải chịu được mất điện giữa chừng
```

Đây là lý do sâu xa vì sao mặc định của database là B-Tree còn mặc định của ngôn ngữ lập trình là hash map. **Cùng một cấu trúc, hai môi trường, hai kết luận đúng.**

---

## Phần 6 — Trạng thái hash index ở từng hệ (2024+)

| Hệ | Có hash index? | Ghi chú quan trọng |
|---|---|---|
| PostgreSQL | Có (`USING HASH`) | **Trước PG 10 không ghi WAL** → mất sau crash, không sao chép sang replica. Từ PG 10 mới an toàn. Không hỗ trợ `UNIQUE`, không nhiều cột, không index phủ |
| MySQL/InnoDB | Không | `USING HASH` bị bỏ qua; chỉ có Adaptive Hash Index tự động trong RAM |
| MySQL/MEMORY | Có, **mặc định** | Engine tạm, mất khi restart |
| SQL Server | Có (Hash Index) | Chỉ trên bảng **memory-optimized** (In-Memory OLTP), phải khai `BUCKET_COUNT` |
| Oracle | Có (Hash Cluster) | Cấu trúc lưu bảng, không phải index thường |
| SQLite | Không | Chỉ B-Tree |

Dòng PostgreSQL đáng nhớ trong phỏng vấn: **hash index từng bị khuyến cáo "đừng dùng" suốt hơn 20 năm** không phải vì chậm, mà vì **không ghi WAL** — crash là index hỏng, và replica không có nó. Đó là ví dụ đẹp cho việc *một cấu trúc bị loại vì lý do vận hành, không phải lý do thuật toán*.

---

## Câu hỏi phỏng vấn

**"Cột chỉ tra bằng `=`, dùng hash index nhé?"** *(câu mở bài)*
Đừng trả lời nhanh hay chậm. Trả lời bằng **cái phải bỏ đi**, và nói thứ tự trước rồi mới nói tốc độ sau:
> *"Cột này hôm nay chỉ tra `=` thật. Nhưng B-Tree đang bán kèm hai thứ mà hash không có: **thứ tự** (nên `ORDER BY ... LIMIT`, `MIN/MAX`, merge join đều miễn phí) và **khả năng phủ** (`INCLUDE` để khỏi heap fetch). Với PostgreSQL còn mất thêm `UNIQUE` và index nhiều cột. Đổi lại được khoảng 0,5-1 micro giây mỗi lượt tra — dưới 1% thời gian một câu truy vấn thật. Em chỉ chọn hash khi khoá rất dài và index không vừa RAM, mà kể cả lúc đó em vẫn cân nhắc B-Tree trên `md5(cột)` để giữ lại các món kia."*

**"Vì sao PostgreSQL mặc định B-Tree dù hash `O(1)` nhanh hơn?"**
Vì `O(1)` chỉ đúng cho **một** trong bốn nhóm truy vấn thật (bằng / khoảng / thứ tự / phủ), và chênh lệch ở nhóm đó nhỏ hơn chi phí mạng và heap fetch cả trăm lần. Mặc định phải chọn cấu trúc **tổng quát nhất**, không phải cấu trúc **nhanh nhất trong một trường hợp**.

**"Thấy `Hash Join` trong `EXPLAIN`, có nghĩa là có hash index không?"**
Không. Hash join là thuật toán chạy, dựng bảng băm tạm trong RAM rồi vứt. Hash index là cách lưu trên đĩa. Trùng chữ, khác hẳn tầng.

**"Khi nào bạn thật sự sẽ đánh hash index?"**
Khi đủ năm điều kiện: chỉ `=`, không cần thứ tự, không cần phủ, không cần unique/nhiều cột, và khoá dài tới mức B-Tree không vừa RAM. Trong đời thật gặp rất hiếm, và thường có phương án thay thế tốt hơn là B-Tree trên băm của cột.

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Sự thật |
|---|---|---|
| Chọn hash vì "O(1) nhanh hơn O(log n)" | Mất `ORDER BY`, `BETWEEN`, `MIN/MAX` | Chênh lệch dưới 1% một câu truy vấn thật |
| `USING HASH` trên InnoDB | Tưởng có hash, thật ra có B+Tree | InnoDB bỏ qua im lặng |
| Dùng hash index để ép `UNIQUE` trên Postgres | Báo lỗi khi tạo | Hash không hỗ trợ `UNIQUE` |
| Hash index trên `(a, b)` | Báo lỗi khi tạo | Postgres chỉ cho hash một cột |
| Dùng hash index trên PG 9.x rồi crash | Index hỏng, replica không có | Trước PG 10 hash không ghi WAL |
| Nghĩ hash miễn nhiễm với dữ liệu lệch | Ngăn dồn cục, chuỗi trang tràn dài | B-Tree cân theo số lượng nên không bị |
| Thấy `Hash Join` rồi đi tìm hash index | Tìm nhầm tầng | Hai khái niệm khác nhau hoàn toàn |
| Nghĩ index băm nhỏ hơn nên luôn tốt hơn | Bỏ mất chi phí heap fetch cho mọi dòng | Nhỏ chỉ đáng giá khi nó là thứ quyết định vừa RAM |

---

## Tóm tắt bài 3

- Hàm băm **cố tình phá huỷ thứ tự** để rải đều. Đó không phải khiếm khuyết — đó là định nghĩa công việc của nó, và cũng là gốc của mọi thứ hash index không làm được.
- Một index B-Tree bán **hai món**: *"dòng nằm ở đâu"* và *"các dòng xếp theo thứ tự nào"*. Chọn hash là **vứt món thứ hai**, cộng với món thứ ba là khả năng **phủ** (`INCLUDE`).
- Cán cân thật: hash thắng ~0,8 micro giây ở bước tra, rồi thua ~30 micro giây vì heap fetch bắt buộc, và thua **hàng nghìn lần** ở mọi truy vấn cần thứ tự.
- `O(1)` của hash là **trung bình có điều kiện**: va chạm và trang tràn kéo nó lên 2-5 lần đọc, và dữ liệu lệch thì không hàm băm nào cứu được.
- PostgreSQL: hash **không** hỗ trợ `UNIQUE`, **không** nhiều cột, **không** index phủ; và trước PG 10 **không ghi WAL** — đó mới là lý do thật khiến nó bị khuyến cáo suốt hai thập kỷ.
- Hash **thật sự** thắng ở một chỗ: **khoá rất dài** làm B-Tree phình vượt RAM. Nhưng ngay cả khi đó, B-Tree trên `md5(cột)` thường là câu trả lời tốt hơn vì giữ lại được cả ba món.
- Ba chữ "hash" khác nhau hay bị lẫn: **hash index** (cách lưu), **hash join** (thuật toán chạy), **adaptive hash index** (bộ nhớ đệm tự động của InnoDB).

**Bài kế tiếp** → [Bài 4: Bitmap index và cột chỉ có bốn giá trị](04-bitmap-index-va-cot-it-gia-tri.md)
