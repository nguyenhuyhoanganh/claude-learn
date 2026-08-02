# Bài 1: Bản đồ hệ sinh thái thanh toán — ai là ai

## Sự cố mở đầu

Khách hàng quẹt thẻ mua hàng 2 triệu đồng lúc 14:32. Giao dịch thành công, có tin nhắn trừ tiền.

15:10, khách gọi tổng đài: *"Tôi bị trừ tiền hai lần."*

Đội kỹ thuật kiểm tra hệ thống của mình: **chỉ có một giao dịch**. Một bản ghi, một mã tham chiếu, một bút toán. Sổ sạch.

Họ trả lời khách: *"Bên em chỉ ghi nhận một giao dịch, chị kiểm tra lại với ngân hàng."*

Khách gọi ngân hàng. Ngân hàng nói: *"Chúng tôi nhận hai lệnh trừ tiền từ đơn vị bán hàng."*

Hai bên đổ lỗi cho nhau suốt bốn ngày. Cuối cùng hoá ra: cổng thanh toán trung gian gửi lại lệnh sau khi bị timeout, và **không ai trong hai đội biết rằng có một bên thứ ba đứng giữa** đang tự động gửi lại.

Sự cố này không phải lỗi kỹ thuật. Nó là lỗi **không biết mình đang nói chuyện với ai**.

Một giao dịch thẻ đi qua **sáu bên khác nhau**. Nếu bạn không vẽ được bản đồ đó, bạn sẽ không bao giờ debug được sự cố thanh toán — vì bạn không biết phải hỏi ai.

## Sáu vai trong một giao dịch thẻ

```text
   ┌──────────┐   ①quẹt thẻ    ┌──────────────┐
   │ NGƯỜI    │───────────────►│ ĐƠN VỊ       │
   │ MUA      │                │ BÁN HÀNG     │
   │(cardholder)│              │ (merchant)   │
   └──────────┘                └──────┬───────┘
        ▲                             │ ②gửi yêu cầu
        │                             ▼
        │                      ┌──────────────┐
        │                      │ CỔNG THANH   │  ← nơi sự cố ở trên xảy ra
        │                      │ TOÁN (PSP)   │
        │                      └──────┬───────┘
        │                             │ ③
        │                             ▼
        │                      ┌──────────────┐
        │                      │ NGÂN HÀNG    │
        │                      │ THU HỘ       │
        │                      │ (acquirer)   │
        │                      └──────┬───────┘
        │                             │ ④
        │                             ▼
        │                      ┌──────────────┐
        │                      │ TỔ CHỨC THẺ  │  Visa/Mastercard/NAPAS
        │                      │ (card scheme)│
        │                      └──────┬───────┘
        │                             │ ⑤
        │        ⑥ trừ tiền           ▼
        │                      ┌──────────────┐
        └──────────────────────│ NGÂN HÀNG    │
                               │ PHÁT HÀNH    │
                               │ (issuer)     │
                               └──────────────┘
```

**Đọc bản đồ này theo một nguyên tắc duy nhất:** tiền đi **ngược chiều** với yêu cầu. Yêu cầu đi từ người mua lên ngân hàng phát hành; tiền chảy từ ngân hàng phát hành về đơn vị bán hàng.

## Từng vai làm gì, và chịu trách nhiệm gì

| Vai | Là ai | Giữ cái gì | Khi có sự cố, hỏi họ điều gì |
|---|---|---|---|
| **Cardholder** — người mua | Chủ thẻ | Không giữ gì | Thời điểm, số tiền, 4 số cuối thẻ |
| **Merchant** — đơn vị bán hàng | Cửa hàng, sàn, app | Đơn hàng | Mã đơn, mã tham chiếu gửi đi |
| **PSP** — cổng thanh toán | VNPay, Momo, Stripe, Payoo | **Nhật ký mọi lần gửi và gửi lại** | Có gửi lại lần nào không, mã của từng lần |
| **Acquirer** — ngân hàng thu hộ | Ngân hàng của đơn vị bán | Tài khoản nhận tiền | Có nhận mấy lệnh, quyết toán ngày nào |
| **Card scheme** — tổ chức thẻ | Visa, Mastercard, JCB, NAPAS | **Luật chơi và trọng tài** | Mã cấp phép, lý do từ chối |
| **Issuer** — ngân hàng phát hành | Ngân hàng của người mua | Tiền của khách | Đã giữ mấy khoản, giải toả chưa |

```text
   ĐIỂM QUAN TRỌNG NHẤT CỦA BẢNG NÀY:

   PSP LÀ BÊN DUY NHẤT GIỮ NHẬT KÝ ĐẦY ĐỦ CỦA MỌI LẦN GỬI VÀ GỬI LẠI.

   Đơn vị bán hàng chỉ thấy "tôi gửi 1 lần".
   Ngân hàng chỉ thấy "tôi nhận 2 lệnh".
   Chỉ PSP mới biết vì sao 1 thành 2.

   → Khi khách báo trừ tiền hai lần, câu hỏi ĐẦU TIÊN
     không phải "hệ thống mình có lỗi không"
     mà là "PSP có gửi lại không, và mã của từng lần là gì".
```

## Vì sao lại phải có nhiều bên đến vậy

Người mới vào ngành hay hỏi: sao không để đơn vị bán hàng gọi thẳng ngân hàng của khách?

```text
   NẾU KHÔNG CÓ TỔ CHỨC THẺ VÀ CỔNG THANH TOÁN:

   Việt Nam có khoảng 50 ngân hàng.
   Một sàn thương mại điện tử muốn nhận thẻ của mọi ngân hàng
   → phải ký hợp đồng với 50 ngân hàng
   → phải tích hợp 50 API khác nhau
   → phải đối soát với 50 đối tác mỗi ngày

   Và mỗi ngân hàng cũng phải làm điều đó với hàng trăm nghìn cửa hàng.

        50 ngân hàng × 200.000 cửa hàng = 10 TRIỆU kết nối

   CÓ TỔ CHỨC THẺ Ở GIỮA:

        50 ngân hàng + 200.000 cửa hàng = 200.050 kết nối

   → Tổ chức thẻ tồn tại để biến phép NHÂN thành phép CỘNG.
     Đây là lý do kinh tế, không phải lý do kỹ thuật.
```

Cổng thanh toán tồn tại vì lý do khác: **đơn vị bán hàng không muốn chạm vào dữ liệu thẻ**. Chạm vào là phải tuân thủ PCI DSS, phải kiểm định hằng năm, phải chịu trách nhiệm nếu rò rỉ. Cổng thanh toán nhận lấy gánh nặng đó.

## Ai lấy tiền của ai — dòng phí

Đây là phần mà kỹ sư hay bỏ qua, nhưng nó giải thích **vì sao số tiền về tài khoản không bằng số tiền khách trả**.

```text
   KHÁCH TRẢ 100.000 đ

   ┌────────────────────────────────────────────────────┐
   │ 100.000                                             │
   │   − 1.100  interchange fee → NGÂN HÀNG PHÁT HÀNH   │
   │   −   150  scheme fee      → TỔ CHỨC THẺ           │
   │   −   400  acquirer markup → NGÂN HÀNG THU HỘ      │
   │   −   350  phí cổng        → PSP                   │
   │ ─────────                                           │
   │ = 98.000  về tài khoản ĐƠN VỊ BÁN HÀNG             │
   └────────────────────────────────────────────────────┘

   Tổng phí gọi là MDR (Merchant Discount Rate) — ở đây là 2%.

   ⚠ HỆ QUẢ CHO HỆ THỐNG CỦA BẠN:

   Số tiền GHI NHẬN đơn hàng   = 100.000
   Số tiền NHẬN VỀ tài khoản   =  98.000

   Nếu bạn đối soát bằng cách so hai con số này, NGÀY NÀO CŨNG LỆCH.
   → Phải ghi phí thành một bút toán CHI PHÍ riêng (xem phase 1 bài 2),
     rồi đối soát trên số GỘP, không phải số RÒNG.
```

```text
   VÀ MỘT CHI TIẾT DỄ SAI:

   Có PSP trả tiền theo số RÒNG (đã trừ phí, mỗi ngày một lần),
   có PSP trả số GỘP rồi cuối tháng xuất hoá đơn thu phí.

   Hai cách này cần hai mô hình sổ sách KHÁC NHAU.
   Hỏi rõ điều này TRƯỚC khi viết code đối soát, không phải sau.
```

## Bản đồ chuyển khoản — khác hẳn bản đồ thẻ

Ở Việt Nam, chuyển khoản ngân hàng phổ biến hơn thẻ rất nhiều, và nó đi qua đường khác:

```text
   ┌──────────┐        ┌──────────────┐        ┌──────────┐
   │ NGƯỜI    │───────►│ NGÂN HÀNG    │───────►│  NAPAS   │
   │ CHUYỂN   │        │ CHUYỂN       │        │          │
   └──────────┘        └──────────────┘        └────┬─────┘
                                                     │
                       ┌──────────────┐        ┌────▼─────┐
                       │ NGƯỜI NHẬN   │◄───────│ NGÂN HÀNG│
                       │              │        │ NHẬN     │
                       └──────────────┘        └──────────┘

   ĐƯỜNG NÀY NGẮN HƠN, ÍT BÊN HƠN, PHÍ THẤP HƠN NHIỀU.
   Và quan trọng: nó chạy 24/7, tiền tới trong vài giây.

   ⚠ NHƯNG NÓ CÓ MỘT ĐẶC ĐIỂM CHẾT NGƯỜI:
     CHUYỂN KHOẢN THÀNH CÔNG LÀ KHÔNG THU HỒI ĐƯỢC.

     Thẻ có cơ chế chargeback — khách khiếu nại thì lấy lại được tiền.
     Chuyển khoản thì không. Chuyển nhầm là phải đi xin lại.

   → Đây là lý do lừa đảo chuyển khoản phổ biến hơn lừa đảo thẻ rất nhiều.
```

## Ba câu hỏi phải trả lời trước khi tích hợp bất kỳ đối tác nào

```text
   ① AI CHỊU RỦI RO KHI CÓ TRANH CHẤP?
      Thẻ  → đơn vị bán hàng thường chịu (chargeback)
      Ví   → tuỳ hợp đồng
      Chuyển khoản → gần như không ai chịu, tiền mất là mất

   ② QUYẾT TOÁN KHI NÀO, THEO SỐ GỘP HAY SỐ RÒNG?
      Quyết định toàn bộ mô hình sổ sách và đối soát của bạn.

   ③ CƠ CHẾ GỬI LẠI CỦA HỌ LÀ GÌ?
      · Họ gửi lại mấy lần khi timeout?
      · Có dùng mã chống trùng không, tên trường là gì?
      · Gửi lại có giữ nguyên mã tham chiếu không?

      → CÂU HỎI ③ CHÍNH LÀ THỨ ĐÃ GÂY RA SỰ CỐ Ở ĐẦU BÀI.
        Không hỏi nó trước khi tích hợp là tự đặt bom hẹn giờ.
```

## Ba mã định danh và đừng nhầm chúng với nhau

Đây là nguồn nhầm lẫn số một khi debug sự cố thanh toán.

| Mã | Ai sinh ra | Dùng để làm gì | Có duy nhất không |
|---|---|---|---|
| **Mã đơn hàng** | Hệ thống của bạn | Định danh **đơn hàng** | Duy nhất trong hệ thống bạn |
| **Mã giao dịch PSP** | Cổng thanh toán | Định danh **một lần thử thanh toán** | Một đơn có thể có **nhiều** mã này |
| **Mã cấp phép** (*auth code*) | Ngân hàng phát hành | Chứng minh **đã được duyệt** | Chỉ có khi cấp phép thành công |

```text
   QUAN HỆ THẬT SỰ GIỮA CHÚNG:

   Đơn hàng DH-1024
     ├── lần thử 1: PSP-aaa  → thất bại (sai OTP), không có auth code
     ├── lần thử 2: PSP-bbb  → timeout, KHÔNG BIẾT thành hay bại
     └── lần thử 3: PSP-ccc  → thành công, auth code = 483920

   ⚠ LẦN THỬ 2 LÀ NGUỒN GỐC CỦA MỌI SỰ CỐ TRỪ TIỀN HAI LẦN.

   Timeout KHÔNG có nghĩa là thất bại. Nó có nghĩa là BẠN KHÔNG BIẾT.
   Nếu lúc đó bạn cho khách thử lại mà không kiểm tra trạng thái lần 2,
   khách có thể bị trừ tiền cả hai lần.

   → Luật: gặp timeout thì phải TRUY VẤN TRẠNG THÁI, không được đoán.
```

## Sự cố đầu bài — chẩn đoán đúng cách

Quay lại sự cố mở đầu, đây là cách xử lý đúng:

```text
   BƯỚC 1 — HỎI ĐÚNG BÊN
      Không hỏi "hệ thống mình có lỗi không" (chỉ thấy 1 giao dịch).
      Hỏi PSP: "đơn DH-1024 có mấy mã giao dịch, mã nào có auth code?"

   BƯỚC 2 — ĐỐI CHIẾU THEO MÃ CẤP PHÉP, KHÔNG THEO SỐ TIỀN
      Hai giao dịch cùng số tiền, cùng thời điểm gần nhau
      → dễ tưởng là một. Chỉ auth code mới phân biệt được.

   BƯỚC 3 — XÁC ĐỊNH BẢN CHẤT
      Hai auth code khác nhau → ngân hàng ĐÃ giữ tiền hai lần
      Một auth code, hai bản ghi → lỗi ghi sổ phía bạn

   BƯỚC 4 — XỬ LÝ THEO BẢN CHẤT
      Hai auth code → yêu cầu PSP huỷ (void) khoản chưa quyết toán,
                       hoặc hoàn tiền nếu đã quyết toán
      Một auth code → sửa sổ bằng bút toán đảo, không đụng tới tiền

   ⚠ ĐỪNG BAO GIỜ HOÀN TIỀN KHI CHƯA XÁC ĐỊNH ĐƯỢC BẢN CHẤT.
     Hoàn nhầm một khoản chưa từng bị trừ = bạn vừa cho không khách hàng.
```

**Chặn tái diễn:**

```text
   ① LƯU MỌI MÃ GIAO DỊCH CỦA MỌI LẦN THỬ, kể cả lần thất bại.
      Nhiều hệ thống chỉ lưu lần thành công — và mất khả năng điều tra.

   ② GẶP TIMEOUT PHẢI TRUY VẤN TRẠNG THÁI, có lịch thử lại rõ ràng.

   ③ GỬI MÃ CHỐNG TRÙNG cho mọi lệnh tạo giao dịch.

   ④ CÓ MỘT MÀN HÌNH TRA CỨU nội bộ: nhập mã đơn → hiện đủ mọi lần thử,
      mã PSP, auth code, trạng thái, thời điểm.
      → Không có màn hình này, mỗi sự cố tốn bốn ngày như ở đầu bài.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Không biết có PSP đứng giữa | Đổ lỗi qua lại nhiều ngày, không ai tìm ra nguyên nhân | Vẽ bản đồ các bên **trước** khi tích hợp |
| Coi timeout là thất bại | Khách bị trừ tiền hai lần | Timeout = **không biết** → phải truy vấn trạng thái |
| Chỉ lưu lần thử thành công | Mất khả năng điều tra khi có sự cố | Lưu **mọi** lần thử kèm mã và thời điểm |
| Nhầm mã đơn với mã giao dịch | Một đơn nhiều lần thử → tra cứu ra kết quả sai | Ba mã, ba mục đích, lưu riêng |
| Đối soát bằng số ròng | Ngày nào cũng lệch đúng bằng phí | Ghi phí thành bút toán riêng, đối soát trên số **gộp** |
| Không hỏi cơ chế gửi lại của đối tác | Đối tác tự gửi lại → trùng giao dịch | Hỏi rõ số lần, mã chống trùng, tên trường |
| Tưởng chuyển khoản cũng thu hồi được như thẻ | Hứa với khách điều không làm được | Chuyển khoản thành công là **không thu hồi được** |
| Hoàn tiền trước khi xác định bản chất | Cho không khách hàng một khoản tiền | Xác định qua **auth code** rồi mới xử lý |
| Không có màn hình tra cứu nội bộ | Mỗi sự cố tốn nhiều ngày | Dựng sớm, đây là công cụ vận hành bắt buộc |

## Tóm tắt bài 1

- Một giao dịch thẻ đi qua **sáu bên**: người mua, đơn vị bán hàng, cổng thanh toán, ngân hàng thu hộ, tổ chức thẻ, ngân hàng phát hành.
- **Tiền đi ngược chiều với yêu cầu.**
- Tổ chức thẻ tồn tại để biến **phép nhân thành phép cộng** (50 × 200.000 → 50 + 200.000); cổng thanh toán tồn tại để đơn vị bán hàng **không phải chạm vào dữ liệu thẻ**.
- **PSP là bên duy nhất giữ nhật ký đầy đủ mọi lần gửi và gửi lại** — khi nghi trùng giao dịch, hỏi họ trước.
- Số tiền về tài khoản **không bằng** số khách trả; chênh lệch là **MDR**. Ghi phí thành bút toán riêng, đối soát trên số **gộp**.
- Chuyển khoản qua NAPAS ngắn hơn, rẻ hơn, nhanh hơn — nhưng **thành công là không thu hồi được**, khác hẳn thẻ.
- Ba mã khác nhau: **mã đơn hàng**, **mã giao dịch PSP** (một đơn có nhiều), **mã cấp phép** (chỉ có khi duyệt thành công).
- **Timeout không phải thất bại — nó là "không biết".** Phải truy vấn trạng thái, tuyệt đối không đoán.
- Ba câu hỏi bắt buộc trước khi tích hợp: ai chịu rủi ro tranh chấp, quyết toán gộp hay ròng, cơ chế gửi lại thế nào.

**Bài kế tiếp** → [Bài 2: Chuyển khoản liên ngân hàng — NAPAS, Citad và SWIFT](02-chuyen-khoan-lien-ngan-hang.md)

**Quay lại** → [Phase 1, Bài 7: Tiền tệ và làm tròn](../phase-1-tien-va-so-cai/07-tien-te-va-lam-tron.md) · **Tra thuật ngữ** → [Từ điển](../00-thuat-ngu.md)
