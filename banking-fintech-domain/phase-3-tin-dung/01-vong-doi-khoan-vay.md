# Bài 1: Vòng đời một khoản vay — từ đơn đề nghị tới tất toán

## Sự cố mở đầu

Một công ty cho vay tiêu dùng ra mắt sản phẩm trả góp. Ba tháng đầu chạy tốt.

Tháng thứ tư, kế toán phát hiện: có **1.847 khoản vay** trong hệ thống ở trạng thái `ĐANG GIẢI NGÂN`. Chúng nằm đó từ hai tháng trước.

Điều tra: khách ký hợp đồng, hệ thống chuyển trạng thái sang `ĐANG GIẢI NGÂN`, gọi API ngân hàng để chuyển tiền. Ngân hàng trả lỗi timeout. Code bắt lỗi, ghi log, và **không làm gì thêm**.

Trong 1.847 khoản đó:

- **1.203 khoản** tiền đã chuyển thành công nhưng hệ thống không biết → khách đã nhận tiền, **không có lịch trả nợ nào được tạo**, không ai đòi
- **644 khoản** tiền chưa chuyển → khách chờ hai tháng, gọi lên hỏi thì tổng đài không tra được vì đơn không ở trạng thái nào có nghĩa

Thiệt hại: hơn **18 tỷ đồng** cho vay mà không có lịch thu nợ.

Nguyên nhân gốc: **trạng thái của khoản vay được thiết kế như một danh sách tuyến tính**, không phải một máy trạng thái có xử lý nhánh lỗi.

## Vòng đời đầy đủ, kèm mọi nhánh

```text
   ┌──────────────┐
   │  ĐƠN ĐỀ NGHỊ │  khách nộp hồ sơ
   └──────┬───────┘
          ▼
   ┌──────────────┐       ┌──────────────┐
   │  THẨM ĐỊNH   │──────►│   TỪ CHỐI    │ (lưu lý do — bắt buộc)
   └──────┬───────┘       └──────────────┘
          ▼
   ┌──────────────┐       ┌──────────────┐
   │  PHÊ DUYỆT   │──────►│  KHÁCH HUỶ   │
   │  (có điều    │       └──────────────┘
   │   kiện)      │
   └──────┬───────┘
          ▼
   ┌──────────────┐       ┌──────────────┐
   │  KÝ HỢP ĐỒNG │──────►│  HẾT HẠN     │ (duyệt xong không ký trong X ngày)
   └──────┬───────┘       └──────────────┘
          ▼
   ┌──────────────┐
   │  GIẢI NGÂN   │◄──────────────┐
   └──────┬───────┘                │
          │                        │ ⚠ NHÁNH BỊ BỎ QUÊN Ở ĐẦU BÀI
   ┌──────┴───────┬────────────────┴──────┐
   ▼              ▼                        ▼
┌────────┐  ┌──────────┐          ┌──────────────┐
│THÀNH   │  │ THẤT BẠI │          │ KHÔNG XÁC    │
│CÔNG    │  │(huỷ đơn) │          │ ĐỊNH         │
└───┬────┘  └──────────┘          │ → TRA SOÁT   │
    │                              └──────────────┘
    ▼
┌──────────────┐
│  ĐANG TRẢ NỢ │◄─────────┐
└──────┬───────┘           │
       │                   │ trả đủ kỳ
   ┌───┴────┬──────────┬───┘
   ▼        ▼          ▼
┌────────┐┌────────┐┌──────────────┐
│TẤT TOÁN││TRẢ     ││  QUÁ HẠN     │
│ĐÚNG HẠN││TRƯỚC   │└──────┬───────┘
└────────┘│HẠN     │       │
          └────────┘   ┌───┴────┬─────────┐
                       ▼        ▼         ▼
                  ┌────────┐┌───────┐┌─────────┐
                  │KHÁCH   ││CƠ CẤU ││ NỢ XẤU  │
                  │TRẢ BÙ  ││LẠI NỢ ││ → XỬ LÝ │
                  └────────┘└───────┘└─────────┘
```

> **Nguyên tắc thiết kế rút ra từ sự cố:** mọi bước có gọi hệ thống bên ngoài đều phải có **ba nhánh**, không phải hai. Thành công, thất bại, và **không xác định**. Nhánh thứ ba là nhánh bị quên nhiều nhất và gây thiệt hại lớn nhất.

## Giải ngân — bước nguy hiểm nhất

```text
   VÌ SAO GIẢI NGÂN NGUY HIỂM HƠN MỌI BƯỚC KHÁC:

   Trước giải ngân : sai thì sửa được, chưa có tiền đi đâu cả
   Sau giải ngân   : tiền đã ra khỏi tài khoản công ty
                     Nếu không tạo được lịch trả nợ → CHO KHÔNG

   Và điều tệ nhất: KHÁCH KHÔNG BÁO.
   Khách nhận tiền mà không thấy ai đòi thì họ im lặng.
   → Lỗi này không tự lộ ra. Chỉ đối soát mới tìm được.
```

**Thứ tự đúng khi giải ngân:**

```text
   ❌ SAI — chuyển tiền trước, tạo lịch sau:
      ① chuyển tiền cho khách
      ② tạo lịch trả nợ
      → Bước ② lỗi = đã cho không tiền

   ✅ ĐÚNG — tạo lịch trước, chuyển tiền sau:
      ① tạo lịch trả nợ đầy đủ, trạng thái CHỜ_GIẢI_NGÂN
      ② ghi bút toán: Nợ "Cho vay khách hàng" / Có "Tiền gửi ngân hàng"
      ③ chuyển tiền, kèm MÃ CHỐNG TRÙNG
      ④ nhận kết quả:
           thành công     → kích hoạt lịch trả nợ
           thất bại rõ    → huỷ lịch, ghi bút toán đảo
           không xác định → GIỮ NGUYÊN, chuyển sang tra soát
                            (KHÔNG huỷ, KHÔNG chuyển lại)

   → Kể cả khi bước ③ hoàn toàn mất liên lạc, bạn vẫn còn
     bản ghi khoản vay và lịch trả nợ để đối chiếu.
```

```text
   ⚠ VÀ MỘT VIỆC BẮT BUỘC HẰNG NGÀY:

   ĐỐI SOÁT SỐ TIỀN GIẢI NGÂN VỚI SAO KÊ NGÂN HÀNG.

   Σ khoản giải ngân ghi trong sổ  =  Σ khoản chuyển đi trên sao kê

   Lệch chiều nào cũng nguy hiểm:
     Sao kê có, sổ không có  → cho vay mà không có hồ sơ thu nợ
     Sổ có, sao kê không có  → khách đang chờ tiền mà không ai biết
```

## Trạng thái phải phân biệt: của khoản vay và của từng kỳ

Đây là chỗ nhiều hệ thống làm sai ngay từ thiết kế bảng.

```text
   ┌─────────────────────────────────────────────────────────┐
   │ KHOẢN VAY  (loan)                                        │
   │   trạng thái: đang trả nợ / tất toán / quá hạn / nợ xấu │
   │   số tiền gốc, lãi suất, kỳ hạn, ngày giải ngân          │
   └────────────────────┬────────────────────────────────────┘
                        │ 1 – nhiều
   ┌────────────────────▼────────────────────────────────────┐
   │ KỲ TRẢ NỢ  (installment)                                 │
   │   kỳ số, ngày đến hạn, gốc phải trả, lãi phải trả       │
   │   trạng thái RIÊNG: chưa đến hạn / đã trả / quá hạn     │
   └────────────────────┬────────────────────────────────────┘
                        │ 1 – nhiều
   ┌────────────────────▼────────────────────────────────────┐
   │ LẦN THANH TOÁN  (payment)                                │
   │   số tiền, thời điểm, phân bổ vào gốc/lãi/phạt          │
   └─────────────────────────────────────────────────────────┘

   ⚠ MỘT LẦN THANH TOÁN CÓ THỂ TRẢ CHO NHIỀU KỲ.
     MỘT KỲ CÓ THỂ ĐƯỢC TRẢ BỞI NHIỀU LẦN.
     → Quan hệ nhiều-nhiều, cần bảng phân bổ ở giữa.

   Thiết kế "mỗi kỳ một lần trả" là sai với thực tế
   và sẽ phải làm lại khi khách trả thiếu hoặc trả gộp.
```

## Thứ tự phân bổ tiền — quy tắc không được tuỳ tiện

Khách trả 2 triệu cho khoản vay đang nợ: gốc 10 triệu, lãi 300 nghìn, phạt chậm 50 nghìn. Tiền đó vào đâu trước?

```text
   THỨ TỰ PHỔ BIẾN (phải khớp với hợp đồng đã ký):

      ① Phí và phạt chậm trả          50.000
      ② Lãi quá hạn                        0
      ③ Lãi trong hạn                300.000
      ④ Gốc                        1.650.000
                                   ─────────
                                   2.000.000

   ⚠ THỨ TỰ NÀY KHÔNG PHẢI DO KỸ SƯ CHỌN.
     Nó nằm trong HỢP ĐỒNG và trong quy định pháp luật.
     Làm sai = tính lãi sai = tranh chấp pháp lý, không chỉ là bug.

   → Đọc hợp đồng mẫu trước khi code hàm phân bổ.
     Và lưu lại thứ tự đã áp dụng cho từng lần trả, để giải thích được
     với khách và với thanh tra.
```

```text
   VÀ MỘT CHI TIẾT DỄ BỎ SÓT:

   Nếu khách trả THIẾU so với kỳ, phần trả được phân bổ theo thứ tự trên,
   phần còn thiếu tiếp tục tính lãi.

   Nếu khách trả THỪA, phần thừa xử lý thế nào?
      · Trả trước cho kỳ sau?
      · Giảm gốc luôn (trả trước hạn một phần)?
      · Giữ ở tài khoản chờ?

   Ba cách cho ra ba con số lãi khác nhau ở các kỳ sau.
   → Phải quy định rõ, và phải nói cho khách biết.
```

## Trả trước hạn — nơi khách và công ty xung đột lợi ích

```text
   KHÁCH VAY 100 TRIỆU, KỲ HẠN 24 THÁNG, TRẢ HẾT Ở THÁNG THỨ 6.

   CÔNG TY MẤT GÌ:
      18 tháng tiền lãi dự kiến

   → Đó là lý do gần như mọi hợp đồng có PHÍ TRẢ TRƯỚC HẠN.

   HAI CÁCH TÍNH PHÍ, KẾT QUẢ KHÁC NHAU RẤT NHIỀU:
      · Theo % dư nợ còn lại tại thời điểm trả
      · Theo % số tiền trả trước hạn

   Và phí thường GIẢM DẦN theo thời gian đã vay
   (trả ở tháng 3 phạt nặng hơn trả ở tháng 20).

   ⚠ SỐ TIỀN TẤT TOÁN PHẢI TÍNH TỚI ĐÚNG NGÀY KHÁCH TRẢ,
     không phải tới cuối kỳ.
     Lãi cộng dồn từng ngày → chậm một ngày là số khác.
     → Báo giá tất toán phải kèm HẠN HIỆU LỰC ("có giá trị tới hết ngày X").
```

## Cơ cấu lại nợ — và cái bẫy kế toán

```text
   KHÁCH KHÓ KHĂN, CÔNG TY ĐỒNG Ý GIÃN NỢ:
      · Kéo dài kỳ hạn
      · Giảm số tiền trả mỗi kỳ
      · Tạm hoãn trả gốc, chỉ trả lãi

   ⚠ CƠ CẤU LẠI NỢ KHÔNG XOÁ LỊCH SỬ QUÁ HẠN.

   Nhiều hệ thống làm sai: cơ cấu xong thì đặt lại trạng thái về
   "đang trả nợ bình thường" như chưa có chuyện gì.

   → Sai về kế toán: khoản nợ đã cơ cấu vẫn phải theo dõi riêng
     và vẫn ảnh hưởng tới phân loại nhóm nợ (bài 5).
   → Sai về rủi ro: mất dấu vết một khách đã từng khó khăn.

   ĐÚNG: giữ nguyên lịch sử, tạo LỊCH TRẢ NỢ MỚI, đánh dấu khoản vay
   là "đã cơ cấu" kèm ngày và lý do.
```

## Những mốc thời gian phải lưu

```text
   MỖI MỐC TRẢ LỜI MỘT CÂU HỎI KHÁC NHAU:

   ngày_nop_don        → đo thời gian xử lý hồ sơ
   ngày_phe_duyet      → tính hạn hiệu lực của phê duyệt
   ngày_ky_hop_dong    → mốc pháp lý
   ngày_giai_ngan      → MỐC BẮT ĐẦU TÍNH LÃI
   ngày_den_han_ky_1   → thường không phải ngày giải ngân + 1 tháng
   ngày_tat_toan       → mốc kết thúc

   ⚠ NGÀY TÍNH LÃI VÀ NGÀY GIẢI NGÂN CÓ THỂ KHÁC NHAU.

   Có sản phẩm tính lãi từ ngày giải ngân, có sản phẩm tính từ ngày
   khách nhận được tiền, có sản phẩm có kỳ ân hạn.
   → Đừng giả định. Hỏi rõ và lưu thành một trường riêng.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Giải ngân chỉ có hai nhánh thành/bại | Timeout → khoản vay treo, **cho vay không có lịch thu nợ** | Bắt buộc nhánh thứ ba "không xác định" + tra soát |
| Chuyển tiền trước, tạo lịch trả nợ sau | Lỗi ở bước sau = cho không tiền | Tạo lịch trước, chuyển tiền sau |
| Không đối soát giải ngân với sao kê | Lỗi không tự lộ ra, phát hiện sau hàng tháng | Đối soát hằng ngày, hai chiều |
| Một kỳ ↔ một lần trả | Không xử lý được trả thiếu, trả gộp | Quan hệ nhiều-nhiều, có bảng phân bổ |
| Tự chọn thứ tự phân bổ tiền | Tính lãi sai → **tranh chấp pháp lý** | Theo hợp đồng và quy định, lưu lại thứ tự đã áp dụng |
| Không quy định xử lý tiền trả thừa | Ba cách xử lý ra ba số lãi khác nhau | Quy định rõ, thông báo cho khách |
| Báo giá tất toán không có hạn hiệu lực | Khách trả muộn một ngày → số tiền sai | Kèm "có giá trị tới hết ngày X" |
| Cơ cấu nợ xong đặt lại trạng thái bình thường | Sai phân loại nhóm nợ, mất dấu vết rủi ro | Giữ lịch sử, đánh dấu "đã cơ cấu" |
| Giả định ngày tính lãi = ngày giải ngân | Tính lãi lệch ngay từ kỳ đầu | Lưu thành trường riêng, hỏi rõ sản phẩm |
| Không lưu lý do từ chối | Không phân tích được, không giải trình được với thanh tra | Bắt buộc lưu lý do có cấu trúc |

## Tóm tắt bài 1

- Vòng đời khoản vay là **máy trạng thái có nhánh lỗi**, không phải danh sách tuyến tính.
- Mọi bước gọi hệ thống bên ngoài phải có **ba nhánh**: thành công, thất bại, **không xác định**. Nhánh thứ ba bị quên nhiều nhất và gây thiệt hại lớn nhất.
- **Giải ngân là bước nguy hiểm nhất** — sau nó tiền đã ra khỏi công ty, và lỗi **không tự lộ ra vì khách không báo**.
- Thứ tự đúng: **tạo lịch trả nợ trước, chuyển tiền sau**, kèm mã chống trùng. Không xác định thì **giữ nguyên và tra soát**, tuyệt đối không huỷ hay chuyển lại.
- **Đối soát giải ngân với sao kê hằng ngày, hai chiều** — đây là cách duy nhất phát hiện khoản vay mất lịch thu nợ.
- Ba tầng dữ liệu: **khoản vay → kỳ trả nợ → lần thanh toán**, quan hệ giữa kỳ và lần trả là **nhiều-nhiều**.
- **Thứ tự phân bổ tiền nằm trong hợp đồng và pháp luật**, không phải do kỹ sư chọn. Làm sai là tranh chấp pháp lý.
- Số tiền tất toán tính **tới đúng ngày trả**; báo giá phải kèm **hạn hiệu lực**.
- **Cơ cấu lại nợ không xoá lịch sử quá hạn** — giữ nguyên dấu vết, tạo lịch mới, đánh dấu "đã cơ cấu".

**Bài kế tiếp** → [Bài 2: Chấm điểm tín dụng — quyết định cho vay dựa trên gì](02-cham-diem-tin-dung.md)

**Quay lại** → [Phase 2, Bài 6: Hoàn tiền và tranh chấp](../phase-2-thanh-toan/06-hoan-tien-va-tranh-chap.md)
