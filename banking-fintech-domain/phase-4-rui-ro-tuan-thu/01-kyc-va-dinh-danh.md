# Bài 1: KYC và định danh khách hàng

## Sự cố mở đầu

Một ví điện tử triển khai định danh điện tử: khách chụp căn cước, chụp mặt, hệ thống so khớp tự động. Tỷ lệ duyệt tự động đạt 94%. Thời gian mở tài khoản giảm từ hai ngày xuống ba phút.

Bốn tháng sau, cơ quan quản lý thanh tra và yêu cầu giải trình **11.400 tài khoản**.

Kiểm tra ra: có 11.400 tài khoản dùng **ảnh căn cước của 380 người**. Cùng một khuôn mặt, cùng một số giấy tờ, chỉ khác tên tài khoản và số điện thoại.

Hệ thống so khớp khuôn mặt với ảnh trên giấy tờ — và nó làm đúng việc đó. Nhưng **không ai kiểm tra xem số giấy tờ đó đã được dùng để mở tài khoản khác chưa**.

Những tài khoản này được dùng để nhận tiền lừa đảo rồi chuyển đi ngay. Công ty bị phạt, bị đình chỉ mở tài khoản mới ba tháng, và phải rà soát toàn bộ tài khoản cũ.

Bài học: **định danh không phải là "khớp mặt với giấy tờ". Nó là "người này là ai, và người này đã ở đây chưa".**

## KYC thật sự gồm bốn việc, không phải một

```text
   ① XÁC MINH DANH TÍNH  (Identity Verification)
      Giấy tờ này có thật không? Người cầm giấy tờ có phải chủ nhân không?

   ② XÁC MINH DUY NHẤT  (Deduplication)
      Người này đã có tài khoản ở đây chưa?
      ← BƯỚC BỊ BỎ QUA Ở ĐẦU BÀI

   ③ SÀNG LỌC  (Screening)
      Người này có nằm trong danh sách cấm vận, danh sách đen,
      hay là người có ảnh hưởng chính trị không?

   ④ ĐÁNH GIÁ RỦI RO  (Risk Rating)
      Khách này thuộc nhóm rủi ro nào? Cần giám sát tới mức nào?

   ⚠ BỐN VIỆC NÀY PHẢI LÀM ĐỦ. Làm ① mà bỏ ② là lỗ hổng ở đầu bài.
     Làm ①②③ mà bỏ ④ thì không biết phải giám sát ai chặt hơn.
```

## Xác minh danh tính — ba lớp

```text
   LỚP 1 — GIẤY TỜ CÓ THẬT KHÔNG
      · Kiểm tra định dạng số giấy tờ, ngày cấp, nơi cấp
      · Kiểm tra đặc điểm bảo an: hình chìm, phông chữ, bố cục
      · Đối chiếu với cơ sở dữ liệu quốc gia nếu có kết nối

   LỚP 2 — NGƯỜI CẦM GIẤY TỜ CÓ PHẢI CHỦ NHÂN KHÔNG
      · So khớp khuôn mặt giữa ảnh chụp và ảnh trên giấy tờ

   LỚP 3 — NGƯỜI ĐÓ CÓ ĐANG SỐNG VÀ ĐANG Ở ĐÂY KHÔNG  (liveness)
      · Yêu cầu quay đầu, nháy mắt, đọc số ngẫu nhiên
      · Phát hiện ảnh chụp lại màn hình, video quay sẵn, mặt nạ

   ⚠ LỚP 3 LÀ LỚP HAY BỊ LÀM QUA LOA NHẤT VÀ BỊ TẤN CÔNG NHIỀU NHẤT.

   Không có lớp 3: kẻ gian chỉ cần ảnh chân dung của nạn nhân
   lấy từ mạng xã hội là mở được tài khoản.
```

```text
   VÀ MỘT MỐI ĐE DOẠ MỚI PHẢI TÍNH TỚI:

   Công cụ tạo video giả (deepfake) đã đủ tốt để vượt qua
   các bài kiểm tra liveness đơn giản kiểu "nháy mắt", "quay đầu".

   → Cần thêm: kiểm tra chiều sâu, phản chiếu ánh sáng ngẫu nhiên,
     và quan trọng nhất là KHÔNG COI LIVENESS LÀ LỚP PHÒNG THỦ CUỐI CÙNG.
   → Phải có giám sát hành vi sau khi mở tài khoản (bài 3).
```

## Chống trùng lặp — bước bị bỏ quên

```text
   PHẢI KIỂM TRA TRÙNG TRÊN NHIỀU TRỤC, KHÔNG CHỈ SỐ GIẤY TỜ:

   ① SỐ GIẤY TỜ            → trục hiển nhiên nhất
   ② KHUÔN MẶT             → cùng mặt, khác giấy tờ = giấy tờ giả
   ③ SỐ ĐIỆN THOẠI         → một số dùng cho nhiều tài khoản
   ④ THIẾT BỊ              → cùng máy mở hàng chục tài khoản
   ⑤ SỐ TÀI KHOẢN NGÂN HÀNG NHẬN TIỀN
   ⑥ ĐỊA CHỈ / TOẠ ĐỘ ĐĂNG KÝ

   ⚠ TRỤC ② VÀ ④ QUAN TRỌNG HƠN NGƯỜI TA NGHĨ:

   Trục ②: cùng một khuôn mặt xuất hiện với 380 số giấy tờ khác nhau
           → giấy tờ giả, hoặc mua bán giấy tờ

   Trục ④: một thiết bị mở 200 tài khoản trong một tuần
           → gần như chắc chắn là luồng gian lận có tổ chức
```

```sql
-- Kiểm tra bắt buộc trước khi kích hoạt tài khoản
SELECT count(*) FROM kyc_records
WHERE document_number = :so_giay_to
  AND status = 'APPROVED'
  AND customer_id <> :customer_id;
-- > 0  →  KHÔNG kích hoạt, chuyển sang xem xét thủ công
```

```text
   ⚠ VÀ RÀNG BUỘC PHẢI ĐẶT Ở TẦNG DATABASE, KHÔNG CHỈ Ở ỨNG DỤNG
     (cùng nguyên tắc với bài chuẩn hoá email trong khoá SQL):

      CREATE UNIQUE INDEX uq_kyc_document
          ON kyc_records (document_type, document_number)
          WHERE status = 'APPROVED';

   Vì luồng nhập liệu hàng loạt, công cụ quản trị, hay một
   dịch vụ khác đều có thể ghi thẳng vào bảng.
```

## Sàng lọc danh sách — và vấn đề tên riêng

```text
   PHẢI SÀNG LỌC TÊN KHÁCH VỚI:
      · Danh sách cấm vận quốc tế và trong nước
      · Danh sách khủng bố
      · Danh sách người có ảnh hưởng chính trị
      · Danh sách đen nội bộ

   VÀ ĐÂY LÀ PHẦN KHÓ: KHỚP TÊN KHÔNG BAO GIỜ CHÍNH XÁC.

      "Nguyễn Văn A"  vs  "NGUYEN VAN A"  vs  "Nguyen V. A"
      Thứ tự họ tên khác nhau giữa các nước
      Phiên âm khác nhau cho cùng một tên gốc
      Dấu tiếng Việt bị bỏ hoặc bỏ sai
```

```text
   HAI LOẠI SAI VÀ CHI PHÍ RẤT KHÁC NHAU:

   BÁO ĐỘNG GIẢ (khớp nhầm người vô tội)
      → khách bị chặn oan, mất khách, tốn công xem xét thủ công
      → tỷ lệ này thường rất cao: 95–99% cảnh báo là giả

   BỎ SÓT (không khớp được người thật sự trong danh sách)
      → VI PHẠM PHÁP LUẬT, phạt nặng, có thể mất giấy phép

   → CHI PHÍ HAI LOẠI SAI KHÔNG ĐỐI XỨNG.
     Nên ngưỡng khớp luôn đặt LỎNG, chấp nhận nhiều báo động giả,
     và đầu tư vào QUY TRÌNH XEM XÉT nhanh thay vì siết ngưỡng.
```

```text
   VÀ MỘT VIỆC BẮT BUỘC HAY BỊ QUÊN:

   SÀNG LỌC LẠI ĐỊNH KỲ TOÀN BỘ KHÁCH HÀNG CŨ.

   Danh sách cấm vận được cập nhật liên tục. Một khách sạch hôm nay
   có thể vào danh sách tháng sau.
   → Chạy lại sàng lọc mỗi khi danh sách cập nhật, không chỉ lúc mở tài khoản.
```

## Phân tầng KYC theo rủi ro

```text
   KHÔNG PHẢI KHÁCH NÀO CŨNG CẦN MỨC ĐỘ XÁC MINH NHƯ NHAU.

   ┌──────────┬─────────────────────┬───────────────────────────┐
   │ Mức      │ Yêu cầu             │ Được làm gì               │
   ├──────────┼─────────────────────┼───────────────────────────┤
   │ Cơ bản   │ Số điện thoại       │ Hạn mức rất thấp,         │
   │          │ + tên               │ không rút tiền mặt        │
   ├──────────┼─────────────────────┼───────────────────────────┤
   │ Chuẩn    │ + giấy tờ tuỳ thân  │ Hạn mức thông thường      │
   │          │ + khớp mặt          │                           │
   ├──────────┼─────────────────────┼───────────────────────────┤
   │ Nâng cao │ + xác minh địa chỉ  │ Hạn mức cao,              │
   │          │ + nguồn tiền        │ giao dịch quốc tế         │
   └──────────┴─────────────────────┴───────────────────────────┘

   → Cho phép khách bắt đầu nhanh ở mức thấp, nâng cấp khi cần.
   → Hạn mức phải được HỆ THỐNG CƯỠNG CHẾ, không phải chỉ ghi trong tài liệu.
```

```text
   ⚠ KHI NÀO PHẢI NÂNG MỨC XÁC MINH BẮT BUỘC:

   · Khách vượt ngưỡng giao dịch tích luỹ
   · Có giao dịch với quốc gia rủi ro cao
   · Bị cảnh báo từ hệ thống giám sát giao dịch
   · Là người có ảnh hưởng chính trị

   → Ba trường hợp đầu là ĐIỀU KIỆN ĐỘNG, phải kiểm tra liên tục,
     không chỉ kiểm lúc mở tài khoản.
```

## Lưu trữ dữ liệu KYC — nơi rủi ro tập trung

```text
   HỆ THỐNG KYC LƯU: ẢNH CĂN CƯỚC, ẢNH KHUÔN MẶT, SỐ GIẤY TỜ, ĐỊA CHỈ.

   ĐÂY LÀ KHO DỮ LIỆU NHẠY CẢM NHẤT TRONG CÔNG TY.
   Rò rỉ nó nghiêm trọng hơn rò rỉ dữ liệu giao dịch rất nhiều —
   vì số giấy tờ và khuôn mặt thì KHÔNG ĐỔI ĐƯỢC như mật khẩu.

   ① MÃ HOÁ KHI LƯU, khoá quản lý riêng, không nằm cùng dữ liệu
   ② PHÂN QUYỀN CHẶT — ai xem được ảnh căn cước phải ghi log từng lần
   ③ GHI LOG MỌI LẦN TRUY CẬP, kể cả đọc, kể cả của quản trị viên
   ④ THỜI HẠN LƯU TRỮ theo quy định, XOÁ khi hết hạn
   ⑤ CHE BỚT KHI HIỂN THỊ — nhân viên hỗ trợ chỉ cần 4 số cuối
```

```text
   ⚠ MÂU THUẪN PHẢI GIẢI QUYẾT:

   Quy định phòng chống rửa tiền yêu cầu LƯU hồ sơ nhiều năm sau khi
   khách đóng tài khoản.
   Quy định bảo vệ dữ liệu cá nhân yêu cầu XOÁ khi không còn cần thiết.

   → Hai yêu cầu này xung đột, và giải pháp là:
     giữ hồ sơ đúng thời hạn luật định cho mục đích phòng chống rửa tiền,
     nhưng KHÔNG dùng dữ liệu đó cho mục đích nào khác,
     và có lịch xoá tự động khi hết hạn.
   → Phải ghi rõ căn cứ pháp lý cho từng loại dữ liệu và từng thời hạn.
```

## Quy trình xem xét thủ công

```text
   TỰ ĐỘNG DUYỆT ĐƯỢC 90–95%. PHẦN CÒN LẠI CẦN NGƯỜI XEM.

   ┌──────────────────────────────────────────────────────────┐
   │ HÀNG ĐỢI XEM XÉT                                          │
   │   · Ưu tiên theo thời gian chờ và giá trị khách hàng      │
   │   · Hiển thị RÕ lý do bị đưa vào hàng đợi                 │
   │   · Người xem thấy: ảnh, điểm khớp, các trục trùng lặp,   │
   │     kết quả sàng lọc                                       │
   ├──────────────────────────────────────────────────────────┤
   │ QUYẾT ĐỊNH                                                │
   │   Duyệt / Từ chối / Yêu cầu bổ sung                      │
   │   BẮT BUỘC ghi lý do có cấu trúc, không phải văn bản tự do│
   ├──────────────────────────────────────────────────────────┤
   │ KIỂM SOÁT                                                 │
   │   · Người duyệt ≠ người xem xét với hồ sơ rủi ro cao      │
   │   · Lấy mẫu kiểm tra lại các quyết định đã duyệt          │
   │   · Theo dõi tỷ lệ duyệt theo từng nhân viên              │
   └──────────────────────────────────────────────────────────┘

   ⚠ THEO DÕI TỶ LỆ DUYỆT THEO NHÂN VIÊN LÀ BIỆN PHÁP CHỐNG THÔNG ĐỒNG.
     Một người duyệt 99% trong khi trung bình đội là 70%
     là dấu hiệu cần kiểm tra.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Chỉ khớp mặt với giấy tờ, không chống trùng | **11.400 tài khoản từ 380 người** như ở đầu bài | Kiểm trùng trên 6 trục, ràng buộc ở database |
| Liveness làm qua loa | Ảnh lấy từ mạng xã hội cũng mở được tài khoản | Kiểm tra chiều sâu, thử thách ngẫu nhiên |
| Coi liveness là lớp phòng thủ cuối | Deepfake vượt qua được | Phải có giám sát hành vi sau khi mở |
| Siết ngưỡng sàng lọc để giảm báo động giả | **Bỏ sót người trong danh sách cấm vận** → phạt nặng | Ngưỡng lỏng + quy trình xem xét nhanh |
| Chỉ sàng lọc lúc mở tài khoản | Khách vào danh sách sau đó không bị phát hiện | Sàng lọc lại mỗi khi danh sách cập nhật |
| Hạn mức chỉ ghi trong tài liệu | Không có tác dụng thực tế | **Hệ thống cưỡng chế** hạn mức theo mức KYC |
| Không nâng mức xác minh theo điều kiện động | Khách rủi ro cao vẫn ở mức xác minh thấp | Kiểm tra điều kiện liên tục, không chỉ lúc mở |
| Lưu ảnh giấy tờ không mã hoá | Rò rỉ dữ liệu **không thể khắc phục** — số giấy tờ không đổi được | Mã hoá, khoá riêng, log mọi truy cập |
| Không có lịch xoá dữ liệu hết hạn | Vi phạm quy định bảo vệ dữ liệu cá nhân | Thời hạn theo từng loại, xoá tự động |
| Lý do từ chối ghi văn bản tự do | Không thống kê được, không giải trình được | Lý do có **cấu trúc**, chọn từ danh mục |
| Không theo dõi tỷ lệ duyệt theo nhân viên | Không phát hiện được thông đồng | Theo dõi, lấy mẫu kiểm tra lại |

## Tóm tắt bài 1

- KYC gồm **bốn việc**: xác minh danh tính, **chống trùng lặp**, sàng lọc danh sách, đánh giá rủi ro. Bỏ việc thứ hai là lỗ hổng ở đầu bài.
- Định danh không phải "khớp mặt với giấy tờ" mà là **"người này là ai, và người này đã ở đây chưa"**.
- Xác minh danh tính có **ba lớp**: giấy tờ thật, đúng chủ nhân, và **liveness** — lớp ba hay bị làm qua loa nhất và bị tấn công nhiều nhất.
- **Liveness không phải lớp phòng thủ cuối cùng** — deepfake đã vượt được các bài kiểm tra đơn giản, nên phải có giám sát hành vi sau khi mở tài khoản.
- Chống trùng phải kiểm **sáu trục**: số giấy tờ, khuôn mặt, số điện thoại, thiết bị, tài khoản nhận tiền, địa chỉ. Ràng buộc đặt ở **tầng database**.
- Sàng lọc danh sách có **chi phí hai loại sai không đối xứng**: báo động giả tốn công, bỏ sót là vi phạm pháp luật → ngưỡng đặt **lỏng**, đầu tư vào quy trình xem xét.
- **Sàng lọc lại toàn bộ khách cũ mỗi khi danh sách cập nhật**, không chỉ lúc mở tài khoản.
- Phân tầng KYC theo rủi ro, và **hạn mức phải được hệ thống cưỡng chế**, không chỉ ghi trong tài liệu.
- Kho dữ liệu KYC là **nơi rủi ro tập trung nhất** — rò rỉ số giấy tờ và khuôn mặt không khắc phục được vì chúng không đổi được như mật khẩu.
- Xung đột giữa **lưu giữ theo luật phòng chống rửa tiền** và **xoá theo luật bảo vệ dữ liệu** phải giải quyết bằng thời hạn rõ ràng theo từng loại dữ liệu, kèm căn cứ pháp lý.

**Bài kế tiếp** → [Bài 2: Phòng chống rửa tiền — giám sát giao dịch và báo cáo](02-aml-va-giam-sat-giao-dich.md)

**Quay lại** → [Phase 3, Bài 5: Nhóm nợ và dự phòng](../phase-3-tin-dung/05-nhom-no-va-du-phong.md)
