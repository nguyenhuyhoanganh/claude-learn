# Bài 5: Đóng sổ và báo cáo

## Vì sao đóng sổ tồn tại

```text
   SỔ CÁI LÀ MỘT DÒNG CHẢY LIÊN TỤC. NHƯNG BÁO CÁO TÀI CHÍNH
   CẦN MỘT BỨC ẢNH TĨNH: "TÍNH TỚI HẾT NGÀY 31/07, TÌNH HÌNH THẾ NÀO."

   VẤN ĐỀ: bút toán của tháng 7 vẫn có thể được ghi vào ngày 3/8.
      · Đối soát ngày 31/07 xong vào ngày 02/08
      · Phí của đối tác báo về ngày 03/08
      · Bút toán điều chỉnh sau khi kiểm tra

   → Nếu chạy báo cáo tháng 7 vào ngày 01/08 và ngày 05/08,
     BẠN SẼ NHẬN HAI CON SỐ KHÁC NHAU.

   ĐÓNG SỔ LÀ VIỆC CHỐT LẠI: "TỪ GIỜ, KHÔNG AI ĐƯỢC GHI THÊM
   BÚT TOÁN VÀO KỲ NÀY NỮA."
```

## Ngày nghiệp vụ, không phải ngày ghi

```text
   ĐÂY LÀ NỀN TẢNG CỦA MỌI THỨ TRONG BÀI NÀY (đã nhắc ở bài 1):

      business_date  — bút toán này THUỘC VỀ kỳ nào
      created_at     — bút toán này ĐƯỢC GHI lúc nào

   Bút toán phí của giao dịch ngày 31/07, ghi vào 03/08:
      business_date = 2026-07-31
      created_at    = 2026-08-03

   → Báo cáo tháng 7 dùng business_date.
   → Nhật ký kiểm toán dùng created_at.

   ⚠ HỆ THỐNG CHỈ CÓ MỘT CỘT NGÀY SẼ KHÔNG BAO GIỜ LÀM ĐÚNG
     BÁO CÁO TÀI CHÍNH.
```

## Ba trạng thái của một kỳ

```text
   ┌─────────────────────────────────────────────────────────────┐
   │ MỞ  (open)                                                   │
   │   Ghi bút toán bình thường.                                  │
   ├─────────────────────────────────────────────────────────────┤
   │ TẠM KHOÁ  (soft close)                                       │
   │   Chỉ người có quyền đặc biệt mới ghi được, phải có lý do.  │
   │   Dùng trong lúc đối soát và kiểm tra.                       │
   ├─────────────────────────────────────────────────────────────┤
   │ KHOÁ HẲN  (hard close)                                       │
   │   KHÔNG AI ghi được, kể cả quản trị viên.                    │
   │   Sai sót phát hiện sau → ghi vào KỲ HIỆN TẠI               │
   │   dưới dạng bút toán điều chỉnh.                             │
   └─────────────────────────────────────────────────────────────┘
```

```sql
CREATE TABLE accounting_periods (
    period_code   TEXT PRIMARY KEY,        -- '2026-07'
    start_date    DATE NOT NULL,
    end_date      DATE NOT NULL,
    status        TEXT NOT NULL,           -- OPEN|SOFT_CLOSED|HARD_CLOSED
    closed_at     TIMESTAMPTZ,
    closed_by     TEXT
);

-- Cưỡng chế ở tầng database, không dựa vào tầng ứng dụng
CREATE OR REPLACE FUNCTION chan_ghi_ky_da_dong() RETURNS TRIGGER AS $$
DECLARE trang_thai TEXT;
BEGIN
    SELECT status INTO trang_thai FROM accounting_periods
    WHERE NEW.business_date BETWEEN start_date AND end_date;

    IF trang_thai = 'HARD_CLOSED' THEN
        RAISE EXCEPTION 'Kỳ chứa ngày % đã khoá hẳn', NEW.business_date;
    END IF;
    IF trang_thai = 'SOFT_CLOSED'
       AND NOT has_role(current_user, 'accounting_adjuster') THEN
        RAISE EXCEPTION 'Kỳ chứa ngày % đang tạm khoá', NEW.business_date;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chan_ky_dong
    BEFORE INSERT ON journal_entries
    FOR EACH ROW EXECUTE FUNCTION chan_ghi_ky_da_dong();
```

```text
   ⚠ VÌ SAO PHẢI CƯỠNG CHẾ Ở DATABASE:

   Job nền, script vận hành, dịch vụ khác đều ghi thẳng vào sổ cái.
   Kiểm tra ở tầng ứng dụng chỉ chặn được một đường vào.
   (Cùng nguyên tắc với ràng buộc cân đối ở bài 1.)
```

## Quy trình đóng sổ

```text
   ① NGỪNG PHÁT SINH BÚT TOÁN CHO KỲ (chuyển sang TẠM KHOÁ)

   ② ĐẢM BẢO MỌI GIAO DỊCH ĐANG TREO ĐÃ KẾT LUẬN
      · Tài khoản treo phải về 0 (phase 5 case 2)
      · Saga đang chạy phải kết thúc (bài 3)
      · Giao dịch trạng thái "không xác định" phải được tra soát xong
      → BƯỚC NÀY HAY BỊ BỎ QUA, và nó là nguyên nhân
        phải mở lại kỳ đã đóng.

   ③ HOÀN TẤT ĐỐI SOÁT MỌI ĐỐI TÁC (bài 4)
      Mọi chênh lệch phải ở trạng thái RESOLVED hoặc ACCEPTED.

   ④ CHẠY CÁC BÚT TOÁN CUỐI KỲ
      · Trích lập dự phòng (phase 3 bài 5)
      · Phân bổ chi phí trả trước
      · Đánh giá lại số dư ngoại tệ theo tỷ giá cuối kỳ
      · Ghi nhận lãi dự thu

   ⑤ CHẠY BỘ KIỂM TRA TOÀN VẸN
      · Mọi bút toán cân
      · Σ số dư tài sản = Σ nợ phải trả + vốn
      · Số dư đệm khớp tổng các vế
      · Không còn bút toán nào ở trạng thái nháp

   ⑥ CHỤP ẢNH SỐ DƯ MỌI TÀI KHOẢN

   ⑦ SINH BÁO CÁO

   ⑧ NGƯỜI CÓ THẨM QUYỀN PHÊ DUYỆT → chuyển sang KHOÁ HẲN
```

```sql
-- Bước ⑤ — bộ kiểm tra bắt buộc, sai một là không được đóng
WITH kiem_tra AS (
    SELECT 'Bút toán không cân' AS ten,
           count(*) AS so_loi
    FROM (SELECT journal_entry_id FROM journal_lines
          GROUP BY 1
          HAVING sum(CASE WHEN direction='D' THEN amount_minor ELSE -amount_minor END) <> 0) t
    UNION ALL
    SELECT 'Tài khoản treo chưa về 0',
           count(*) FROM accounts
           WHERE account_type = 'SUSPENSE' AND balance_minor <> 0
    UNION ALL
    SELECT 'Giao dịch chưa kết luận',
           count(*) FROM transfers WHERE status IN ('SENT','UNKNOWN')
    UNION ALL
    SELECT 'Chênh lệch đối soát chưa đóng',
           count(*) FROM recon_breaks WHERE status IN ('OPEN','INVESTIGATING')
)
SELECT * FROM kiem_tra WHERE so_loi > 0;
-- → phải trả về 0 dòng mới được đóng sổ
```

## Ảnh chụp số dư — vì sao bắt buộc

```sql
CREATE TABLE balance_snapshots (
    period_code   TEXT NOT NULL,
    account_id    BIGINT NOT NULL,
    currency      CHAR(3) NOT NULL,
    balance_minor BIGINT NOT NULL,
    debit_total   BIGINT NOT NULL,      -- tổng phát sinh nợ trong kỳ
    credit_total  BIGINT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (period_code, account_id, currency)
);
```

```text
   ⚠ VÌ SAO KHÔNG TÍNH LẠI TỪ SỔ CÁI MỖI LẦN CẦN:

   ① CHẬM — tính tổng vài chục triệu vế cho mỗi báo cáo

   ② VÀ QUAN TRỌNG HƠN: KẾT QUẢ CÓ THỂ ĐỔI

      Nếu ai đó ghi bút toán điều chỉnh vào kỳ cũ (khi kỳ mới ở
      trạng thái tạm khoá), tính lại sẽ ra số khác báo cáo đã nộp.

   → Ảnh chụp là BẢN GHI BẤT BIẾN của con số đã công bố.
     Báo cáo tháng 7 nộp cơ quan quản lý phải dựng lại được
     y nguyên sau nhiều năm.
```

## Sửa sai sau khi đã đóng sổ

```text
   PHÁT HIỆN SAI SÓT CỦA THÁNG 7 VÀO THÁNG 9. LÀM GÌ?

   ❌ MỞ LẠI KỲ THÁNG 7 VÀ SỬA
      → Báo cáo đã nộp không còn khớp với sổ
      → Mất tính tin cậy của mọi báo cáo đã công bố

   ✅ GHI BÚT TOÁN ĐIỀU CHỈNH VÀO KỲ HIỆN TẠI (tháng 9)
      · business_date = ngày trong tháng 9
      · Ghi rõ trong mô tả: điều chỉnh cho kỳ tháng 7
      · Có tham chiếu tới bút toán gốc
      · Có phê duyệt

   ⚠ NGOẠI LỆ DUY NHẤT: sai sót TRỌNG YẾU, phải trình bày lại
     báo cáo đã công bố. Đây là quyết định của kế toán trưởng
     và có thể phải báo cáo cơ quan quản lý — không phải
     quyết định kỹ thuật.
```

## Ba báo cáo cơ bản

```text
   ① BẢNG CÂN ĐỐI KẾ TOÁN — bức ảnh tại một thời điểm
      Tài sản = Nợ phải trả + Vốn chủ sở hữu

      Với fintech:
         TÀI SẢN      : tiền ở ngân hàng, cho vay khách hàng,
                        phải thu từ đối tác
         NỢ PHẢI TRẢ  : SỐ DƯ VÍ CỦA KHÁCH  ← khoản lớn nhất
         VỐN          : vốn góp + lợi nhuận giữ lại

   ② BÁO CÁO KẾT QUẢ KINH DOANH — một khoảng thời gian
      Doanh thu (phí giao dịch, lãi cho vay)
      − Chi phí (phí đối tác, dự phòng, vận hành)
      = Lợi nhuận

   ③ BÁO CÁO LƯU CHUYỂN TIỀN TỆ — tiền thật vào ra

   ⚠ BÁO CÁO ③ KHÁC BÁO CÁO ② VÀ ĐÂY LÀ CHỖ HAY GÂY NHẦM:

   Ghi nhận doanh thu ngày 1 nhưng tiền về ngày 3 (T+2),
   và một phần bị giữ lại 90 ngày (phase 2 bài 3).
   → "Sổ có lãi mà tài khoản không có tiền" là tình huống
     hoàn toàn bình thường và phải giải thích được.
```

## Số dư ví khách là nợ phải trả — hệ quả thực tế

```text
   ĐIỀU NÀY ĐÃ NÓI Ở BÀI 1, NHƯNG Ở TẦNG BÁO CÁO NÓ CÓ HỆ QUẢ LỚN:

   Ví khách 10 tỷ KHÔNG PHẢI doanh thu, KHÔNG PHẢI tài sản của công ty.
   Nó là khoản công ty NỢ khách.

   → Và nó phải có tài sản đối ứng: tiền trong tài khoản đảm bảo.

      TÀI SẢN                          NỢ PHẢI TRẢ
      Tiền tài khoản đảm bảo  10 tỷ    Số dư ví khách   10 tỷ

   ⚠ NẾU HAI CON SỐ NÀY KHÔNG BẰNG NHAU:
      · Tài sản < nợ phải trả → công ty đang thiếu tiền của khách
        → đây là vấn đề nghiêm trọng về mặt pháp lý, không chỉ kế toán
      · Tài sản > nợ phải trả → có tiền thừa chưa xác định được chủ

   → Đây chính là ràng buộc đã nói ở phase 2 bài 4, nhìn từ
     góc độ báo cáo tài chính.
```

## Báo cáo tự động và bất biến

```text
   YÊU CẦU BẮT BUỘC CHO MỌI BÁO CÁO TÀI CHÍNH:

   ① DỰNG LẠI ĐƯỢC
      Chạy lại báo cáo tháng 7 hôm nay phải ra đúng con số
      đã nộp — nhờ ảnh chụp, không tính lại từ sổ.

   ② LƯU BẢN ĐÃ NỘP
      Lưu chính file đã gửi đi, kèm thời điểm, người gửi, checksum.

   ③ TRUY NGƯỢC ĐƯỢC
      Từ một con số trên báo cáo, đi ngược về được tập bút toán
      tạo ra nó.
      → Đây là câu hỏi thanh tra hay hỏi nhất về báo cáo.

   ④ CÓ PHIÊN BẢN
      Sửa mẫu báo cáo thì phải biết báo cáo cũ dùng mẫu nào.
```

```sql
-- Truy ngược: con số "doanh thu phí tháng 7" gồm những bút toán nào
SELECT je.id, je.business_date, je.entry_type, je.reference_id,
       jl.amount_minor, je.description
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.journal_entry_id
JOIN accounts a ON a.id = jl.account_id
WHERE a.code = 'REVENUE:TRANSACTION_FEE'
  AND je.business_date BETWEEN DATE '2026-07-01' AND DATE '2026-07-31'
  AND jl.direction = 'C'
ORDER BY je.business_date;
```

## Lịch đóng sổ

```text
   ┌──────────────┬────────────────────────────────────────────┐
   │ Hằng ngày    │ Đối soát, kiểm tra ràng buộc, chụp ảnh số dư│
   │              │ → Không "đóng", nhưng phải sạch mỗi ngày   │
   ├──────────────┼────────────────────────────────────────────┤
   │ Hằng tháng   │ Đóng sổ đầy đủ, báo cáo nội bộ             │
   ├──────────────┼────────────────────────────────────────────┤
   │ Hằng quý/năm │ Báo cáo cho cơ quan quản lý, kiểm toán     │
   └──────────────┴────────────────────────────────────────────┘

   ⚠ NGUYÊN TẮC: ĐÓNG SỔ THÁNG CHỈ DỄ NẾU MỖI NGÀY ĐÃ SẠCH.

   Nếu tài khoản treo còn số dư suốt 30 ngày, chênh lệch đối soát
   tồn đọng cả tháng, thì đóng sổ tháng sẽ mất nhiều ngày và
   phải xử lý hàng trăm vấn đề cùng lúc.

   → Công việc thật nằm ở kỷ luật hằng ngày, không nằm ở
     quy trình đóng sổ cuối tháng.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Chỉ có một cột ngày | **Không bao giờ làm đúng báo cáo tài chính** | Tách `business_date` và `created_at` |
| Không có trạng thái kỳ kế toán | Bút toán ghi vào kỳ đã báo cáo → số liệu đổi | Ba trạng thái, cưỡng chế ở database |
| Kiểm tra kỳ đóng ở tầng ứng dụng | Job nền và script vẫn ghi được | Trigger ở database |
| Không kiểm tra giao dịch treo trước khi đóng | Phải mở lại kỳ đã đóng | Bộ kiểm tra bắt buộc, sai một là không đóng |
| Mở lại kỳ đã đóng để sửa | Báo cáo đã nộp không còn khớp sổ | Bút toán điều chỉnh vào **kỳ hiện tại** |
| Tính lại báo cáo từ sổ cái mỗi lần | Chậm, và **kết quả có thể đổi** | Ảnh chụp số dư là bản ghi bất biến |
| Không lưu file báo cáo đã nộp | Không chứng minh được đã nộp gì | Lưu file, thời điểm, người gửi, checksum |
| Coi số dư ví khách là doanh thu | Sai bản chất, sai mọi báo cáo | Ví khách là **nợ phải trả**, có tài sản đối ứng |
| Nhầm lợi nhuận với dòng tiền | "Sổ có lãi mà tài khoản không có tiền" gây hoảng loạn | Ba báo cáo riêng, giải thích được chênh lệch |
| Không truy ngược được từ báo cáo về bút toán | Không trả lời được câu hỏi thanh tra | Giữ liên kết từ con số về tập bút toán |
| Dồn mọi việc vào cuối tháng | Đóng sổ mất nhiều ngày, đầy rủi ro | **Kỷ luật hằng ngày** mới là công việc thật |

## Tóm tắt bài 5

- Đóng sổ tồn tại vì **bút toán của kỳ cũ vẫn có thể được ghi sau ngày cuối kỳ** — không chốt lại thì chạy báo cáo hai lần ra hai số.
- **`business_date` tách khỏi `created_at`** là nền tảng; hệ thống một cột ngày không bao giờ làm đúng báo cáo tài chính.
- **Ba trạng thái kỳ**: mở, tạm khoá, khoá hẳn — và phải **cưỡng chế ở database** vì job nền và script ghi thẳng vào sổ.
- Quy trình tám bước, trong đó **bước kiểm tra giao dịch treo hay bị bỏ qua nhất** và là nguyên nhân phải mở lại kỳ đã đóng.
- **Ảnh chụp số dư là bản ghi bất biến của con số đã công bố** — không tính lại từ sổ cái, vì kết quả có thể đổi.
- **Sai sót sau khi đóng sổ thì ghi bút toán điều chỉnh vào kỳ hiện tại**, không mở lại kỳ cũ.
- **Số dư ví khách là nợ phải trả và phải có tài sản đối ứng** — hai con số không bằng nhau là vấn đề pháp lý, không chỉ kế toán.
- **Lợi nhuận khác dòng tiền**: doanh thu ghi ngày 1, tiền về ngày 3, một phần giữ 90 ngày — "sổ có lãi mà tài khoản không có tiền" là bình thường.
- Báo cáo phải **dựng lại được, lưu bản đã nộp, truy ngược được về bút toán, và có phiên bản**.
- **Đóng sổ tháng chỉ dễ nếu mỗi ngày đã sạch** — công việc thật nằm ở kỷ luật hằng ngày.

---

## Hết khoá học

Bạn đã đi qua sáu phase:

```text
   phase-1  Tiền và sổ cái          — nền tảng: hạch toán kép, số dư, đối soát
   phase-2  Thanh toán              — hệ sinh thái, thẻ, QR, ví, cổng thanh toán
   phase-3  Tín dụng                — khoản vay, chấm điểm, lãi, nhóm nợ
   phase-4  Rủi ro và tuân thủ      — KYC, AML, gian lận, kiểm soát, audit
   phase-5  Mười case sự cố         — những gì thật sự hỏng trong production
   phase-6  Thiết kế hệ thống       — ledger, idempotency, saga, đối soát, đóng sổ
```

**Ba điều đáng nhớ nhất của cả khoá:**

```text
   ① TIỀN LUÔN PHẢI CÓ NGUỒN.
      Mọi bút toán cân, mọi khoản chi có đối ứng, mọi chênh lệch
      được ghi nhận. Sổ cái tự kiểm tra được chính nó.

   ② TRẠNG THÁI "KHÔNG BIẾT" LÀ TRẠNG THÁI HỢP LỆ.
      Timeout không phải thất bại. Ép nó về thành công hay thất bại
      đều dẫn tới mất tiền thật. Đây là nguyên nhân của phần lớn
      case ở phase 5.

   ③ LỚP PHÒNG THỦ Ở TẦNG DATABASE LÀ LỚP DUY NHẤT KHÔNG VÒNG QUA ĐƯỢC.
      Job nền, script vận hành, công cụ quản trị, dịch vụ khác —
      tất cả đều ghi thẳng vào database mà không qua tầng ứng dụng.
```

**Quay lại** → [Bài 4: Đối soát tự động](04-doi-soat-tu-dong.md) · **Mục lục** → [README](../README.md) · **Từ điển** → [Thuật ngữ](../00-thuat-ngu.md)
