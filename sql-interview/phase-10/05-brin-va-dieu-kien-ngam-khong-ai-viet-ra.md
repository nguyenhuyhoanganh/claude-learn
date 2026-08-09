# Bài 5: BRIN — index nặng 700 KB thay cho 8 GB, và cái đêm nó lặng lẽ thành vô dụng

**8 giờ 5 phút sáng thứ Ba.** Giám đốc mở trang báo cáo doanh thu. Vòng quay chạy, chạy mãi. 30 giây sau, trang trả về lỗi hết giờ chờ.

Hôm qua, chính trang đó ra kết quả trong **0,9 giây**. Không ai triển khai gì. Không ai sửa một dòng cấu hình nào. Cùng câu lệnh, cùng bảng, hôm nay **6 phút**. Chậm hơn **400 lần**.

Index vẫn nằm nguyên đó, đúng cái tên đó. Và nó chỉ nặng **700 KB** thay cho **8 GB** của một index B-Tree tương đương. Nhỏ hơn 11.000 lần, mà hôm qua còn nhanh hơn mọi thứ.

Trong đúng một đêm, nó thành vô dụng — **mà không có một dòng lỗi nào**.

Bài này là một vụ án. Ta sẽ thu bằng chứng trước, loại từng nghi phạm bằng phép đo, rồi mới kết luận. Vì **ai suy luận trước khi thu đủ bằng chứng thì chỉ đi tìm thứ mình đã tin sẵn**.

---

## Phần 1 — Thu bằng chứng: bốn mẩu ghim lên bảng

Chưa suy luận gì cả. Bốn mẩu, đánh số.

### Mẩu 1 — Kế hoạch chạy không đổi một chữ

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT ... FROM giao_dich WHERE ngay >= now() - interval '7 days';
```

```text
Bitmap Heap Scan on giao_dich  (actual time=... rows=3120044 loops=1)
  Recheck Cond: (ngay >= ...)
  Rows Removed by Index Recheck: 512884301          ← ghim con số này lại
  Heap Blocks: lossy=4194304
  ->  Bitmap Index Scan on idx_gd_ngay_brin  (actual time=118 ...)
        Index Cond: (ngay >= ...)
```

Máy **vẫn đi qua index BRIN**, đúng như hôm qua. Nên ai xem cũng kết luận ngay: *"index vẫn đang được dùng, vậy index không phải vấn đề"*.

### Mẩu 2 — Bảng nhận rất nhiều lượt sửa, nhưng gần như không to thêm

```text
7 ngày qua:
  dòng mới thêm  :  3.100.000
  lượt UPDATE    : 41.000.000        ← gấp hơn 13 lần số dòng mới
  cỡ bảng tăng   :  +1,5%
```

### Mẩu 3 — Nó chậm đều mọi lúc

3 giờ sáng, không còn ai dùng hệ thống. Chạy lại: vẫn **đúng 6 phút**. Không một phiên nào đang chờ khoá.

### Mẩu 4 — Nhật ký bảo trì đêm mùng 4

Đội trực chạy *"một lệnh dọn bảng"*. Sáng mùng 5, báo cáo nhanh lại đúng **0,9 giây**. Ba ngày sau, chậm y hệt — **6 phút trở lại**.

> Bốn mẩu trên bảng, bốn nghi phạm sắp đi qua. Nói trước một câu: **mọi thứ cần để giải vụ này đều đã nằm trên bảng ngay lúc này.**

---

## Phần 2 — Loại từng nghi phạm bằng phép đo

Nguyên tắc: mỗi nghi phạm phải kèm **một dự đoán kiểm chứng được**. Nếu phép đo không khớp dự đoán, gạch tên. Không tranh luận.

### Nghi phạm A — Phình bảng (table bloat)

Gần như ai cũng chỉ vào nó trước, và mẩu 2 chống lưng rất mạnh: **41 triệu lượt sửa**.

Cơ chế nghe cực kỳ hợp lý: PostgreSQL dùng **MVCC** — nó **không sửa dòng tại chỗ**. Mỗi lần `UPDATE`, nó bỏ bản cũ lại đó (dead tuple) rồi ghi một bản mới. 41 triệu lượt sửa là 41 triệu bản bỏ lại. Bản cũ nằm lại thì bảng to ra, bảng to ra thì đọc lâu hơn.

**Dự đoán nếu A đúng:** cỡ bảng hôm nay phải **nhảy vọt** so với tuần trước.

```sql
SELECT pg_size_pretty(pg_total_relation_size('giao_dich')) AS co_bang,
       n_dead_tup, n_live_tup,
       round(100.0 * n_dead_tup / NULLIF(n_live_tup, 0), 1) AS phan_tram_chet,
       last_autovacuum
  FROM pg_stat_user_tables WHERE relname = 'giao_dich';
```

```text
  tuần trước : 33,6 GB
  hôm nay    : 34,1 GB      →  +1,5%
  dead tuple : 2,4%         →  autovacuum vẫn đang dọn tốt mỗi đêm
```

Một cái bảng to thêm 1,5% **không làm gì chậm đi 400 lần**. **Gạch tên A.**

> Nhưng **giữ lại con số 41 triệu**. Nó sẽ quay lại ở cuối phim mang một nghĩa hoàn toàn khác.

### Nghi phạm B — Thống kê cũ

Kinh điển hơn nhiều, và ai làm database lâu cũng đã ăn cú này. Bộ tối ưu **không đọc dữ liệu**, nó đọc một **bản tóm tắt**. Tóm tắt lệch thì nó ước sai số dòng rồi chọn kế hoạch tệ. Và nó khớp đúng cái mốc "một đêm" — vì `autoanalyze` chạy ban đêm.

**Dự đoán nếu B đúng:** kế hoạch hôm nay phải **khác** kế hoạch hôm qua.

```sql
ANALYZE giao_dich;
EXPLAIN (ANALYZE, BUFFERS) SELECT ... ;   -- so từng dòng với bản hôm qua
```

```text
  diff hai kế hoạch : giống nhau từng dòng
  vẫn đi qua đúng index BRIN đó, cùng kiểu quét, cùng thứ tự
  sau ANALYZE thủ công, chạy lại: 6 phút, y nguyên
  (mà bản thống kê đã được cập nhật từ 02:15 sáng nay)
```

**Gạch tên B.** Kế hoạch không đổi thì đây không phải chuyện của bộ tối ưu — nó vẫn đang chọn đúng thứ nó chọn hôm qua.

> **Quy tắc rút ra, dùng được cho mọi vụ về sau:** thống kê cũ làm **đổi kế hoạch**. Kế hoạch **không đổi** mà thời gian đổi 400 lần thì thủ phạm nằm ở **dữ liệu**, không nằm ở optimizer.

### Nghi phạm C — Khoá chờ (lock contention)

Dễ tin nhất, vì nó giải thích đúng cái cảm giác: *"câu lệnh không chậm, nó đứng chờ"*. Sáu phút đó có thể là sáu phút xếp hàng.

**Dự đoán nếu C đúng:** lúc vắng người nó phải nhanh trở lại. Mẩu 3 đã đo đúng vào chỗ đó.

```sql
SELECT pid, state, wait_event_type, wait_event, now() - query_start AS chay_duoc
  FROM pg_stat_activity WHERE state <> 'idle';
```

```text
  03:00 — trong bảng phiên đang chạy có ĐÚNG 1 dòng: câu lệnh của ta.
          wait_event_type: NULL  → không chờ ai cả.
          vẫn 6 phút.
```

Và đây là **phép đo chốt**: `EXPLAIN ANALYZE` tách sáu phút đó ra từng bước. **Toàn bộ nằm trong bước đọc bảng**, không một giây nào nằm ở chỗ chờ. **Gạch tên C.** Nó không chờ ai — nó đang **thật sự làm việc liên tục suốt 6 phút**.

### Nghi phạm D — Index hỏng / index phình

Đây là cái mà gần như mọi đội đều tin, vì mẩu 4 nói thẳng vào tai họ: *"một lệnh dọn bảng đêm đó đã chữa được, vậy thứ hỏng phải là cái index"*.

Cơ chế này đúng thật với nhiều loại index khác. Và cách kiểm rẻ tới mức không có cớ gì để không làm:

```sql
SELECT pg_size_pretty(pg_relation_size('idx_gd_ngay_brin'));   -- 0,72 MB
REINDEX INDEX CONCURRENTLY idx_gd_ngay_brin;                   -- 3,2 giây
SELECT pg_size_pretty(pg_relation_size('idx_gd_ngay_brin'));   -- 0,72 MB
```

```text
  cỡ trước khi dựng lại : 0,72 MB
  cỡ sau khi dựng lại   : 0,72 MB      → không phình một byte nào
  chạy lại câu lệnh     : 6 phút       → không chữa được gì
```

**Gạch tên D.** Index không hỏng, và dựng lại nó không chữa được gì.

**Bốn cái tên gạch hết.** Và đây đúng là chỗ phần lớn các đội dừng lại, rồi đi xin thêm máy chủ.

---

## Phần 3 — Đọc lại tấm bảng: ta không thiếu bằng chứng, ta đọc sai một mẩu

Quay lại tấm bảng. Bốn mẩu vẫn nằm đó và **không có mẩu nào mới**. Nghĩa là ta không thiếu bằng chứng — **ta đã đọc sai một mẩu**.

Mẩu 4: nhật ký ghi là *"một lệnh dọn bảng"*, và cả đội đọc nó thành *"dựng lại index"*. Giờ đọc **chính xác** cái lệnh đó:

```sql
CLUSTER giao_dich USING idx_gd_ngay_btree;
```

`CLUSTER` **không chạm vào index**. Nó **ghi lại toàn bộ bảng theo thứ tự** của một index.

> Nên thứ đã chữa được ba ngày **không phải cái index. Là cái bảng.**

Và đó là chỗ mọi thứ mở ra.

---

## Phần 4 — BRIN thật sự lưu cái gì

BRIN = **B**lock **R**ange **IN**dex. Nó **không lưu từng dòng**. Nó cắt bảng thành từng **dải** (block range), mỗi dải mặc định **128 trang** (= 1 MB), rồi với mỗi dải nó ghi đúng **hai con số**: nhỏ nhất và lớn nhất.

Hết. **Không một con trỏ nào.**

```text
Bảng giao_dich, 34 GB = 4.194.304 trang, chia thành dải 128 trang:

  dải #0      trang 0-127        ngay ∈ [2020-01-01, 2020-01-02]
  dải #1      trang 128-255      ngay ∈ [2020-01-02, 2020-01-04]
  dải #2      trang 256-383      ngay ∈ [2020-01-04, 2020-01-05]
  ...
  dải #32.767 trang cuối         ngay ∈ [2024-08-08, 2024-08-09]

  32.768 dải × (2 dấu thời gian 8 byte + overhead) ≈ 700 KB
```

Đó là lý do nó chỉ nặng 700 KB: **nó không lưu dữ liệu, nó lưu một bản mô tả.**

```text
So sánh cùng một cột `ngay` trên 400 triệu dòng:

  B-Tree :  400.000.000 mục  →  ~8 GB      →  tra chính xác từng dòng
  BRIN   :       32.768 dải  →  ~700 KB    →  chỉ loại bớt theo dải
                                               nhỏ hơn ~11.700 lần
```

### Cách nó nhanh: phép loại trừ

Bạn hỏi 7 ngày gần nhất. BRIN duyệt 32.768 dải, và **bỏ qua mọi dải mà khoảng [min, max] không chạm tới** khoảng bạn hỏi:

```text
  hỏi: ngay >= 2024-08-02

  dải #0      [2020-01-01, 2020-01-02]  → max < 2024-08-02  → BỎ
  dải #1      [2020-01-02, 2020-01-04]  → BỎ
  ...
  dải #32.600 [2024-08-01, 2024-08-03]  → có giao  → ĐỌC 128 trang
  dải #32.601 [2024-08-03, 2024-08-04]  → có giao  → ĐỌC
  ...

  Bình thường: bỏ được 99,5% số dải.
```

Rồi những dải sống sót được đọc, **và mọi dòng trong đó vẫn phải kiểm lại** — vì BRIN chỉ nói *"dải này **có thể** chứa"*, không bao giờ nói *"dòng này chắc chắn khớp"*. Đó chính là dòng `Rows Removed by Index Recheck` ở mẩu 1.

### Điều kiện ngầm — không ai viết nó ra, không ai đi kiểm nó

Phép loại trừ đó đứng trên một điều kiện:

> **Thứ tự nằm trên đĩa phải trùng với thứ tự của cột.**

Nếu mỗi dải chứa dữ liệu của một khoảng thời gian hẹp, `[min, max]` hẹp, loại được nhiều. Nếu dữ liệu bị **trộn lẫn**, mỗi dải chứa đủ mọi thời điểm, `[min, max]` phủ trọn 4 năm — và **không dải nào bị loại nữa**.

```text
Bảng đã sắp (correlation ≈ 1,0):        Bảng bị trộn (correlation ≈ 0,07):

 dải 0 [01/01 → 01/02]  hẹp ✓            dải 0 [2020 → 2024]  phủ trọn ✗
 dải 1 [01/02 → 01/04]  hẹp ✓            dải 1 [2020 → 2024]  phủ trọn ✗
 dải 2 [01/04 → 01/05]  hẹp ✓            dải 2 [2020 → 2024]  phủ trọn ✗

 → loại 99,5% số dải                     → loại 0 dải
 → đọc 21.000 trang                      → đọc 4.194.304 trang
 → 0,9 giây                              → 6 phút
```

**Không ai viết điều kiện đó ra, và không ai đi kiểm nó.**

---

## Phần 5 — Thủ phạm: 41 triệu lượt sửa, đọc lại lần thứ hai

Giữ lại từ nghi phạm A: **41 triệu lượt sửa**. Lúc đó ta hỏi *"nó có làm bảng to ra không?"* — không. Giờ hỏi câu khác: **"nó làm dòng nằm ở đâu?"**

PostgreSQL không sửa tại chỗ. Mỗi lượt `UPDATE` là **một dòng mới**, và dòng mới đó thường đi vào **cuối bảng**.

```text
Job đêm chạy: UPDATE giao_dich SET trang_thai_doi_soat = 'ok'
              WHERE ngay BETWEEN '2020-01-01' AND '2024-08-01';

  → 41 triệu dòng CŨ được ghi lại như dòng MỚI ở cuối bảng.

  Kết quả: ngày của 4 năm trước đáp xuống ngay cạnh ngày hôm nay.
```

```text
Đuôi bảng sau job đêm:

  dải #32.600 : [2020-03-11] [2024-08-08] [2021-07-02] [2024-08-09] [2019-12-30] ...
                  min = 2019-12-30,  max = 2024-08-09   → phủ trọn 4 năm 8 tháng

  → hỏi "7 ngày gần nhất" cũng không loại được dải này.
  → mà MỌI dải ở đuôi đều như vậy.
```

Đọc lại mẩu 1 với con mắt mới: `Heap Blocks: lossy=4194304` — **số khối phải đọc đúng bằng số trang của cả bảng**. **0 dải bị loại.** Câu trả lời đã nằm ngay trong plan từ đầu, chỉ là không ai đọc tới dòng đó.

### Con số duy nhất kể được vụ này

```sql
SELECT attname, correlation
  FROM pg_stats
 WHERE tablename = 'giao_dich' AND attname = 'ngay';
```

```text
  tuần trước : correlation = 0,99      ← thứ tự đĩa ≈ thứ tự thời gian
  hôm nay    : correlation = 0,07      ← gần như ngẫu nhiên
```

**Correlation** là hệ số tương quan giữa **thứ tự giá trị của cột** và **thứ tự vật lý của dòng trên đĩa**, chạy từ `-1` tới `1`.

Và đây là điều khó chịu nhất: **con số này không có mặt trong kế hoạch chạy**. `EXPLAIN` không in nó. Không có cảnh báo nào. Loại index này **không bao giờ báo lỗi khi nó thành vô dụng** — nó không sai, nó không trả thiếu một dòng nào. **Nó chỉ thôi loại bớt, và im lặng.**

> **Đính chính nguồn.** Bản gốc nói *"Postgres không sửa tại chỗ, mỗi lượt là một dòng mới và **nó ghi vào cuối bảng**"*. Đúng phần lớn trường hợp nhưng không phải luôn luôn. PostgreSQL trước hết thử **HOT update** (Heap-Only Tuple): nếu **không cột nào được index bị sửa** và trang hiện tại **còn chỗ trống**, bản mới nằm **ngay trong trang cũ** — correlation không bị ảnh hưởng. Bản mới chỉ đi nơi khác khi trang đầy hoặc khi job sửa đúng cột đang được index. Hệ quả thực dụng rất quan trọng: **hạ `fillfactor` xuống 80-90 giúp giữ HOT update và giữ correlation lâu hơn hẳn**.
>
> ```sql
> ALTER TABLE giao_dich SET (fillfactor = 85);   -- chừa 15% chỗ trống mỗi trang
> ```

---

## Phần 6 — Bản vá: ba đường, không đường nào miễn phí

### Đường 1 — Chặn ở nguồn

Cái job đêm đó **đừng sửa hàng loạt dòng cũ nữa**. Tách trạng thái đối soát sang một bảng phụ:

```sql
CREATE TABLE doi_soat (
    giao_dich_id BIGINT PRIMARY KEY REFERENCES giao_dich(id),
    trang_thai   TEXT,
    cap_nhat_luc TIMESTAMPTZ DEFAULT now()
);
-- job đêm giờ INSERT/UPSERT vào bảng nhỏ này,
-- bảng giao_dich trở lại append-only → correlation giữ nguyên mãi mãi
```

**Giá phải trả:** thêm một lần join ở mọi truy vấn cần trạng thái đối soát.
**Đây là bản vá đúng nhất** — nó sửa nguyên nhân, không sửa triệu chứng.

### Đường 2 — Sắp lại định kỳ

```sql
CLUSTER giao_dich USING idx_gd_ngay_btree;
```

Chính là thứ đội trực đã **tình cờ** làm đêm mùng 4 mà không biết mình vừa làm gì.

**Giá phải trả:** `CLUSTER` giữ khoá `ACCESS EXCLUSIVE` — **không ai đọc được bảng trong lúc đó**. 34 GB mất khoảng **11 phút** ngừng đọc hoàn toàn. Và nó cần thêm dung lượng đĩa bằng cỡ bảng.

Phiên bản trực tuyến, gần như không khoá:

```bash
pg_repack --table=giao_dich --order-by=ngay -d mydb
```

`pg_repack` dựng bảng mới song song rồi tráo tên, chỉ khoá vài giây ở bước cuối. Đây là công cụ nên biết tên khi được hỏi *"làm sao sắp lại bảng 34 GB trên production?"*.

### Đường 3 — Chia bảng theo tháng

```sql
CREATE TABLE giao_dich (id BIGINT, ngay TIMESTAMPTZ, ...) PARTITION BY RANGE (ngay);
CREATE TABLE giao_dich_2024_08 PARTITION OF giao_dich
    FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');
```

Mỗi phần **tự giữ thứ tự của nó**, và job đêm chỉ làm bẩn đúng phần của tháng nó chạm tới. Ngoài ra bạn được **partition pruning** miễn phí — truy vấn 7 ngày gần nhất chỉ chạm một phần, kể cả khi BRIN đã hỏng.

**Giá phải trả:** mất `UNIQUE` toàn cục nếu khoá không chứa cột phân vùng, và phải bảo trì việc tạo/xoá phân vùng. Chi tiết ở [phase-7 bài 3](../phase-7/03-partitioning-chia-bang-lon.md).

### Đường 4 — Đổi hẳn sang B-Tree

Miễn nhiễm hoàn toàn với vấn đề này, vì B-Tree lưu vị trí từng dòng nên **không quan tâm thứ tự vật lý**.

**Giá phải trả:** `700 KB → 8 GB`, cộng chi phí ghi cho mọi `INSERT`.

### Đường 5 — Vá bằng chính BRIN (phần mở rộng ngoài transcript)

Từ **PostgreSQL 14**, có một opclass sinh ra đúng cho tình huống này:

```sql
CREATE INDEX idx_gd_ngay_brin ON giao_dich
    USING BRIN (ngay timestamptz_minmax_multi_ops);
```

`minmax_multi` lưu **nhiều khoảng rời rạc** cho mỗi dải thay vì một khoảng duy nhất:

```text
minmax thường:  dải #32.600 → [2019-12-30 ................ 2024-08-09]
                              một khoảng khổng lồ, loại được 0

minmax_multi :  dải #32.600 → [2019-12-30, 2020-01-02]
                              [2021-07-01, 2021-07-03]
                              [2024-08-08, 2024-08-09]
                              → hỏi "7 ngày gần nhất" vẫn loại được
                                các dải chỉ chứa dữ liệu cũ
```

Nó chịu được dữ liệu bị trộn **một phần** — chính xác là kiểu hỏng mà job đêm gây ra. Index to hơn `minmax` vài lần (700 KB → vài MB), vẫn nhỏ hơn B-Tree cả nghìn lần.

Và một opclass nữa đáng biết, `bloom` (cũng từ PG 14), cho cột **không** tương quan mà chỉ tra bằng `=`:

```sql
CREATE INDEX ON giao_dich USING BRIN (ma_giao_dich uuid_bloom_ops);
-- mỗi dải lưu một bộ lọc Bloom → trả lời "dải này CÓ THỂ chứa mã X không"
```

### Chỉnh độ mịn của dải

```sql
CREATE INDEX ... USING BRIN (ngay) WITH (pages_per_range = 32, autosummarize = on);
```

| `pages_per_range` | Cỡ index | Độ mịn khi loại | Khi nào dùng |
|---|---|---|---|
| 512 | rất nhỏ | thô | Bảng cực lớn, sắp rất tốt |
| **128** (mặc định) | ~700 KB / 34 GB | vừa | Mặc định hợp lý |
| 32 | to gấp 4 | mịn hơn | Correlation không hoàn hảo |
| 8 | to gấp 16 | rất mịn | Gần như đã nên dùng B-Tree |

`autosummarize = on` bắt BRIN tự tóm tắt dải mới ngay khi nó đầy. Không bật thì dải mới nhất **chưa được tóm tắt** cho tới lần `VACUUM` kế tiếp — và trong khoảng đó nó **luôn phải đọc**. Đây là một cái bẫy im lặng khác: bảng append-only mà truy vấn *"hôm nay"* lại chậm, thường là vì lý do này.

```sql
SELECT brin_summarize_new_values('idx_gd_ngay_brin');   -- tóm tắt ngay, thủ công
```

---

## Phần 7 — Cách bắt lần sau trong 30 giây

```sql
-- Mọi cột đang có BRIN mà correlation đã tụt: đây là cảnh báo sớm
SELECT c.relname       AS bang,
       s.attname       AS cot,
       round(s.correlation::numeric, 3) AS tuong_quan,
       pg_size_pretty(pg_relation_size(i.indexrelid)) AS co_index,
       CASE WHEN abs(s.correlation) < 0.9 THEN 'BÁO ĐỘNG' ELSE 'ổn' END AS trang_thai
  FROM pg_index      i
  JOIN pg_class      ci ON ci.oid = i.indexrelid
  JOIN pg_class      c  ON c.oid  = i.indrelid
  JOIN pg_am         am ON am.oid = ci.relam
  JOIN pg_attribute  a  ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  JOIN pg_stats      s  ON s.tablename = c.relname AND s.attname = a.attname
 WHERE am.amname = 'brin'
 ORDER BY abs(s.correlation);
```

```text
   bang      |  cot  | tuong_quan | co_index | trang_thai
  -----------+-------+------------+----------+-----------
   giao_dich | ngay  |      0.071 | 720 kB   | BÁO ĐỘNG
   nhat_ky   | tao_luc|     0.998 | 512 kB   | ổn
```

**Dưới 0,9 là báo động.** Bảng nào có BRIN thì dựng luôn cảnh báo trên con số này — nó rẻ, chạy trong mili giây, và nó là **con số duy nhất kể được vụ án này**.

Thêm một truy vấn kiểm tra trực tiếp mức độ hỏng:

```sql
CREATE EXTENSION IF NOT EXISTS pageinspect;
SELECT * FROM brin_page_items(get_raw_page('idx_gd_ngay_brin', 2), 'idx_gd_ngay_brin');
-- nhìn thẳng vào [min, max] của từng dải: chúng có phủ trọn cả lịch sử không?
```

---

## Phần 8 — Khi nào BRIN là lựa chọn đúng

BRIN không phải "B-Tree tiết kiệm". Nó là một cấu trúc **cho một hình dạng dữ liệu rất cụ thể**.

| Điều kiện | Bắt buộc? |
|---|---|
| Bảng **rất lớn** (từ vài chục GB) | Có — bảng nhỏ thì B-Tree đằng nào cũng vừa RAM |
| Cột **tương quan cao với thứ tự vật lý** | **Bắt buộc tuyệt đối** |
| Bảng gần như **chỉ thêm mới** (append-only) | Rất nên |
| Truy vấn theo **khoảng**, không phải tra một dòng | Có — BRIN vô dụng cho `WHERE id = 42` |
| Chấp nhận đọc thừa rồi kiểm lại | Có |

Ứng viên điển hình: bảng log, bảng sự kiện, bảng metric theo thời gian, bảng giao dịch chỉ thêm — với cột `created_at` hoặc `id` tự tăng.

Ứng viên **sai**: bảng người dùng (`WHERE email = ?`), bảng đơn hàng bị `UPDATE` trạng thái liên tục, bất cứ cột nào giá trị rải ngẫu nhiên (UUID v4).

---

## Câu hỏi phỏng vấn

**"Bảng log 2 tỉ dòng, index thế nào?"**
BRIN trên `created_at` là câu trả lời gây ấn tượng — index nhỏ hơn B-Tree hàng nghìn lần. **Nhưng phải nói kèm điều kiện ngầm**, nếu không bạn chỉ đang đọc thuộc: nó **chỉ hiệu quả khi thứ tự vật lý trùng thứ tự thời gian**, tức bảng phải gần như chỉ thêm mới. Có `UPDATE` hàng loạt dòng cũ là nó thành vô dụng mà không báo lỗi. Nói thêm được `pg_stats.correlation` và `minmax_multi_ops` là bạn đã ở tầng khác.

**"Câu lệnh chậm 400 lần qua một đêm, không ai deploy gì. Bạn điều tra thế nào?"**
Trình bày theo **quy trình loại trừ**, mỗi nghi phạm kèm phép đo:
1. So kế hoạch hôm nay với hôm qua → **kế hoạch không đổi thì không phải chuyện optimizer**.
2. Đo cỡ bảng và `n_dead_tup` → loại phình bảng.
3. `pg_stat_activity` + `EXPLAIN ANALYZE` tách thời gian → loại khoá chờ.
4. `REINDEX` rồi đo lại → loại index hỏng.
5. Còn lại là **dữ liệu đã đổi hình dạng**: correlation, phân bố, độ chọn lọc.
Trình bày theo quy trình luôn được chấm cao hơn nêu đúng đáp án bằng linh cảm.

**"`CLUSTER` khác `VACUUM FULL` và `REINDEX` thế nào?"**
`REINDEX` dựng lại **index**, không chạm bảng. `VACUUM FULL` dựng lại **bảng** để thu hồi chỗ trống, **giữ nguyên thứ tự cũ**. `CLUSTER` dựng lại bảng **theo thứ tự một index**. Cả `VACUUM FULL` và `CLUSTER` đều khoá `ACCESS EXCLUSIVE`; bản trực tuyến là `pg_repack`.

**"BRIN có bao giờ trả về thiếu dòng không?"**
Không bao giờ. Nó chỉ mất khả năng **loại bớt**, và khi đó plan tụt về gần bằng quét tuần tự — nhưng kết quả vẫn đúng 100%. Đó chính là lý do lỗi này khó phát hiện: **không có gì sai để mà báo**.

---

## Bẫy thường gặp

| Bẫy | Sự thật |
|---|---|
| Chọn BRIN chỉ vì "index nhỏ hơn nghìn lần" | Nhỏ là hệ quả, không phải lý do. Lý do là **tương quan vật lý** |
| Nghĩ `REINDEX` chữa được BRIN chậm | BRIN chậm vì **bảng** bị trộn, không phải vì index hỏng |
| Đọc `EXPLAIN` chỉ tới dòng "có dùng index không" | Dòng cần đọc là `Heap Blocks: lossy=` và `Rows Removed by Index Recheck` |
| Đánh BRIN trên cột UUID v4 hoặc cột được sửa liên tục | Correlation ≈ 0 ngay từ đầu, index vô dụng từ ngày đầu tiên |
| Quên `autosummarize = on` trên bảng append-only | Dải mới nhất chưa tóm tắt → truy vấn "hôm nay" luôn phải đọc |
| Chạy `CLUSTER` trên production giờ cao điểm | Khoá `ACCESS EXCLUSIVE`, 34 GB ≈ 11 phút không ai đọc được. Dùng `pg_repack` |
| Job đêm `UPDATE` hàng loạt dòng cũ | Phá correlation của **mọi** BRIN trên bảng đó |
| Nghĩ BRIN thay được B-Tree cho `WHERE id = ?` | BRIN chỉ phục vụ **khoảng**; tra một dòng thì nó đọc cả dải 128 trang |

---

## Tóm tắt bài 5

- BRIN cắt bảng thành **dải 128 trang**, mỗi dải chỉ ghi **min và max**. Không con trỏ nào. Đó là lý do nó nặng 700 KB thay cho 8 GB — **nó không lưu dữ liệu, nó lưu một bản mô tả**.
- Nó nhanh nhờ **phép loại trừ**, và phép đó đứng trên một **điều kiện ngầm không ai viết ra**: thứ tự trên đĩa phải trùng thứ tự của cột.
- 41 triệu lượt `UPDATE` không làm bảng to thêm (chỉ +1,5%), nhưng làm **dòng của 4 năm trước đáp xuống cạnh dòng hôm nay** → mọi dải ở đuôi phủ trọn lịch sử → **0 dải bị loại**.
- **Loại index này không bao giờ báo lỗi khi nó thành vô dụng.** Nó không sai, không thiếu dòng nào. Nó chỉ thôi loại bớt và im lặng.
- Con số duy nhất kể được vụ này là `pg_stats.correlation` — và nó **không xuất hiện trong `EXPLAIN`**. Dưới 0,9 là báo động.
- Quy trình điều tra dùng lại được: kế hoạch **không đổi** mà thời gian đổi 400 lần → thủ phạm nằm ở **dữ liệu**, không ở optimizer.
- Năm bản vá, không cái nào miễn phí: **tách bảng phụ** (đúng nhất) → **`CLUSTER`/`pg_repack`** → **phân vùng theo tháng** → **`minmax_multi_ops`** (PG 14+) → **đổi sang B-Tree**. Cộng `fillfactor` để giữ HOT update.
- Bài học lớn hơn BRIN: **index nhỏ luôn kèm một điều kiện ngầm. Điều kiện đó vỡ thì không có lỗi nào. Hãy đo TƯƠNG QUAN, đừng đo cỡ index.**

**Bài kế tiếp** → [Bài 6: Index đảo và tìm kiếm toàn văn](06-index-dao-va-tim-kiem-toan-van.md)
