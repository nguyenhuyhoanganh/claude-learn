# Bài 1: Tiền trong hệ thống là gì?

## Sự cố mở đầu

Một ví điện tử lưu số dư người dùng như thế này:

```
users
├── id
├── name
└── balance        ← 1.500.000
```

Người dùng nạp tiền, số `balance` tăng. Chuyển tiền, số này giảm. Đơn giản, dễ hiểu, chạy được.

Sáu tháng sau, ba câu hỏi xuất hiện cùng lúc và không ai trả lời được:

```text
   Kế toán hỏi : "Tổng số dư người dùng là 8,2 tỷ. Trong tài khoản ngân hàng
                  của công ty chỉ có 7,9 tỷ. 300 triệu đi đâu?"

   Khách hàng hỏi: "Tôi thấy trừ 500.000 lúc 14:32 nhưng không nhớ mua gì.
                    Cho tôi xem lại được không?"

   Thanh tra hỏi : "Chứng minh cho tôi thấy số dư của khách hàng X
                    tại thời điểm 30/6 là bao nhiêu."
```

Không câu nào trả lời được, vì hệ thống chỉ lưu **con số hiện tại**, không lưu **lý do nó thành như vậy**.

Bài này giải thích vì sao "số dư là một con số" là mô hình sai, và tiền thực sự được biểu diễn thế nào.

## Số dư không phải dữ liệu — nó là kết quả tính toán

Đây là thay đổi tư duy quan trọng nhất của cả khoá học:

```text
   MÔ HÌNH SAI (số dư là dữ liệu gốc)
   ┌──────────────────────┐
   │ balance = 1.500.000  │  ← lưu trực tiếp, ghi đè mỗi lần thay đổi
   └──────────────────────┘
   Sửa số này là xong. Không ai biết vì sao nó là 1.500.000.

   MÔ HÌNH ĐÚNG (số dư là kết quả)
   ┌────────────────────────────────────────────────────┐
   │ Lịch sử các biến động (không bao giờ sửa, chỉ thêm)│
   │  +2.000.000  nạp tiền từ ngân hàng                 │
   │    -300.000  thanh toán hoá đơn điện               │
   │    -200.000  chuyển cho Nguyễn Văn A               │
   │ ──────────────────────────────────────             │
   │  = 1.500.000  ← TÍNH RA, không lưu sẵn             │
   └────────────────────────────────────────────────────┘
```

**Nguyên tắc: dữ liệu gốc là chuỗi biến động, số dư chỉ là tổng của chúng.**

Ba câu hỏi ở đầu bài lập tức trả lời được:
- Tiền đi đâu? → cộng tất cả biến động, so với ngân hàng.
- Trừ 500.000 lúc 14:32 vì gì? → tra bản ghi biến động đó.
- Số dư ngày 30/6? → cộng mọi biến động tới 23:59:59 ngày 30/6.

**Thuật ngữ**: bản ghi biến động này gọi là **ledger entry** (bút toán) hoặc **transaction line** (dòng giao dịch). Toàn bộ tập hợp gọi là **ledger** (sổ cái).

> Số dư *có thể* được lưu sẵn để đọc nhanh — nhưng lúc đó nó là **bản tính sẵn (cached/derived)**, và phải luôn kiểm chứng được bằng cách cộng lại từ sổ cái. Bài 3 và phase-6 bài 1 sẽ nói kỹ.

## Bất biến (immutable) — quy tắc không được phá

**Immutable — bất biến**: một khi đã ghi, bản ghi **không bao giờ được sửa hoặc xoá**.

```text
   SAI: khách hàng khiếu nại → sửa lại số tiền trong bản ghi cũ
   ĐÚNG: giữ nguyên bản ghi cũ → ghi thêm một bút toán ĐIỀU CHỈNH
```

Ví dụ: hệ thống trừ nhầm 500.000 của khách.

```text
   Bút toán #1001  -500.000  Thanh toán hoá đơn      [giữ nguyên]
   Bút toán #1047  +500.000  Điều chỉnh: hoàn tiền do lỗi hệ thống,
                             tham chiếu #1001, duyệt bởi NV0234
```

Vì sao phải làm vậy thay vì sửa cho gọn?

| Lý do | Giải thích |
|---|---|
| **Kiểm toán** | Thanh tra cần thấy *cả lỗi lẫn cách sửa lỗi*, không phải một lịch sử đã được dọn dẹp |
| **Tranh chấp** | Nếu khách kiện, bạn cần chứng minh chuyện gì đã thực sự xảy ra |
| **Phát hiện gian lận** | Nhân viên sửa được bản ghi thì cũng sửa được để lấy tiền |
| **Khôi phục** | Sổ cái bất biến cho phép dựng lại trạng thái tại **bất kỳ** thời điểm nào |
| **Đối soát** | So sánh với đối tác cần dữ liệu không đổi qua thời gian |

**Thuật ngữ**: bút toán sửa sai gọi là **adjusting entry** (bút toán điều chỉnh). Bút toán đảo ngược hoàn toàn một bút toán trước đó gọi là **reversal entry** (bút toán đảo).

Quy tắc thực tế trong ngành: **bảng ledger chỉ có `INSERT`, không bao giờ có `UPDATE` hay `DELETE`**. Nhiều ngân hàng còn cấu hình quyền database để chặn cứng hai lệnh đó.

## Đơn vị nhỏ nhất — vì sao không dùng số thực

Câu hỏi tưởng chừng vặt vãnh nhưng gây ra sự cố thật:

```text
   Lưu 0,1 + 0,2 bằng kiểu số thực (float/double):
   0.1 + 0.2 = 0.30000000000000004

   Lặp lại phép này hàng triệu lần trong hệ thống thanh toán
   → sai lệch tích luỹ → lệch sổ.
```

Nguyên nhân: máy tính lưu số thực theo hệ nhị phân, và **0,1 không biểu diễn chính xác được trong hệ nhị phân** (giống như 1/3 không biểu diễn hết trong hệ thập phân).

Hai cách đúng:

**Cách 1 — Lưu bằng số nguyên, theo đơn vị nhỏ nhất (minor unit)**

```text
   USD:  lưu bằng cent      →  $12,34  lưu là  1234
   EUR:  lưu bằng cent      →  €99,99  lưu là  9999
   JPY:  không có đơn vị lẻ →  ¥500    lưu là  500
   VND:  không có đơn vị lẻ →  50.000đ lưu là  50000
```

**Thuật ngữ**: **minor unit** (đơn vị phụ) là đơn vị nhỏ nhất của một loại tiền. Chuẩn **ISO 4217** quy định mỗi loại tiền có bao nhiêu chữ số thập phân (`exponent`):

| Mã ISO | Tiền tệ | Số chữ số thập phân | Ví dụ lưu trữ |
|---|---|---|---|
| `USD` | Đô la Mỹ | 2 | `$12,34` → `1234` |
| `EUR` | Euro | 2 | `€99,99` → `9999` |
| `VND` | Đồng Việt Nam | **0** | `50.000đ` → `50000` |
| `JPY` | Yên Nhật | 0 | `¥500` → `500` |
| `KWD` | Dinar Kuwait | **3** | `12,345 KWD` → `12345` |
| `BHD` | Dinar Bahrain | 3 | |

> **Đặc thù Việt Nam**: VND có **0 chữ số thập phân** theo ISO 4217 — không có "xu". Điều này làm việc lưu trữ đơn giản hơn, nhưng **không** có nghĩa là không bao giờ gặp số lẻ: khi tính lãi, chia phí, hoặc quy đổi ngoại tệ, kết quả trung gian vẫn ra số lẻ và phải có quy tắc làm tròn rõ ràng (bài 7).

**Cách 2 — Dùng kiểu decimal chính xác**

Khi ngôn ngữ/database hỗ trợ, dùng kiểu thập phân chính xác thay vì số thực:

```text
   PostgreSQL / MySQL :  NUMERIC(19, 4)  hoặc  DECIMAL(19, 4)
   Java               :  BigDecimal
   C# / .NET          :  decimal
   Python             :  decimal.Decimal
   JavaScript         :  KHÔNG có sẵn — phải dùng thư viện, hoặc BigInt
```

Con số `(19, 4)` nghĩa là: tổng 19 chữ số, trong đó 4 chữ số sau dấu phẩy. Đủ để lưu tới hàng nghìn tỷ với 4 chữ số lẻ.

> **Vì sao 4 chữ số lẻ chứ không phải 2?** Vì các phép tính trung gian (lãi suất, tỷ giá, phí theo phần trăm) cần độ chính xác cao hơn giá trị cuối. Bạn tính ở 4 chữ số rồi mới làm tròn về đơn vị hiển thị.

**Bảng so sánh**:

| Cách lưu | Ưu | Nhược |
|---|---|---|
| Số nguyên theo minor unit | Nhanh, không bao giờ sai số, dễ so sánh | Phải nhớ nhân/chia khi hiển thị; khó khi cần chữ số lẻ trung gian |
| `DECIMAL`/`BigDecimal` | Rõ ràng, tính toán trực tiếp được, đủ chỗ cho số lẻ | Chậm hơn số nguyên, tốn bộ nhớ hơn |
| **`FLOAT`/`DOUBLE`** | **Không dùng cho tiền. Bao giờ cũng vậy.** | Sai số tích luỹ |

Hầu hết hệ thống hiện đại dùng **số nguyên minor unit** cho việc lưu trữ và truyền qua API, và `DECIMAL` cho các phép tính trung gian phức tạp.

## Tiền luôn đi kèm loại tiền tệ

Một con số trần trụi không phải là tiền:

```text
   SAI:   amount = 100
          → 100 gì? Đồng? Đô? Yên?

   ĐÚNG:  amount = 100, currency = "USD"
```

**Thuật ngữ**: cặp `(số tiền, loại tiền tệ)` gọi là **Money** hoặc **Monetary amount**. Trong lập trình, đây nên là một **kiểu dữ liệu riêng**, không phải hai biến rời rạc — để trình biên dịch chặn được lỗi cộng USD với VND.

Quy tắc bất di bất dịch:

```text
   ✓ 100 USD + 50 USD  = 150 USD          (cùng loại tiền → cộng được)
   ✗ 100 USD + 50 VND  = ???              (khác loại tiền → KHÔNG cộng được)
   ✓ 100 USD → quy đổi theo tỷ giá → 2.540.000 VND   (phải QUY ĐỔI trước)
```

Và khi quy đổi, phải lưu lại **tỷ giá đã dùng và thời điểm** — vì tỷ giá thay đổi từng phút, và sau này khi đối soát bạn cần biết con số đó đến từ đâu.

## Số dư có thể âm không?

Tuỳ **loại tài khoản** — và đây là chỗ nhiều người mới nhầm.

| Loại tài khoản | Tiếng Anh | Âm được không | Ví dụ |
|---|---|---|---|
| Tài khoản thanh toán thường | Current/Checking account | Không (trừ khi có thấu chi) | Ví điện tử, tài khoản không kỳ hạn |
| Tài khoản có thấu chi | Overdraft account | **Có**, tới hạn mức cho phép | Tài khoản doanh nghiệp |
| Thẻ tín dụng | Credit card | **Có** (số âm = dư nợ) | Thẻ tín dụng |
| Tài khoản của chính công ty | Liability/Asset account | Tuỳ loại | Xem bài 3 |

**Thuật ngữ**: **overdraft** (thấu chi) là việc cho phép rút vượt số dư tới một hạn mức thoả thuận trước.

Điểm quan trọng về mặt hệ thống: **quy tắc "không được âm" phải được database đảm bảo, không chỉ code**.

```text
   Chỉ kiểm tra trong code:
   if (balance >= amount) { balance -= amount; }
   → Hai request đồng thời cùng thấy đủ tiền → cùng trừ → SỐ DƯ ÂM
     (đây là race condition kinh điển)

   Đảm bảo ở database:
   - Ràng buộc CHECK (balance >= 0), hoặc
   - Câu UPDATE có điều kiện: UPDATE ... WHERE balance >= :amount
   → Database từ chối ở tầng thấp nhất, không phụ thuộc code viết đúng hay sai
```

Phase-5 bài 4 dành trọn cho case "số dư âm".

## Ba con số khác nhau, đừng nhầm lẫn

Cùng một tài khoản, tại cùng một thời điểm, có **ba con số khác nhau** — và chúng thường không bằng nhau:

```text
   ┌────────────────────────────────────────────────────────────┐
   │  SỐ DƯ SỔ SÁCH (ledger balance / book balance)             │
   │  Tổng mọi bút toán ĐÃ GHI NHẬN vào sổ cái.                 │
   │  Ví dụ: 5.000.000                                          │
   ├────────────────────────────────────────────────────────────┤
   │  SỐ DƯ KHẢ DỤNG (available balance)                        │
   │  = Số dư sổ sách − tiền đang bị PHONG TOẢ                  │
   │  Ví dụ: 5.000.000 − 700.000 (đang giữ chỗ) = 4.300.000     │
   ├────────────────────────────────────────────────────────────┤
   │  SỐ DƯ ĐÃ QUYẾT TOÁN (settled balance)                     │
   │  Chỉ tính những giao dịch đã thực sự chuyển tiền xong      │
   │  giữa các ngân hàng. Ví dụ: 4.800.000                      │
   └────────────────────────────────────────────────────────────┘
```

Ví dụ đời thường: bạn quẹt thẻ mua xăng 700.000đ.

```text
   Ngay lúc quẹt   : ngân hàng GIỮ CHỖ 700.000 (chưa trừ thật)
                     → số dư khả dụng giảm 700.000
                     → số dư sổ sách CHƯA đổi
   1-3 ngày sau    : cây xăng gửi yêu cầu thu tiền thật
                     → số dư sổ sách mới giảm
   Cuối ngày T+1/2 : tiền thực sự chuyển giữa hai ngân hàng
                     → số dư đã quyết toán mới đổi
```

Đây là lý do bạn nhìn app ngân hàng thấy "số dư khả dụng" khác "số dư hiện tại". Bài 4 dành trọn cho chủ đề này.

**Hệ quả lên thiết kế**: khi ai đó nói "lấy số dư", câu hỏi đầu tiên phải là **"số dư nào?"**. Nhầm ba con số này là nguồn của rất nhiều lỗi nghiệp vụ.

## Tiền của ai đang nằm ở đâu

Một hiểu lầm phổ biến của người mới vào fintech: nghĩ rằng ví điện tử "giữ tiền" của người dùng.

Thực tế:

```text
   ┌──────────────────────────────────────────────────────────┐
   │  NGÂN HÀNG THẬT                                          │
   │  Tài khoản đảm bảo của Công ty Ví ABC: 8.200.000.000 đ   │
   │  (một tài khoản duy nhất, đứng tên công ty)              │
   └──────────────────────────────────────────────────────────┘
                              ▲
                              │ tiền THẬT nằm ở đây
                              │
   ┌──────────────────────────────────────────────────────────┐
   │  SỔ CÁI CỦA VÍ ABC (chỉ là ghi chép, không phải tiền)    │
   │  Nguyễn Văn A : 1.500.000                                │
   │  Trần Thị B   : 2.300.000                                │
   │  ... (tổng phải = 8.200.000.000)                         │
   └──────────────────────────────────────────────────────────┘
```

**Thuật ngữ**:
- **Escrow account / Trust account** — tài khoản đảm bảo: tài khoản ngân hàng mà công ty giữ tiền hộ khách hàng, tách biệt khỏi tiền hoạt động của công ty.
- **Omnibus account** — tài khoản gộp: một tài khoản ngân hàng duy nhất chứa tiền của nhiều khách hàng, việc phân bổ cho từng người được ghi nhận trong sổ cái nội bộ.
- **Segregation of funds** — tách bạch nguồn tiền: nguyên tắc tiền khách hàng phải tách khỏi tiền công ty, để nếu công ty phá sản thì tiền khách vẫn còn.

> **Đặc thù Việt Nam**: Ngân hàng Nhà nước yêu cầu các tổ chức cung ứng dịch vụ trung gian thanh toán (ví điện tử, cổng thanh toán) phải mở **tài khoản đảm bảo thanh toán** tại ngân hàng, và **số dư trên tài khoản này không được thấp hơn tổng số dư ví của toàn bộ khách hàng** tại mọi thời điểm. Đây không phải khuyến nghị — là bắt buộc, và bị thanh tra kiểm tra.

**Hệ quả lên thiết kế hệ thống**: bạn phải có khả năng chứng minh, tại bất kỳ thời điểm nào:

```text
   Tổng số dư mọi ví khách hàng  ≤  Số dư tài khoản đảm bảo tại ngân hàng
```

Việc kiểm tra này phải **tự động, hằng ngày**, và lệch một đồng cũng phải có cảnh báo. Đó chính là **đối soát** — bài 6.

## Bẫy thường gặp

| Bẫy | Vì sao nguy hiểm |
|---|---|
| Lưu số dư là một cột duy nhất, `UPDATE` mỗi lần | Không truy vết được, không kiểm toán được, không dựng lại lịch sử được |
| Dùng `FLOAT`/`DOUBLE` cho tiền | Sai số tích luỹ, lệch sổ |
| Sửa/xoá bản ghi giao dịch khi có lỗi | Mất bằng chứng, không qua được kiểm toán |
| Lưu số tiền mà không lưu loại tiền tệ | Không quy đổi được, dễ cộng nhầm |
| Quy đổi ngoại tệ mà không lưu tỷ giá đã dùng | Không đối soát được về sau |
| Chỉ kiểm tra "đủ tiền" bằng code | Race condition → số dư âm |
| Nhầm ba loại số dư với nhau | Cho tiêu tiền đang bị phong toả, hoặc chặn nhầm giao dịch hợp lệ |
| Nghĩ số dư trong app = tiền thật trong ngân hàng | Không phát hiện được khi hai bên lệch nhau |

## Tóm tắt bài 1

- **Số dư không phải dữ liệu gốc — nó là tổng của chuỗi bút toán.** Lưu chuỗi biến động, tính ra số dư.
- Bản ghi tài chính phải **bất biến**: chỉ `INSERT`, sửa sai bằng **bút toán điều chỉnh/đảo**, không bao giờ `UPDATE`/`DELETE`.
- **Không bao giờ dùng số thực cho tiền.** Dùng **số nguyên theo đơn vị nhỏ nhất** hoặc **`DECIMAL`/`BigDecimal`**.
- VND có **0 chữ số thập phân** theo ISO 4217, nhưng phép tính trung gian vẫn cần quy tắc làm tròn.
- Tiền = **(số tiền + loại tiền tệ)**. Khác loại tiền thì phải quy đổi, và **lưu lại tỷ giá đã dùng**.
- Có **ba loại số dư** khác nhau: sổ sách, khả dụng, đã quyết toán. Luôn hỏi "số dư nào?".
- Tiền thật nằm ở **tài khoản đảm bảo tại ngân hàng**; sổ cái của bạn chỉ là ghi chép phân bổ. Hai bên phải luôn khớp.

**Bài kế tiếp** → [Bài 2: Hạch toán kép — nguyên lý 500 năm không đổi](02-hach-toan-kep.md)
