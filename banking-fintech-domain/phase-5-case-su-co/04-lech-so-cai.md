# Case 4: Lệch sổ cái

## Triệu chứng

```text
   Kiểm tra ràng buộc sống còn của ví (phase 2 bài 4):

      Σ số dư mọi ví trong hệ thống  =  10.000.000.000 đ
      Số dư tài khoản đảm bảo tại NH =   9.987.400.000 đ
      ────────────────────────────────────────────────────
      LỆCH                                12.600.000 đ

   Nghĩa là: công ty đang NỢ KHÁCH HÀNG NHIỀU HƠN số tiền thật có.

   Không có giao dịch nào báo lỗi. Không có ví nào âm.
   Từng bút toán riêng lẻ đều cân.
```

Lệch sổ là loại sự cố **không tự lộ ra** — chỉ phát hiện được khi có người chủ động kiểm tra ràng buộc tổng thể.

## Chẩn đoán — thu hẹp theo thời gian trước

```sql
-- BƯỚC 1: lệch xuất hiện từ khi nào?
-- Nếu có ảnh chụp số dư cuối mỗi ngày, đây là câu hỏi trả lời được ngay.
SELECT snapshot_date,
       total_wallet_balance,
       escrow_balance,
       total_wallet_balance - escrow_balance AS lech
FROM daily_balance_snapshots
WHERE snapshot_date > current_date - 30
ORDER BY snapshot_date;
```

```text
   snapshot_date | total_wallet | escrow        | lech
   --------------+--------------+---------------+------------
   2026-07-28    | 9.850.000.000| 9.850.000.000 |          0
   2026-07-29    | 9.910.000.000| 9.910.000.000 |          0
   2026-07-30    | 9.960.000.000| 9.951.800.000 |  8.200.000  ← BẮT ĐẦU
   2026-07-31    |10.000.000.000| 9.987.400.000 | 12.600.000
                                                    ▲
   → Thu hẹp từ 30 ngày xuống MỘT NGÀY. Đây là bước tiết kiệm
     nhiều thời gian nhất, và nó chỉ làm được nếu có ảnh chụp hằng ngày.
```

```sql
-- BƯỚC 2: trong ngày đó, loại giao dịch nào gây lệch?
SELECT entry_type,
       count(*)                    AS so_luong,
       sum(amount_minor)           AS tong_tien,
       count(*) FILTER (WHERE counterpart_entry_id IS NULL) AS thieu_doi_ung
FROM wallet_entries
WHERE created_at::date = DATE '2026-07-30'
GROUP BY entry_type
ORDER BY 4 DESC;
```

```text
   entry_type   | so_luong | tong_tien     | thieu_doi_ung
   -------------+----------+---------------+---------------
   BONUS_CREDIT |      164 |     8.200.000 |           164   ← THỦ PHẠM
   TOPUP        |    4.201 | 1.240.000.000 |             0
   PAYMENT      |   12.880 | ...           |             0

   → 164 bút toán CỘNG tiền vào ví mà KHÔNG CÓ BÚT TOÁN ĐỐI ỨNG.
     Tiền xuất hiện từ hư không.
```

## Bốn nguyên nhân gốc phổ biến

```text
   ① BÚT TOÁN MỘT VẾ  ← trường hợp trên
      Cộng tiền vào ví mà không ghi có/nợ ở đâu.
      Thường gặp ở: khuyến mãi, hoàn tiền thiện chí, điều chỉnh thủ công.

   ② GHI SỔ NGOÀI TRANSACTION VỚI THAO TÁC TIỀN
      Chuyển tiền thành công nhưng ghi sổ lỗi, hoặc ngược lại.

   ③ TÍNH LỆCH DO LÀM TRÒN
      Chia tiền cho nhiều bên, phần dư không được phân bổ (phase 1 bài 7).
      → Lệch nhỏ nhưng tích luỹ liên tục.

   ④ ĐẾM NHẦM PHẠM VI
      Ví nội bộ, ví kỹ thuật, tài khoản chờ bị tính hoặc không tính
      vào tổng một cách không nhất quán.
      → Đây là "lệch giả", sổ vẫn đúng.

   ⚠ PHẢI LOẠI TRỪ ④ TRƯỚC KHI ĐIỀU TRA ①②③.
     Rất nhiều báo cáo lệch hoá ra là do định nghĩa "tổng" không rõ.
```

## Vì sao bút toán một vế lọt qua được

```text
   ❌ MÃ NGUỒN GÂY RA SỰ CỐ:

      void tangKhuyenMai(Long viId, long soTien) {
          walletRepo.credit(viId, soTien);      // chỉ có MỘT dòng
      }

   Trông vô hại. Nhưng nó vi phạm nguyên tắc hạch toán kép:
   tiền phải ĐẾN TỪ ĐÂU ĐÓ.

   ✅ ĐÚNG:

      void tangKhuyenMai(Long viId, long soTien) {
          ledger.post(JournalEntry.builder()
              .debit("CHI_PHI_KHUYEN_MAI", soTien)
              .credit("VI_KHACH_HANG:" + viId, soTien)
              .reference(...)
              .build());
      }

   → Tiền đến từ tài khoản chi phí khuyến mãi.
     Sổ cân, và báo cáo tài chính phản ánh đúng chi phí đã bỏ ra.
```

```text
   ⚠ VÌ SAO LỖI NÀY PHỔ BIẾN:

   Vì API kiểu credit()/debit() cho phép ghi MỘT VẾ.
   Chỉ cần một chỗ trong code gọi nó là sổ lệch.

   → CÁCH CHẶN TRIỆT ĐỂ: KHÔNG CUNG CẤP API GHI MỘT VẾ.
     Chỉ có postJournalEntry() nhận vào danh sách các vế,
     và tự kiểm tra tổng nợ = tổng có trước khi ghi.
```

## Xử lý ngay

```text
   ① ĐỪNG VỘI "SỬA CHO CÂN"
      Cám dỗ lớn nhất là chạy một bút toán điều chỉnh 12,6 triệu
      cho số khớp lại. ĐỪNG.
      → Trước hết phải biết lệch ĐẾN TỪ ĐÂU. Sửa mù là mất dấu vết.

   ② DỪNG NGUỒN GÂY LỆCH
      Tắt tính năng khuyến mãi đang lỗi trước khi lệch to thêm.

   ③ XÁC ĐỊNH TỪNG BÚT TOÁN THIẾU ĐỐI ỨNG
      Liệt kê đủ 164 bút toán, tổng phải khớp đúng 8,2 triệu của ngày đó.
      → Không khớp nghĩa là còn nguyên nhân khác chưa tìm ra.

   ④ GHI BÚT TOÁN BÙ CÓ NGUỒN RÕ RÀNG

         Nợ  "Chi phí khuyến mãi"        12.600.000
         Có  "Ví khách hàng" (tổng hợp)  12.600.000

      → Số dư ví KHÔNG đổi (khách vẫn giữ tiền đã nhận),
        chỉ ghi nhận đúng nguồn của khoản tiền đó.
      → Sổ cân trở lại, và báo cáo phản ánh đúng chi phí thật.

   ⑤ NẾU LỆCH DO TIỀN THẬT MẤT (không phải bút toán thiếu)
      → nạp thêm tiền vào tài khoản đảm bảo cho khớp,
        và ghi chi phí tổn thất.
```

```text
   ⚠ PHÂN BIỆT HAI TÌNH HUỐNG:

   LỆCH DO GHI SỔ THIẾU  → tiền thật vẫn đủ, chỉ sổ sai
                            → sửa bằng bút toán bù, không cần nạp tiền

   LỆCH DO TIỀN THẬT MẤT → công ty đang nợ khách nhiều hơn tiền có
                            → PHẢI NẠP TIỀN THẬT vào tài khoản đảm bảo

   Nhầm hai tình huống này dẫn tới hoặc nạp tiền thừa,
   hoặc để nguyên tình trạng thiếu tiền thật.
```

## Chặn tái diễn

```text
   ① KHÔNG CÓ API GHI MỘT VẾ
      Chỉ có postJournalEntry(), tự kiểm tổng nợ = tổng có.
      Đây là biện pháp hiệu quả nhất và nên làm đầu tiên.

   ② RÀNG BUỘC Ở DATABASE
      Mỗi bút toán phải thuộc một journal_entry, và mỗi journal_entry
      phải cân. Kiểm bằng trigger hoặc bằng job chạy liên tục.

   ③ ẢNH CHỤP SỐ DƯ CUỐI MỖI NGÀY
      Không có nó thì mọi cuộc điều tra đều bắt đầu từ con số 0
      và mất nhiều ngày.

   ④ KIỂM TRA RÀNG BUỘC TỔNG THỂ MỖI GIỜ, không chỉ mỗi ngày
      Phát hiện sau 1 giờ khác hẳn phát hiện sau 30 ngày.

   ⑤ ĐỊNH NGHĨA RÕ "TỔNG" GỒM NHỮNG TÀI KHOẢN NÀO
      Viết ra thành tài liệu và thành code dùng chung,
      để mọi báo cáo dùng cùng một định nghĩa.
```

```sql
-- Kiểm tra chạy mỗi giờ
WITH kiem_tra AS (
    SELECT
      (SELECT sum(balance_minor) FROM wallets WHERE type = 'CUSTOMER') AS tong_vi,
      (SELECT balance_minor FROM escrow_accounts WHERE id = 1)         AS escrow
)
SELECT tong_vi, escrow, tong_vi - escrow AS lech,
       CASE WHEN tong_vi <> escrow THEN 'CẢNH BÁO' ELSE 'OK' END AS trang_thai
FROM kiem_tra;
```

```sql
-- Kiểm tra mọi bút toán đều cân
SELECT journal_entry_id,
       sum(CASE WHEN side = 'DEBIT'  THEN amount_minor ELSE 0 END) AS tong_no,
       sum(CASE WHEN side = 'CREDIT' THEN amount_minor ELSE 0 END) AS tong_co
FROM ledger_lines
GROUP BY journal_entry_id
HAVING sum(CASE WHEN side = 'DEBIT'  THEN amount_minor ELSE 0 END)
    <> sum(CASE WHEN side = 'CREDIT' THEN amount_minor ELSE 0 END);
-- → phải trả về 0 dòng, luôn luôn
```

## Bài học

```text
   ① LỆCH SỔ KHÔNG TỰ LỘ RA.
      Từng giao dịch đều đúng, không lỗi nào, không ví nào âm.
      Chỉ ràng buộc TỔNG THỂ mới phát hiện được.

   ② API CHO PHÉP GHI MỘT VẾ LÀ LỖI THIẾT KẾ.
      Chỉ cần một chỗ gọi sai là sổ lệch, và rất khó tìm.

   ③ ẢNH CHỤP HẰNG NGÀY LÀ CÔNG CỤ ĐIỀU TRA QUAN TRỌNG NHẤT.
      Nó thu hẹp phạm vi từ 30 ngày xuống một ngày trong một truy vấn.

   ④ ĐỪNG SỬA CHO CÂN TRƯỚC KHI BIẾT NGUYÊN NHÂN.
      Sửa mù làm mất dấu vết, và nguyên nhân vẫn còn đó.

   ⑤ PHÂN BIỆT "SỔ SAI" VỚI "TIỀN THẬT MẤT".
      Hai tình huống, hai cách xử lý hoàn toàn khác nhau.

   ⑥ KIỂM TRA MỖI GIỜ, KHÔNG PHẢI MỖI THÁNG.
      Chi phí kiểm tra gần bằng 0; chi phí phát hiện muộn thì rất lớn.
```

**Bài kế tiếp** → [Case 5: Đối soát lệch không giải thích được](05-doi-soat-lech.md)

**Quay lại** → [Case 3: Số dư âm](03-so-du-am.md)
