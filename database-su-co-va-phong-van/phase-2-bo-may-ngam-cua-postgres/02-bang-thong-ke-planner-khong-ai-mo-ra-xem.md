# Bài 9: Bảng thống kê mà planner đọc, và không ai mở ra xem

Ngày 19 tháng 2 năm 2026, một dịch vụ xác thực người dùng sập **90 phút**. Hơn **95% lưu lượng** bị chặn thẳng.

Không ai deploy. Không ai sửa một dòng code nào. Không có tấn công. Không có tăng tải đột biến.

Thủ phạm là **một lệnh cập nhật thống kê tự chạy, bốc mẫu trượt đúng một cột**.

Bài này mổ ra cái bảng mà mọi câu lệnh của bạn đều phụ thuộc vào, mà gần như không ai từng mở ra xem — và vì sao đây là thứ mà AI viết SQL hộ bạn **không thể nhìn thấy**.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ |
|---|---|---|
| **Planner** (bộ lập kế hoạch) | Phần database quyết định câu lệnh đi đường nào | Ứng dụng bản đồ chọn lộ trình |
| **Thống kê** (statistics) | Bản **tóm tắt** về dữ liệu: cột này có bao nhiêu giá trị khác nhau, giá trị nào hay gặp, phân bố ra sao | Bản tóm tắt dân số một tỉnh, không phải danh sách từng người |
| **`ANALYZE`** | Lệnh đi bốc mẫu dữ liệu và dựng lại bảng thống kê | Đi khảo sát mẫu để cập nhật bản tóm tắt |
| **Autovacuum / autoanalyze** | Tiến trình nền tự chạy `VACUUM` và `ANALYZE` | Người dọn dẹp và khảo sát tự động, không ai gọi |
| **`null_frac`** | Tỷ lệ dòng có giá trị rỗng ở cột đó | "99% người trong tỉnh này không khai nghề nghiệp" |
| **`n_distinct`** | Số giá trị **khác nhau** ước tính trong cột | "Tỉnh này có khoảng 400 nghề khác nhau" |
| **MCV** (Most Common Values) | Danh sách các giá trị **hay gặp nhất** kèm tần suất từng cái | "Top 100 nghề phổ biến nhất và tỷ lệ mỗi nghề" |
| **Histogram** (bảng chia khoảng) | Chia dữ liệu thành các khoảng chứa số dòng xấp xỉ bằng nhau | Chia dân số thành 100 nhóm tuổi bằng nhau |
| **Selectivity** (độ chọn lọc) | Ước tính **tỷ lệ dòng** thoả một điều kiện | "Điều kiện này chắc lọc ra khoảng 3% số dòng" |
| **Cardinality** (số lượng dòng) | Số dòng ước tính mà một bước sẽ trả về | "Bước này chắc ra khoảng 30 dòng" |
| **Nested Loop Join** | Ghép bảng bằng cách: lấy từng dòng bảng ngoài, rồi lục cả bảng trong cho từng dòng đó | Cầm từng tên trong danh sách A rồi tra danh bạ B, từng cái một |
| **Hash Join** | Dựng bảng băm từ một bên rồi quét bên kia đối chiếu | Chép cả danh bạ B ra giấy nháp có mục lục, rồi tra một lượt |
| **Merge Join** | Sắp xếp cả hai bên rồi đi song song một lượt | Hai danh sách đã xếp theo tên, đi từ trên xuống một lượt |
| **Sampling** (bốc mẫu) | Đọc một phần dữ liệu rồi suy ra cả bảng | Hỏi 1.000 người rồi kết luận về cả tỉnh |

## Chuyện AI viết SQL — và con số nói ngược lại

Câu hỏi nghe hoài: *"Thời AI rồi thì nên học ngôn ngữ nào cho khỏi thất nghiệp?"*

Câu trả lời có lẽ không phải một cái tên ngôn ngữ nào cả. SQL là ví dụ dễ thấy nhất.

Chắc hẳn bạn nghĩ AI viết SQL thì **đúng cú pháp thôi, còn chạy thì chậm hơn người**. Có hẳn một bộ đo cho việc này, tên **BIRD**, và nó chấm cả tốc độ chứ không chỉ chấm đúng sai. Số của nó nói ngược lại.

```text
   BIRD:  12.751 câu hỏi  |  95 database  |  37 lĩnh vực chuyên môn
   Đề bài viết bằng tiếng người, model phải viết ra câu lệnh trả đúng kết quả.
   Chấm bằng hai điểm: Execution Accuracy (đúng/sai)
                       Valid Efficiency Score (hiệu năng của câu ĐÚNG)
```

Mấy hệ đứng đầu bảng chấm ra điểm hiệu năng **nhỉnh hơn người** (khoảng 0,93–0,94 so với 0,90 của người).

**Khoan mừng.** Có ba chỗ phải đọc kỹ trước khi tin con số đó:

```text
   ① Mấy hệ đầu bảng là HỆ NHIỀU TẦNG: chạy đi chạy lại, tự sửa,
      tự kiểm tra. Không phải gõ một câu vào chatbot.

   ② Model chỉ được tính điểm ở NHỮNG CÂU NÓ LÀM ĐÚNG.
      Người và model đang bị chấm trên HAI TẬP CÂU KHÁC NHAU.
      → Đó là điểm quy đổi, không phải tỷ lệ nhanh chậm.

   ③ 95 database cộng lại đúng 33,4 GB.
      → Trung bình mỗi database 351 MB.
      → Ở cỡ đó, CẢ DATABASE NẰM GỌN TRONG BỘ NHỚ.
      → Quét cả bảng cũng chỉ mất một nhịp.
      → GẦN NHƯ KHÔNG CÓ ĐẤT CHO MỘT KẾ HOẠCH TỒI.
```

Điểm ③ mới là điểm quan trọng nhất. Bộ đo được dựng trên những database **nhỏ tới mức không thể phân biệt câu lệnh tốt với câu lệnh tồi**.

Và rồi chính nhóm làm bộ đo thử hai cách cho câu lệnh chạy nhanh hơn:

| Cách | Tiết kiệm trung bình |
|---|---|
| Viết lại câu lệnh cho khéo (10 ví dụ họ đưa ra) | **77,75%** |
| **Thêm index vào database, KHÔNG sửa một chữ nào trong câu lệnh** | **87,3%** |

Hoá ra thứ cắt được nhiều thời gian nhất lại **nằm ngoài câu lệnh**.

Vậy nó nằm ở đâu? Nó nằm ở **bộ lập kế hoạch**. Và bộ lập kế hoạch có một đặc điểm ít người để ý:

> **Nó không đọc dữ liệu của bạn. Nó đọc một BẢN TÓM TẮT về dữ liệu của bạn.**

## Bản tóm tắt đó có gì

PostgreSQL không chạy thử rồi đo — vì muốn đo thật thì phải chạy hết mọi đường mới biết đường nào rẻ. Nên nó **đoán trước**, dựa vào một bảng gọi là `pg_stats`.

Mở nó ra xem thử — đây là câu lệnh nên chạy trên database của chính bạn ngay hôm nay:

```sql
SELECT attname                AS ten_cot,
       null_frac              AS ty_le_rong,
       n_distinct             AS so_gia_tri_khac_nhau,
       array_length(most_common_vals::text::text[], 1)  AS so_gia_tri_hay_gap,
       most_common_freqs[1:5] AS tan_suat_5_cai_dau,
       correlation            AS do_tuong_quan_voi_thu_tu_vat_ly
  FROM pg_stats
 WHERE tablename = 'don_hang'
 ORDER BY attname;
```

Bảng đó chứa gần như đúng bốn thứ:

```text
   ① null_frac        — bao nhiêu phần trăm dòng là rỗng
   ② n_distinct       — cột có bao nhiêu giá trị khác nhau
   ③ MCV + tần suất   — danh sách giá trị hay gặp nhất kèm tỷ lệ từng cái
                        (mặc định 100 giá trị)
   ④ Histogram        — chia phần dữ liệu còn lại thành 100 khoảng
                        có số dòng xấp xỉ bằng nhau

   Gần như chừng đó thôi. TOÀN BỘ quyết định về đường đi của
   mọi câu lệnh trong hệ thống của bạn dựa trên bốn thứ này.
```

### Phép tính mẫu ngay trong tài liệu PostgreSQL

Tài liệu chính thức có sẵn một ví dụ trên bảng **10.000 dòng** với một câu lọc theo một cột:

```text
   TRƯỜNG HỢP A — giá trị bạn truyền vào NẰM TRONG danh sách hay gặp
   ───────────────────────────────────────────────────────────────
   Planner tra thẳng bảng tần suất:  tần suất của giá trị đó = 0,003
   → ước tính: 10.000 × 0,003 = 30 dòng

   TRƯỜNG HỢP B — giá trị KHÔNG nằm trong danh sách hay gặp
   ───────────────────────────────────────────────────────────────
   Planner lấy phần còn lại (sau khi trừ hết MCV và phần NULL)
   rồi chia đều cho số giá trị khác nhau còn lại.
   → ước tính: 15 dòng
```

**Cú pháp giống hệt nhau. Hai công thức khác hẳn nhau.** Cái quyết định là giá trị đó **có lọt danh sách hay gặp của riêng bảng đó hay không**.

Và bảng tần suất ấy:

```text
   ✗ AI không thấy.
   ✗ Người mới học cũng không thấy.
   ✗ Nó không nằm trong câu lệnh.
   ✗ Nó không nằm trong mô tả bảng (schema).
   ✗ Mặc định thì không ai gửi nó cho model cả.
```

## Chỗ chết người: nhiều điều kiện lọc cùng lúc

Khi câu lệnh có nhiều điều kiện, PostgreSQL **nhân xác suất của từng điều kiện lại với nhau**. Tức là nó **giả định các cột không dính dáng gì tới nhau**.

Tài liệu có một ví dụ trớ trêu: hai cột **giá trị trùng nhau hoàn toàn**.

```text
   Bảng 10.000 dòng. Cột A và cột B luôn có giá trị y hệt nhau.

   Lọc riêng cột A:        ước 100 dòng   (đúng: 100)   ✓
   Lọc riêng cột B:        ước 100 dòng   (đúng: 100)   ✓
   Lọc CẢ HAI cột:         ước   1 dòng   (đúng: 100)   ✗

   Vì sao ra 1? Vì 1% × 1% = 0,01%, và 10.000 × 0,01% = 1.
   → HỤT 100 LẦN, chỉ vì giả định hai cột độc lập.
```

Trong đời thật, các cột **luôn dính nhau**:

```text
   thanh_pho = 'Hà Nội'     và    ma_vung = '024'        → dính chặt
   quoc_gia  = 'Việt Nam'   và    tien_te = 'VND'        → dính chặt
   trang_thai = 'DA_HUY'    và    ly_do_huy IS NOT NULL  → dính chặt
   loai_xe = 'SUV'          và    so_cho >= 7            → dính khá chặt
```

Mỗi cặp cột dính nhau là một chỗ ước tính hụt.

### Ước hụt thì đã sao? Chậm hơn tí là cùng chứ gì?

**Không.** Vì con số ước tính **quyết định luôn cách ghép hai bảng lại với nhau**.

```text
   ═══ NESTED LOOP ═══════════════════════════════════════════
   for mỗi dòng ở bảng NGOÀI:
       lục bảng TRONG tìm dòng khớp        ← một dòng một lượt lục

   Chi phí ≈ (số dòng bảng ngoài) × (chi phí một lượt lục)

   Rẻ NHẤT khi bảng ngoài chỉ có 1–vài dòng.
   THẢM HOẠ khi bảng ngoài có nhiều dòng.

   ═══ HASH JOIN ═════════════════════════════════════════════
   Dựng bảng băm từ bên nhỏ (một lượt), quét bên lớn (một lượt).

   Chi phí ≈ (số dòng bên A) + (số dòng bên B)

   Ổn định. Không sợ ước tính sai nhiều.
```

Bây giờ ghép hai chuyện lại:

```text
   Planner TƯỞNG vòng ngoài chỉ có 1 dòng
        → nó thấy Nested Loop rẻ nhất → chọn Nested Loop.

   Thực tế vòng ngoài có 100 dòng
        → 100 lượt lục thay vì 1. Chậm 100 lần.

   Bảng đồ chơi 10.000 dòng đã lệch 100 lần.
   Bảng thật vài chục triệu dòng thì con số đó KHÔNG DỪNG Ở 100.
   Mỗi dòng lệch thêm là MỘT LƯỢT LỤC NỮA.
```

### Đây không phải suy đoán — có nghiên cứu đo hẳn hoi

Một nhóm nghiên cứu bắn cả bộ truy vấn thật vào PostgreSQL và 4 hệ khác, đo xem ước tính lệch bao nhiêu:

```text
   Tỷ lệ câu lệnh có ước tính SAI TỪ 10 LẦN TRỞ LÊN:

   Câu có 1 phép ghép bảng:  16%
   Câu có 2 phép ghép bảng:  32%     ← gần gấp đôi
   Câu có 3 phép ghép bảng:  52%     ← lại gần gấp đôi

   Vì sao gấp đôi mỗi lần? Vì TẦNG SAU LẤY ƯỚC TÍNH ĐÃ SAI CỦA
   TẦNG TRƯỚC LÀM ĐẦU VÀO. Sai số nhân dồn.
```

Và họ chỉ ra một đặc điểm mà họ gọi là **quyết định cực kỳ mạo hiểm**:

```text
   Khi chi phí ước tính của Nested Loop là 1.000.000
   còn của Hash Join là     1.000.001

   → PostgreSQL LUÔN chọn Nested Loop.

   Cái được: bé tí (1 đơn vị chi phí trên giấy).
   Cái mất khi ước tính sai: khi hai bảng cùng lớn lên,
                              Nested Loop dội theo BÌNH PHƯƠNG.
```

Nói cách khác, planner không hề tính tới **rủi ro**. Nó chỉ so hai con số và chọn cái nhỏ hơn, dù một bên có mặt trái thảm hoạ còn bên kia thì không.

## Bản tóm tắt kia được làm từ đâu? Từ một mẫu

Giờ tới câu hỏi ít ai hỏi: `ANALYZE` lấy số liệu ở đâu ra?

**Nó không quét cả bảng. Nó chỉ bốc mẫu.**

```text
   Cỡ mẫu = 300 × default_statistics_target
           = 300 × 100 (mặc định)
           = 30.000 dòng
```

Và đây là chỗ đáng giật mình:

```text
   Con số 30.000 KHÔNG NHÂN LÊN THEO CỠ BẢNG.

   Bảng     10.000 dòng  →  quét luôn cả bảng      (100%)
   Bảng  1.000.000 dòng  →  vẫn 30.000 dòng        (3%)
   Bảng 10.000.000.000 dòng → VẪN 30.000 dòng      (0,0003%)
```

Đây là **chủ ý, không phải sót**. Dòng chú thích cạnh đoạn mã đó dẫn một bài báo năm 1998 (Chaudhuri, Motwani, Narasayya — *"Random sampling for histogram construction: how much is enough?"*), nói rằng mẫu chừng đó vẫn cho sai số đủ nhỏ.

**Với bảng chia khoảng (histogram) thì đúng.** Với những thứ khác thì không. Và "những thứ khác" chính là vụ sập ở đầu bài.

## Vụ sập: 90 phút vì một cột toàn NULL

Clerk là dịch vụ xác thực người dùng cho ứng dụng web. Ngày **19/02/2026** họ sập 90 phút rồi tự viết bài mổ sự cố công khai.

Trong database của họ có một cột mà **99,99996% số dòng là NULL**.

```text
   ① Bản cập nhật thống kê TỰ ĐỘNG chạy (autoanalyze).
   ② Nó bốc mẫu 30.000 dòng.
   ③ Cả 30.000 dòng đều NULL.
   ④ Planner kết luận: cột đó 100% là NULL. (null_frac = 1.0)
   ⑤ Từ kết luận sai đó, nó lập kế hoạch với giả định
      "nhánh kia KHÔNG CÓ LẤY MỘT DÒNG NÀO khác NULL"
      → trên giấy, đó là kế hoạch rẻ nhất có thể.

   ⑥ Thực tế nhánh ấy trả về HƠN 17.000 DÒNG.
```

Nhẩm một phép là thấy ngay vì sao mẫu trượt:

```text
   Tỷ lệ không NULL = 4 phần triệu = 0,000004
   Cỡ mẫu = 30.000 dòng

   Kỳ vọng bắt được: 30.000 × 0,000004 = 0,12 dòng

   → PHẦN LỚN CÁC LẦN CHẠY SẼ TRƯỢT SẠCH.
     Không phải xui. Đây là kết quả có thể tính trước.
```

Phần còn lại của sự cố cũng đáng đọc, vì nó cho thấy loại lỗi này khó chẩn đoán thế nào:

```text
   • Câu lệnh đó chạy đủ thường xuyên nên chỗ "đi bộ" bất ngờ
     hút gần hết tài nguyên database.
   • Hơn 95% lưu lượng bị chặn thẳng (trả 429).
   • Cơ chế tự đá sang máy dự phòng KHÔNG KÍCH HOẠT —
     vì database vẫn sống, chỉ là ngáp ngoải.
     (Health check hỏi "còn thở không?", không hỏi "còn khoẻ không?")
   • Mất 70 PHÚT đội trực mới lần ra nguyên nhân thật.
     Nửa giờ đầu họ nghi một khách hàng tăng lưu lượng đột biến,
     chặn tay cũng không ăn thua.
   • Thứ đưa kế hoạch về như cũ: GÕ TAY MỘT LỆNH ANALYZE.
```

Sau sự cố, họ làm hai việc: **nâng cỡ mẫu cho bảng ấy**, rồi tối hôm đó **viết lại câu lệnh để planner khỏi phải đoán**.

## Bốn cách chữa, và giới hạn của từng cách

### ① Nâng cỡ mẫu cho đúng cột có vấn đề

```sql
-- Chỉ nâng cho MỘT CỘT, không nâng toàn hệ
ALTER TABLE nguoi_dung ALTER COLUMN cot_lech_nang SET STATISTICS 1000;
ANALYZE nguoi_dung;
--            ↑ BẮT BUỘC chạy lại, lệnh ALTER không tự cập nhật thống kê
```

```text
   SET STATISTICS 1000  →  cỡ mẫu = 300 × 1000 = 300.000 dòng
                        →  danh sách giá trị hay gặp dài hơn (1000 thay vì 100)
                        →  bảng chia khoảng mịn hơn
```

Cái giá, phải nói cho đủ:

| Được | Mất |
|---|---|
| Mẫu lớn hơn 10 lần → ít trượt hơn hẳn | `ANALYZE` chạy lâu hơn |
| Danh sách giá trị hay gặp dài hơn | Chỗ lưu thống kê phình ra |
| Bảng chia khoảng mịn hơn | **Mỗi lần lập kế hoạch phải đọc bảng thống kê dài hơn** → planner chậm hơn một chút |
| | **Không giúp gì cho chuyện hai cột dính nhau** |

Vế cuối quan trọng: nâng cỡ mẫu chỉ giúp được **ba việc** đã liệt kê. Nó **không** đụng tới giả định độc lập giữa các cột.

### ② Thống kê mở rộng cho các cột dính nhau

```sql
-- Khai báo cho planner biết hai cột này KHÔNG độc lập
CREATE STATISTICS st_diachi (dependencies, ndistinct, mcv)
    ON thanh_pho, ma_vung FROM dia_chi;
ANALYZE dia_chi;
```

**Nhưng tài liệu nói thẳng một câu rất cay:** loại thống kê mở rộng này **hiện chưa được planner dùng khi ước tính cho phép ghép bảng**.

```text
   Công cụ DUY NHẤT để vá chuyện hai cột dính nhau
   lại đúng là công cụ Postgres KHÔNG dùng ở nơi
   sai số nhân dồn mạnh nhất (chỗ ghép bảng).
```

Nên `CREATE STATISTICS` giúp được câu lệnh lọc trên một bảng, không cứu được câu lệnh ghép nhiều bảng.

### ③ Viết lại câu lệnh để planner khỏi phải đoán

Đây là cách chữa gốc rễ và cũng là thứ Clerk làm sau khi dập lửa.

Ý tưởng: nếu planner đoán sai vì nó không có thông tin, thì hãy **cấu trúc lại câu lệnh sao cho nó không cần đoán**:

```sql
-- ✗ Planner phải đoán có bao nhiêu dòng thoả cột lệch nặng
SELECT * FROM phien s
  JOIN nguoi_dung u ON u.id = s.nguoi_dung_id
 WHERE s.token_dac_biet IS NOT NULL;

-- ✓ Index từng phần: chính sự tồn tại của index nói lên
--   "tập này rất nhỏ", và planner ước tính từ chính index đó
CREATE INDEX idx_phien_token_dac_biet ON phien (nguoi_dung_id)
    WHERE token_dac_biet IS NOT NULL;
```

Index từng phần (partial index) rất hợp với đúng kiểu dữ liệu này: cột hầu hết là NULL, chỉ vài nghìn dòng có giá trị. Index chỉ chứa vài nghìn dòng đó — vừa nhỏ, vừa cho planner một nguồn ước tính tốt hơn hẳn.

### ④ Ghi đè thẳng con số `n_distinct`

Chính tài liệu thừa nhận: con số đếm giá trị khác nhau **vẫn sai trên bảng lớn, kể cả khi đã nâng mẫu lên mức lớn nhất**. Vì đếm số giá trị khác nhau từ một mẫu là bài toán khó về mặt thống kê.

Bạn ghi đè được bằng tay:

```sql
-- Số âm = "tỷ lệ so với số dòng của bảng"
--   -1   = mỗi dòng một giá trị khác nhau (như cột khoá chính)
--   -0.5 = số giá trị khác nhau bằng một nửa số dòng
ALTER TABLE su_kien ALTER COLUMN nguoi_dung_id SET (n_distinct = -0.05);
ANALYZE su_kien;
```

Dùng khi bạn **biết chắc** đặc điểm dữ liệu của mình mà `ANALYZE` cứ đoán sai. Nhớ rằng bạn vừa nhận trách nhiệm cập nhật con số đó khi dữ liệu thay đổi bản chất.

## Một cái bẫy vận hành ít người biết: khi nào autoanalyze chạy?

Đây là chi tiết thực chiến quan trọng.

```text
   Ngưỡng kích hoạt autoanalyze:
      autovacuum_analyze_threshold        (mặc định 50)
    + autovacuum_analyze_scale_factor × số dòng bảng   (mặc định 0,1)
```

Nghĩa là:

```text
   Bảng      1.000 dòng  →  chạy lại sau ~150 dòng thay đổi
   Bảng  1.000.000 dòng  →  chạy lại sau ~100.000 thay đổi
   Bảng 100.000.000 dòng →  chạy lại sau ~10.000.000 THAY ĐỔI

   → Bảng CÀNG TO, thống kê CÀNG LÂU MỚI ĐƯỢC CẬP NHẬT.
   → Đúng chỗ cần chính xác nhất thì lại được chăm sóc ít nhất.
```

Cách chữa cho những bảng lớn quan trọng:

```sql
ALTER TABLE don_hang SET (autovacuum_analyze_scale_factor = 0.01);
-- 1% thay vì 10% → cập nhật thống kê thường xuyên hơn 10 lần
```

Và luôn theo dõi tuổi của thống kê:

```sql
SELECT relname                AS bang,
       n_live_tup             AS so_dong,
       last_analyze,
       last_autoanalyze,
       n_mod_since_analyze    AS so_thay_doi_tu_lan_phan_tich_cuoi
  FROM pg_stat_user_tables
 WHERE n_live_tup > 100000
 ORDER BY n_mod_since_analyze DESC;
```

Cột `n_mod_since_analyze` lớn bất thường nghĩa là planner của bạn đang ra quyết định dựa trên bức ảnh cũ.

## "Thế đưa bảng thống kê cho model xem là xong chứ gì?"

Mấy hệ đầu bảng làm đúng thế thật: cho model chạy lệnh xem kế hoạch, mở thống kê ra đọc, bốc thử vài dòng dữ liệu mẫu.

Cái giá là nhiều lượt gọi hơn, đắt hơn. Nhưng vấn đề sâu hơn:

> Kể cả làm hết chừng đó, thứ model đọc được **vẫn là bản tóm tắt lấy mẫu kia** — tức là nó **thừa hưởng nguyên si chỗ sai mà planner đang mắc**.

Trong vụ Clerk, một model đọc `pg_stats` cũng sẽ thấy `null_frac = 1.0` và cũng sẽ kết luận y hệt planner. Sai số không nằm ở chỗ ai đọc, nó nằm ở **chính cái mẫu**.

Nên học ngôn ngữ nào thì học — phần cú pháp AI viết hộ được thật, và viết khá tốt. **Thứ nó không viết hộ được là hiểu dữ liệu của chính bạn:**

```text
   • Cột nào lệch tới mức mẫu bốc trượt?
   • Bảng nào to tới mức 30.000 dòng thành vô nghĩa?
   • Hai cột nào dính nhau tới mức phép nhân xác suất sai bét?
   • Bảng nào lớn tới mức autoanalyze mấy tuần mới chạy một lần?
```

Bốn câu đó không có trong câu lệnh, không có trong mô tả bảng, và không ai gửi chúng cho model cả.

## Ngụm cà phê cuối: vì sao sửa lỗi bộ tối ưu rất nản

Nhóm nghiên cứu kia từng thử thay con số đếm giá trị khác nhau bằng **giá trị đúng tuyệt đối**, nghĩ ước tính sẽ chuẩn lên.

```text
   Phương sai:      TỐT LÊN thật.
   Xu hướng ước hụt: NẶNG THÊM.

   Vì sao? Vì con số cũ sai theo hướng ĐẨY ƯỚC TÍNH CAO LÊN,
   vô tình BÙ cho một sai số khác đang KÉO XUỐNG.

   Hai cái sai cộng lại thành một cái đúng.
```

Họ than rằng vì vậy mà sửa lỗi bộ tối ưu rất nản: **vá được câu này thì gây gãy câu kia**.

Đây cũng là lý do nên cẩn thận khi "tối ưu" thống kê bằng tay: bạn đang chỉnh một hệ mà các sai số đang cân bằng nhau theo cách không ai lập tài liệu.

## Bẫy thường gặp

| Bẫy | Vì sao hỏng | Cách sửa |
|---|---|---|
| Không bao giờ mở `pg_stats` ra xem | Không biết planner đang tin điều gì | Chạy câu truy vấn `pg_stats` ở đầu bài |
| Tin rằng cỡ mẫu tăng theo cỡ bảng | 30.000 dòng dù bảng 10 tỷ dòng | `SET STATISTICS` cho cột quan trọng |
| Cột lệch nặng (>99% một giá trị) mà để mặc định | Mẫu bốc trượt hoàn toàn — đúng vụ Clerk | Nâng `STATISTICS`, hoặc dùng index từng phần |
| Nghĩ `CREATE STATISTICS` cứu được mọi thứ | Nó **chưa được dùng khi ước tính ghép bảng** | Viết lại câu lệnh; giảm số phép ghép |
| Bảng lớn để `analyze_scale_factor` mặc định | Bảng 100 triệu dòng cần 10 triệu thay đổi mới cập nhật | Hạ xuống 0,01 cho bảng lớn quan trọng |
| `ALTER ... SET STATISTICS` rồi không chạy `ANALYZE` | Cấu hình đổi nhưng thống kê vẫn là bản cũ | Luôn `ANALYZE` ngay sau đó |
| Health check chỉ hỏi "còn thở không" | Database ngáp ngoải vẫn "khoẻ" → không tự chuyển máy | Health check phải đo độ trễ truy vấn thật |
| Nghi khách hàng/lưu lượng trước khi nghi kế hoạch | Mất 70 phút đi sai hướng | Khi chậm đột ngột mà không ai deploy: **nghi kế hoạch bị lật trước tiên** |
| Đưa schema cho AI rồi tin câu lệnh nó viết là tối ưu | Model không thấy phân bố dữ liệu; và nếu thấy thì cũng thừa hưởng chỗ sai | Tự kiểm bằng `EXPLAIN (ANALYZE, BUFFERS)` trên dữ liệu thật |

## Nguồn và kiểm chứng

- **Clerk**, *"Postmortem: Clerk System Outage (February 19, 2026)"* — sập 8:11 sáng PST, >95% lưu lượng trả 429, khôi phục sau ~90 phút bằng cách chạy tay `ANALYZE`. Cột có `null_frac` thật là 99,99996%, mẫu bốc toàn NULL nên planner kết luận 100% NULL; nhánh đó thực tế trả hơn 17.000 dòng.
- **BIRD**: 12.751 cặp câu hỏi–SQL, 95 database, tổng 33,4 GB, 37 lĩnh vực. Chỉ số hiệu năng là *Valid Efficiency Score*.
- Cỡ mẫu `ANALYZE` = `300 × default_statistics_target`, mặc định 100 → **30.000 dòng**, không đổi theo cỡ bảng.
- Nghiên cứu về sai số ước tính và rủi ro Nested Loop: Leis và cộng sự, *"How Good Are Query Optimizers, Really?"* (VLDB 2015).
- Phép nhẩm "kỳ vọng bắt được 0,12 dòng" là suy ra từ hai con số công bố (tỷ lệ NULL và cỡ mẫu mặc định), **không phải con số Clerk công bố**.

## Tóm tắt bài 9

- **Planner không đọc dữ liệu của bạn — nó đọc một bản tóm tắt lấy mẫu.** Bản tóm tắt đó chỉ có bốn thứ: tỷ lệ rỗng, số giá trị khác nhau, danh sách giá trị hay gặp, và bảng chia khoảng.
- **Cỡ mẫu là 30.000 dòng và KHÔNG tăng theo cỡ bảng.** Với bảng 10 tỷ dòng, đó là 0,0003%.
- Cột **lệch nặng** (99,99% một giá trị) là chỗ mẫu bốc trượt hoàn toàn — đó chính là vụ sập 90 phút của Clerk.
- PostgreSQL **giả định các cột độc lập** và nhân xác suất lại. Hai cột dính nhau là hụt 100 lần; và các cột trong đời thật **luôn dính nhau**.
- Ước hụt không chỉ làm chậm — nó **đổi cách ghép bảng** sang Nested Loop, thứ dội theo bình phương khi cả hai bảng lớn lên.
- Sai số **nhân dồn theo số phép ghép**: 16% → 32% → 52% với 1, 2, 3 phép ghép.
- `CREATE STATISTICS` là công cụ duy nhất vá chuyện cột dính nhau, nhưng **chưa được dùng cho ước tính ghép bảng** — đúng nơi sai số dồn mạnh nhất.
- **Bảng càng to, autoanalyze càng lâu mới chạy** (10% số dòng). Hạ `autovacuum_analyze_scale_factor` cho bảng lớn quan trọng.
- **AI viết được cú pháp, không viết được sự hiểu về dữ liệu của bạn** — và nếu nó đọc thống kê, nó thừa hưởng nguyên si chỗ sai của planner.

**Bài kế tiếp** → [Bài 10: Báo cáo tháng chạy 40 giây và ô cấu hình không ai để ý](03-bao-cao-thang-chay-40-giay-work-mem.md)
