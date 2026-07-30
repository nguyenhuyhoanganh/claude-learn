# Bài 2: Hạch toán kép — nguyên lý 500 năm không đổi

## Sự cố mở đầu

Đây là sự cố đã nhắc ở phần giới thiệu, giờ ta mổ xẻ nó.

Một ví điện tử lưu tiền theo cách "tự nhiên nhất":

```
wallets
├── user_id
└── balance
```

Chuyển tiền = trừ ví người gửi, cộng ví người nhận. Nạp tiền = cộng ví. Rút tiền = trừ ví. Thu phí = trừ ví.

Sau ba tháng:

```text
   Tổng số dư mọi ví khách hàng        : 8.200.000.000 đ
   Số dư tài khoản đảm bảo tại ngân hàng: 7.860.000.000 đ
   ────────────────────────────────────────────────────
   LỆCH                                :   340.000.000 đ
```

Câu hỏi: **340 triệu này là do đâu?**

- Do một lỗi cộng nhầm? Bao nhiêu giao dịch?
- Do phí thu chưa chuyển về công ty?
- Do hoàn tiền hai lần?
- Do có người rút tiền mà không trừ ví?

**Không ai biết.** Vì hệ thống chỉ ghi "ví ai tăng bao nhiêu", không ghi **"tiền đó từ đâu ra"**.

Hạch toán kép sinh ra để giải quyết đúng vấn đề này. Nó được nhà toán học Luca Pacioli mô tả năm 1494, và đến nay **mọi ngân hàng trên thế giới vẫn dùng**.

## Nguyên lý cốt lõi

> **Tiền không tự sinh ra, không tự mất đi. Nó chỉ chuyển từ chỗ này sang chỗ khác.**
> Vì vậy, mọi biến động tiền phải được ghi **ít nhất hai lần**: một lần cho nơi tiền đi khỏi, một lần cho nơi tiền đi tới.

```text
   HẠCH TOÁN ĐƠN (single-entry) — cách sai
   "Ví của A giảm 200.000"
   → Tiền đi đâu? Không ai biết.

   HẠCH TOÁN KÉP (double-entry) — cách đúng
   "Ví của A giảm 200.000"  VÀ  "Ví của B tăng 200.000"
   → Rõ ràng. Và tổng thay đổi = 0.
```

**Quy tắc vàng: tổng của mọi dòng trong một giao dịch phải bằng 0.**

Nếu tổng khác 0, nghĩa là tiền vừa được tạo ra từ hư không hoặc vừa bốc hơi — cả hai đều là lỗi. Đây là một **ràng buộc kiểm tra được tự động**, và đó là sức mạnh lớn nhất của hạch toán kép.

## Nợ và Có — hai từ gây hiểu lầm nhất

Kế toán dùng hai từ: **Debit (Nợ)** và **Credit (Có)**.

Đây là chỗ 90% lập trình viên bị rối, vì:

```text
   ĐỪNG hiểu theo nghĩa thông thường!

   ✗ "Debit = trừ tiền, Credit = cộng tiền"        → SAI
   ✗ "Nợ = mình đang nợ ai đó"                     → SAI
   ✗ "Credit card = thẻ tín dụng nên credit = vay" → SAI
```

**Debit và Credit chỉ đơn thuần là "bên trái" và "bên phải" của một bút toán.** Không hơn.

```text
   Một bút toán luôn có hai bên, và hai bên phải bằng nhau:

   ┌──────────────────┬──────────────────┐
   │   NỢ (Debit)     │   CÓ (Credit)    │
   │   bên trái       │   bên phải       │
   ├──────────────────┼──────────────────┤
   │   200.000        │   200.000        │
   └──────────────────┴──────────────────┘
              Tổng Nợ = Tổng Có
```

Việc "Nợ làm tăng hay giảm" **phụ thuộc vào loại tài khoản**. Đó là điều tiếp theo cần hiểu.

## Năm loại tài khoản

Mọi tài khoản trong kế toán thuộc một trong năm loại:

| Loại | Tiếng Anh | Nghĩa dễ hiểu | Ví dụ trong fintech |
|---|---|---|---|
| **Tài sản** | Asset | Thứ công ty **sở hữu** | Tiền trong tài khoản ngân hàng, khoản cho vay |
| **Nợ phải trả** | Liability | Thứ công ty **nợ người khác** | **Số dư ví của khách hàng** |
| **Vốn chủ sở hữu** | Equity | Phần thuộc về chủ công ty | Vốn góp, lợi nhuận giữ lại |
| **Doanh thu** | Revenue | Tiền công ty **kiếm được** | Phí giao dịch, lãi cho vay |
| **Chi phí** | Expense | Tiền công ty **tiêu ra** | Phí trả cho ngân hàng, lương |

Điều quan trọng nhất và phản trực giác nhất với người mới:

> **Số dư ví của khách hàng là "Nợ phải trả" (Liability) của công ty, không phải "Tài sản".**

Vì sao? Vì tiền đó **không phải của công ty** — công ty đang giữ hộ và **nợ** khách hàng khoản đó. Bất cứ lúc nào khách hàng cũng có quyền rút ra.

```text
   Khách nạp 1.000.000 vào ví:

   Công ty NHẬN được 1.000.000 tiền mặt      → TÀI SẢN tăng
   Công ty NỢ khách hàng 1.000.000            → NỢ PHẢI TRẢ tăng

   Hai vế cân bằng. Công ty không giàu thêm đồng nào.
```

## Phương trình kế toán

Toàn bộ hạch toán kép đứng trên một phương trình:

```text
        TÀI SẢN  =  NỢ PHẢI TRẢ  +  VỐN CHỦ SỞ HỮU

     (thứ mình có) = (thứ mình nợ) + (thứ thực sự là của mình)
```

Mọi bút toán đúng đều giữ phương trình này cân bằng. Nếu nó lệch, có lỗi ở đâu đó.

Mở rộng đầy đủ (doanh thu và chi phí cuối cùng chảy vào vốn chủ sở hữu):

```text
   TÀI SẢN = NỢ PHẢI TRẢ + VỐN + (DOANH THU − CHI PHÍ)
```

## Bảng quy tắc Nợ/Có — bảng cần thuộc lòng

Đây là bảng duy nhất bạn cần nhớ trong cả bài:

```text
   ┌───────────────┬─────────────┬─────────────┐
   │  Loại tài khoản│  Nợ (Debit) │  Có (Credit)│
   ├───────────────┼─────────────┼─────────────┤
   │  Tài sản       │    TĂNG ↑   │    GIẢM ↓   │
   │  Chi phí       │    TĂNG ↑   │    GIẢM ↓   │
   ├───────────────┼─────────────┼─────────────┤
   │  Nợ phải trả   │    GIẢM ↓   │    TĂNG ↑   │
   │  Vốn chủ SH    │    GIẢM ↓   │    TĂNG ↑   │
   │  Doanh thu     │    GIẢM ↓   │    TĂNG ↑   │
   └───────────────┴─────────────┴─────────────┘
```

Mẹo nhớ: **Tài sản và Chi phí đi cùng nhau** (Nợ làm tăng). Ba loại còn lại đi cùng nhau (Có làm tăng).

Cách nhớ khác, trực quan hơn cho người làm hệ thống:

```text
   Hình dung phương trình:   TÀI SẢN = NỢ PHẢI TRẢ + VỐN
                             ────────   ─────────────────
                             bên TRÁI      bên PHẢI

   Tài khoản nằm bên TRÁI phương trình → NỢ làm tăng
   Tài khoản nằm bên PHẢI phương trình → CÓ làm tăng
```

## Đọc bút toán qua ví dụ thật

### Ví dụ 1: Khách nạp 1.000.000đ vào ví qua chuyển khoản ngân hàng

```text
   ┌────────────────────────────────────────┬───────────┬───────────┐
   │ Tài khoản                              │  Nợ       │  Có       │
   ├────────────────────────────────────────┼───────────┼───────────┤
   │ Tiền gửi ngân hàng (Tài sản)           │ 1.000.000 │           │
   │ Ví khách hàng - Nguyễn Văn A (Nợ p/trả)│           │ 1.000.000 │
   └────────────────────────────────────────┴───────────┴───────────┘
                                    Tổng:     1.000.000 = 1.000.000  ✓
```

Đọc bằng lời: *"Tài sản của công ty (tiền trong ngân hàng) tăng 1 triệu, đồng thời khoản công ty nợ anh A cũng tăng 1 triệu."*

### Ví dụ 2: A chuyển 200.000đ cho B (cùng trong ví)

```text
   ┌────────────────────────────────────────┬───────────┬───────────┐
   │ Tài khoản                              │  Nợ       │  Có       │
   ├────────────────────────────────────────┼───────────┼───────────┤
   │ Ví khách hàng - A (Nợ phải trả)        │   200.000 │           │
   │ Ví khách hàng - B (Nợ phải trả)        │           │   200.000 │
   └────────────────────────────────────────┴───────────┴───────────┘
```

Chú ý: **tiền thật trong tài khoản ngân hàng KHÔNG đổi**. Chỉ có việc "công ty nợ ai" thay đổi. Đây chính là lý do ví điện tử xử lý chuyển tiền nội bộ được ngay lập tức, còn chuyển ra ngân hàng khác thì mất thời gian.

### Ví dụ 3: Thu phí 2.000đ khi A chuyển tiền

```text
   ┌────────────────────────────────────────┬───────────┬───────────┐
   │ Ví khách hàng - A (Nợ phải trả)        │     2.000 │           │
   │ Doanh thu phí giao dịch (Doanh thu)    │           │     2.000 │
   └────────────────────────────────────────┴───────────┴───────────┘
```

Bây giờ công ty **thực sự giàu thêm 2.000đ** — vì khoản nợ với khách giảm mà tài sản không đổi.

### Ví dụ 4: Khách rút 500.000đ về ngân hàng, phí rút 5.000đ

Một giao dịch có thể có **nhiều hơn hai dòng**:

```text
   ┌────────────────────────────────────────┬───────────┬───────────┐
   │ Ví khách hàng - A (Nợ phải trả)        │   505.000 │           │
   │ Tiền gửi ngân hàng (Tài sản)           │           │   500.000 │
   │ Doanh thu phí rút tiền (Doanh thu)     │           │     5.000 │
   └────────────────────────────────────────┴───────────┴───────────┘
                                    Tổng:      505.000 = 505.000  ✓
```

Đọc: *"Trừ ví khách 505.000; trong đó 500.000 chuyển thật ra ngân hàng, 5.000 trở thành doanh thu của công ty."*

**Thuật ngữ**: bút toán có nhiều hơn 2 dòng gọi là **compound entry** (bút toán tổng hợp).

### Ví dụ 5: Hoàn tiền cho khách vì lỗi hệ thống

```text
   ┌────────────────────────────────────────┬───────────┬───────────┐
   │ Chi phí bồi thường khách hàng (Chi phí)│    50.000 │           │
   │ Ví khách hàng - A (Nợ phải trả)        │           │    50.000 │
   └────────────────────────────────────────┴───────────┴───────────┘
```

Chú ý điểm quan trọng: tiền không "từ hư không" mà ra — nó được ghi nhận là **chi phí của công ty**. Cuối tháng, kế toán nhìn vào tài khoản này biết ngay công ty đã bồi thường bao nhiêu vì lỗi hệ thống. Đó là một chỉ số quản trị có giá trị.

## Quay lại sự cố 340 triệu

Với hạch toán kép, sự cố ở đầu bài **không thể xảy ra**. Vì sao?

```text
   Nếu tổng ví khách (Nợ phải trả) = 8.200.000.000
   thì phải có 8.200.000.000 nằm ở đâu đó bên Tài sản.

   Chạy một câu kiểm tra:
   ┌─────────────────────────────────────────────────────┐
   │ TÀI SẢN                                             │
   │   Tiền gửi ngân hàng            7.860.000.000       │
   │   Phải thu từ đối tác thanh toán   340.000.000  ←── │
   │   ────────────────────────────────────────────      │
   │   Tổng tài sản                  8.200.000.000       │
   │                                                     │
   │ NỢ PHẢI TRẢ                                         │
   │   Ví khách hàng                 8.200.000.000       │
   └─────────────────────────────────────────────────────┘

   ⇒ Cân bằng! 340 triệu KHÔNG mất — nó đang nằm ở
     "phải thu từ đối tác thanh toán" (tiền đối tác chưa chuyển về).
```

Hạch toán kép biến câu hỏi *"tiền đi đâu mất rồi?"* thành *"tiền đang ở tài khoản nào?"* — một câu hỏi luôn có câu trả lời.

## Sổ cái và các thành phần

**Thuật ngữ cần nắm**:

| Thuật ngữ tiếng Anh | Tiếng Việt | Nghĩa |
|---|---|---|
| **Ledger** | Sổ cái | Toàn bộ tập hợp các bút toán |
| **Account** | Tài khoản (kế toán) | Một "ngăn" trong sổ cái để nhóm các biến động cùng loại |
| **Journal entry / Transaction** | Bút toán / Giao dịch kế toán | Một sự kiện tài chính, gồm nhiều dòng |
| **Entry line / Posting** | Dòng bút toán | Một dòng Nợ hoặc Có trong bút toán |
| **Chart of accounts** | Hệ thống tài khoản | Danh mục toàn bộ tài khoản của tổ chức |
| **Posting** | Ghi sổ | Hành động ghi bút toán vào sổ cái |
| **Trial balance** | Bảng cân đối thử | Bảng liệt kê số dư mọi tài khoản để kiểm tra tổng Nợ = tổng Có |

Cấu trúc phân cấp:

```text
   SỔ CÁI (Ledger)
   └── GIAO DỊCH #10234  "A chuyển 200.000 cho B, phí 2.000"
       ├── Dòng 1: Nợ  Ví A                 202.000
       ├── Dòng 2: Có  Ví B                 200.000
       └── Dòng 3: Có  Doanh thu phí          2.000
                       ─────────────────────────────
                       Tổng Nợ 202.000 = Tổng Có 202.000  ✓
```

## Ba ràng buộc bất di bất dịch

Đây là ba quy tắc mà hệ thống phải **cưỡng chế**, không phải khuyến nghị:

```text
   1. CÂN BẰNG
      Trong mỗi giao dịch: tổng Nợ = tổng Có.
      Không cân bằng → từ chối ghi sổ, không có ngoại lệ.

   2. BẤT BIẾN
      Bút toán đã ghi không bao giờ sửa/xoá.
      Sai thì ghi bút toán đảo (reversal) rồi ghi lại cho đúng.

   3. NGUYÊN TỬ
      Mọi dòng của một giao dịch được ghi cùng nhau hoặc không dòng nào được ghi.
      Ghi được nửa giao dịch = sổ cái mất cân bằng vĩnh viễn.
```

Ràng buộc thứ 3 có ý nghĩa kỹ thuật trực tiếp: **mọi dòng của một bút toán phải nằm trong cùng một transaction database**. Không được ghi dòng Nợ ở một transaction rồi dòng Có ở transaction khác.

Và hệ quả quan trọng: **sổ cái nên nằm trong một database duy nhất**. Nếu ví khách ở database A còn tài khoản doanh thu ở database B, bạn không còn tính nguyên tử — và không có cách nào đảm bảo cân bằng. Đây là một trong số ít trường hợp mà "chia nhỏ microservice" là quyết định sai.

## Bút toán đảo — cách sửa sai duy nhất

```text
   Bút toán gốc #10234 (SAI: trừ nhầm 200.000 của A)
   ├── Nợ  Ví A          200.000
   └── Có  Ví B          200.000

   Bút toán đảo #10891 (đảo ngược hoàn toàn, tham chiếu #10234)
   ├── Nợ  Ví B          200.000      ← đảo chiều
   └── Có  Ví A          200.000

   Kết quả cuối: số dư về đúng, VÀ lịch sử ghi lại đầy đủ
   cả việc đã sai lẫn việc đã sửa.
```

**Nguyên tắc**: bút toán đảo phải **tham chiếu tới bút toán gốc**, và phải ghi rõ **lý do** và **ai duyệt**. Không có ba thông tin này thì việc sửa sai không kiểm toán được.

## Hạch toán kép trong hệ thống hiện đại

Mô hình dữ liệu tối thiểu (phase-6 bài 1 sẽ đi sâu):

```text
   BẢNG accounts (danh mục tài khoản)
   ├── id
   ├── code            "1112" — mã tài khoản
   ├── name            "Tiền gửi ngân hàng VCB"
   ├── type            ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE
   ├── currency        "VND"
   └── owner_id        (nếu là ví của một khách hàng cụ thể)

   BẢNG journal_entries (giao dịch kế toán — phần đầu)
   ├── id
   ├── occurred_at     thời điểm sự kiện xảy ra
   ├── description     "A chuyển tiền cho B"
   ├── reference       mã tham chiếu tới nghiệp vụ gốc
   └── reversal_of     (nếu đây là bút toán đảo, trỏ tới bút toán gốc)

   BẢNG entry_lines (các dòng — phần chi tiết)
   ├── id
   ├── entry_id        thuộc bút toán nào
   ├── account_id      tài khoản nào
   ├── direction       DEBIT | CREDIT
   └── amount          số tiền (số nguyên, đơn vị nhỏ nhất)
```

Một biến thể phổ biến trong fintech hiện đại: thay vì hai cột `direction` + `amount`, dùng **một cột `amount` có dấu** (Nợ dương, Có âm). Khi đó ràng buộc cân bằng trở thành cực kỳ gọn:

```text
   Tổng amount của mọi dòng trong một bút toán = 0
```

Cách này dễ kiểm tra bằng máy hơn, nhưng khó đọc hơn với kế toán viên. Nhiều hệ thống lưu theo cách có dấu ở tầng dữ liệu và hiển thị theo Nợ/Có ở tầng giao diện — được cả hai.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Hiểu "Debit = trừ, Credit = cộng" | Ghi sai chiều toàn bộ hệ thống |
| Coi ví khách hàng là Tài sản của công ty | Báo cáo tài chính sai, hiểu sai bản chất pháp lý |
| Ghi bút toán không cân bằng "cho nhanh" | Sổ cái mất cân bằng vĩnh viễn, không sửa được về sau |
| Ghi các dòng của một bút toán ở nhiều transaction | Nửa bút toán khi có lỗi giữa chừng |
| Chia sổ cái ra nhiều database/service | Mất tính nguyên tử, không đảm bảo cân bằng |
| Sửa bút toán cũ khi phát hiện sai | Mất bằng chứng, không qua kiểm toán |
| Bút toán đảo không tham chiếu bút toán gốc | Không lần được quan hệ, đối soát rối |
| Không có tài khoản riêng cho phí/bồi thường | Không biết công ty lời lỗ ở đâu |
| Quên rằng tiền có thể "đang trên đường" | Tưởng mất tiền trong khi nó nằm ở tài khoản trung gian (bài 5) |

## Tóm tắt bài 2

- **Hạch toán kép**: mọi biến động tiền được ghi ít nhất hai lần — nơi tiền đi và nơi tiền đến.
- **Quy tắc vàng: tổng Nợ = tổng Có trong mỗi giao dịch.** Đây là ràng buộc máy kiểm tra được tự động.
- **Nợ (Debit) và Có (Credit) chỉ là "trái" và "phải"** — không phải "trừ" và "cộng".
- Năm loại tài khoản: **Tài sản, Nợ phải trả, Vốn, Doanh thu, Chi phí**. Nợ làm tăng Tài sản và Chi phí; Có làm tăng ba loại còn lại.
- **Số dư ví khách hàng là NỢ PHẢI TRẢ của công ty**, không phải tài sản.
- Ba ràng buộc bắt buộc: **cân bằng, bất biến, nguyên tử**. Mọi dòng của một bút toán phải nằm trong **cùng một database transaction**.
- Sửa sai bằng **bút toán đảo** có tham chiếu, lý do và người duyệt.
- Hạch toán kép biến câu hỏi *"tiền mất đi đâu?"* thành *"tiền đang ở tài khoản nào?"*.

**Bài kế tiếp** → [Bài 3: Hệ thống tài khoản — thiết kế danh mục tài khoản cho fintech](03-he-thong-tai-khoan.md)
