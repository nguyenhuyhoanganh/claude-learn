# Case 9: Sai tỷ giá và sai làm tròn hàng loạt

## Triệu chứng

```text
   Sản phẩm chuyển tiền quốc tế. Khách gửi VND, người nhận nhận USD.

   Cuối tháng, kế toán phát hiện tài khoản ngoại tệ THIẾU 47.000 USD
   so với sổ sách.

   Không có giao dịch nào lỗi. Không có khiếu nại nào từ khách.
   Từng giao dịch riêng lẻ kiểm tra đều thấy đúng.

   Lệch trung bình mỗi giao dịch: 0,4 USD.
   Số giao dịch trong tháng: 118.000.
```

Sự cố loại này **không bao giờ tự lộ ra qua khiếu nại**, vì mỗi khách chỉ lệch vài nghìn đồng. Nó chỉ lộ ra khi có người cộng tổng lại.

## Chẩn đoán

```sql
-- BƯỚC 1: lệch có đều không, hay tập trung ở một nhóm?
SELECT currency_pair,
       count(*)                                   AS so_gd,
       round(avg(expected_amount - actual_amount), 4) AS lech_tb,
       sum(expected_amount - actual_amount)       AS tong_lech
FROM fx_transactions
WHERE created_at >= date_trunc('month', current_date)
GROUP BY 1 ORDER BY 4 DESC;
```

```text
   currency_pair | so_gd   | lech_tb | tong_lech
   --------------+---------+---------+-----------
   VND/USD       | 118.000 |  0.3983 |  47.000
   VND/EUR       |   4.200 |  0.0000 |       0
                              ▲
   Lệch CHỈ ở một cặp tiền, và LỆCH ĐỀU MỘT CHIỀU.

   → Lệch đều một chiều = LỖI HỆ THỐNG, không phải ngẫu nhiên.
     Nếu là ngẫu nhiên thì trung bình phải gần 0.
```

```sql
-- BƯỚC 2: dựng lại phép tính của một giao dịch cụ thể
SELECT id, amount_vnd, fx_rate, amount_usd,
       amount_vnd / fx_rate                       AS tinh_lai,
       round(amount_vnd / fx_rate, 2)             AS tinh_lai_lam_tron,
       amount_usd - round(amount_vnd / fx_rate, 2) AS lech
FROM fx_transactions WHERE id = 88213;
```

```text
   amount_vnd | fx_rate | amount_usd | tinh_lai   | lam_tron | lech
   -----------+---------+------------+------------+----------+-------
   10.000.000 |   25430 |     393.23 | 393.236335 |   393.24 | −0.01
                                            ▲           ▲
                      HỆ THỐNG LÀM TRÒN XUỐNG (cắt cụt)
                      THAY VÌ LÀM TRÒN THEO QUY TẮC

   → Mỗi giao dịch lệch tối đa 0,01 USD. Nhưng LUÔN cùng chiều.
     Cộng 118.000 giao dịch với các mức lệch khác nhau → 47.000 USD.
```

## Bốn nguyên nhân gốc

```text
   ① CẮT CỤT THAY VÌ LÀM TRÒN
      (int) hoặc truncate thay vì round.
      → Luôn lệch một chiều, tích luỹ nhanh.

   ② LÀM TRÒN Ở NHIỀU BƯỚC TRUNG GIAN
      Làm tròn sau mỗi phép tính thay vì chỉ làm tròn kết quả cuối.
      → Sai số cộng dồn qua từng bước.

   ③ DÙNG SỐ THỰC CHO TIỀN
      0.1 + 0.2 ≠ 0.3. Sai số nhỏ nhưng tích luỹ.
      → Đây là lỗi nền tảng (phase 1 bài 1).

   ④ ÁP SAI SỐ CHỮ SỐ THẬP PHÂN THEO ĐỒNG TIỀN
      Làm tròn USD về 0 chữ số, hoặc VND về 2 chữ số.
      → Lệch rất lớn, nhưng thường lộ ra ngay.
```

```text
   ⚠ NGUYÊN NHÂN ① VÀ ② LÀ NGUY HIỂM NHẤT VÌ CHÚNG LỆCH RẤT NHỎ.

   Lệch 0,01 USD không ai khiếu nại, không test nào bắt được
   (test thường kiểm "kết quả đúng khoảng"), và không cảnh báo nào kêu.

   Chúng chỉ lộ ra sau hàng trăm nghìn giao dịch.
```

## Quy tắc tính tiền có tỷ giá

```text
   ① DÙNG KIỂU SỐ THẬP PHÂN CHÍNH XÁC, KHÔNG DÙNG SỐ THỰC
      Java: BigDecimal.  Không bao giờ double/float cho tiền.

   ② CHỈ LÀM TRÒN MỘT LẦN, Ở KẾT QUẢ CUỐI
      Mọi bước trung gian giữ đủ độ chính xác (ít nhất 8 chữ số thập phân).

   ③ LÀM TRÒN THEO QUY TẮC ĐÃ THOẢ THUẬN, KHÔNG CẮT CỤT
      Và quy tắc đó nằm trong hợp đồng, không do kỹ sư chọn.

   ④ SỐ CHỮ SỐ THẬP PHÂN LẤY TỪ ĐỊNH NGHĨA ĐỒNG TIỀN
      USD=2, VND=0, JPY=0, KWD=3 — tra từ bảng, không hardcode.

   ⑤ PHẦN CHÊNH DO LÀM TRÒN PHẢI ĐƯỢC GHI SỔ
      Không được để nó "biến mất".
```

```java
// ❌ SAI
double usd = vnd / rate;                       // số thực
long usdCents = (long)(usd * 100);             // cắt cụt

// ✅ ĐÚNG
BigDecimal vndAmount = BigDecimal.valueOf(amountVndMinor);
BigDecimal rate      = tyGia.getRate();        // BigDecimal, đủ chữ số

BigDecimal usdExact  = vndAmount.divide(rate, 10, RoundingMode.HALF_UP);
int scale            = currencyRegistry.scaleOf("USD");        // = 2
BigDecimal usdFinal  = usdExact.setScale(scale, quyTacLamTron); // làm tròn MỘT LẦN

long usdMinor = usdFinal.movePointRight(scale).longValueExact();
```

## Ghi sổ phần chênh lệch làm tròn

```text
   TIỀN KHÔNG TỰ BIẾN MẤT. NẾU KHÁCH ĐƯA 10.000.000 VND
   VÀ NHẬN 393,23 USD, PHẦN CHÊNH PHẢI Ở ĐÂU ĐÓ.

      Nợ  "Tiền gửi khách hàng (VND)"       10.000.000 VND
      Có  "Tài khoản ngoại tệ (USD)"           393,23 USD
      Có  "Chênh lệch làm tròn"                  0,006335 USD

   → Tài khoản "chênh lệch làm tròn" là tài khoản BẮT BUỘC PHẢI CÓ
     trong mọi hệ thống đa tiền tệ.

   → Nó phải nhỏ và ổn định. Nếu nó tăng nhanh thì có lỗi tính toán.
   → Theo dõi nó hằng ngày chính là cách phát hiện sự cố này SỚM.
```

## Tỷ giá — bốn thứ phải lưu

```text
   ① GIÁ TRỊ TỶ GIÁ đã dùng, đủ chữ số
   ② THỜI ĐIỂM tỷ giá có hiệu lực
   ③ NGUỒN tỷ giá (nhà cung cấp nào)
   ④ LOẠI tỷ giá (mua / bán / tham chiếu)

   ⚠ ĐIỂM ④ HAY BỊ NHẦM VÀ GÂY LỆCH LỚN:

   Dùng tỷ giá tham chiếu để tính tiền khách nhận, trong khi
   công ty mua ngoại tệ theo tỷ giá bán → lỗ mỗi giao dịch.

   → Chênh lệch mua/bán thường 0,5–2%, lớn hơn nhiều
     so với sai số làm tròn.
```

```text
   VÀ MỘT NGUYÊN TẮC QUAN TRỌNG:

   TỶ GIÁ PHẢI ĐƯỢC CHỐT TẠI THỜI ĐIỂM BÁO GIÁ CHO KHÁCH,
   VÀ CÓ HẠN HIỆU LỰC.

   ❌ Báo giá lúc 10:00, khách xác nhận lúc 10:30, hệ thống tính lại
      theo tỷ giá mới → khách nhận số khác với số đã thấy.

   ✅ Chốt tỷ giá, lưu vào đơn, có hạn (ví dụ 15 phút).
      Quá hạn thì báo giá lại và yêu cầu khách xác nhận.
```

## Xử lý ngay

```text
   ① DỪNG NGUỒN LỆCH — sửa hàm tính, deploy sớm nhất có thể

   ② XÁC ĐỊNH PHẠM VI
      Lỗi từ khi nào? Bao nhiêu giao dịch? Tổng bao nhiêu?

   ③ QUYẾT ĐỊNH CÓ ĐIỀU CHỈNH CHO KHÁCH KHÔNG
      · Lệch có lợi cho khách → thường công ty chịu, không đòi lại
        (chi phí đòi lại lớn hơn số tiền, và làm xấu trải nghiệm)
      · Lệch có hại cho khách → PHẢI hoàn trả, kể cả số nhỏ
      → Đây là quyết định của bộ phận tuân thủ, không phải của kỹ thuật.

   ④ GHI SỔ KHOẢN LỆCH có nguồn rõ ràng

         Nợ  "Chi phí tổn thất vận hành"    47.000 USD
         Có  "Tài khoản ngoại tệ"           47.000 USD

   ⑤ BÁO CÁO NỘI BỘ
      Lệch 47.000 USD là mức phải báo cáo lên ban lãnh đạo
      và có thể phải báo cơ quan quản lý tuỳ quy định.
```

## Chặn tái diễn

```text
   ① CẤM DÙNG double/float CHO TIỀN — kiểm tra tự động

   ② TÀI KHOẢN CHÊNH LỆCH LÀM TRÒN + CẢNH BÁO KHI NÓ TĂNG BẤT THƯỜNG
      → Đây là biện pháp phát hiện sớm hiệu quả nhất.

   ③ TEST TÍNH CHẤT, KHÔNG CHỈ TEST VÍ DỤ
      Test một vài ví dụ cụ thể không bắt được lệch 0,01.
      Cần test kiểm tra TÍNH CHẤT trên nhiều đầu vào ngẫu nhiên.

   ④ ĐỐI SOÁT SỐ DƯ NGOẠI TỆ HẰNG NGÀY, không phải hằng tháng

   ⑤ MỌI HÀM TÍNH TIỀN TẬP TRUNG MỘT CHỖ
      Không để mỗi nơi tự tính. Một hàm, một quy tắc làm tròn.
```

```java
// Test tính chất: tổng phải bảo toàn, bất kể đầu vào
@Property(tries = 10_000)
void tong_sau_khi_quy_doi_phai_bao_toan(
        @ForAll @LongRange(min = 1000, max = 10_000_000_000L) long vnd,
        @ForAll @BigRange(min = "20000", max = "30000") BigDecimal rate) {

    var kq = fxService.quyDoi(vnd, "VND", "USD", rate);

    // Số nhận + phần chênh lệch làm tròn = số lý thuyết
    BigDecimal lyThuyet = BigDecimal.valueOf(vnd).divide(rate, 10, HALF_UP);
    BigDecimal thucTe   = kq.soTienNhan().add(kq.chenhLechLamTron());

    assertThat(thucTe.subtract(lyThuyet).abs())
        .isLessThan(new BigDecimal("0.0000000001"));
}
```

```sql
-- Cảnh báo hằng ngày: chênh lệch làm tròn tăng bất thường
SELECT created_at::date AS ngay,
       sum(rounding_diff) AS tong_chenh_lech,
       count(*)           AS so_gd,
       round(sum(rounding_diff) / count(*), 6) AS tb_moi_gd
FROM fx_transactions
WHERE created_at > now() - interval '14 days'
GROUP BY 1 ORDER BY 1;
-- → tb_moi_gd phải nhỏ và DAO ĐỘNG QUANH 0.
--   Luôn cùng dấu = có lỗi hệ thống.
```

## Bài học

```text
   ① LỆCH ĐỀU MỘT CHIỀU LÀ LỖI HỆ THỐNG.
      Lệch ngẫu nhiên thì trung bình phải gần 0.
      Đây là dấu hiệu chẩn đoán mạnh nhất.

   ② CẮT CỤT KHÁC LÀM TRÒN. Cắt cụt luôn lệch một chiều.

   ③ CHỈ LÀM TRÒN MỘT LẦN, Ở KẾT QUẢ CUỐI CÙNG.

   ④ PHẦN CHÊNH DO LÀM TRÒN PHẢI ĐƯỢC GHI SỔ, KHÔNG ĐƯỢC BIẾN MẤT.
      Và tài khoản đó chính là công cụ phát hiện sớm.

   ⑤ SAI TỶ GIÁ MUA/BÁN GÂY LỆCH LỚN HƠN SAI LÀM TRÒN RẤT NHIỀU.
      Kiểm tra loại tỷ giá trước khi đi tìm lỗi làm tròn.

   ⑥ SỰ CỐ NÀY KHÔNG BAO GIỜ LỘ RA QUA KHIẾU NẠI.
      Mỗi khách chỉ lệch vài nghìn đồng. Chỉ đối soát tổng mới thấy.
      → Đối soát hằng ngày, không phải hằng tháng.

   ⑦ TEST VÍ DỤ KHÔNG BẮT ĐƯỢC LỆCH 0,01.
      Cần test tính chất trên nhiều đầu vào ngẫu nhiên.
```

**Bài kế tiếp** → [Case 10: Rò rỉ dữ liệu từ bên trong](10-ro-ri-du-lieu-noi-bo.md)

**Quay lại** → [Case 8: Deploy giữa chừng](08-deploy-giua-chung.md)
