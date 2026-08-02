# Bài 5: Bảo mật dữ liệu thẻ và dữ liệu cá nhân

## Sự cố mở đầu

Một công ty fintech bị rò rỉ dữ liệu. Kẻ tấn công lấy được bản sao lưu database.

Đội kỹ thuật kiểm tra và thở phào: **mật khẩu đã băm bằng thuật toán chậm, số thẻ không lưu, số căn cước đã mã hoá**. Họ chuẩn bị thông báo rằng thiệt hại được kiểm soát.

Ba tuần sau, khách hàng bắt đầu bị lừa đảo có mục tiêu. Kẻ gian gọi điện, đọc đúng **tên, ngày sinh, số điện thoại, địa chỉ, và ba giao dịch gần nhất** của từng người. Nhiều khách tin và cung cấp mã OTP.

Dữ liệu nhạy cảm nhất đã được bảo vệ. Nhưng những trường **không ai coi là nhạy cảm** — tên, ngày sinh, lịch sử giao dịch — thì nằm nguyên dạng đọc được.

Và trong lừa đảo, **biết chính xác ba giao dịch gần nhất của nạn nhân có sức thuyết phục hơn cả biết số thẻ**.

Bài học: **bảo vệ dữ liệu không phải là mã hoá vài trường được liệt kê trong quy định.** Nó là hiểu dữ liệu nào, kết hợp lại, gây ra hại gì.

## Phân loại dữ liệu — bước đầu tiên và hay bị bỏ qua

```text
   ┌──────────────────┬─────────────────────────┬───────────────────┐
   │ Mức              │ Ví dụ                   │ Yêu cầu           │
   ├──────────────────┼─────────────────────────┼───────────────────┤
   │ CÔNG KHAI        │ tên sản phẩm, biểu phí  │ không cần bảo vệ  │
   ├──────────────────┼─────────────────────────┼───────────────────┤
   │ NỘI BỘ           │ báo cáo tổng hợp        │ phân quyền        │
   ├──────────────────┼─────────────────────────┼───────────────────┤
   │ CÁ NHÂN          │ tên, số điện thoại,     │ mã hoá khi lưu,   │
   │                  │ địa chỉ, ngày sinh,     │ log truy cập,     │
   │                  │ LỊCH SỬ GIAO DỊCH       │ che khi hiển thị  │
   ├──────────────────┼─────────────────────────┼───────────────────┤
   │ NHẠY CẢM CAO     │ số căn cước, ảnh giấy   │ mã hoá + khoá     │
   │                  │ tờ, sinh trắc học,      │ riêng, phân quyền │
   │                  │ số tài khoản            │ rất chặt          │
   ├──────────────────┼─────────────────────────┼───────────────────┤
   │ DỮ LIỆU THẺ      │ số thẻ, CVV, băng từ    │ KHÔNG LƯU nếu     │
   │                  │                          │ không bắt buộc    │
   └──────────────────┴─────────────────────────┴───────────────────┘

   ⚠ SỰ CỐ ĐẦU BÀI XẢY RA VÌ LỊCH SỬ GIAO DỊCH BỊ XẾP VÀO "NỘI BỘ"
     THAY VÌ "CÁ NHÂN".

   → Phân loại phải hỏi: "nếu dữ liệu này ra ngoài, kẻ xấu làm được gì?"
     chứ không hỏi "quy định có bắt bảo vệ cái này không?"
```

## Dữ liệu thẻ — luật rõ ràng nhất

```text
   ┌──────────────────────┬───────────┬──────────────────────────┐
   │ Dữ liệu              │ Được lưu? │ Ghi chú                  │
   ├──────────────────────┼───────────┼──────────────────────────┤
   │ Số thẻ (PAN)         │ Nếu buộc  │ Phải mã hoá, che khi hiện│
   │ Tên chủ thẻ          │ Được      │                          │
   │ Ngày hết hạn         │ Được      │                          │
   ├──────────────────────┼───────────┼──────────────────────────┤
   │ CVV / CVC            │ ❌ KHÔNG  │ Kể cả mã hoá cũng CẤM    │
   │ Dữ liệu băng từ      │ ❌ KHÔNG  │ Kể cả tạm thời           │
   │ Mã PIN               │ ❌ KHÔNG  │                          │
   └──────────────────────┴───────────┴──────────────────────────┘

   ⚠ BA DÒNG CUỐI LÀ CẤM TUYỆT ĐỐI, KHÔNG CÓ NGOẠI LỆ.

   Và "không lưu" nghĩa là KHÔNG Ở BẤT KỲ ĐÂU:
      · không trong database
      · không trong log        ← chỗ rò rỉ phổ biến nhất
      · không trong bộ nhớ đệm
      · không trong bản ghi lỗi
      · không trong bản ghi request/response của API
```

```text
   RÒ RỈ QUA LOG LÀ SỰ CỐ PHỔ BIẾN NHẤT VÀ DỄ XẢY RA NHẤT:

   log.info("Gọi cổng thanh toán: {}", request);   ← ghi cả số thẻ và CVV

   → Cách chặn:
      ① Bộ lọc ở tầng ghi log, che theo mẫu (số 13–19 chữ số, trường "cvv")
      ② Đối tượng chứa dữ liệu thẻ tự che trong toString()
      ③ Quét log định kỳ tìm mẫu giống số thẻ — nếu tìm thấy là sự cố
```

**Che số thẻ khi hiển thị:**

```text
   ĐƯỢC PHÉP HIỆN: 6 số đầu + 4 số cuối
      4111 11** **** 1234

   ⚠ NHƯNG VỚI NHÂN VIÊN HỖ TRỢ, CHỈ NÊN HIỆN 4 SỐ CUỐI.
     Nguyên tắc quyền tối thiểu: họ chỉ cần đủ để xác nhận với khách.
```

## Mã hoá — ba tầng và điều quan trọng nhất

```text
   ① MÃ HOÁ ĐƯỜNG TRUYỀN
      Mọi kết nối dùng TLS, kể cả giữa các dịch vụ nội bộ.
      → "Mạng nội bộ nên không cần mã hoá" là giả định sai.

   ② MÃ HOÁ KHI LƯU — TOÀN Ổ ĐĨA
      Bảo vệ khi ổ đĩa bị lấy đi vật lý.
      ⚠ KHÔNG bảo vệ được khi kẻ tấn công có quyền truy cập ứng dụng —
        vì lúc đó database tự giải mã cho họ.

   ③ MÃ HOÁ Ở TẦNG ỨNG DỤNG — TỪNG TRƯỜNG
      Dữ liệu được mã hoá TRƯỚC KHI gửi xuống database.
      → Đây là tầng DUY NHẤT bảo vệ được khi database bị rò rỉ.
      → Và đây là tầng hay bị bỏ qua nhất.
```

```text
   ⚠ ĐIỀU QUAN TRỌNG NHẤT CỦA MÃ HOÁ KHÔNG PHẢI THUẬT TOÁN.
     LÀ QUẢN LÝ KHOÁ.

   · Khoá KHÔNG được nằm cùng nơi với dữ liệu
   · Khoá KHÔNG được nằm trong mã nguồn hay biến môi trường thường
   · Dùng dịch vụ quản lý khoá riêng
   · Phải xoay vòng khoá được mà KHÔNG cần giải mã lại toàn bộ dữ liệu
     → dùng khoá dữ liệu riêng cho từng bản ghi, khoá chính chỉ mã hoá khoá dữ liệu
   · Phải có quy trình khi khoá bị lộ

   → Mã hoá bằng thuật toán mạnh với khoá để cạnh dữ liệu
     thì không bảo vệ được gì cả.
```

## Tra cứu dữ liệu đã mã hoá — bài toán thật

```text
   MÃ HOÁ XONG THÌ KHÔNG TÌM KIẾM ĐƯỢC.
   Không thể WHERE so_can_cuoc = '001234567890' trên cột đã mã hoá.

   BỐN CÁCH GIẢI, VỚI ĐÁNH ĐỔI KHÁC NHAU:

   ① CỘT BĂM PHỤ ĐỂ TÌM CHÍNH XÁC
      Lưu thêm cột hash(giá trị + muối cố định của hệ thống)
      → tìm chính xác được, vẫn không đọc ngược được
      ⚠ Muối phải là bí mật, nếu không kẻ tấn công tự băm để dò

   ② MÃ HOÁ GIỮ THỨ TỰ / GIỮ ĐỊNH DẠNG
      Cho phép so sánh và sắp xếp
      ⚠ Rò rỉ thông tin về thứ tự — chỉ dùng khi thật cần

   ③ THAY BẰNG TOKEN
      Lưu token vô nghĩa, dữ liệu thật nằm ở kho token riêng
      → Đây là cách chuẩn cho dữ liệu thẻ
      → Hệ thống chính không bao giờ chạm dữ liệu thật

   ④ CHỈ MÃ HOÁ TRƯỜNG KHÔNG CẦN TÌM KIẾM
      Đơn giản nhất, và thường là đủ

   → PHẦN LỚN TRƯỜNG HỢP DÙNG ① CHO TÌM KIẾM VÀ ④ CHO PHẦN CÒN LẠI.
```

## Che dữ liệu ở môi trường thử nghiệm

```text
   NGUỒN RÒ RỈ BỊ ĐÁNH GIÁ THẤP NHẤT: BẢN SAO PRODUCTION
   ĐƯỢC CHÉP SANG MÔI TRƯỜNG THỬ.

   Môi trường thử thường:
      · nhiều người truy cập hơn
      · bảo mật lỏng hơn
      · ai cũng có quyền đọc database
      · bản sao lưu để lung tung

   → NHƯNG DỮ LIỆU LẠI LÀ DỮ LIỆU THẬT.
```

```text
   NGUYÊN TẮC: KHÔNG BAO GIỜ CHÉP DỮ LIỆU THẬT SANG MÔI TRƯỜNG THỬ.

   BA CÁCH THAY THẾ:
      · Sinh dữ liệu giả có cùng đặc tính thống kê
      · Che dữ liệu khi chép: thay tên, số điện thoại, số giấy tờ
        bằng giá trị giả NHƯNG GIỮ TÍNH NHẤT QUÁN
        (cùng một khách phải ra cùng một tên giả ở mọi bảng)
      · Chỉ chép cấu trúc, không chép dữ liệu

   ⚠ CHE DỮ LIỆU PHẢI KHÔNG ĐẢO NGƯỢC ĐƯỢC.
     Thay "Nguyễn Văn A" thành "Khách hàng 1" mà vẫn giữ số căn cước
     thật thì chưa che được gì.
```

## Quyền của chủ thể dữ liệu

```text
   QUY ĐỊNH BẢO VỆ DỮ LIỆU CÁ NHÂN CHO KHÁCH HÀNG CÁC QUYỀN,
   VÀ MỖI QUYỀN LÀ MỘT YÊU CẦU KỸ THUẬT THẬT:

   ① QUYỀN ĐƯỢC BIẾT      → phải liệt kê được đang lưu gì về họ
   ② QUYỀN TRUY CẬP       → xuất được toàn bộ dữ liệu của một người
   ③ QUYỀN SỬA            → cập nhật được, và lan sang mọi hệ thống phụ
   ④ QUYỀN XOÁ            → xoá được, nhưng có ngoại lệ
   ⑤ QUYỀN RÚT ĐỒNG Ý     → ngừng xử lý cho mục đích đã đồng ý

   ⚠ ĐIỂM ② VÀ ④ RẤT KHÓ NẾU KHÔNG THIẾT KẾ TỪ ĐẦU:

   Dữ liệu một khách nằm rải ở: database chính, kho dữ liệu phân tích,
   log, bộ nhớ đệm, bản sao lưu, hệ thống gửi tin, hệ thống hỗ trợ,
   file xuất báo cáo...

   → Phải có SƠ ĐỒ DÒNG DỮ LIỆU: dữ liệu cá nhân chảy tới đâu.
     Không có sơ đồ này thì không thực hiện được quyền ② và ④.
```

```text
   VÀ XUNG ĐỘT PHẢI GIẢI QUYẾT RÕ (đã nhắc ở bài 1):

   Khách yêu cầu xoá, nhưng luật phòng chống rửa tiền buộc lưu
   hồ sơ giao dịch nhiều năm.

   → GIẢI PHÁP: xoá dữ liệu không còn căn cứ pháp lý để lưu,
     giữ phần bắt buộc theo luật, KHÓA lại chỉ dùng cho đúng mục đích đó,
     và TRẢ LỜI KHÁCH rõ ràng phần nào giữ và vì sao.

   → Im lặng hoặc từ chối toàn bộ đều là vi phạm.
```

## Bảo vệ trong kiến trúc

```text
   ① PHÂN VÙNG MẠNG
      Hệ thống chạm dữ liệu thẻ nằm trong vùng riêng, kiểm soát chặt.
      → Giảm phạm vi phải tuân thủ PCI DSS.

   ② GIẢM PHẠM VI DỮ LIỆU
      Câu hỏi đầu tiên luôn là: CÓ CẦN LƯU KHÔNG?
      → Dữ liệu không lưu là dữ liệu không thể rò rỉ.
      → Đây là biện pháp bảo mật hiệu quả nhất và rẻ nhất.

   ③ CHE Ở TẦNG API
      API trả về dữ liệu đã che sẵn theo quyền của người gọi,
      không để tầng giao diện tự che.
      → Giao diện che thì kẻ tấn công gọi thẳng API là lấy được đủ.

   ④ GIỚI HẠN TRUY XUẤT HÀNG LOẠT
      Một nhân viên xem 5 hồ sơ/ngày là bình thường.
      Xem 5.000 hồ sơ trong một giờ là đang tải dữ liệu về.
      → Giới hạn số bản ghi mỗi lần gọi, và cảnh báo trên tổng số/ngày.
```

```text
   ⚠ ĐIỂM ④ CHẶN ĐƯỢC KỊCH BẢN RÒ RỈ TỪ BÊN TRONG PHỔ BIẾN NHẤT:

   Nhân viên có quyền hợp lệ, dùng đúng quyền đó, nhưng ở quy mô
   không bình thường.

   Không có giới hạn này thì mọi phân quyền đều không ngăn được
   việc tải toàn bộ cơ sở dữ liệu khách hàng.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Chỉ bảo vệ trường quy định liệt kê | Lịch sử giao dịch bị lộ → **lừa đảo có mục tiêu** | Phân loại theo "kẻ xấu làm được gì", không theo danh sách |
| Ghi log request gửi cổng thanh toán | **Số thẻ và CVV nằm trong log** | Bộ lọc ở tầng log, che trong `toString()`, quét log định kỳ |
| Lưu CVV "để tiện đối soát" | **Vi phạm tuyệt đối**, không có ngoại lệ | Không lưu ở bất kỳ đâu, kể cả tạm |
| Chỉ mã hoá toàn ổ đĩa | Không bảo vệ được khi database bị rò rỉ qua ứng dụng | Thêm mã hoá **từng trường** ở tầng ứng dụng |
| Khoá mã hoá nằm cạnh dữ liệu | Mã hoá **không bảo vệ được gì** | Dịch vụ quản lý khoá riêng, xoay vòng được |
| Không thiết kế cách tra cứu dữ liệu mã hoá | Mã hoá xong rồi không tìm kiếm được, phải làm lại | Cột băm phụ có muối bí mật, hoặc token |
| Chép dữ liệu production sang môi trường thử | Nguồn rò rỉ **bị đánh giá thấp nhất** | Sinh dữ liệu giả hoặc che không đảo ngược được |
| Che dữ liệu không nhất quán giữa các bảng | Ghép lại vẫn ra người thật | Cùng khách → cùng giá trị giả ở mọi nơi |
| Che ở tầng giao diện | Gọi thẳng API là lấy được đủ | Che ở **tầng API** theo quyền người gọi |
| Không giới hạn truy xuất hàng loạt | Nhân viên tải toàn bộ dữ liệu khách bằng quyền hợp lệ | Giới hạn số bản ghi, cảnh báo trên tổng/ngày |
| Không có sơ đồ dòng dữ liệu | **Không thực hiện được quyền truy cập và quyền xoá** | Vẽ và duy trì sơ đồ dữ liệu cá nhân chảy tới đâu |
| Từ chối toàn bộ yêu cầu xoá | Vi phạm quy định bảo vệ dữ liệu | Xoá phần được, giữ phần luật buộc, **giải thích rõ** |

## Tóm tắt bài 5

- **Bảo vệ dữ liệu không phải là mã hoá vài trường quy định liệt kê** — lịch sử giao dịch bị lộ có sức thuyết phục hơn cả số thẻ trong lừa đảo có mục tiêu.
- Phân loại dữ liệu phải hỏi **"nếu ra ngoài, kẻ xấu làm được gì"**, không hỏi "quy định có bắt bảo vệ không".
- **CVV, dữ liệu băng từ, mã PIN là cấm tuyệt đối** — và "không lưu" nghĩa là không ở database, **không ở log**, không ở bộ nhớ đệm, không ở bản ghi lỗi.
- **Rò rỉ qua log là sự cố phổ biến nhất** — chặn bằng bộ lọc tầng log, che trong `toString()`, và quét log định kỳ.
- Ba tầng mã hoá; **mã hoá từng trường ở tầng ứng dụng là tầng duy nhất bảo vệ được khi database bị rò rỉ**, và là tầng hay bị bỏ qua nhất.
- **Điều quan trọng nhất của mã hoá là quản lý khoá, không phải thuật toán** — khoá để cạnh dữ liệu thì không bảo vệ được gì.
- Phải thiết kế **cách tra cứu dữ liệu đã mã hoá từ đầu**, nếu không sẽ phải làm lại: cột băm phụ có muối bí mật, hoặc thay bằng token.
- **Không bao giờ chép dữ liệu thật sang môi trường thử** — che phải **không đảo ngược được** và **nhất quán giữa các bảng**.
- **Che ở tầng API, không ở tầng giao diện**; và **giới hạn truy xuất hàng loạt** để chặn kịch bản nhân viên dùng quyền hợp lệ ở quy mô bất thường.
- Quyền truy cập và quyền xoá của khách **đòi hỏi sơ đồ dòng dữ liệu** — không có nó thì không thực hiện được.
- Xung đột giữa quyền xoá và nghĩa vụ lưu trữ: **xoá phần được, giữ phần luật buộc, khoá lại đúng mục đích, và giải thích rõ cho khách**.

**Bài kế tiếp** → [Bài 6: Dấu vết kiểm toán và sẵn sàng cho thanh tra](06-audit-trail-va-thanh-tra.md)

**Quay lại** → [Bài 4: Hạn mức và kiểm soát](04-han-muc-va-kiem-soat.md)
