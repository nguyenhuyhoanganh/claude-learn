# Bài 5: Nhóm nợ, dự phòng và cách nhìn sức khoẻ danh mục

## Sự cố mở đầu

Một công ty cho vay báo cáo quý: dư nợ 800 tỷ, tỷ lệ nợ xấu **2,1%**. Ban lãnh đạo hài lòng, quyết định mở rộng cho vay.

Sáu tháng sau, tỷ lệ nợ xấu là **19,4%**. Công ty phải trích lập dự phòng gần 120 tỷ, chuyển từ lãi sang lỗ.

Không có khủng hoảng nào xảy ra. Không có nhóm khách hàng nào đột ngột mất khả năng trả.

Vấn đề nằm ở phép chia:

```text
   Tỷ lệ nợ xấu = dư nợ xấu / TỔNG DƯ NỢ

   Quý 1: dư nợ 800 tỷ, trong đó 600 tỷ là các khoản MỚI GIẢI NGÂN
          trong 3 tháng gần nhất.

   Khoản vay mới chưa kịp xấu — muốn thành nợ xấu phải quá hạn 90 ngày.

   → MẪU SỐ PHÌNH NHANH HƠN TỬ SỐ.
     Tỷ lệ nợ xấu trông đẹp KHÔNG PHẢI vì chất lượng tốt,
     mà vì công ty đang tăng trưởng nhanh.

   Khi tăng trưởng chậm lại, mẫu số ngừng phình,
   còn các khoản vay cũ lần lượt đến tuổi xấu.
```

Hiện tượng này có tên: **hiệu ứng pha loãng do tăng trưởng**. Nó khiến mọi danh mục cho vay đang tăng trưởng nhanh trông khoẻ hơn thực tế.

## Năm nhóm nợ

```text
   ┌────────┬──────────────────┬──────────────────┬─────────────┐
   │ Nhóm   │ Tên              │ Quá hạn          │ Dự phòng    │
   ├────────┼──────────────────┼──────────────────┼─────────────┤
   │   1    │ Đủ tiêu chuẩn    │ 0–9 ngày         │      0 %    │
   │   2    │ Cần chú ý        │ 10–90 ngày       │      5 %    │
   │   3    │ Dưới tiêu chuẩn  │ 91–180 ngày      │     20 %    │
   │   4    │ Nghi ngờ         │ 181–360 ngày     │     50 %    │
   │   5    │ Có khả năng mất  │ trên 360 ngày    │    100 %    │
   └────────┴──────────────────┴──────────────────┴─────────────┘

   NỢ XẤU = NHÓM 3 + 4 + 5  (quá hạn trên 90 ngày)

   ⚠ CON SỐ CỤ THỂ THEO QUY ĐỊNH TỪNG THỜI KỲ VÀ TỪNG LOẠI HÌNH.
     Bảng trên là khung phổ biến — luôn tra quy định hiện hành,
     và lưu tỷ lệ dự phòng trong CẤU HÌNH, không hardcode.
```

## Ba quy tắc phân loại mà hệ thống hay làm sai

### ① Phân loại theo khách hàng, không theo từng khoản vay

```text
   KHÁCH A CÓ BA KHOẢN VAY:
      Khoản 1: trả đều đặn      → tự nó là nhóm 1
      Khoản 2: trả đều đặn      → tự nó là nhóm 1
      Khoản 3: quá hạn 120 ngày → nhóm 3

   PHÂN LOẠI ĐÚNG: CẢ BA KHOẢN ĐỀU LÀ NHÓM 3.

   Vì rủi ro nằm ở NGƯỜI, không nằm ở khoản vay.
   Người đã mất khả năng trả một khoản thì hai khoản kia
   cũng đang có rủi ro, dù chưa lộ ra.

   → Đây gọi là NGUYÊN TẮC PHÂN LOẠI THEO NHÓM XẤU NHẤT.
   → Hệ thống chỉ phân loại theo từng khoản sẽ báo cáo
     dự phòng THIẾU, và đó là sai sót nghiêm trọng khi thanh tra.
```

### ② Nợ đã cơ cấu không tự động về nhóm 1

```text
   KHÁCH QUÁ HẠN 100 NGÀY (nhóm 3), CÔNG TY ĐỒNG Ý GIÃN NỢ.
   Sau khi cơ cấu, khách trả đúng hạn kỳ đầu tiên.

   ❌ SAI: đưa về nhóm 1 vì "hiện đang trả đúng hạn"
   ✅ ĐÚNG: giữ ở nhóm đã phân loại, chỉ được nâng nhóm sau khi
            trả đúng hạn liên tục một khoảng thời gian thử thách

   VÌ SAO: nếu cơ cấu là đưa về nhóm 1 ngay, thì bất kỳ khoản nợ xấu nào
   cũng có thể "làm đẹp" bằng cách cơ cấu lại.
   → Đây chính là hành vi mà quy định muốn ngăn chặn.
```

### ③ Ngày quá hạn tính từ kỳ quá hạn SỚM NHẤT chưa trả

```text
   KHÁCH CÓ 12 KỲ:
      Kỳ 3 : quá hạn 150 ngày, chưa trả
      Kỳ 4 : đã trả
      Kỳ 5 : đã trả

   ❌ SAI: nhìn kỳ gần nhất thấy đã trả → xếp nhóm 1
   ✅ ĐÚNG: kỳ 3 quá hạn 150 ngày → nhóm 3

   → Khách trả các kỳ mới mà bỏ kỳ cũ là một mẫu hành vi CÓ THẬT,
     và hệ thống phải bắt được nó.

   SQL TÍNH ĐÚNG:

      SELECT loan_id,
             max(current_date - due_date) AS so_ngay_qua_han
      FROM installments
      WHERE status <> 'DA_TRA' AND due_date < current_date
      GROUP BY loan_id;
      -- max() trên các kỳ CHƯA TRẢ = kỳ quá hạn lâu nhất
```

## Dự phòng — nó thật sự là gì

```text
   DỰ PHÒNG KHÔNG PHẢI LÀ TIỀN ĐỂ RIÊNG RA MỘT CHỖ.

   Nó là một BÚT TOÁN GHI NHẬN TỔN THẤT DỰ KIẾN,
   làm giảm lợi nhuận ngay bây giờ thay vì đợi tới lúc mất thật.

   BÚT TOÁN (xem lại phase 1 bài 2):

      Nợ  "Chi phí dự phòng rủi ro tín dụng"    120.000.000
      Có  "Dự phòng rủi ro tín dụng"            120.000.000
                ▲
      Tài khoản này ĐỐI ỨNG với "Cho vay khách hàng":
      nó làm GIẢM giá trị khoản cho vay trên bảng cân đối.

   → Dư nợ gộp        800.000.000.000
     Dự phòng        −120.000.000.000
     ───────────────────────────────
     Dư nợ ròng       680.000.000.000  ← con số phản ánh thực tế
```

```text
   VÀ KHI THẬT SỰ MẤT TIỀN (xử lý xoá nợ):

      Nợ  "Dự phòng rủi ro tín dụng"    X
      Có  "Cho vay khách hàng"          X

   → Lúc này lợi nhuận KHÔNG bị ảnh hưởng nữa, vì tổn thất
     đã được ghi nhận từ trước qua dự phòng.

   ⚠ ĐÂY LÀ ĐIỂM MẤU CHỐT: XOÁ NỢ KHÔNG PHẢI LÀ XOÁ KHOẢN PHẢI THU.
     Khách vẫn nợ. Công ty vẫn có quyền đòi.
     Chỉ là trên sổ sách, khoản đó không còn được tính là tài sản.
     → Nếu sau này thu hồi được, ghi vào THU NHẬP KHÁC.
     → Hệ thống PHẢI giữ lại khoản vay đã xoá nợ để còn theo dõi thu hồi.
```

## Hai cách tính dự phòng

```text
   ① DỰ PHÒNG CỤ THỂ — theo nhóm nợ, cho từng khoản

      dự phòng = (dư nợ − giá trị tài sản bảo đảm × hệ số) × tỷ lệ nhóm

      ⚠ PHẦN TÀI SẢN BẢO ĐẢM RẤT DỄ SAI:
        · Giá trị định giá lúc nào? Định giá cũ 3 năm là không dùng được.
        · Hệ số khấu trừ khác nhau theo loại tài sản
          (sổ tiết kiệm gần 100%, bất động sản thấp hơn, hàng tồn kho thấp nữa)
        · Tài sản có thanh khoản không? Có tranh chấp không?

   ② DỰ PHÒNG CHUNG — tỷ lệ nhỏ trên toàn bộ dư nợ nhóm 1–4

      Để phòng những tổn thất CHƯA lộ ra.
      → Đây chính là cái đệm cho hiệu ứng pha loãng ở đầu bài.
```

```text
   XU HƯỚNG HIỆN ĐẠI: TỔN THẤT TÍN DỤNG DỰ KIẾN

   Thay vì chỉ trích lập khi đã quá hạn (nhìn về quá khứ),
   mô hình mới ước lượng tổn thất DỰ KIẾN ngay từ lúc giải ngân
   (nhìn về tương lai), dựa trên:

      Tổn thất dự kiến = PD × LGD × EAD

      PD  (Probability of Default)  — xác suất vỡ nợ
      LGD (Loss Given Default)      — tỷ lệ mất khi vỡ nợ
      EAD (Exposure At Default)     — dư nợ tại thời điểm vỡ nợ

   → Ba con số này chính là đầu ra của mô hình chấm điểm (bài 2).
   → Hệ thống cần lưu chúng theo từng khoản vay và cập nhật định kỳ.
```

## Đọc sức khoẻ danh mục cho đúng

```text
   ❌ CHỈ SỐ GÂY HIỂU LẦM: tỷ lệ nợ xấu trên tổng dư nợ

   ✅ BỐN CÁCH NHÌN THAY THẾ:
```

### ① Phân tích theo lứa giải ngân (vintage)

```text
   NHÓM CÁC KHOẢN VAY THEO THÁNG GIẢI NGÂN,
   THEO DÕI TỶ LỆ XẤU CỦA TỪNG LỨA THEO TUỔI:

   Lứa      │ 3 tháng │ 6 tháng │ 9 tháng │ 12 tháng
   ─────────┼─────────┼─────────┼─────────┼──────────
   2025-06  │  0,8 %  │  2,1 %  │  3,4 %  │   4,0 %
   2025-09  │  0,9 %  │  2,3 %  │  3,6 %  │   4,2 %
   2025-12  │  1,1 %  │  3,0 %  │  4,9 %  │     —
   2026-03  │  2,4 %  │    —    │    —    │     —
              ▲
     LỨA THÁNG 3 XẤU GẤP HAI LỨA CŨ Ở CÙNG ĐỘ TUỔI
     → chất lượng thẩm định đang xuống, phát hiện được NGAY
       thay vì đợi 12 tháng

   → ĐÂY LÀ CÁCH NHÌN QUAN TRỌNG NHẤT VÀ NÓ MIỄN NHIỄM VỚI
     HIỆU ỨNG PHA LOÃNG, vì mỗi lứa được so ở cùng độ tuổi.
```

### ② Tỷ lệ chuyển nhóm

```text
   Bao nhiêu phần trăm dư nợ nhóm 1 tháng trước đã rơi xuống nhóm 2?
   Nhóm 2 → nhóm 3?

   → Chỉ số CẢNH BÁO SỚM. Tỷ lệ chuyển nhóm tăng trước khi
     tỷ lệ nợ xấu tăng vài tháng.
```

### ③ Tỷ lệ chậm trả kỳ đầu

```text
   Khách chậm ngay kỳ 1 hoặc kỳ 2.

   → Không phải rủi ro tín dụng, mà là dấu hiệu GIAN LẬN
     hoặc thẩm định sai hoàn toàn.
   → Chỉ số nhanh nhất, thấy được trong vòng 1–2 tháng (xem bài 2).
```

### ④ Tỷ lệ thu hồi

```text
   Trong số nợ đã xấu, thu hồi lại được bao nhiêu phần trăm?

   → Ảnh hưởng trực tiếp tới LGD, và quyết định
     dự phòng nên trích bao nhiêu.
```

## Những gì hệ thống phải lưu để làm được các báo cáo trên

```text
   ① LỊCH SỬ NHÓM NỢ THEO THỜI GIAN, KHÔNG CHỈ NHÓM HIỆN TẠI

      loan_classification_history (loan_id, ngay, nhom, so_ngay_qua_han, ly_do)

      → Không có bảng này thì không tính được tỷ lệ chuyển nhóm,
        và không giải trình được với thanh tra vì sao một khoản
        được xếp nhóm đó vào thời điểm đó.

   ② NGÀY GIẢI NGÂN — để nhóm theo lứa

   ③ ẢNH CHỤP DANH MỤC CUỐI MỖI THÁNG

      Vì phân loại thay đổi liên tục, báo cáo tháng trước phải
      dựng lại được y hệt. Tính lại từ dữ liệu hiện tại sẽ ra số khác.

   ④ TỶ LỆ DỰ PHÒNG ĐÃ ÁP DỤNG cho từng lần trích lập

      Quy định đổi tỷ lệ → số cũ vẫn phải giải thích được theo tỷ lệ cũ.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Chỉ nhìn tỷ lệ nợ xấu trên tổng dư nợ | **Tăng trưởng nhanh che giấu chất lượng xấu** | Phân tích theo **lứa giải ngân** |
| Phân loại theo từng khoản vay | Dự phòng **thiếu** — sai sót nghiêm trọng khi thanh tra | Phân loại theo **khách hàng, lấy nhóm xấu nhất** |
| Cơ cấu nợ xong đưa về nhóm 1 | Mọi nợ xấu đều "làm đẹp" được | Giữ nhóm, chỉ nâng sau thời gian thử thách |
| Tính quá hạn theo kỳ gần nhất | Khách trả kỳ mới bỏ kỳ cũ → xếp nhóm sai | Lấy **kỳ quá hạn lâu nhất chưa trả** |
| Xoá nợ rồi xoá luôn khoản vay khỏi hệ thống | **Không theo dõi thu hồi được**, mất quyền đòi trên thực tế | Giữ khoản vay, đánh dấu đã xoá nợ |
| Nghĩ dự phòng là tiền để riêng | Hiểu sai bản chất, giải thích sai với lãnh đạo | Dự phòng là **bút toán ghi nhận tổn thất dự kiến** |
| Dùng giá trị tài sản bảo đảm cũ | Dự phòng thiếu nghiêm trọng | Định giá lại định kỳ, áp hệ số khấu trừ theo loại |
| Hardcode tỷ lệ dự phòng | Quy định đổi phải deploy | Lưu trong cấu hình, có hiệu lực theo thời gian |
| Chỉ lưu nhóm nợ hiện tại | Không tính được tỷ lệ chuyển nhóm, **không giải trình được** | Lưu lịch sử phân loại theo ngày |
| Không chụp ảnh danh mục cuối tháng | Báo cáo cũ không dựng lại được | Ảnh chụp cuối mỗi tháng, bất biến |
| Chỉ theo dõi nợ xấu | Phát hiện muộn 3–6 tháng | Theo dõi **chuyển nhóm** và **chậm trả kỳ đầu** |

## Tóm tắt bài 5

- **Tỷ lệ nợ xấu trên tổng dư nợ là chỉ số gây hiểu lầm** — danh mục tăng trưởng nhanh có mẫu số phình nhanh hơn tử số, nên trông khoẻ hơn thực tế.
- **Phân tích theo lứa giải ngân là cách nhìn quan trọng nhất** vì nó so các lứa ở cùng độ tuổi, miễn nhiễm với hiệu ứng pha loãng, và phát hiện chất lượng thẩm định xuống cấp ngay lập tức.
- Năm nhóm nợ theo số ngày quá hạn; **nợ xấu là nhóm 3–5** (quá hạn trên 90 ngày). Tỷ lệ dự phòng phải nằm trong **cấu hình có hiệu lực theo thời gian**.
- Ba quy tắc phân loại hay bị làm sai: **phân loại theo khách hàng lấy nhóm xấu nhất**, **nợ cơ cấu không tự về nhóm 1**, **tính quá hạn theo kỳ sớm nhất chưa trả**.
- **Dự phòng không phải tiền để riêng** — nó là bút toán ghi nhận tổn thất dự kiến, làm giảm lợi nhuận ngay thay vì đợi mất thật.
- **Xoá nợ không phải xoá khoản phải thu.** Khách vẫn nợ, công ty vẫn có quyền đòi — hệ thống phải giữ khoản vay để theo dõi thu hồi.
- Giá trị tài sản bảo đảm phải **định giá lại định kỳ** và áp **hệ số khấu trừ theo loại** — dùng định giá cũ là nguồn thiếu dự phòng nghiêm trọng.
- Bốn cách nhìn thay thế: **lứa giải ngân**, **tỷ lệ chuyển nhóm** (cảnh báo sớm vài tháng), **chậm trả kỳ đầu** (dấu hiệu gian lận), **tỷ lệ thu hồi** (quyết định LGD).
- Phải lưu **lịch sử phân loại theo ngày** và **ảnh chụp danh mục cuối mỗi tháng** — nếu không thì không dựng lại được báo cáo cũ và không giải trình được với thanh tra.

**Bài kế tiếp** → [Phase 4, Bài 1: KYC và định danh khách hàng](../phase-4-rui-ro-tuan-thu/01-kyc-va-dinh-danh.md)

**Quay lại** → [Bài 4: Lịch trả nợ](04-lich-tra-no.md)
