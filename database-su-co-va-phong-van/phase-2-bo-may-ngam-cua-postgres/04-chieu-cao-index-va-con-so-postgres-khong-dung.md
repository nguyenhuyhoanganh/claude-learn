# Bài 11: Chiều cao index và con số Postgres không dùng

Một index gần như chỉ còn rác — **99,98% là trang chết**. Vậy mà nó trả về một khoá với **ít việc hơn** hồi còn đầy dữ liệu.

Chuyện bắt đầu bằng việc ai cũng làm: xoá một đống dữ liệu cũ, chạy `VACUUM`, rồi mở câu lệnh kiểm tra index xem đã gọn lại chưa:

```sql
SELECT tree_level FROM pgstatindex('idx_don_hang_ngay');
--  → 2
```

Con số chiều cao vẫn **2** — không đổi. Thế là thở dài, xếp lịch dựng lại index (`REINDEX`) vào cuối tuần.

Nhưng chạy thử một lượt tra khoá thì thấy: nó chỉ còn đọc **1 trang**, thay vì **3 trang** hồi bảng còn đủ dữ liệu.

> **Con số bạn nhìn không sai. Nó chỉ không phải con số Postgres dùng.**

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ |
|---|---|---|
| **B-Tree** | Cấu trúc cây mà hầu hết index dùng: từ gốc đi xuống lá, mọi lá cách gốc đúng số bước như nhau | Mục lục nhiều tầng: mục lục lớn → mục lục nhỏ → trang thật |
| **Trang** (page) | Đơn vị đọc/ghi 8 KB của PostgreSQL | Một tờ giấy |
| **Tầng / `tree_level`** | Số tầng của cây. Mỗi tầng tốn đúng **một lần đọc trang** | Số lần phải lật mục lục trước khi tới trang cần |
| **Lá** (leaf page) | Trang tầng dưới cùng, chứa khoá thật và con trỏ tới dòng dữ liệu | Trang có nội dung thật |
| **Trang chết** (dead/deleted page) | Trang đã bị xoá logic nhưng **vẫn nằm trong file index** | Trang đã xé nội dung nhưng giấy vẫn kẹp trong cuốn sổ |
| **Bloat** (phình rác) | Phần dung lượng index/bảng bị chiếm bởi trang chết và chỗ trống | Cuốn sổ dày lên vì nhiều trang trắng xen giữa |
| **Metapage** | Trang **đầu tiên** của mọi index B-Tree, chứa thông tin điều hướng | Trang bìa lót ghi "mục lục bắt đầu ở trang mấy" |
| **Fast Root** | Con trỏ tới tầng thấp nhất **chỉ còn đúng một trang** — nơi mọi thao tác thật sự bắt đầu tìm | Lối tắt: "khỏi đi qua ba tầng rỗng, vào thẳng đây" |
| **`VACUUM`** | Tiến trình dọn dòng chết, đánh dấu chỗ trống để tái sử dụng | Dọn dẹp, đánh dấu chỗ trống để lần sau ghi đè |
| **`REINDEX`** | Dựng lại index từ đầu, trả lại dung lượng cho hệ điều hành | Chép lại cả cuốn mục lục ra sổ mới, bỏ trang trắng |
| **`fillfactor`** | Phần trăm một trang được lấp đầy khi dựng index. Mặc định 90 cho B-Tree | Chép mục lục nhưng chừa 10% mỗi trang để sau chèn thêm |
| **`avg_leaf_density`** | Tỷ lệ lấp đầy trung bình của **các lá còn sống** | Các trang còn nội dung thì đầy bao nhiêu phần |

## Chặng 1 — Vì sao xoá dữ liệu không làm cây thấp lại

Cây B-Tree tìm một khoá bằng cách **đi từ trên xuống**:

```text
                    ┌──────────┐
      Tầng gốc      │   GỐC    │           ← lần đọc thứ 1
                    └────┬─────┘
              ┌──────────┼──────────┐
              ▼          ▼          ▼
      Tầng giữa   [ nhánh ] [ nhánh ] [ nhánh ]    ← lần đọc thứ 2
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
      Tầng lá   [ lá ]  [ lá ]  [ lá ]       ← lần đọc thứ 3: TÌM THẤY
```

Mỗi tầng tốn **đúng một lần đọc**, và mỗi lần đọc lấy lên **một trang 8 KB**.

Cây 3 tầng thì tra khoá nào cũng mất 3 lần đọc. Khoá nằm ở đâu cũng vậy — **đó chính là nghĩa của chữ "cân bằng" (Balanced) trong tên B-Tree**.

### Thế xoá bớt dữ liệu đi thì cây có thấp lại không?

**Không bao giờ.**

Tài liệu thiết kế nằm ngay trong mã nguồn PostgreSQL (`src/backend/access/nbtree/README`) nói thẳng một luật: **trang ngoài cùng bên phải của bất kỳ tầng nào không bao giờ bị xoá — kể cả trang gốc.**

Hệ quả: chiều cao cây **không thể giảm**. Sau một đợt xoá lớn, cây thành hình cái que:

```text
   ═══ TRƯỚC KHI XOÁ ═══════════════════════════════════════════

                    [ GỐC ]                    tầng 2
              ┌────────┼────────┐
          [nhánh]  [nhánh]  [nhánh]            tầng 1
          ╱  │  ╲   ╱ │ ╲    ╱ │ ╲
        [lá][lá][lá][lá][lá][lá][lá][lá]       tầng 0
        → tra một khoá: 3 lần đọc


   ═══ SAU KHI XOÁ 99,98% DỮ LIỆU ══════════════════════════════

                    [ GỐC ]                    tầng 2  ← vẫn ở đây!
                       │
                   [nhánh]                     tầng 1  ← CHỈ CÒN 1 TRANG
                       │
                    [ lá ]                     tầng 0  ← CHỈ CÒN 1 TRANG

        Gốc vẫn ngồi ở tầng 2, nhưng dưới nó là mấy tầng
        chỉ còn đúng một trang.

        → Mỗi tầng như vậy là MỘT LẦN ĐỌC HOÀN TOÀN VÔ ÍCH:
          đọc lên chỉ để biết "đi tiếp xuống dưới".
```

## Chặng 2 — Mẹo Fast Root: hai cặp con trỏ trong Metapage

PostgreSQL gỡ chuyện này bằng một mẹo mượn của **Lanin & Shasha** (hai tác giả mà phần logic xoá trang của `nbtree` lấy ý tưởng từ đó).

Ý tưởng rất đơn giản:

```text
   Ghi nhớ TẦNG THẤP NHẤT CHỈ CÒN ĐÚNG MỘT TRANG,
   gọi đó là FAST ROOT.

   Từ đó, mọi thao tác bắt đầu tìm TỪ CHỖ NÀY thay vì từ gốc thật
   → nhảy cóc qua mấy tầng rỗng.
```

Vì sao không sửa thẳng gốc thật cho gọn? **Vì gốc thật chính là trang ngoài cùng bên phải của tầng nó — mà luật vừa nói là không bao giờ xoá.**

Nên PostgreSQL để nguyên con trỏ cũ, rồi **đẻ thêm con trỏ thứ hai**. Cả hai cùng ghi vào Metapage (trang đầu tiên của index):

```text
   ┌─────────── METAPAGE (trang 0 của index) ───────────┐
   │                                                     │
   │   btm_root       →  gốc THẬT                        │
   │   btm_level      →  tầng của gốc thật      = 2      │
   │                                                     │
   │   btm_fastroot   →  FAST ROOT                       │
   │   btm_fastlevel  →  tầng của fast root     = 0      │
   │                                                     │
   └─────────────────────────────────────────────────────┘
```

### Sự thật vỡ ra

```text
   Khi Postgres THỰC SỰ đi tìm một khoá,
   hoặc khi nó ước tính chi phí cho planner:
        → nó đọc con trỏ  btm_fastroot / btm_fastlevel

   Còn hàm pgstatindex (câu lệnh chép trên mạng)
        → trả về chiều cao của GỐC THẬT: btm_level
```

> **Con số nằm trên dashboard của bạn không nằm trên đường đi nào của Postgres lúc chạy câu lệnh.**

Đây là lý do nghịch lý ở đầu bài xảy ra: `tree_level` vẫn báo 2, nhưng thao tác thật chỉ tốn 1 lần đọc — vì nó xuất phát từ fast root ở tầng 0.

### Và đây là chỗ mẹo đó KHÔNG cứu được bạn

Fast Root chỉ giúp khi các tầng trên **teo lại còn đúng một trang**. Nếu bạn xoá **thưa** — mỗi trang lá vẫn còn sót vài dòng — thì cây vẫn rộng, và fast root **trùng với gốc thật**:

```text
   ═══ XOÁ SẠCH (mọi dòng trong một khoảng) ════════════════════
      Nhiều trang lá trống hoàn toàn → bị gỡ khỏi cây
      → tầng trên teo lại còn 1 trang → fastroot tụt xuống
      → tra khoá NHANH HƠN trước

   ═══ XOÁ THƯA (rải rác khắp nơi) ═════════════════════════════
      Mỗi trang lá vẫn còn sót vài dòng → KHÔNG trang nào bị gỡ
      → cây vẫn rộng y nguyên → fastroot == root
      → vẫn phải đi đủ 3 tầng, NHƯNG mỗi trang chỉ còn vài dòng thật

      Ví dụ đo được: dữ liệu thực tế chỉ cần 96 lá,
      nhưng bị rải ra 13.202 lá  →  GẤP 137 LẦN.
```

**Kiểu xoá quyết định kết quả, không phải lượng xoá.** Và kiểu xoá thưa mới là kiểu phổ biến trong đời thật (xoá theo trạng thái, xoá theo người dùng, xoá theo điều kiện nghiệp vụ).

Đây đúng là kịch bản mà tài liệu PostgreSQL cảnh báo trong mục *routine reindexing*: khoá bị xoá rải rác làm lãng phí không gian, và tài liệu khuyến nghị `REINDEX` định kỳ trong trường hợp đó.

## Chặng 3 — Chỉ số `avg_leaf_density` còn chơi trớ hơn

Chỉ số hay được đem ra quyết định cùng với chiều cao là **độ đầy của lá**:

```sql
SELECT avg_leaf_density, leaf_pages, deleted_pages
  FROM pgstatindex('idx_don_hang_ngay');
```

Nghe tên thì tưởng nó đo mức lãng phí. **Không phải.**

```text
   avg_leaf_density LOẠI HẲN TRANG CHẾT ra khỏi CẢ TỬ SỐ LẪN MẪU SỐ.
   Nó chỉ tính trên đám lá CÒN SỐNG.

   Nó trả lời câu hỏi:
      "Mấy cái lá còn sống đang đầy bao nhiêu phần?"

   Nó KHÔNG sinh ra để đo rác.
```

Hệ quả rất ngược đời:

```text
   Index càng nhiều trang chết
      → mẫu số càng "sạch" (chỉ còn lá sống)
      → CON SỐ BÁO CÁO CÀNG ĐẸP.

   Bạn nhìn thấy avg_leaf_density = 89% và yên tâm,
   trong khi 90% dung lượng file index là trang chết.
```

### Vậy ngưỡng bao nhiêu mới đáng lo?

```text
   ✗ Tài liệu chính thức của PostgreSQL:  KHÔNG ĐƯA RA NGƯỠNG NÀO.

   ✓ Laurenz Albe (người trong nhóm phát triển Postgres), trên mailing list:
        độ đầy khoảng 30% là HOÀN TOÀN BÌNH THƯỜNG với một cây B-Tree.

   ✗ Các bài hướng dẫn trôi nổi trên mạng:
        dưới 60%... dưới 70%... thậm chí dưới 80% là phải REINDEX ngay!
        → CHÊNH NHAU HƠN 2 LẦN so với con số của người trong nhóm phát triển.
```

Và một mốc đáng nhớ: **mức đầy mặc định khi vừa dựng xong một index B-Tree đã là 90%** (`fillfactor = 90`) — tức PostgreSQL **cố tình** chừa sẵn 10% trống để sau này chèn thêm khỏi phải tách trang.

Nghĩa là: một index vừa `REINDEX` xong đã không đạt ngưỡng "phải trên 95%" mà một số bài viết đưa ra.

## Chặng 4 — Thí nghiệm thực tế và hai sự thật khó chịu

### Sự thật 1: `VACUUM` không trả dung lượng về cho hệ điều hành

```text
   Xoá sạch một bảng lớn → chạy VACUUM
      → 193 MiB rác vẫn nằm nguyên trong file index.
      → VACUUM KHÔNG trả trang nào về cho hệ điều hành.
```

`VACUUM` chỉ **đánh dấu chỗ trống để tái sử dụng**. Nó chỉ trả dung lượng về hệ điều hành trong đúng một trường hợp: khi các trang trống nằm **liền một dải ở cuối file** (thì nó cắt đuôi file).

Với index thì trang trống gần như không bao giờ nằm gọn ở cuối. Nên trong thực tế: **`VACUUM` không làm index nhỏ lại.**

```text
   VACUUM         →  chỗ trống được TÁI SỬ DỤNG (ghi đè lên được)
   VACUUM FULL    →  dựng lại bảng+index, TRẢ dung lượng, nhưng KHOÁ TOÀN BỘ BẢNG
   REINDEX        →  dựng lại index, TRẢ dung lượng
   pg_repack      →  như VACUUM FULL nhưng không khoá lâu (extension bên ngoài)
```

### Sự thật 2: rác index tích lại nhanh hơn bạn tưởng

GitLab chạy tác vụ `REINDEX` định kỳ vào cuối tuần trên hệ thống thật, và họ giới hạn rất cẩn thận (chỉ làm một số index, giới hạn kích thước mỗi lượt). Năm 2020 họ ước tính rác index tích lại **khoảng 500 GB sau 3 tháng**.

Đó là một công ty có đội database chuyên trách. Nếu bạn chưa từng nghĩ tới chuyện này, hệ của bạn nhiều khả năng cũng đang tích rác tương tự — chỉ là chưa ai đo.

### Cái giá của `REINDEX CONCURRENTLY`

`REINDEX CONCURRENTLY` là phiên bản **không khoá ghi** — nghe như bữa trưa miễn phí. Không phải:

```text
   ① Phải quét bảng HAI LƯỢT cho mỗi index
      (một lượt dựng, một lượt bắt các thay đổi xảy ra trong lúc dựng).

   ② Phải CHỜ mọi giao dịch liên quan kết thúc — cả trước và sau.
      Một giao dịch mở từ 3 tiếng trước là nó đứng chờ 3 tiếng.

   ③ NẾU HỎNG GIỮA CHỪNG: để lại một index hỏng (INVALID) nằm đó.
      Index đó KHÔNG phục vụ câu lệnh nào,
      NHƯNG VẪN ĂN CHI PHÍ CPU/ĐĨA MỖI LẦN GHI.
      → Tức là bạn có phần tệ nhất của cả hai thế giới.
```

Phải luôn kiểm tra sau khi chạy:

```sql
-- Tìm index INVALID (hỏng giữa chừng) — nên chạy sau mọi lần REINDEX CONCURRENTLY
SELECT i.indexrelid::regclass AS index_hong,
       i.indrelid::regclass   AS thuoc_bang,
       pg_size_pretty(pg_relation_size(i.indexrelid)) AS kich_thuoc
  FROM pg_index i
 WHERE NOT i.indisvalid;

-- Dọn: DROP INDEX CONCURRENTLY <ten_index_hong>;
```

## Vậy quyết định `REINDEX` bằng cái gì?

Nếu chỉ giữ lại một thứ từ bài này:

> **Đừng quyết định `REINDEX` bằng chiều cao (`tree_level`) hay bằng ngưỡng chép trên mạng.**

### Cách làm đúng — hai chỉ số, đo chứ không đoán

**① Đo số trang THẬT SỰ đọc**

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM don_hang WHERE ngay_tao = '2026-08-01';
```

```text
   Buffers: shared hit=3      ← index khoẻ: 3 trang cho một lượt tra
   Buffers: shared hit=847    ← có vấn đề thật: đang lê qua rác
```

Đây là con số **nằm đúng trên đường đi của Postgres**, khác hẳn `tree_level`.

**② Theo dõi kích thước index theo thời gian**

Câu hỏi không phải *"index này có rác không"* (index nào cũng có rác), mà là *"nó đang **xấu dần** hay đã **đứng lại**?"*

```sql
-- Chạy hằng ngày, ghi vào một bảng lịch sử
SELECT now()                                        AS luc_do,
       indexrelname                                 AS ten_index,
       pg_relation_size(indexrelid)                 AS byte,
       idx_scan                                     AS so_lan_duoc_dung
  FROM pg_stat_user_indexes
 WHERE schemaname = 'public';
```

```text
   Index phình đều rồi ĐỨNG LẠI ở một mức
      → bình thường. Đó là trạng thái cân bằng: chỗ trống sinh ra
        và được tái sử dụng với tốc độ ngang nhau. ĐỪNG ĐỘNG VÀO.

   Index phình LIÊN TỤC không có dấu hiệu dừng
      → có vấn đề thật. Nhưng hãy tìm NGUYÊN NHÂN trước khi REINDEX:
        thường là một giao dịch mở quá lâu, hoặc một replication slot
        bị bỏ quên, khiến VACUUM không được phép dọn gì.
        (Xem Bài 12.)
```

Vế cuối rất quan trọng: **`REINDEX` chữa triệu chứng.** Nếu nguyên nhân là VACUUM bị chặn, thì tuần sau rác lại quay về đúng như cũ.

### Hai cải tiến gần đây làm giảm nhu cầu REINDEX

Nếu bạn đang chạy phiên bản cũ, đây là lý do đáng nâng cấp:

| Phiên bản | Cải tiến | Giúp gì |
|---|---|---|
| **PostgreSQL 13** | **B-Tree deduplication** — nhiều dòng cùng một giá trị khoá được gom chung một mục | Index trên cột ít giá trị khác nhau (trạng thái, loại, cờ) nhỏ đi rất nhiều |
| **PostgreSQL 14** | **Bottom-up index deletion** — dọn rác index tại chỗ ngay khi trang sắp đầy | Giảm mạnh phình rác do `UPDATE` lặp lại trên cùng dòng |

Lưu ý một giới hạn quan trọng của cải tiến PG 14: nó **chỉ áp dụng cho những index KHÔNG bị câu lệnh `UPDATE` sửa tới**. Nếu bạn liên tục cập nhật đúng cột nằm trong index, cơ chế này không giúp được — và đó chính là cái bẫy của hàng đợi chạy trên database, mổ kỹ ở [Bài 17](../phase-4-thu-tu-va-quy-mo/02-hang-doi-tren-postgres-hong-o-dau.md).

## Bẫy thường gặp

| Bẫy | Vì sao hỏng | Cách sửa |
|---|---|---|
| Quyết định `REINDEX` bằng `tree_level` | Đó là chiều cao **gốc thật**, Postgres dùng **fast root** | Đo `Buffers` bằng `EXPLAIN (ANALYZE, BUFFERS)` |
| Tin `avg_leaf_density` đo mức rác | Nó loại trang chết khỏi cả tử số lẫn mẫu số → càng rác càng đẹp | Theo dõi **kích thước index theo thời gian** |
| Dùng ngưỡng 70–80% chép trên mạng | Người trong nhóm phát triển nói ~30% là bình thường; và `fillfactor` mặc định chỉ 90 | Không dùng ngưỡng cố định |
| Tưởng `VACUUM` làm index nhỏ lại | `VACUUM` chỉ đánh dấu chỗ trống để tái sử dụng | `REINDEX` / `pg_repack` nếu thật sự cần trả dung lượng |
| Chạy `REINDEX CONCURRENTLY` rồi không kiểm tra | Hỏng giữa chừng để lại index INVALID vẫn tốn chi phí ghi | Luôn kiểm `pg_index WHERE NOT indisvalid` |
| `REINDEX` mà không tìm nguyên nhân | Giao dịch dài / replication slot bỏ quên → tuần sau rác quay lại | Kiểm `pg_stat_activity` và `pg_replication_slots` trước |
| `VACUUM FULL` trên production giờ cao điểm | Khoá **toàn bộ bảng**, không ai đọc ghi được | `REINDEX CONCURRENTLY` hoặc `pg_repack` |
| `REINDEX` mọi index cho "sạch" | Tốn I/O khổng lồ, và phần lớn index vốn đã ở trạng thái cân bằng | Chỉ đụng index đang phình liên tục |
| Bỏ qua index chưa bao giờ được dùng | `REINDEX` một index `idx_scan = 0` là lãng phí hoàn toàn | Kiểm `idx_scan` trước — nên **xoá** chứ không phải dựng lại |

## Nguồn và kiểm chứng

- Cơ chế Fast Root và bốn trường `btm_root` / `btm_level` / `btm_fastroot` / `btm_fastlevel` nằm trong `src/include/access/nbtree.h`, kèm mô tả trong `src/backend/access/nbtree/README`. Luật "trang ngoài cùng bên phải của mỗi tầng không bao giờ bị xoá" cũng ở đó.
- `pgstatindex()` trả `tree_level` lấy từ **`btm_level`** (gốc thật), trong khi thao tác tìm kiếm và ước tính chi phí đi từ **`btm_fastroot`**.
- `fillfactor` mặc định của B-Tree là **90**.
- GitLab: rác index ước tính **~500 GB sau 3 tháng** (2020), và họ chạy tác vụ reindex định kỳ vào cuối tuần với giới hạn chặt về số lượng và kích thước mỗi lượt.
- Các con số thí nghiệm (193 MiB rác sau khi xoá sạch; 96 lá cần thiết bị rải ra 13.202 lá) trích từ thí nghiệm công khai của Franck Pachot (tháng 7/2026) — **hãy tự dựng lại trên dữ liệu của bạn** thay vì dùng làm ngưỡng.

## Tóm tắt bài 11

- **Chiều cao B-Tree không bao giờ giảm khi xoá dữ liệu** — vì trang ngoài cùng bên phải của mỗi tầng không bao giờ bị xoá.
- PostgreSQL bù bằng **Fast Root**: con trỏ thứ hai trong Metapage, trỏ tới tầng thấp nhất chỉ còn một trang. **Mọi thao tác thật đi từ đây.**
- **`pgstatindex.tree_level` trả về chiều cao GỐC THẬT — con số Postgres không dùng khi chạy câu lệnh.**
- **Kiểu xoá quyết định kết quả, không phải lượng xoá.** Xoá sạch một khoảng thì cây teo và tra nhanh hơn; xoá thưa rải rác thì cây vẫn rộng mà mỗi lá chỉ còn vài dòng.
- **`avg_leaf_density` loại trang chết ra khỏi phép tính** → index càng rác, con số càng đẹp. Nó không sinh ra để đo rác.
- Tài liệu chính thức **không đưa ngưỡng nào**. Người trong nhóm phát triển nói ~30% là bình thường; `fillfactor` mặc định vốn chỉ 90.
- **`VACUUM` không trả dung lượng index về hệ điều hành.** Chỉ `REINDEX` / `VACUUM FULL` / `pg_repack` làm được.
- **`REINDEX CONCURRENTLY` quét bảng hai lượt, phải chờ mọi giao dịch liên quan, và nếu hỏng thì để lại index INVALID vẫn ăn chi phí ghi.**
- Quyết định bằng **hai chỉ số đo được**: số trang thật sự đọc (`EXPLAIN (ANALYZE, BUFFERS)`), và **kích thước index theo thời gian** — phình rồi đứng lại là bình thường, phình mãi mới là có vấn đề.

**Bài kế tiếp** → [Bài 12: Bộ đếm 32 bit và cánh cửa ghi tự đóng](05-bo-dem-32-bit-va-cua-ghi-tu-dong.md)
