# Bài 4: Đối soát tự động

## Vì sao đối soát là hệ thống, không phải công việc

```text
   Ở NHIỀU CÔNG TY, ĐỐI SOÁT LÀ MỘT NGƯỜI VỚI MỘT FILE EXCEL.

   Cách đó hỏng khi:
      · Số giao dịch vượt vài nghìn mỗi ngày
      · Có nhiều hơn hai đối tác
      · Người đó nghỉ phép
      · Có tranh chấp và cần dựng lại kết luận của ba tháng trước

   VÀ NÓ CÓ MỘT VẤN ĐỀ NGHIÊM TRỌNG HƠN:
   KẾT LUẬN KHÔNG ĐƯỢC LƯU LẠI.

   Đối soát xong, file Excel đóng lại, và không ai biết
   hôm đó đã xử lý những chênh lệch nào, xử lý ra sao.
   → Khi thanh tra hỏi, không giải trình được (phase 4 bài 6).
```

Đối soát tự động là một **hệ thống có trạng thái**, không phải một script chạy rồi in ra màn hình.

## Ba tầng đối soát

```text
   ┌──────────────────────────────────────────────────────────┐
   │ TẦNG 1 — NỘI BỘ (không cần đối tác)                       │
   │   · Σ số dư mọi ví = số dư tài khoản đảm bảo             │
   │   · Mỗi bút toán cân (tổng nợ = tổng có)                  │
   │   · Cột số dư đệm = tổng các vế                           │
   │   → CHẠY MỖI GIỜ. Rẻ nhất, phát hiện sớm nhất.           │
   ├──────────────────────────────────────────────────────────┤
   │ TẦNG 2 — VỚI ĐỐI TÁC (file đối soát)                      │
   │   · Sổ mình ↔ file cổng thanh toán                        │
   │   · Sổ mình ↔ sao kê ngân hàng                            │
   │   → CHẠY HẰNG NGÀY.                                        │
   ├──────────────────────────────────────────────────────────┤
   │ TẦNG 3 — TIỀN THẬT                                        │
   │   · Số dư thật tăng = thu − hoàn − phí − phần giữ lại     │
   │   → CHẠY HẰNG NGÀY. Con số cuối cùng, quan trọng nhất.    │
   └──────────────────────────────────────────────────────────┘

   ⚠ NHIỀU ĐỘI CHỈ LÀM TẦNG 2 VÀ BỎ TẦNG 1.

   Tầng 1 gần như miễn phí và bắt được lỗi trong vòng một giờ,
   trong khi tầng 2 phải đợi tới hôm sau.
   → Luôn làm tầng 1 trước.
```

## Kiến trúc hệ thống đối soát

```text
   ┌────────────────────────────────────────────────────────────┐
   │ ① NHẬP DỮ LIỆU                                              │
   │    Tải file / gọi API / đọc sao kê                          │
   │    → LƯU FILE GỐC, không sửa. Đây là bằng chứng.           │
   ├────────────────────────────────────────────────────────────┤
   │ ② CHUẨN HOÁ                                                 │
   │    Đưa mọi nguồn về CÙNG MỘT cấu trúc:                      │
   │    (mã giao dịch, số tiền đơn vị nhỏ nhất, đồng tiền,      │
   │     thời điểm UTC, loại, trạng thái)                        │
   ├────────────────────────────────────────────────────────────┤
   │ ③ GHÉP                                                      │
   │    Theo khoá ghép, trong cửa sổ thời gian phù hợp           │
   ├────────────────────────────────────────────────────────────┤
   │ ④ PHÂN LOẠI CHÊNH LỆCH                                      │
   │    Bốn nhóm (phase 5 case 5), gán mức ưu tiên               │
   ├────────────────────────────────────────────────────────────┤
   │ ⑤ TỰ ĐỘNG XỬ LÝ những mẫu đã biết                          │
   ├────────────────────────────────────────────────────────────┤
   │ ⑥ HÀNG ĐỢI CHO NGƯỜI XỬ LÝ phần còn lại                    │
   ├────────────────────────────────────────────────────────────┤
   │ ⑦ GHI SỔ VÀ LƯU KẾT LUẬN                                    │
   └────────────────────────────────────────────────────────────┘

   ⚠ BƯỚC ② LÀ BƯỚC TIẾT KIỆM CÔNG NHẤT VỀ LÂU DÀI.

   Chuẩn hoá xong thì logic ghép và phân loại dùng chung cho
   MỌI đối tác. Không chuẩn hoá thì mỗi đối tác một bộ code riêng.
```

## Bảng dữ liệu

```sql
-- Bản ghi mỗi lần chạy đối soát — chống chạy trùng, lưu kết quả
CREATE TABLE recon_runs (
    id              BIGSERIAL PRIMARY KEY,
    source          TEXT NOT NULL,          -- 'PSP_A' | 'BANK_VCB'
    business_date   DATE NOT NULL,
    status          TEXT NOT NULL,          -- RUNNING|COMPLETED|FAILED
    file_checksum   TEXT,                   -- phát hiện file được phát hành lại
    total_ours      BIGINT,
    total_theirs    BIGINT,
    matched_count   INT,
    unmatched_count INT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ,
    UNIQUE (source, business_date)
);

-- Từng chênh lệch — có vòng đời riêng, không phải chỉ là dòng log
CREATE TABLE recon_breaks (
    id              BIGSERIAL PRIMARY KEY,
    recon_run_id    BIGINT NOT NULL REFERENCES recon_runs(id),
    break_type      TEXT NOT NULL,   -- ONLY_OURS|ONLY_THEIRS|AMOUNT_DIFF|DUPLICATE
    our_txn_id      TEXT,
    their_txn_id    TEXT,
    our_amount      BIGINT,
    their_amount    BIGINT,
    priority        TEXT NOT NULL,   -- HIGH|MEDIUM|LOW
    status          TEXT NOT NULL,   -- OPEN|INVESTIGATING|RESOLVED|ACCEPTED
    resolution_code TEXT,            -- CÓ CẤU TRÚC, không phải văn bản tự do
    resolution_note TEXT,
    resolved_by     TEXT,
    resolved_at     TIMESTAMPTZ,
    journal_entry_id BIGINT          -- bút toán đã ghi để xử lý, nếu có
);
```

```text
   ⚠ BA CHI TIẾT QUAN TRỌNG:

   ① file_checksum
      Đối tác phát hành lại file sau khi bổ sung là chuyện thường.
      So checksum để biết cần chạy lại hay không.

   ② recon_breaks CÓ TRẠNG THÁI VÀ NGƯỜI XỬ LÝ
      Chênh lệch không phải một dòng log — nó là một việc phải làm,
      có người chịu trách nhiệm, có kết luận.

   ③ resolution_code CÓ CẤU TRÚC
      Nhờ đó thống kê được: nguyên nhân nào hay gặp nhất,
      và tự động hoá được những nguyên nhân đó ở bước ⑤.
```

## Khoá ghép và cửa sổ thời gian

```text
   ① KHOÁ GHÉP: LUÔN LÀ MÃ GIAO DỊCH CỦA ĐỐI TÁC

      ❌ Ghép theo mã đơn hàng → một đơn nhiều lần thử → nhiều-nhiều
      ❌ Ghép theo (số tiền + thời gian) → hai giao dịch giống nhau
      ✅ Mã giao dịch của đối tác là khoá duy nhất

      → Vì vậy phải LƯU mã của đối tác trong mọi bản ghi của mình.

   ② CỬA SỔ THỜI GIAN: THEO GIỜ CHỐT SỔ CỦA ĐỐI TÁC

      Đối tác chốt 23:00 giờ của họ, bạn tính theo ngày lịch Việt Nam
      → giao dịch gần nửa đêm nằm ở hai ngày khác nhau
      → LỆCH GIẢ, và đây là nguyên nhân phổ biến nhất (phase 5 case 5)

      → Lưu giờ chốt sổ và múi giờ của TỪNG đối tác vào cấu hình.
```

```sql
-- Ghép, dùng cửa sổ theo giờ chốt sổ của đối tác
WITH cua_so AS (
    SELECT (DATE '2026-08-01' + cutoff_time) AT TIME ZONE tz AS tu,
           (DATE '2026-08-02' + cutoff_time) AT TIME ZONE tz AS den
    FROM partner_config WHERE source = 'PSP_A'
)
SELECT coalesce(o.psp_txn_id, t.psp_txn_id) AS ma,
       o.amount_minor AS cua_minh,
       t.amount_minor AS cua_ho,
       CASE
         WHEN t.psp_txn_id IS NULL THEN 'ONLY_OURS'
         WHEN o.psp_txn_id IS NULL THEN 'ONLY_THEIRS'
         WHEN o.amount_minor <> t.amount_minor THEN 'AMOUNT_DIFF'
       END AS loai_lech
FROM cua_so w
FULL OUTER JOIN our_transactions o
     ON o.created_at >= w.tu AND o.created_at < w.den
FULL OUTER JOIN partner_statement t ON t.psp_txn_id = o.psp_txn_id
WHERE o.psp_txn_id IS DISTINCT FROM t.psp_txn_id
   OR o.amount_minor <> t.amount_minor;
```

## Mức ưu tiên — không phải chênh lệch nào cũng như nhau

```text
   ┌────────────┬──────────────────────────┬────────────────────────┐
   │ Ưu tiên    │ Loại                     │ Hạn xử lý              │
   ├────────────┼──────────────────────────┼────────────────────────┤
   │ CAO        │ ONLY_THEIRS              │ TRONG NGÀY             │
   │            │ (khách trả tiền, mình    │                        │
   │            │  không ghi nhận)         │                        │
   ├────────────┼──────────────────────────┼────────────────────────┤
   │ CAO        │ AMOUNT_DIFF > ngưỡng     │ Trong ngày             │
   ├────────────┼──────────────────────────┼────────────────────────┤
   │ TRUNG BÌNH │ ONLY_OURS quá 2 ngày     │ 3 ngày                 │
   ├────────────┼──────────────────────────┼────────────────────────┤
   │ THẤP       │ AMOUNT_DIFF nhỏ do       │ Xử lý theo lô hằng tuần│
   │            │ làm tròn                 │                        │
   └────────────┴──────────────────────────┴────────────────────────┘

   ⚠ ONLY_THEIRS LUÔN LÀ ƯU TIÊN CAO NHẤT.
     Đó là khách đã trả tiền mà chưa nhận được hàng hoặc dịch vụ.
     Để qua ngày là biến thành khiếu nại rồi tranh chấp.
```

## Tự động xử lý những mẫu đã biết

```text
   SAU VÀI THÁNG, BẠN SẼ THẤY CÙNG VÀI NGUYÊN NHÂN LẶP LẠI.
   TỰ ĐỘNG HOÁ CHÚNG ĐỂ NGƯỜI CHỈ XỬ LÝ PHẦN THẬT SỰ MỚI.

   ┌──────────────────────────────────┬──────────────────────────┐
   │ Mẫu                              │ Xử lý tự động            │
   ├──────────────────────────────────┼──────────────────────────┤
   │ ONLY_OURS, tạo hôm qua           │ Chờ thêm 1 ngày rồi xét  │
   │ ONLY_OURS, quá 3 ngày            │ Huỷ ghi nhận + bút toán  │
   │ AMOUNT_DIFF = đúng phí đã biết   │ Ghi bút toán phí, đóng   │
   │ AMOUNT_DIFF ≤ 1 đơn vị tiền      │ Ghi chênh lệch làm tròn  │
   │ ONLY_THEIRS, tìm được đơn khớp   │ Ghi nhận bổ sung         │
   └──────────────────────────────────┴──────────────────────────┘

   ⚠ MỌI XỬ LÝ TỰ ĐỘNG PHẢI GHI resolution_code = 'AUTO_...'
     và vẫn lưu bản ghi đầy đủ.

   → Để còn thống kê được và để giải trình được.
   → Và để phát hiện khi một mẫu "đã biết" đột nhiên tăng vọt —
     đó là dấu hiệu có vấn đề mới.
```

## Ghi sổ cho chênh lệch

```text
   MỌI CHÊNH LỆCH ĐƯỢC ĐÓNG PHẢI CÓ BÚT TOÁN TƯƠNG ỨNG,
   TRỪ KHI KẾT LUẬN LÀ "LỆCH GIẢ DO GHÉP SAI".

   VÍ DỤ:

   Phí chưa ghi nhận:
      Nợ  "Chi phí cổng thanh toán"      15.000
      Có  "Phải thu từ cổng"             15.000

   Giao dịch mình ghi nhầm:
      (bút toán đảo bút toán gốc)

   Chênh lệch làm tròn:
      Nợ/Có "Chênh lệch làm tròn"           2

   Tổn thất không truy được nguyên nhân:
      Nợ  "Chi phí tổn thất vận hành"   350.000
      Có  "Phải thu từ cổng"            350.000

   ⚠ TRƯỜNG HỢP CUỐI PHẢI CÓ NGƯỠNG VÀ PHẢI ĐƯỢC PHÊ DUYỆT.
     "Không truy được nguyên nhân" không được trở thành cái sọt rác
     để đóng mọi chênh lệch khó.
     → Theo dõi tỷ lệ đóng bằng lý do này; nó tăng là dấu hiệu xấu.
```

## Chỉ số theo dõi

```text
   ① SỐ NGÀY LIÊN TIẾP ĐỐI SOÁT KHỚP HOÀN TOÀN
      → Chỉ số sức khoẻ tổng thể, dễ hiểu với mọi người.

   ② SỐ CHÊNH LỆCH ĐANG MỞ, THEO TUỔI
      → Chênh lệch mở quá 7 ngày là dấu hiệu quy trình có vấn đề.

   ③ TỔNG GIÁ TRỊ CHÊNH LỆCH ĐANG MỞ
      → Con số này là mức rủi ro tài chính chưa được giải quyết.

   ④ TỶ LỆ TỰ ĐỘNG XỬ LÝ
      → Càng cao càng tốt, nhưng phải theo dõi cả độ chính xác.

   ⑤ THỜI GIAN TRUNG BÌNH TỪ PHÁT HIỆN TỚI ĐÓNG

   ⑥ PHÂN BỐ resolution_code
      → Nguyên nhân nào hay gặp nhất chính là chỗ nên sửa
        ở hệ thống gốc, không phải chỗ nên tự động hoá thêm.
```

```text
   ⚠ CHỈ SỐ ⑥ LÀ CHỈ SỐ CÓ GIÁ TRỊ NHẤT VÀ HAY BỊ BỎ QUA NHẤT.

   Nếu 60% chênh lệch có lý do "webhook mất", thì việc cần làm
   không phải là tự động hoá việc xử lý chúng, mà là SỬA LUỒNG WEBHOOK.

   Đối soát là lưới an toàn, không phải nơi để sống chung với lỗi.
```

## Khi nào được phép bỏ qua chênh lệch

```text
   NGƯỠNG CHẤP NHẬN CHỈ HỢP LỆ KHI ĐÃ HIỂU NGUYÊN NHÂN.

   ✅ "Bỏ qua chênh lệch ≤ 1 đồng do làm tròn"
      → hiểu nguyên nhân, biết giới hạn, ghi vào tài khoản làm tròn

   ❌ "Bỏ qua chênh lệch dưới 100.000 đồng"
      → không hiểu nguyên nhân, chỉ là ngưỡng cho tiện

   → Ngưỡng loại thứ hai là cách để chênh lệch lớn dần mà không ai biết,
     và là thứ thanh tra sẽ hỏi đầu tiên.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Đối soát bằng Excel thủ công | **Kết luận không được lưu**, không giải trình được | Hệ thống có trạng thái, lưu kết luận |
| Chỉ làm đối soát với đối tác | Bỏ qua tầng nội bộ gần như miễn phí | Làm **tầng 1 trước**, chạy mỗi giờ |
| Không chuẩn hoá dữ liệu | Mỗi đối tác một bộ code riêng | Chuẩn hoá về cấu trúc chung ở bước ② |
| Ghép theo mã đơn hàng | Quan hệ nhiều-nhiều, số không khớp | Ghép theo **mã giao dịch của đối tác** |
| Cửa sổ theo ngày lịch của mình | **Lệch giả** do giờ chốt sổ khác nhau | Cửa sổ theo giờ chốt sổ + múi giờ của đối tác |
| Không lưu file gốc | Mất bằng chứng khi có tranh chấp | Lưu nguyên vẹn, kèm checksum |
| Không kiểm checksum file | Đối tác phát hành lại mà không chạy lại | So checksum mỗi lần tải |
| Chênh lệch chỉ là dòng log | Không ai chịu trách nhiệm, tồn đọng | Có trạng thái, người xử lý, hạn xử lý |
| `resolution_note` là văn bản tự do | Không thống kê được nguyên nhân | `resolution_code` có cấu trúc |
| Để `ONLY_THEIRS` qua ngày | Khách trả tiền không nhận hàng → tranh chấp thua | Ưu tiên cao nhất, xử lý trong ngày |
| Đóng chênh lệch không ghi bút toán | Sổ không phản ánh thực tế | Mọi kết luận đều có bút toán tương ứng |
| Lạm dụng lý do "không truy được" | Thành sọt rác che giấu vấn đề | Có ngưỡng, cần phê duyệt, theo dõi tỷ lệ |
| Ngưỡng bỏ qua không có cơ sở | Chênh lệch lớn dần mà không ai biết | Chỉ bỏ qua khi **hiểu nguyên nhân** |
| Tự động hoá thay vì sửa gốc | Sống chung với lỗi mãi mãi | Xem phân bố `resolution_code`, sửa nguyên nhân |

## Tóm tắt bài 4

- Đối soát là **hệ thống có trạng thái**, không phải script chạy rồi in ra màn hình — vì **kết luận phải lưu lại được để giải trình**.
- **Ba tầng**: nội bộ (mỗi giờ, gần như miễn phí), với đối tác (hằng ngày), tiền thật (hằng ngày). **Nhiều đội bỏ tầng 1 dù nó rẻ nhất và phát hiện sớm nhất.**
- **Chuẩn hoá dữ liệu là bước tiết kiệm công nhất** — làm xong thì logic ghép và phân loại dùng chung cho mọi đối tác.
- **Ghép theo mã giao dịch của đối tác**, và **cửa sổ thời gian theo giờ chốt sổ của họ** — không theo ngày lịch của mình.
- **Chênh lệch có vòng đời riêng**: trạng thái, người xử lý, hạn xử lý, kết luận có cấu trúc.
- **`ONLY_THEIRS` luôn là ưu tiên cao nhất** — khách đã trả tiền mà chưa nhận được gì.
- **Mọi chênh lệch được đóng đều phải có bút toán tương ứng**, và lý do "không truy được nguyên nhân" phải có ngưỡng và cần phê duyệt.
- **Phân bố `resolution_code` là chỉ số giá trị nhất**: nguyên nhân hay gặp nhất là chỗ cần **sửa ở hệ thống gốc**, không phải chỗ cần tự động hoá thêm.
- **Ngưỡng bỏ qua chỉ hợp lệ khi đã hiểu nguyên nhân** — ngưỡng "cho tiện" là cách để chênh lệch lớn dần.

**Bài kế tiếp** → [Bài 5: Đóng sổ và báo cáo](05-dong-so-va-bao-cao.md)

**Quay lại** → [Bài 3: Saga cho luồng tiền](03-saga-cho-luong-tien.md)
