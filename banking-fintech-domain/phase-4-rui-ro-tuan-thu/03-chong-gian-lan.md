# Bài 3: Chống gian lận — phát hiện và phản ứng theo thời gian thực

## Sự cố mở đầu

Một sàn thương mại điện tử bị tấn công vào đêm thứ Bảy. Kẻ gian dùng danh sách thẻ tín dụng đánh cắp, đặt hàng giá trị cao, giao tới các địa chỉ khác nhau.

Đội vận hành phát hiện lúc 9 giờ sáng Chủ nhật. Trong 11 tiếng, có **2.340 đơn hàng** đã được duyệt và **1.890 đơn đã giao cho đơn vị vận chuyển**.

Họ bật quy tắc chặn khẩn cấp: **từ chối mọi đơn trên 5 triệu đồng thanh toán bằng thẻ**.

Cuộc tấn công dừng lại. Nhưng trong 6 tiếng tiếp theo, **4.100 khách hàng thật** cũng bị từ chối. Nhiều người mua hàng cho sự kiện trong ngày, không mua lại nữa.

Tổng thiệt hại: 3,2 tỷ từ gian lận, và ước tính **hơn 8 tỷ doanh thu mất** vì chặn nhầm khách thật.

Bài học: **phản ứng chống gian lận có chi phí, và chi phí đó thường lớn hơn chính vụ gian lận.** Bài này nói về cách phản ứng có kiểm soát.

## Gian lận khác rủi ro tín dụng ở chỗ nào

```text
   RỦI RO TÍN DỤNG          GIAN LẬN
   ────────────────         ─────────────────────────
   Người thật               Có thể không phải người thật
   Có ý định trả            KHÔNG có ý định trả
   Mất khả năng dần dần     Mất ngay từ giao dịch đầu
   Thay đổi CHẬM            Thay đổi theo NGÀY
   Mô hình dùng được năm    Mô hình lỗi thời sau vài tuần

   → HAI BÀI TOÁN KHÁC NHAU HOÀN TOÀN, cần hai hệ thống riêng.
     (Đã nói ở phase 3 bài 2, nhưng đây là chỗ nó quan trọng nhất.)
```

```text
   VÀ ĐẶC ĐIỂM QUYẾT ĐỊNH KIẾN TRÚC:

   KẺ GIAN LẬN LÀ ĐỐI THỦ CÓ TRÍ TUỆ, ĐANG CHỦ ĐỘNG THỬ HỆ THỐNG CỦA BẠN.

   Họ thử từng chút một để tìm ngưỡng. Họ thấy giao dịch 5 triệu bị chặn
   thì thử 4,9 triệu. Thấy chặn theo IP thì đổi IP.

   → Mọi quy tắc cố định đều SẼ bị dò ra.
   → Nên hệ thống phải có phần KHÔNG ĐOÁN ĐƯỢC và phải ĐỔI LIÊN TỤC.
```

## Các loại gian lận và dấu hiệu riêng

```text
   ① DÙNG THẺ/TÀI KHOẢN ĐÁNH CẮP
      Dấu hiệu: địa chỉ giao khác địa chỉ thanh toán, đơn giá trị cao,
                giao gấp, thiết bị mới, thời gian bất thường

   ② CHIẾM ĐOẠT TÀI KHOẢN  (account takeover)
      Dấu hiệu: đổi mật khẩu / email / số điện thoại rồi giao dịch ngay,
                đăng nhập từ vị trí lạ, đổi tài khoản nhận tiền
      ⚠ NGUY HIỂM HƠN ① vì tài khoản có lịch sử sạch, qua được nhiều luật

   ③ GIAN LẬN TỪ CHÍNH CHỦ  (friendly fraud)
      Khách thật mua thật, nhận hàng, rồi khiếu nại "tôi không mua"
      Dấu hiệu: khó phát hiện lúc giao dịch; chỉ thấy qua lịch sử khiếu nại

   ④ GIAN LẬN KHUYẾN MÃI
      Tạo hàng loạt tài khoản để lấy ưu đãi người dùng mới
      Dấu hiệu: cùng thiết bị, cùng tài khoản nhận tiền, đăng ký hàng loạt

   ⑤ TÀI KHOẢN TRUNG CHUYỂN  (money mule)
      Người thật cho mượn tài khoản để nhận tiền bẩn
      Dấu hiệu: nhận rồi chuyển đi hết ngay, số dư luôn về 0
```

```text
   ⚠ LOẠI ② VÀ ⑤ HAY BỊ BỎ SÓT NHẤT:

   Loại ② vì tài khoản đã có lịch sử tốt → mọi luật dựa trên
   lịch sử khách hàng đều cho qua.
   → Cách chữa: coi MỌI THAY ĐỔI THÔNG TIN NHẠY CẢM là sự kiện rủi ro,
     và áp thời gian chờ trước khi cho giao dịch lớn.

   Loại ⑤ vì chủ tài khoản là người thật, KYC sạch.
   → Cách chữa: giám sát MẪU DÒNG TIỀN, không giám sát danh tính.
```

## Ba tầng phản ứng — không chỉ có chặn hay cho qua

Đây là phần giải quyết sự cố ở đầu bài.

```text
   ❌ TƯ DUY NHỊ PHÂN: chặn hoặc cho qua
      → Chặn thì mất khách thật. Cho qua thì mất tiền.

   ✅ BA TẦNG PHẢN ỨNG THEO MỨC ĐỘ RỦI RO:

   ┌──────────────────────────────────────────────────────────┐
   │ ĐIỂM THẤP      →  CHO QUA                                 │
   ├──────────────────────────────────────────────────────────┤
   │ ĐIỂM TRUNG BÌNH →  THÊM MA SÁT                            │
   │                    · yêu cầu xác thực bổ sung (OTP, 3-DS) │
   │                    · giữ đơn 30 phút rồi tự duyệt         │
   │                    · gọi điện xác nhận với đơn giá trị cao│
   │                    · giao hàng nhưng thu tiền khi nhận    │
   │                    → KHÁCH THẬT VẪN MUA ĐƯỢC,             │
   │                      kẻ gian thì bỏ cuộc                  │
   ├──────────────────────────────────────────────────────────┤
   │ ĐIỂM CAO       →  CHẶN + đưa vào hàng đợi xem xét         │
   └──────────────────────────────────────────────────────────┘

   → TẦNG GIỮA LÀ TẦNG QUAN TRỌNG NHẤT VÀ HAY BỊ BỎ QUA NHẤT.

   Nếu ở sự cố đầu bài họ có tầng giữa — yêu cầu 3-D Secure cho
   đơn trên 5 triệu thay vì chặn thẳng — thì kẻ gian không qua được
   (vì không có OTP của chủ thẻ) mà khách thật vẫn mua được.
```

## Quy tắc và mô hình — dùng cả hai

```text
   QUY TẮC (rules)                      MÔ HÌNH (model)
   ────────────────                     ─────────────────
   Sửa được trong vài phút              Huấn luyện lại mất ngày/tuần
   Giải thích được ngay                 Khó giải thích
   Bắt được mẫu ĐÃ BIẾT                 Bắt được mẫu CHƯA BIẾT
   Kẻ gian dò ra được                   Khó dò hơn
   Cần người viết                       Tự học từ dữ liệu

   → DÙNG QUY TẮC ĐỂ PHẢN ỨNG NHANH VỚI ĐỢT TẤN CÔNG ĐANG DIỄN RA.
   → DÙNG MÔ HÌNH ĐỂ BẮT NHỮNG MẪU CHƯA AI VIẾT RA THÀNH LUẬT.
   → Không thay thế nhau. Bổ sung cho nhau.
```

```text
   ⚠ YÊU CẦU VẬN HÀNH QUAN TRỌNG NHẤT:

   PHẢI SỬA VÀ BẬT QUY TẮC MỚI ĐƯỢC MÀ KHÔNG CẦN DEPLOY.

   Đợt tấn công diễn ra trong vài giờ. Nếu quy trình của bạn là
   sửa code → review → build → deploy thì mất nửa ngày,
   và đợt tấn công đã xong.

   → Quy tắc nằm trong cấu hình hoặc bảng dữ liệu, có giao diện quản trị,
     có chế độ CHẠY THỬ (chỉ ghi log, không chặn) để đo tác động trước.
```

## Chế độ chạy thử — bắt buộc trước khi bật quy tắc mới

```text
   MỌI QUY TẮC MỚI PHẢI QUA HAI GIAI ĐOẠN:

   ① CHẠY THỬ (shadow mode)
      Quy tắc chạy, ghi lại "nếu bật thì sẽ chặn giao dịch nào",
      NHƯNG KHÔNG THỰC SỰ CHẶN.

      Sau 24–48 giờ, xem:
         · Sẽ chặn bao nhiêu giao dịch?
         · Trong đó bao nhiêu là gian lận thật?
         · Bao nhiêu là khách thật?
         · Thiệt hại doanh thu ước tính bao nhiêu?

   ② BẬT DẦN
      Áp cho 5% giao dịch → 25% → 100%, theo dõi ở từng bước.

   ⚠ NẾU Ở SỰ CỐ ĐẦU BÀI HỌ CHẠY THỬ TRƯỚC,
     họ đã thấy quy tắc "chặn mọi đơn trên 5 triệu" sẽ chặn
     4.100 khách thật — và đã chọn cách khác.

   → NGOẠI LỆ DUY NHẤT: đang bị tấn công dữ dội thì bật ngay,
     nhưng phải đặt HẠN TỰ TẮT (ví dụ 4 giờ) để buộc xem lại.
```

## Đo lường — hai con số phải nhìn cùng lúc

```text
   ❌ CHỈ ĐO TỶ LỆ GIAN LẬN → sẽ dẫn tới siết chặt tới mức mất khách

   ✅ ĐO CẢ HAI:

   ┌────────────────────────┬──────────────────────────────────┐
   │ Tỷ lệ gian lận lọt qua │ tiền mất do gian lận / tổng doanh│
   ├────────────────────────┼──────────────────────────────────┤
   │ Tỷ lệ chặn nhầm        │ giao dịch hợp lệ bị chặn /       │
   │                        │ tổng giao dịch hợp lệ            │
   └────────────────────────┴──────────────────────────────────┘

   VÀ QUY VỀ MỘT CON SỐ ĐỂ SO SÁNH ĐƯỢC:

      Tổng chi phí = tiền mất do gian lận
                   + doanh thu mất do chặn nhầm
                   + chi phí xem xét thủ công

   → Sự cố đầu bài: 3,2 tỷ gian lận + 8 tỷ chặn nhầm.
     Quyết định "chặn thẳng" làm TỔNG CHI PHÍ TĂNG GẤP BA.
```

```text
   ⚠ VÀ ĐO TỶ LỆ CHẶN NHẦM KHÓ HƠN NHIỀU:

   Giao dịch bị chặn thì không biết nó hợp lệ hay không.

   BA CÁCH ƯỚC LƯỢNG:
      · Cho qua ngẫu nhiên một tỷ lệ nhỏ giao dịch bị chặn để đo
        (tốn tiền, nhưng là cách chính xác nhất)
      · Đếm khách bị chặn rồi gọi lên khiếu nại và được xác minh là thật
      · So tỷ lệ chặn giữa các nhóm khách có lịch sử tốt và xấu
```

## Phản ứng khi đang bị tấn công

```text
   BƯỚC 1 — XÁC ĐỊNH ĐẶC ĐIỂM CHUNG (10 phút đầu)
      Các giao dịch gian lận có gì giống nhau?
      · Cùng dải IP? Cùng loại thiết bị?
      · Cùng khoảng giá trị? Cùng danh mục hàng?
      · Cùng địa chỉ giao? Cùng khung giờ?

      → CHẶN THEO ĐẶC ĐIỂM HẸP NHẤT CÓ THỂ.
        "Chặn mọi đơn trên 5 triệu" là đặc điểm quá rộng.
        "Chặn đơn từ dải IP X, giao tới quận Y, sản phẩm loại Z"
        hẹp hơn nhiều và không ảnh hưởng khách thật.

   BƯỚC 2 — BẬT QUY TẮC HẸP, CÓ HẠN TỰ TẮT

   BƯỚC 3 — TĂNG MA SÁT THAY VÌ CHẶN với vùng không chắc chắn

   BƯỚC 4 — CHẶN DÒNG TIỀN RA, KHÔNG CHỈ CHẶN GIAO DỊCH VÀO
      Đơn đã duyệt nhưng chưa giao → GIỮ LẠI, đừng giao.
      → Ở sự cố đầu bài, 1.890 đơn đã giao là phần mất thật.
        Nếu dừng khâu giao hàng sớm hơn thì cứu được phần lớn.

   BƯỚC 5 — SAU KHI DỪNG: rà soát lại, gỡ quy tắc khẩn cấp,
      thay bằng quy tắc chính thức đã chạy thử
```

```text
   ⚠ BƯỚC 4 LÀ BƯỚC HAY BỊ QUÊN NHẤT.

   Đội kỹ thuật tập trung chặn giao dịch mới, quên rằng
   hàng nghìn đơn đã duyệt đang trên đường giao.

   → Phải có nút "TẠM DỪNG GIAO HÀNG THEO ĐIỀU KIỆN"
     và nút "TẠM DỪNG CHI TIỀN RA" như một công cụ vận hành sẵn có,
     không phải đi viết code lúc đang có sự cố.
```

## Dữ liệu cần thu thập từ đầu

```text
   KHÔNG CÓ NHỮNG DỮ LIỆU NÀY THÌ MỌI HỆ THỐNG CHỐNG GIAN LẬN ĐỀU YẾU:

      · Dấu vân tay thiết bị (device fingerprint)
      · Địa chỉ IP và thông tin định vị
      · Thời gian thao tác trên form (người thật gõ chậm hơn máy)
      · Lịch sử đăng nhập, đổi thông tin
      · Địa chỉ giao hàng đã dùng trước đây
      · Tài khoản nhận tiền đã dùng trước đây
      · Liên kết giữa các tài khoản qua mọi trục trên

   ⚠ THU THẬP TỪ ĐẦU. Không thể quay ngược thời gian lấy dữ liệu cũ.
     Và phải có CƠ SỞ PHÁP LÝ cùng thông báo cho người dùng
     về việc thu thập này.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Chỉ có chặn hoặc cho qua | Chặn nhầm khách thật, thiệt hại **lớn hơn chính vụ gian lận** | Ba tầng: cho qua / **thêm ma sát** / chặn |
| Bật quy tắc mới thẳng lên production | 4.100 khách thật bị chặn như ở đầu bài | **Chạy thử 24–48 giờ** rồi bật dần |
| Quy tắc khẩn cấp không có hạn tự tắt | Quên gỡ, chặn nhầm kéo dài nhiều ngày | Bắt buộc đặt hạn tự tắt |
| Chặn theo đặc điểm quá rộng | Ảnh hưởng lớn tới khách thật | Tìm đặc điểm **hẹp nhất** trong 10 phút đầu |
| Sửa quy tắc phải deploy | Mất nửa ngày, đợt tấn công đã xong | Quy tắc trong cấu hình, có giao diện quản trị |
| Chỉ chặn giao dịch mới | **Đơn đã duyệt vẫn được giao** — phần mất thật | Có nút tạm dừng giao hàng và chi tiền ra |
| Chỉ đo tỷ lệ gian lận | Siết tới mức mất khách mà vẫn tưởng đang làm tốt | Đo **cả tỷ lệ chặn nhầm**, quy về tổng chi phí |
| Dùng mô hình tín dụng cho gian lận | Mẫu gian lận đổi theo ngày, mô hình lỗi thời sau vài tuần | Hai hệ thống riêng |
| Chỉ dùng quy tắc, không dùng mô hình | Không bắt được mẫu chưa ai biết | Dùng cả hai, bổ sung nhau |
| Không coi đổi thông tin là sự kiện rủi ro | Chiếm đoạt tài khoản qua được mọi luật dựa trên lịch sử | Thời gian chờ sau khi đổi thông tin nhạy cảm |
| Không thu thập dữ liệu thiết bị từ đầu | Không phân tích liên kết được | Thu thập sớm, có cơ sở pháp lý và thông báo |

## Tóm tắt bài 3

- **Phản ứng chống gian lận có chi phí, và chi phí đó thường lớn hơn chính vụ gian lận** — 3,2 tỷ mất do gian lận nhưng 8 tỷ mất vì chặn nhầm.
- Gian lận khác rủi ro tín dụng: **kẻ gian là đối thủ có trí tuệ đang chủ động dò ngưỡng của bạn**, nên mọi quy tắc cố định đều sẽ bị dò ra.
- Năm loại gian lận; **chiếm đoạt tài khoản** và **tài khoản trung chuyển** hay bị bỏ sót nhất vì cả hai đều có lịch sử sạch.
- **Ba tầng phản ứng**, trong đó **tầng giữa — thêm ma sát — là quan trọng nhất và hay bị bỏ qua nhất**: khách thật vẫn mua được, kẻ gian bỏ cuộc.
- **Quy tắc và mô hình bổ sung nhau**: quy tắc phản ứng nhanh với đợt tấn công đang diễn ra, mô hình bắt mẫu chưa ai viết thành luật.
- **Sửa và bật quy tắc phải làm được không cần deploy** — đợt tấn công chỉ kéo dài vài giờ.
- **Chạy thử 24–48 giờ trước khi bật** là bắt buộc; ngoại lệ duy nhất là đang bị tấn công, và khi đó phải có **hạn tự tắt**.
- Đo **cả hai con số**: tỷ lệ gian lận lọt qua và **tỷ lệ chặn nhầm**, rồi quy về **tổng chi phí** để so sánh được các phương án.
- Khi đang bị tấn công: tìm **đặc điểm hẹp nhất**, bật quy tắc có hạn tự tắt, tăng ma sát thay vì chặn, và **dừng khâu giao hàng/chi tiền** — bước cuối hay bị quên nhất.
- Dữ liệu thiết bị, IP, hành vi phải **thu thập từ đầu** kèm cơ sở pháp lý — không quay ngược thời gian lấy được.

**Bài kế tiếp** → [Bài 4: Hạn mức và kiểm soát rủi ro vận hành](04-han-muc-va-kiem-soat.md)

**Quay lại** → [Bài 2: Phòng chống rửa tiền](02-aml-va-giam-sat-giao-dich.md)
