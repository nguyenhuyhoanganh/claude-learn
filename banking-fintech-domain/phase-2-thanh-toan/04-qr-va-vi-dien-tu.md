# Bài 4: QR code và ví điện tử — mô hình thanh toán phổ biến nhất Việt Nam

## Sự cố mở đầu

Một quán cà phê dán mã QR tĩnh ở quầy. Khách quét, tự nhập số tiền, chuyển khoản, đưa điện thoại cho nhân viên xem màn hình "Chuyển tiền thành công". Nhân viên gật đầu, khách đi.

Cuối ngày, chủ quán đối chiếu: bán 187 ly, thu về tiền của **164 giao dịch**.

23 ly biến mất. Camera cho thấy khách có đưa màn hình ra, nhân viên có nhìn.

Hoá ra có ba kiểu:

- Khách chụp màn hình một giao dịch **cũ** rồi đưa ra
- Khách dùng app giả lập giao diện chuyển tiền
- Khách chuyển thật nhưng **vào số tài khoản khác** — mã QR bị dán đè

Sự cố này có một nguyên nhân gốc duy nhất: **xác nhận thanh toán bằng mắt người, không bằng hệ thống**.

Bài này nói về mô hình thanh toán phổ biến nhất Việt Nam, và vì sao mô hình rẻ nhất lại nguy hiểm nhất.

## Hai loại mã QR — khác nhau về bản chất

```text
   ┌──────────────────────────────────────────────────────────────┐
   │ QR TĨNH                                                       │
   │                                                               │
   │   Chứa: mã ngân hàng + số tài khoản (+ tên)                  │
   │   KHÔNG chứa số tiền, KHÔNG chứa mã đơn hàng                 │
   │                                                               │
   │   In ra một lần, dán mãi mãi.                                │
   │   Khách tự nhập số tiền.                                     │
   │                                                               │
   │   ✅ Rẻ — không cần hệ thống gì                              │
   │   ❌ KHÔNG BIẾT khoản tiền vào là của đơn nào                │
   │   ❌ KHÔNG tự đối soát được                                  │
   │   ❌ Bị dán đè mã khác mà không ai biết                      │
   ├──────────────────────────────────────────────────────────────┤
   │ QR ĐỘNG                                                       │
   │                                                               │
   │   Chứa: mã ngân hàng + tài khoản + SỐ TIỀN + MÃ ĐƠN HÀNG     │
   │                                                               │
   │   Sinh ra cho TỪNG giao dịch, dùng một lần, có hạn.          │
   │                                                               │
   │   ✅ Khách không nhập sai số tiền được                       │
   │   ✅ Tiền vào là biết ngay của đơn nào → TỰ ĐỐI SOÁT         │
   │   ✅ Hết hạn thì không dùng lại được                         │
   │   ❌ Cần hệ thống sinh mã và nhận thông báo                  │
   └──────────────────────────────────────────────────────────────┘
```

> **Với bất kỳ mô hình kinh doanh nào có nhiều hơn vài giao dịch mỗi ngày, QR tĩnh là lựa chọn sai.** Nó tiết kiệm chi phí tích hợp và trả giá bằng thất thoát cùng công đối soát thủ công.

## Luồng thanh toán QR động — đúng cách

```text
   ┌─────────┐  ①tạo đơn 45.000đ   ┌──────────────┐
   │ QUẦY    │────────────────────►│ HỆ THỐNG BÁN │
   │ THU NGÂN│                     │ HÀNG         │
   └─────────┘                     └──────┬───────┘
                                           │ ②xin mã QR cho đơn DH-1024
                                           ▼
                                    ┌──────────────┐
                                    │ NGÂN HÀNG /  │
                                    │ PSP          │
                                    └──────┬───────┘
                                           │ ③trả về chuỗi QR
        ┌─────────┐  ④hiện QR              │
        │ MÀN HÌNH│◄───────────────────────┘
        └────┬────┘
             │ ⑤khách quét và xác nhận trên app ngân hàng
             ▼
      ┌─────────────┐   ⑥tiền chuyển
      │ APP NGÂN    │──────────────────────►┌──────────────┐
      │ HÀNG KHÁCH  │                       │ NGÂN HÀNG /  │
      └─────────────┘                       │ PSP          │
                                            └──────┬───────┘
                                                   │ ⑦GỬI THÔNG BÁO (webhook)
                                                   ▼
                                            ┌──────────────┐
                                            │ HỆ THỐNG BÁN │ ⑧đối chiếu mã đơn
                                            │ HÀNG         │   → xác nhận đã thu
                                            └──────┬───────┘
                                                   │ ⑨
                                                   ▼
                                            ┌──────────────┐
                                            │ MÀN HÌNH QUẦY│ "ĐÃ THANH TOÁN"
                                            └──────────────┘

   ⚠ BƯỚC ⑦ VÀ ⑧ LÀ THỨ MÀ QUÁN CÀ PHÊ Ở ĐẦU BÀI KHÔNG CÓ.

   Không có bước này, "xác nhận thanh toán" chỉ là nhân viên
   nhìn màn hình điện thoại của khách — và màn hình thì giả được.
```

## Nguyên tắc sống còn: chỉ tin thông báo từ hệ thống

```text
   ❌ KHÔNG BAO GIỜ COI LÀ ĐÃ THANH TOÁN KHI:
      · Khách đưa ảnh chụp màn hình
      · Khách đọc mã giao dịch cho nhân viên
      · Nhân viên "nhìn thấy app báo thành công"
      · App của bạn tự chuyển trạng thái sau khi khách bấm "Tôi đã trả"

   ✅ CHỈ COI LÀ ĐÃ THANH TOÁN KHI:
      · Nhận được thông báo từ ngân hàng/PSP, VÀ
      · Chữ ký của thông báo hợp lệ, VÀ
      · Số tiền khớp với đơn hàng, VÀ
      · Mã đơn hàng khớp, VÀ
      · Mã giao dịch đó chưa từng được xử lý trước đó
```

```text
   NĂM ĐIỀU KIỆN TRÊN PHẢI ĐỦ CẢ NĂM.

   Thiếu chữ ký      → ai cũng gửi được thông báo giả tới bạn
   Thiếu khớp tiền   → khách trả 1.000 đ cho đơn 1.000.000 đ
   Thiếu khớp mã đơn → tiền của đơn này ghi nhận cho đơn khác
   Thiếu chống trùng → một lần trả, ghi nhận nhiều đơn
```

## Xác thực thông báo — phần hay bị làm sai nhất

```text
   THÔNG BÁO (WEBHOOK) LÀ MỘT REQUEST HTTP TỪ INTERNET VÀO HỆ THỐNG BẠN.
   BẤT KỲ AI CŨNG GỬI ĐƯỢC. Nên nó phải được xác thực.

   ① KIỂM TRA CHỮ KÝ
      Đối tác ký nội dung bằng khoá bí mật dùng chung.
      Bạn tính lại chữ ký và so sánh.
      ⚠ So sánh phải dùng hàm so sánh THỜI GIAN CỐ ĐỊNH,
        không dùng phép so chuỗi thường (tránh rò rỉ qua thời gian).

   ② KIỂM TRA THỜI GIAN
      Thông báo có mốc thời gian; quá cũ thì từ chối.
      → chặn việc phát lại thông báo cũ.

   ③ CHỐNG TRÙNG THEO MÃ GIAO DỊCH
      Đối tác CÓ THỂ gửi lại cùng một thông báo nhiều lần —
      đây là hành vi BÌNH THƯỜNG, không phải lỗi.
      → Lưu mã giao dịch đã xử lý, gặp lại thì bỏ qua và trả 200.

   ④ TRẢ VỀ 200 NGAY, XỬ LÝ SAU
      Đối tác thường timeout sau vài giây và gửi lại.
      Xử lý nặng trong lúc họ chờ → họ gửi lại → bạn xử lý trùng.
      → Nhận, ghi vào hàng đợi, trả 200, rồi mới xử lý.

   ⑤ ĐỪNG TIN SỐ TIỀN TRONG THÔNG BÁO MỘT CÁCH MÙ QUÁNG
      Với giao dịch giá trị lớn, TRUY VẤN LẠI đối tác để xác nhận.
```

## Ví điện tử — mô hình khác hẳn

```text
   VÍ ĐIỆN TỬ KHÔNG PHẢI NGÂN HÀNG. NÓ LÀ MỘT SỔ CÁI RIÊNG.

   ┌────────────────────────────────────────────────────────────┐
   │  TÀI KHOẢN ĐẢM BẢO TẠI NGÂN HÀNG                           │
   │  (một tài khoản duy nhất, chứa tiền thật của TẤT CẢ khách) │
   │                        10.000.000.000 đ                     │
   └────────────────────────────────────────────────────────────┘
                              ▲
                              │  tổng phải luôn KHỚP
                              ▼
   ┌────────────────────────────────────────────────────────────┐
   │  SỔ CÁI CỦA VÍ (trong database của bạn)                    │
   │     ví A:      500.000 đ                                    │
   │     ví B:    1.200.000 đ                                    │
   │     ví C:       80.000 đ                                    │
   │     ...                                                     │
   │     TỔNG: 10.000.000.000 đ                                 │
   └────────────────────────────────────────────────────────────┘

   ⚠ ĐÂY LÀ RÀNG BUỘC QUAN TRỌNG NHẤT CỦA MỘT VÍ:

      TỔNG SỐ DƯ MỌI VÍ  =  SỐ DƯ TÀI KHOẢN ĐẢM BẢO

   Lệch nghĩa là hoặc bạn đang giữ tiền không thuộc về ai,
   hoặc bạn đang nợ khách hàng nhiều hơn số tiền thật có.
   → Kiểm tra ràng buộc này MỖI NGÀY, không có ngoại lệ.
```

## Ba luồng tiền của ví, và đặc điểm riêng

```text
   ① NẠP TIỀN (từ ngân hàng vào ví)
      Tiền thật vào tài khoản đảm bảo → cộng số dư ví
      ⚠ Phải chờ tiền THẬT SỰ vào rồi mới cộng.
        Cộng trước khi tiền vào = cho khách tiêu tiền chưa có.

   ② THANH TOÁN TRONG VÍ (ví → ví, ví → cửa hàng)
      KHÔNG chạm ngân hàng. Chỉ là hai bút toán trong sổ cái của bạn.
      → Nhanh, gần như miễn phí, và ĐÂY LÀ LỢI THẾ LỚN NHẤT CỦA VÍ.

   ③ RÚT TIỀN (từ ví ra ngân hàng)
      Trừ số dư ví → chuyển tiền thật từ tài khoản đảm bảo
      ⚠ Trừ ví TRƯỚC, chuyển tiền SAU.
        Nếu chuyển thất bại → hoàn lại số dư ví bằng bút toán đảo.
        Làm ngược lại (chuyển trước, trừ sau) → khách rút hai lần.
```

```text
   VÌ SAO LUỒNG ② LÀ MÔ HÌNH KINH DOANH CỦA VÍ:

   Mỗi giao dịch qua ngân hàng đều mất phí.
   Giao dịch trong nội bộ ví chỉ là hai dòng ghi sổ.

   → Ví càng giữ được tiền ở lại trong hệ sinh thái của mình
     thì chi phí càng thấp.
   → Đó là lý do ví luôn khuyến khích bạn giữ số dư,
     và tính phí khi bạn rút ra.
```

## Điểm khác biệt then chốt giữa ba hình thức

| | Chuyển khoản QR | Thẻ | Ví điện tử |
|---|---|---|---|
| Tiền đi qua đâu | Ngân hàng ↔ ngân hàng | 6 bên (bài 1) | Sổ cái nội bộ |
| Tốc độ | Vài giây | Cấp phép ngay, tiền về T+2 | Tức thì |
| Phí cho đơn vị bán | Rất thấp | 1,5–3% | Trung bình |
| **Thu hồi được không** | ❌ **Không** | ✅ Có (chargeback) | Tuỳ chính sách ví |
| Rủi ro chính | Chuyển nhầm, không lấy lại được | Chargeback | Lệch sổ cái nội bộ |
| Cần đối soát với ai | Ngân hàng | PSP + acquirer | Ngân hàng giữ tài khoản đảm bảo |

```text
   HÀNG "THU HỒI ĐƯỢC KHÔNG" QUYẾT ĐỊNH RẤT NHIỀU THỨ:

   Bán hàng giá trị cao mà chỉ nhận chuyển khoản
   → khách bị lừa thì không có cơ chế nào bảo vệ họ
   → nhưng ĐƠN VỊ BÁN HÀNG lại an toàn hơn (không bị chargeback)

   Nhận thẻ
   → khách được bảo vệ
   → nhưng bạn chịu rủi ro chargeback, và tỷ lệ cao thì mất quyền nhận thẻ

   → Không có lựa chọn tốt nhất. Có lựa chọn phù hợp với ngành hàng.
```

## Sửa lại quán cà phê ở đầu bài

```text
   ĐỔI TỪ QR TĨNH SANG QR ĐỘNG:

   ① Máy tính tiền sinh QR có sẵn số tiền và mã đơn
      → khách không nhập được số khác
      → mã dùng một lần, hết hạn sau vài phút

   ② Hệ thống nhận thông báo từ ngân hàng
      → màn hình quầy TỰ chuyển sang "ĐÃ THANH TOÁN"
      → nhân viên KHÔNG cần nhìn điện thoại khách

   ③ Có tiếng chuông báo khi nhận được tiền
      → nhân viên nghe thấy mới đưa hàng

   ④ Cuối ngày đối soát tự động: số đơn = số giao dịch nhận được
      → lệch bao nhiêu biết ngay, không phải đếm tay

   ⚠ VÀ MỘT VIỆC NHỎ NHƯNG QUAN TRỌNG:
     KIỂM TRA MÃ QR DÁN Ở QUẦY MỖI NGÀY.
     Dán đè mã là hình thức lừa đảo phổ biến, và nó không cần
     kỹ thuật gì cả — chỉ cần một tờ giấy.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng QR tĩnh cho bán lẻ | Không đối soát được, **thất thoát âm thầm** | QR động có số tiền và mã đơn |
| Xác nhận bằng mắt nhìn màn hình khách | Ảnh chụp cũ, app giả → mất hàng | Chỉ tin **thông báo có chữ ký** từ hệ thống |
| Không kiểm tra chữ ký thông báo | Ai cũng gửi được thông báo giả | Xác thực chữ ký, so sánh **thời gian cố định** |
| Không chống trùng thông báo | Đối tác gửi lại → ghi nhận nhiều lần | Lưu mã giao dịch đã xử lý |
| Xử lý nặng trước khi trả 200 | Đối tác timeout, gửi lại, xử lý trùng | Nhận → hàng đợi → trả 200 → xử lý sau |
| Không đối chiếu số tiền và mã đơn | Trả 1.000 đ cho đơn 1.000.000 đ vẫn qua | Kiểm **đủ 5 điều kiện** |
| Cộng số dư ví trước khi tiền vào | Khách tiêu tiền chưa có thật | Chờ tiền vào tài khoản đảm bảo rồi mới cộng |
| Chuyển tiền rút trước, trừ ví sau | Khách rút được hai lần | Trừ ví trước, thất bại thì bút toán đảo |
| Không kiểm tra tổng ví = tài khoản đảm bảo | Nợ khách nhiều hơn tiền thật có | Kiểm tra ràng buộc này **mỗi ngày** |
| Không kiểm tra mã QR dán ở quầy | Bị dán đè, tiền vào tài khoản kẻ khác | Kiểm tra vật lý hằng ngày |
| Tưởng chuyển khoản cũng thu hồi được | Hứa với khách điều không làm được | Chuyển khoản **không có chargeback** |

## Tóm tắt bài 4

- **QR tĩnh** chỉ chứa số tài khoản — không biết tiền vào là của đơn nào, không tự đối soát được, và bị dán đè dễ dàng.
- **QR động** chứa số tiền và mã đơn, dùng một lần, có hạn → tự đối soát được. Với bán lẻ, QR tĩnh là lựa chọn sai.
- **Chỉ tin thông báo từ hệ thống, không tin màn hình điện thoại của khách.** Ảnh chụp và app giả đều dễ làm.
- Năm điều kiện phải đủ cả năm: **chữ ký hợp lệ, khớp số tiền, khớp mã đơn, chưa xử lý lần nào, thông báo còn mới**.
- Webhook là request từ Internet — phải **xác thực chữ ký**, so sánh thời gian cố định, **trả 200 ngay rồi xử lý sau**, và **chống trùng** vì đối tác gửi lại là hành vi bình thường.
- Ví điện tử là **một sổ cái riêng** với ràng buộc sống còn: **tổng số dư mọi ví = số dư tài khoản đảm bảo**, kiểm tra mỗi ngày.
- Ba luồng ví: **nạp** (chờ tiền thật rồi mới cộng), **thanh toán nội bộ** (chỉ hai bút toán — đây là lợi thế lớn nhất của ví), **rút** (trừ ví trước, chuyển sau).
- **Chuyển khoản không có cơ chế thu hồi; thẻ có chargeback.** Điều này quyết định ngành hàng nào nên nhận hình thức nào.

**Bài kế tiếp** → [Bài 5: Cổng thanh toán — tích hợp thế nào cho không phải làm lại](05-cong-thanh-toan.md)

**Quay lại** → [Bài 3: Thanh toán thẻ](03-thanh-toan-the.md)
