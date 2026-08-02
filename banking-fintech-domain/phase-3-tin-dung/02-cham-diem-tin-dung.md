# Bài 2: Chấm điểm tín dụng — quyết định cho vay dựa trên gì

## Sự cố mở đầu

Một công ty cho vay tiêu dùng đưa mô hình chấm điểm mới lên production. Mô hình mới tốt hơn mô hình cũ trên mọi chỉ số khi kiểm thử.

Ba tháng sau, tỷ lệ nợ xấu tăng từ 3,1% lên **8,7%**.

Đội dữ liệu kiểm tra lại mô hình: vẫn chính xác. Kiểm tra dữ liệu đầu vào: vẫn đúng.

Vấn đề nằm ở chỗ không ai nghĩ tới. Mô hình được huấn luyện trên dữ liệu của những khách hàng **đã được duyệt vay** trong quá khứ. Nhưng những người **bị từ chối** thì không có dữ liệu về việc họ có trả nợ được hay không — vì họ chưa từng được vay.

Mô hình học từ một tập dữ liệu đã bị lọc sẵn bởi chính quyết định của mô hình cũ. Khi mô hình mới nới lỏng tiêu chí ở một nhóm khách hàng, nó bước vào vùng **chưa từng có dữ liệu**.

Hiện tượng này có tên: **thiên lệch do chỉ quan sát được người được duyệt**. Nó là cái bẫy đặc trưng của mọi hệ thống chấm điểm tín dụng, và nó không xuất hiện trong bất kỳ bài kiểm thử nào.

## Chấm điểm tín dụng thật sự trả lời câu hỏi gì

```text
   CÂU HỎI SAI:  "Người này có tốt không?"
   CÂU HỎI ĐÚNG: "Xác suất người này KHÔNG trả được nợ trong
                  12 tháng tới là bao nhiêu?"

   → Kết quả không phải "duyệt / từ chối".
     Kết quả là MỘT CON SỐ XÁC SUẤT.

   Việc chuyển con số đó thành quyết định là một bước RIÊNG,
   và nó phụ thuộc vào khẩu vị rủi ro của công ty, không phải mô hình.
```

```text
   VÌ SAO PHẢI TÁCH HAI BƯỚC:

   Điểm rủi ro : 0,12  (12% khả năng không trả được)
        ↓
   Ngưỡng quyết định — do KINH DOANH đặt, thay đổi theo thời kỳ:
        · Đang mở rộng thị phần    → duyệt tới 0,15
        · Kinh tế khó khăn         → siết còn 0,08
        · Sản phẩm lãi suất cao    → chấp nhận 0,20

   → Cùng một mô hình, ba chính sách khác nhau.
   → Nếu trộn hai bước vào nhau, mỗi lần đổi khẩu vị rủi ro
     lại phải huấn luyện lại mô hình. Đó là thiết kế sai.
```

## Nguồn dữ liệu — và điều mỗi nguồn thật sự nói lên

| Nguồn | Nói lên điều gì | Hạn chế |
|---|---|---|
| **Lịch sử tín dụng** (CIC ở Việt Nam) | Đã từng vay và trả thế nào | Người chưa từng vay không có hồ sơ |
| **Thu nhập khai báo** | Khả năng trả | Khai được, khó xác minh |
| **Sao kê tài khoản** | Dòng tiền thật vào ra | Chỉ thấy một ngân hàng |
| **Hành vi trong app** | Mức độ nghiêm túc | Dễ nhầm tương quan với nhân quả |
| **Dữ liệu viễn thông** | Ổn định nơi ở, nghề nghiệp | Nhạy cảm về quyền riêng tư |
| **Dữ liệu thiết bị** | Dấu hiệu gian lận | Không nói gì về khả năng trả |

```text
   ⚠ PHÂN BIỆT HAI THỨ HAY BỊ TRỘN LẪN:

   RỦI RO TÍN DỤNG : người thật, có ý định trả, nhưng KHÔNG ĐỦ KHẢ NĂNG
   RỦI RO GIAN LẬN : người không có ý định trả ngay từ đầu,
                     hoặc không phải người thật

   Hai loại rủi ro này cần HAI MÔ HÌNH KHÁC NHAU và
   HAI CÁCH XỬ LÝ KHÁC NHAU.

   Gộp chung → mô hình tín dụng bị nhiễu bởi các mẫu gian lận,
   và các mẫu gian lận thì thay đổi rất nhanh.
```

## Năm nhóm yếu tố kinh điển

```text
   ① LỊCH SỬ TRẢ NỢ          — yếu tố mạnh nhất
      Đã từng chậm trả bao nhiêu lần, chậm bao lâu, gần đây hay lâu rồi.
      Chậm 90 ngày cách đây 5 năm khác hẳn chậm 10 ngày tháng trước.

   ② MỨC ĐỘ SỬ DỤNG HẠN MỨC
      Dùng 95% hạn mức thẻ tín dụng là dấu hiệu căng thẳng dòng tiền,
      kể cả khi vẫn trả đủ.

   ③ THỜI GIAN CÓ LỊCH SỬ TÍN DỤNG
      Hồ sơ 10 năm sạch đáng tin hơn hồ sơ 3 tháng sạch.

   ④ SỐ LẦN BỊ TRA CỨU GẦN ĐÂY
      Nộp đơn ở 8 nơi trong 2 tuần là dấu hiệu đang rất cần tiền.

   ⑤ CƠ CẤU KHOẢN VAY ĐANG CÓ
      Tổng nghĩa vụ trả nợ hằng tháng so với thu nhập.
```

```text
   YẾU TỐ ⑤ CÓ MỘT CHỈ SỐ RIÊNG, VÀ NÓ QUAN TRỌNG NHẤT VỚI VAY TIÊU DÙNG:

   DTI (Debt-to-Income) = tổng trả nợ hằng tháng / thu nhập hằng tháng

   Ví dụ: thu nhập 20 triệu, đang trả nợ 6 triệu, xin vay thêm
          khoản trả 4 triệu/tháng
          → DTI sau khi vay = (6 + 4) / 20 = 50%

   ⚠ TÍNH DTI PHẢI GỒM CẢ KHOẢN ĐANG XIN, không chỉ khoản đang có.
     Đây là lỗi tính toán phổ biến nhất và nó luôn nghiêng về
     phía duyệt quá dễ.
```

## Bốn cái bẫy dữ liệu

```text
   ① THIÊN LỆCH DO CHỈ THẤY NGƯỜI ĐƯỢC DUYỆT  ← sự cố ở đầu bài
      Bạn chỉ biết kết quả trả nợ của người ĐÃ ĐƯỢC VAY.
      Người bị từ chối là vùng tối hoàn toàn.
      → Cách giảm: duyệt ngẫu nhiên một tỷ lệ nhỏ hồ sơ dưới ngưỡng
        để thu thập dữ liệu vùng tối. Tốn tiền, nhưng là cách duy nhất.

   ② RÒ RỈ DỮ LIỆU TƯƠNG LAI
      Dùng biến chỉ tồn tại SAU khi đã biết kết quả.
      Ví dụ: "số lần công ty gọi nhắc nợ" — chỉ có với người đã chậm trả.
      → Mô hình đạt độ chính xác rất cao khi kiểm thử và vô dụng khi chạy thật.
      → Quy tắc: mọi biến phải trả lời được câu "biến này có giá trị
        tại đúng thời điểm ra quyết định không?"

   ③ MÔ HÌNH LỖI THỜI
      Hành vi trả nợ thay đổi theo chu kỳ kinh tế.
      Mô hình huấn luyện năm ổn định sẽ sai trong năm khó khăn.
      → Theo dõi độ trôi của phân bố đầu vào, không chỉ theo dõi độ chính xác.

   ④ BIẾN THAY THẾ CHO YẾU TỐ BỊ CẤM
      Luật cấm phân biệt theo giới tính, dân tộc, tôn giáo.
      Nhưng mã bưu chính, tên trường học, loại điện thoại có thể
      GIÁN TIẾP mã hoá những yếu tố đó.
      → Kiểm tra công bằng của mô hình là việc bắt buộc, không phải tuỳ chọn.
```

## Kiến trúc hệ thống chấm điểm

```text
   ┌──────────────────────────────────────────────────────────┐
   │ ① THU THẬP DỮ LIỆU                                        │
   │    Nhiều nguồn, mỗi nguồn có thể chậm hoặc lỗi            │
   │    → phải có timeout riêng và giá trị mặc định cho từng   │
   │      nguồn, KHÔNG để một nguồn chậm chặn cả quy trình     │
   ├──────────────────────────────────────────────────────────┤
   │ ② TÍNH ĐẶC TRƯNG (feature)                                │
   │    ⚠ Logic tính đặc trưng lúc HUẤN LUYỆN và lúc CHẠY THẬT │
   │      phải GIỐNG HỆT NHAU.                                 │
   │    → Khác nhau là nguồn lỗi âm thầm phổ biến nhất.        │
   │      Dùng chung một thư viện cho cả hai đường.            │
   ├──────────────────────────────────────────────────────────┤
   │ ③ CHẤM ĐIỂM                                               │
   │    Trả về: điểm + PHIÊN BẢN MÔ HÌNH + các đặc trưng đã dùng│
   ├──────────────────────────────────────────────────────────┤
   │ ④ ÁP DỤNG CHÍNH SÁCH                                      │
   │    Ngưỡng + luật cứng (tuổi, giấy tờ, danh sách đen)      │
   │    → Luật cứng nằm NGOÀI mô hình, sửa được ngay không cần │
   │      huấn luyện lại                                       │
   ├──────────────────────────────────────────────────────────┤
   │ ⑤ GHI LẠI TOÀN BỘ                                         │
   │    Đầu vào, đặc trưng, điểm, phiên bản, quyết định, lý do │
   └──────────────────────────────────────────────────────────┘
```

```text
   ⚠ BƯỚC ⑤ KHÔNG PHẢI ĐỂ GỠ LỖI. NÓ LÀ YÊU CẦU PHÁP LÝ.

   Khách bị từ chối có quyền hỏi vì sao.
   Thanh tra có quyền yêu cầu giải trình một quyết định cụ thể
   từ nhiều năm trước.

   → Phải tái dựng được quyết định đó: cùng đầu vào, cùng phiên bản
     mô hình, ra cùng kết quả.
   → Nghĩa là phải LƯU PHIÊN BẢN MÔ HÌNH theo từng quyết định,
     và giữ được các phiên bản mô hình cũ.
```

## Bốn chỉ số theo dõi sau khi lên production

| Chỉ số | Ý nghĩa | Dấu hiệu xấu |
|---|---|---|
| **Tỷ lệ duyệt** | Bao nhiêu phần trăm hồ sơ được duyệt | Tăng vọt không rõ lý do → mô hình hoặc dữ liệu có vấn đề |
| **Độ trôi phân bố** | Đầu vào hôm nay có giống lúc huấn luyện không | Trôi mạnh → mô hình đang ngoài vùng an toàn |
| **Tỷ lệ chậm trả sớm** | Chậm ngay kỳ đầu hoặc kỳ hai | Tăng → dấu hiệu **gian lận**, không phải rủi ro tín dụng |
| **Nợ xấu theo nhóm khách** | Tách theo điểm, theo kênh, theo sản phẩm | Một nhóm xấu bất thường → mô hình sai ở đúng nhóm đó |

```text
   CHỈ SỐ "CHẬM TRẢ SỚM" LÀ CHỈ SỐ CẢNH BÁO NHANH NHẤT.

   Nợ xấu thật sự cần 90+ ngày mới lộ ra. Quá muộn để phản ứng.
   Nhưng người gian lận thường bỏ ngay từ kỳ đầu.

   → Theo dõi tỷ lệ chậm kỳ đầu hằng tuần cho phép phát hiện
     một luồng gian lận mới trong vài tuần thay vì vài tháng.
```

## Ba luật cứng nên nằm ngoài mô hình

```text
   ① ĐIỀU KIỆN PHÁP LÝ
      Tuổi, giấy tờ hợp lệ, không thuộc danh sách cấm.
      → Không thoả là từ chối, bất kể điểm bao nhiêu.

   ② HẠN MỨC THEO THU NHẬP
      DTI vượt trần → từ chối hoặc giảm số tiền cho vay.
      → Đây là bảo vệ khách hàng, không chỉ bảo vệ công ty.

   ③ CHỐNG NỘP ĐƠN LIÊN TỤC
      Bị từ chối rồi nộp lại ngay → phải có thời gian chờ.
      → Không có luật này thì khách sửa thông tin và thử lại
        tới khi lọt qua.

   ⚠ BA LUẬT NÀY PHẢI SỬA ĐƯỢC BẰNG CẤU HÌNH, KHÔNG PHẢI BẰNG DEPLOY.
     Quy định thay đổi thì phải áp dụng được trong ngày.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Trộn chấm điểm với quyết định duyệt | Đổi khẩu vị rủi ro phải huấn luyện lại mô hình | Tách hai bước: điểm rủi ro và ngưỡng chính sách |
| Bỏ qua thiên lệch người-được-duyệt | Nới ngưỡng là bước vào **vùng không có dữ liệu** | Duyệt ngẫu nhiên một tỷ lệ nhỏ dưới ngưỡng |
| Dùng biến chỉ có sau khi biết kết quả | Kiểm thử rất tốt, chạy thật vô dụng | Mọi biến phải có giá trị **tại thời điểm quyết định** |
| Logic tính đặc trưng khác nhau giữa huấn luyện và chạy thật | Sai âm thầm, rất khó tìm | Dùng chung một thư viện |
| Gộp mô hình tín dụng và mô hình gian lận | Mô hình tín dụng bị nhiễu bởi mẫu gian lận đổi liên tục | Hai mô hình riêng, hai cách xử lý riêng |
| Tính DTI không gồm khoản đang xin | Luôn nghiêng về duyệt quá dễ | Gồm cả khoản đang xin vào mẫu số |
| Không lưu phiên bản mô hình theo quyết định | **Không giải trình được** với khách và thanh tra | Lưu đầu vào, đặc trưng, điểm, phiên bản, lý do |
| Luật cứng nằm trong mô hình | Quy định đổi phải huấn luyện lại | Luật cứng ngoài mô hình, sửa bằng cấu hình |
| Không kiểm tra biến thay thế yếu tố bị cấm | Phân biệt đối xử gián tiếp → rủi ro pháp lý | Kiểm tra công bằng là bắt buộc |
| Chỉ theo dõi nợ xấu | Phát hiện muộn 90+ ngày | Theo dõi **tỷ lệ chậm trả kỳ đầu** hằng tuần |
| Một nguồn dữ liệu chậm chặn cả quy trình | Hồ sơ treo, khách bỏ đi | Timeout riêng và giá trị mặc định cho từng nguồn |

## Tóm tắt bài 2

- Chấm điểm trả lời **"xác suất không trả được nợ là bao nhiêu"**, không phải "duyệt hay từ chối". **Tách con số rủi ro khỏi ngưỡng chính sách** — nếu không, mỗi lần đổi khẩu vị rủi ro lại phải huấn luyện lại mô hình.
- **Rủi ro tín dụng và rủi ro gian lận là hai thứ khác nhau**, cần hai mô hình và hai cách xử lý riêng.
- **DTI phải gồm cả khoản đang xin vay** — quên điều này luôn làm quyết định nghiêng về phía duyệt quá dễ.
- Bốn bẫy dữ liệu: **thiên lệch do chỉ thấy người được duyệt**, **rò rỉ dữ liệu tương lai**, **mô hình lỗi thời**, và **biến thay thế cho yếu tố bị cấm**.
- Bẫy thứ nhất là bẫy đặc trưng của tín dụng: mô hình học từ tập dữ liệu **đã bị lọc bởi chính quyết định của mô hình cũ**, nên nới ngưỡng là bước vào vùng chưa có dữ liệu.
- Logic tính đặc trưng lúc huấn luyện và lúc chạy thật **phải dùng chung một thư viện**.
- **Ghi lại toàn bộ quyết định kèm phiên bản mô hình là yêu cầu pháp lý**, không phải để gỡ lỗi — phải tái dựng được quyết định từ nhiều năm trước.
- **Tỷ lệ chậm trả kỳ đầu là chỉ số cảnh báo nhanh nhất** — nợ xấu cần 90+ ngày mới lộ, còn gian lận bỏ ngay kỳ đầu.
- Luật cứng (pháp lý, trần DTI, chống nộp đơn liên tục) nằm **ngoài mô hình** và sửa được bằng cấu hình.

**Bài kế tiếp** → [Bài 3: Lãi suất — bốn cách tính cho ra bốn con số khác nhau](03-cac-cach-tinh-lai.md)

**Quay lại** → [Bài 1: Vòng đời một khoản vay](01-vong-doi-khoan-vay.md)
