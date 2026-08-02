# Bài 4: Lịch trả nợ — dựng, sửa và những phép tính không được sai

## Sự cố mở đầu

Ngày 31 tháng 1, một công ty tài chính giải ngân 4.200 khoản vay trả góp 12 tháng.

Hệ thống dựng lịch trả nợ: kỳ 1 đến hạn 28 tháng 2, kỳ 2 đến hạn 28 tháng 3, kỳ 3 đến hạn 28 tháng 4...

Tháng 3, khách gọi lên: *"Sao ngày đến hạn của tôi lại là 28 mà không phải 31? Tôi lĩnh lương ngày 30."*

Nguyên nhân: tháng 2 không có ngày 31, code lấy ngày cuối tháng 2 là 28, rồi **dùng ngày 28 đó làm mốc cho mọi kỳ sau**. Ngày đến hạn của cả khoản vay bị dịch vĩnh viễn từ 31 xuống 28.

Hậu quả không chỉ là khách khó chịu:

- 4.200 khách có ngày đến hạn **trước ngày nhận lương** → tỷ lệ chậm trả kỳ đầu tăng vọt
- Tiền lãi tính theo số ngày thật → mỗi kỳ **ngắn hơn 3 ngày** → tổng lãi thu về **thiếu hơn 200 triệu**
- Lịch in trên hợp đồng giấy ghi ngày 31, hệ thống ghi ngày 28 → **hợp đồng và hệ thống không khớp**

Một dòng code xử lý ngày tháng, ba loại hậu quả khác nhau.

## Quy tắc sinh ngày đến hạn

```text
   ❌ CÁCH SAI — cộng dồn từ kỳ trước:
      ngay_ky_n = them_thang(ngay_ky_n_tru_1, 1)

      31/01 → 28/02 → 28/03 → 28/04 ...
                       ▲
              SAI LỆCH BỊ GIỮ LẠI VĨNH VIỄN

   ✅ CÁCH ĐÚNG — luôn tính từ ngày mốc gốc:
      ngay_ky_n = them_thang(ngay_moc_goc, n)
      rồi kẹp về ngày cuối tháng nếu tháng đó không có ngày ấy

      31/01 → 28/02 → 31/03 → 30/04 → 31/05 ...
                       ▲
              TỰ PHỤC HỒI VỀ ĐÚNG NGÀY 31
```

```java
// Java — LocalDate.plusMonths đã xử lý đúng việc kẹp ngày,
// nhưng phải cộng từ MỐC GỐC, không cộng dồn
LocalDate mocGoc = LocalDate.of(2026, 1, 31);
for (int n = 1; n <= soKy; n++) {
    LocalDate denHan = mocGoc.plusMonths(n);   // ✅ luôn từ mốc gốc
    // 2026-02-28, 2026-03-31, 2026-04-30, 2026-05-31 ...
}
```

```sql
-- PostgreSQL
SELECT (DATE '2026-01-31' + (n || ' month')::interval)::date AS den_han
FROM generate_series(1, 12) AS n;
--  2026-02-28
--  2026-03-31   ← tự phục hồi
--  2026-04-30
```

```text
   ⚠ VÀ MỘT LỰA CHỌN SẢN PHẨM PHẢI QUYẾT ĐỊNH TỪ ĐẦU:

   Ngày đến hạn nên là:
      · Ngày giải ngân + n tháng?                → khác nhau giữa các khách
      · Một ngày cố định trong tháng (5, 10, 25)? → dễ vận hành hơn nhiều

   Cách thứ hai giúp gom việc nhắc nợ và thu nợ vào vài ngày trong tháng,
   và cho phép khách chọn ngày gần ngày nhận lương.
   → Đa số sản phẩm cho vay tiêu dùng chọn cách thứ hai.
```

## Kỳ đầu tiên — luôn là kỳ đặc biệt

```text
   GIẢI NGÂN 20/01, NGÀY ĐẾN HẠN CỐ ĐỊNH LÀ NGÀY 10 HẰNG THÁNG.

   KỲ ĐẦU ĐẾN HẠN 10/02 → chỉ có 21 ngày, không phải 30.

   BA CÁCH XỬ LÝ, VÀ PHẢI CHỌN RÕ MỘT:

   ① TÍNH LÃI THEO SỐ NGÀY THẬT
      Kỳ đầu tính lãi 21 ngày → số tiền kỳ đầu NHỎ HƠN các kỳ sau.
      ✅ Công bằng nhất, đúng bản chất.
      ❌ Khách thắc mắc vì sao kỳ đầu khác.

   ② GỘP KỲ ĐẦU VÀO KỲ HAI
      Kỳ đầu đến hạn 10/03, tính lãi 51 ngày.
      ✅ Cho khách thêm thời gian chuẩn bị.
      ❌ Kỳ đầu lớn hơn → dễ chậm trả.

   ③ ĐẨY SANG THÁNG SAU
      Kỳ đầu đến hạn 10/03, chỉ tính lãi 30 ngày, 21 ngày kia miễn.
      ✅ Dễ giải thích, khách thích.
      ❌ Công ty mất một phần lãi.

   ⚠ DÙ CHỌN CÁCH NÀO, PHẢI GHI RÕ TRONG HỢP ĐỒNG
     VÀ HIỂN THỊ TRONG LỊCH TRẢ NỢ CHO KHÁCH XEM TRƯỚC KHI KÝ.
```

## Cấu trúc một dòng lịch trả nợ

```text
   MỘT KỲ CẦN GHI ĐỦ:

      ky_so                    1, 2, 3...
      ngay_dau_ky              để tính số ngày tính lãi
      ngay_den_han
      du_no_dau_ky             dùng để tính lãi kỳ này
      goc_phai_tra
      lai_phai_tra
      phi_phai_tra             nếu có phí định kỳ
      tong_phai_tra            = gốc + lãi + phí
      du_no_cuoi_ky            = dư nợ đầu kỳ − gốc phải trả

      -- phần cập nhật theo thực tế:
      goc_da_tra
      lai_da_tra
      phat_da_tra
      ngay_tra_du
      trang_thai               CHUA_DEN_HAN | DEN_HAN | DA_TRA | QUA_HAN

   ⚠ LƯU CẢ DƯ NỢ ĐẦU KỲ VÀ CUỐI KỲ, dù có thể tính ra được.

   Lý do: khi có trả trước hạn hoặc cơ cấu nợ, dư nợ thực tế
   lệch khỏi lịch ban đầu. Không lưu thì không tái dựng được
   lịch sử, và không giải thích được với khách.
```

## Kiểm tra bắt buộc sau khi dựng lịch

```text
   CHẠY BỐN PHÉP KIỂM NÀY TRƯỚC KHI LƯU. SAI MỘT LÀ TỪ CHỐI TẠO KHOẢN VAY.

   ① Σ gốc mọi kỳ  =  số tiền giải ngân           (không xê xích 1 đồng)
   ② dư nợ cuối kỳ cuối cùng  =  0
   ③ mọi ngày đến hạn tăng dần, không trùng nhau
   ④ Σ (gốc + lãi + phí)  =  tổng phải trả công bố cho khách
```

```java
void kiemTraLich(KhoanVay vay, List<KyTraNo> lich) {
    long tongGoc = lich.stream().mapToLong(KyTraNo::getGocPhaiTra).sum();
    if (tongGoc != vay.getSoTienGiaiNgan()) {
        throw new LichTraNoKhongHopLe(
            "Tổng gốc %d ≠ số tiền giải ngân %d".formatted(
                tongGoc, vay.getSoTienGiaiNgan()));
    }
    if (lich.get(lich.size() - 1).getDuNoCuoiKy() != 0) {
        throw new LichTraNoKhongHopLe("Dư nợ cuối kỳ cuối phải bằng 0");
    }
    // ... kiểm tra ngày và tổng phải trả
}
```

```text
   ⚠ VÌ SAO PHẢI TỪ CHỐI THAY VÌ TỰ SỬA:

   Lịch lệch nghĩa là có một giả định sai ở đâu đó.
   Tự sửa = che giấu giả định sai, và nó sẽ nổ ở chỗ khác.

   Thà một khoản vay không tạo được và có người xem,
   còn hơn 4.200 khoản vay lệch âm thầm như ở đầu bài.
```

## Khi thực tế lệch khỏi lịch — bốn tình huống

```text
   ① TRẢ ĐÚNG HẠN, ĐÚNG SỐ
      → cập nhật kỳ đó thành ĐÃ TRẢ. Lịch không đổi.

   ② TRẢ THIẾU
      → phân bổ theo thứ tự (phí → lãi → gốc, xem bài 1)
      → phần còn thiếu tiếp tục tính lãi quá hạn
      → KHÔNG dựng lại lịch, chỉ ghi nhận thực tế

   ③ TRẢ THỪA / TRẢ TRƯỚC HẠN MỘT PHẦN
      → phần thừa giảm gốc
      → LỊCH CÁC KỲ SAU PHẢI DỰNG LẠI, vì dư nợ đã đổi
      → hai lựa chọn: giữ nguyên số kỳ (mỗi kỳ trả ít đi),
        hoặc giữ nguyên số tiền mỗi kỳ (rút ngắn số kỳ)
        → phải hỏi khách hoặc quy định rõ trong hợp đồng

   ④ CƠ CẤU LẠI NỢ
      → tạo lịch MỚI, giữ nguyên lịch cũ để tra cứu
      → đánh dấu phiên bản lịch
```

```text
   ⚠ NGUYÊN TẮC: LỊCH TRẢ NỢ CÓ PHIÊN BẢN, KHÔNG SỬA ĐÈ.

   loan_schedules (loan_id, version, created_at, reason, is_active)

   Vì sao: khách khiếu nại về một kỳ trả cách đây một năm,
   bạn phải dựng lại được lịch ĐANG CÓ HIỆU LỰC tại thời điểm đó.
   Sửa đè = mất khả năng giải trình.
```

## Ngày đến hạn rơi vào ngày nghỉ

```text
   BA QUY TẮC PHỔ BIẾN — PHẢI CHỌN VÀ GHI VÀO HỢP ĐỒNG:

   ① NGÀY LÀM VIỆC KẾ TIẾP
      Đến hạn 15/03 (chủ nhật) → dời sang 16/03
      ⚠ Nếu dời sang tháng sau thì sao? (30/04 → 02/05)

   ② NGÀY LÀM VIỆC KẾ TIẾP, KHÔNG VƯỢT THÁNG
      Nếu dời sẽ sang tháng khác thì lùi về ngày làm việc TRƯỚC đó.
      → Quy tắc phổ biến nhất trong tài chính.

   ③ GIỮ NGUYÊN NGÀY
      Khách vẫn có thể trả qua kênh tự động 24/7.
      → Phù hợp khi thu tự động qua ví hoặc trích nợ tài khoản.

   ⚠ VÀ CÂU HỎI QUAN TRỌNG HƠN: DỜI NGÀY ĐẾN HẠN CÓ LÀM ĐỔI SỐ NGÀY TÍNH LÃI KHÔNG?

   Nếu có → số tiền kỳ đó đổi theo.
   Nếu không → ngày đến hạn dời nhưng lãi vẫn tính tới ngày gốc.

   Hai cách cho hai con số khác nhau. Phải quy định rõ.
```

## Sinh lịch cho sản phẩm trả góp đều

```text
   CÔNG THỨC SỐ TIỀN TRẢ MỖI KỲ (annuity):

              P × i
      A = ───────────────
          1 − (1 + i)⁻ⁿ

      P = số tiền vay,  i = lãi suất mỗi kỳ,  n = số kỳ

   VÍ DỤ: P = 100.000.000, lãi 12%/năm → i = 0,01, n = 12

      A = 100.000.000 × 0,01 / (1 − 1,01⁻¹²) = 8.884.878,67
```

```text
   TỪ A, DỰNG TỪNG KỲ:

   Kỳ 1:  lãi = 100.000.000 × 0,01 = 1.000.000
          gốc = 8.884.879 − 1.000.000 = 7.884.879
          dư nợ cuối = 92.115.121

   Kỳ 2:  lãi =  92.115.121 × 0,01 =   921.151
          gốc = 8.884.879 −   921.151 = 7.963.728
          dư nợ cuối = 84.151.393
   ...
   Kỳ 12: gốc = TOÀN BỘ dư nợ còn lại   ← ép về 0, gánh phần lẻ

   ⚠ KỲ CUỐI PHẢI ÉP GỐC = DƯ NỢ CÒN LẠI, không dùng công thức.
     Đây là cách duy nhất đảm bảo dư nợ cuối cùng bằng đúng 0.
```

```text
   ⚠ VÀ LƯU Ý VỀ KIỂU SỐ:

   Tính toán trung gian dùng số thực thì được, nhưng
   MỌI SỐ TIỀN LƯU XUỐNG PHẢI LÀ SỐ NGUYÊN ĐƠN VỊ NHỎ NHẤT
   (xem phase 1 bài 1).

   Làm tròn NGAY sau mỗi kỳ, không tích luỹ số thập phân qua các kỳ —
   nếu không, sai số dồn lại và kỳ cuối lệch vài chục đồng.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Cộng dồn ngày từ kỳ trước | 31/01 → 28/02 → **28/03 vĩnh viễn**; lệch lãi và lệch hợp đồng | Luôn cộng từ **mốc gốc** |
| Không quy định cách xử lý kỳ đầu | Kỳ đầu số lẻ, khách thắc mắc, dễ chậm trả | Chọn một trong ba cách, ghi vào hợp đồng |
| Không kiểm tra Σ gốc = số tiền vay | Khoản vay **không bao giờ tất toán được** | Bốn phép kiểm bắt buộc, sai thì **từ chối tạo** |
| Tự sửa lịch khi phát hiện lệch | Che giấu giả định sai, nổ ở chỗ khác | Từ chối và báo lỗi rõ ràng |
| Kỳ cuối dùng công thức thay vì ép về 0 | Dư nợ cuối còn vài đồng lẻ | Kỳ cuối: gốc = toàn bộ dư nợ còn lại |
| Tích luỹ số thập phân qua nhiều kỳ | Kỳ cuối lệch vài chục đồng | Làm tròn ngay sau mỗi kỳ |
| Sửa đè lịch khi cơ cấu nợ | **Mất khả năng giải trình** khiếu nại cũ | Lịch có phiên bản, giữ lịch cũ |
| Không lưu dư nợ đầu/cuối kỳ | Không tái dựng được sau khi trả trước hạn | Lưu cả hai dù tính ra được |
| Không quy định ngày nghỉ | Tính quá hạn oan → khiếu nại | Chọn quy tắc, và nói rõ **có đổi số ngày tính lãi không** |
| Trả trước hạn một phần mà không dựng lại lịch | Lịch không khớp dư nợ thật | Dựng lại kỳ sau, hỏi khách giữ số kỳ hay giữ số tiền |
| Ngày đến hạn theo ngày giải ngân | Mỗi khách một ngày → khó vận hành thu nợ | Ngày cố định trong tháng, cho khách chọn |

## Tóm tắt bài 4

- **Luôn sinh ngày đến hạn từ mốc gốc, không cộng dồn từ kỳ trước** — cộng dồn làm sai lệch bị giữ lại vĩnh viễn (31/01 → 28 mọi tháng).
- Ngày đến hạn nên là **ngày cố định trong tháng** cho khách chọn, không phải ngày giải ngân + n tháng — dễ vận hành hơn nhiều và giúp khách chọn ngày gần ngày nhận lương.
- **Kỳ đầu luôn là kỳ đặc biệt**: tính theo ngày thật, gộp vào kỳ hai, hay đẩy sang tháng sau — phải chọn rõ và ghi vào hợp đồng.
- **Bốn phép kiểm bắt buộc** sau khi dựng lịch: Σ gốc = số tiền vay, dư nợ cuối = 0, ngày tăng dần, Σ phải trả khớp công bố. Sai thì **từ chối tạo, không tự sửa**.
- **Kỳ cuối ép gốc = toàn bộ dư nợ còn lại**, không dùng công thức — đây là cách duy nhất đảm bảo dư nợ về đúng 0.
- **Làm tròn ngay sau mỗi kỳ**, không tích luỹ số thập phân — nếu không kỳ cuối lệch vài chục đồng.
- **Lịch trả nợ có phiên bản, không sửa đè** — phải dựng lại được lịch đang có hiệu lực tại một thời điểm trong quá khứ để giải trình khiếu nại.
- Trả trước hạn một phần thì **phải dựng lại lịch các kỳ sau**; hỏi khách muốn giữ số kỳ hay giữ số tiền mỗi kỳ.
- Ngày nghỉ: chọn quy tắc dời ngày, và trả lời rõ câu **"dời ngày có làm đổi số ngày tính lãi không"**.

**Bài kế tiếp** → [Bài 5: Nhóm nợ, dự phòng và cách nhìn sức khoẻ danh mục](05-nhom-no-va-du-phong.md)

**Quay lại** → [Bài 3: Các cách tính lãi](03-cac-cach-tinh-lai.md)
