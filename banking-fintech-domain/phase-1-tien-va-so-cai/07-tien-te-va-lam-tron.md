# Bài 7: Tiền tệ, làm tròn và những đồng lẻ biến mất

## Sự cố mở đầu

Một nền tảng gọi xe chia doanh thu mỗi chuyến: **tài xế 80%, nền tảng 20%**.

```text
   Chuyến xe 33.333đ:
   ├── Tài xế   : 33.333 × 0,80 = 26.666,4  → làm tròn xuống → 26.666
   └── Nền tảng : 33.333 × 0,20 =  6.666,6  → làm tròn xuống →  6.666
   ────────────────────────────────────────────────────────────────
   Tổng chia ra : 33.332
   Tiền thu vào : 33.333
   THIẾU        :      1 đ
```

Một đồng. Không ai để ý.

Với **2 triệu chuyến xe mỗi tháng**, khoản "một đồng" đó thành **2 triệu đồng mỗi tháng** không biết đi đâu — và quan trọng hơn: **sổ cái mất cân bằng 2 triệu lần mỗi tháng**.

Bốn tháng sau, kiểm toán không ký được báo cáo vì tổng Nợ ≠ tổng Có.

Bài này về những đồng lẻ — chủ đề nghe vặt vãnh nhưng gây ra sự cố thật ở mọi hệ thống tài chính.

## Vì sao làm tròn là bắt buộc

Tiền tệ có **đơn vị nhỏ nhất** (bài 1). Không tồn tại 0,4 đồng hay nửa xu. Nhưng phép tính tài chính thì liên tục sinh ra số lẻ:

```text
   ├── Chia tỉ lệ      : 33.333 × 20%
   ├── Tính lãi        : 10.000.000 × 7,5% / 365 × 17 ngày
   ├── Quy đổi ngoại tệ: 100 USD × 25.437,5
   ├── Tính thuế       : 1.234.567 × 10%
   └── Chia đều n phần : 1.000 / 3
```

Mỗi phép tính này cho ra số lẻ, và **phải được làm tròn về đơn vị nhỏ nhất** trước khi ghi sổ.

Vấn đề không phải *có làm tròn hay không* — mà là **làm tròn thế nào, và phần lẻ đi đâu**.

## Các kiểu làm tròn

| Kiểu | Tiếng Anh | Quy tắc | 2,5 → | −2,5 → | 3,5 → |
|---|---|---|---|---|---|
| Làm tròn nửa lên | HALF_UP | ≥0,5 thì lên | 3 | −3 | 4 |
| Làm tròn nửa xuống | HALF_DOWN | >0,5 mới lên | 2 | −2 | 3 |
| **Làm tròn nửa chẵn** | HALF_EVEN | 0,5 thì về số chẵn gần nhất | **2** | **−2** | **4** |
| Làm tròn lên | CEILING / UP | luôn lên | 3 | −2 | 4 |
| Làm tròn xuống | FLOOR / DOWN | luôn xuống | 2 | −3 | 3 |
| Cắt bỏ | TRUNCATE | bỏ phần lẻ | 2 | −2 | 3 |

### HALF_EVEN — kiểu được dùng trong tài chính

Còn gọi là **banker's rounding** (làm tròn kiểu ngân hàng). Vì sao nó được ưa chuộng?

```text
   Làm tròn HALF_UP cho 1.000 số kết thúc bằng ,5:
   → TẤT CẢ đều làm tròn LÊN
   → Sai lệch tích luỹ theo một chiều: +500 đơn vị

   Làm tròn HALF_EVEN cho cùng 1.000 số:
   → Một nửa lên, một nửa xuống (tuỳ số chẵn/lẻ)
   → Sai lệch tích luỹ ≈ 0
```

Với hàng triệu giao dịch, sự khác biệt này là thật. Đây là lý do chuẩn kế toán quốc tế và hầu hết thư viện tài chính mặc định dùng HALF_EVEN.

> Lưu ý: nhiều quy định thuế và một số hợp đồng lại **yêu cầu HALF_UP**. Đừng chọn theo sở thích — **kiểm tra quy định áp dụng cho nghiệp vụ cụ thể của bạn**, và ghi rõ trong tài liệu thiết kế.

### Trong các ngôn ngữ

```text
   Java       : RoundingMode.HALF_EVEN  (BigDecimal.setScale)
   C#/.NET    : MidpointRounding.ToEven (mặc định của Math.Round)
   Python     : decimal.ROUND_HALF_EVEN (mặc định của Decimal)
   PostgreSQL : round() dùng HALF_UP cho numeric — cần cẩn thận
   JavaScript : Math.round() dùng HALF_UP và có vấn đề số thực — tránh dùng cho tiền
```

Điểm cần nhớ: **mặc định của mỗi ngôn ngữ/database khác nhau**. Nếu hệ thống của bạn tính tiền ở nhiều tầng (Java tính, PostgreSQL tính lại để kiểm tra), hai bên có thể ra kết quả khác nhau. Phải thống nhất và **đặt tường minh**, không dựa vào mặc định.

## Nguyên tắc 1: Làm tròn ở cuối, không ở giữa

```text
   SAI — làm tròn từng bước:
   1.000.000 × 7,5% = 75.000
   75.000 / 365     = 205,479...  → làm tròn → 205
   205 × 17 ngày    = 3.485

   ĐÚNG — giữ độ chính xác cao, chỉ làm tròn kết quả cuối:
   1.000.000 × 7,5% / 365 × 17 = 3.493,15...  → làm tròn → 3.493

   Lệch: 8 đồng cho MỘT khoản vay.
   Với 500.000 khoản vay: lệch 4 triệu đồng.
```

**Quy tắc**: các phép tính trung gian giữ ở độ chính xác cao (thường 6-8 chữ số thập phân), chỉ làm tròn **một lần duy nhất** khi ghi vào sổ cái hoặc hiển thị cho người dùng.

Đây là lý do bài 1 khuyến nghị dùng `DECIMAL(19, 4)` hoặc cao hơn cho tính toán, dù VND không có số lẻ.

## Nguyên tắc 2: Phần lẻ phải đi đâu đó

Quay lại sự cố mở đầu. Có bốn cách xử lý, và cách nào cũng phải **được chọn có ý thức**.

### Cách A: Bên cuối cùng nhận phần dư (largest remainder)

```text
   Chuyến 33.333đ, chia 80/20:
   ├── Tài xế   : làm tròn xuống → 26.666
   └── Nền tảng : 33.333 − 26.666 = 6.667   ← tính bằng PHÉP TRỪ, không nhân

   Tổng: 26.666 + 6.667 = 33.333  ✓  CÂN BẰNG
```

**Đây là cách đơn giản và đúng nhất cho hầu hết trường hợp.** Nguyên tắc: tính n−1 phần bằng phép nhân, **phần cuối cùng tính bằng phép trừ** để đảm bảo tổng luôn khớp.

Ai nên nhận phần dư? Thường là bên có lợi ích lớn hơn hoặc bên vận hành nền tảng — nhưng phải nhất quán và ghi rõ trong quy tắc nghiệp vụ.

### Cách B: Tài khoản chênh lệch làm tròn

```text
   ├── Tài xế             : 26.666
   ├── Nền tảng           :  6.666
   └── Chênh lệch làm tròn:      1   ← ghi vào tài khoản riêng
   ─────────────────────────────────
   Tổng: 33.333  ✓
```

Ưu điểm: theo dõi được tổng ảnh hưởng của việc làm tròn. Nhược: thêm một dòng bút toán cho mọi giao dịch có số lẻ.

Dùng khi tỉ lệ chia phức tạp (nhiều bên) hoặc khi cần báo cáo riêng về tác động làm tròn.

### Cách C: Phân bổ phần dư theo vòng (round-robin)

```text
   Chia 1.000đ cho 3 người:
   ├── Lần chia 1: A=334, B=333, C=333   (A nhận dư)
   ├── Lần chia 2: A=333, B=334, C=333   (B nhận dư)
   └── Lần chia 3: A=333, B=333, C=334   (C nhận dư)
```

Công bằng về dài hạn. Dùng khi chia đều cho nhiều bên ngang hàng (chia hoa hồng, chia lợi nhuận).

### Cách D: Thiết kế lại để không có số lẻ

```text
   Thay vì: giá 33.333đ rồi chia
   Dùng   : giá luôn là bội số của 1.000đ (33.000đ)
```

Nghe đơn giản nhưng rất hiệu quả khi áp dụng được — đặc biệt với VND, nơi mà giá tiền lẻ đến từng đồng hiếm khi có ý nghĩa thực tế.

### Bảng chọn cách

| Tình huống | Cách nên dùng |
|---|---|
| Chia hai bên theo tỉ lệ cố định | **A** — bên cuối nhận phần dư (phép trừ) |
| Chia nhiều bên, cần công bằng dài hạn | **C** — round-robin |
| Tính lãi, tính phí phức tạp | **B** — tài khoản chênh lệch làm tròn |
| Đặt giá sản phẩm/dịch vụ | **D** — thiết kế tránh số lẻ |

## Quy đổi ngoại tệ

Đây là nơi làm tròn kết hợp với nhiều vấn đề khác.

### Vấn đề 1: Tỷ giá nào?

```text
   Tại một thời điểm, một cặp tiền có NHIỀU tỷ giá khác nhau:
   ├── Tỷ giá mua tiền mặt      : 25.100
   ├── Tỷ giá mua chuyển khoản  : 25.150
   ├── Tỷ giá bán               : 25.450
   ├── Tỷ giá trung tâm (NHNN)  : 24.850
   └── Tỷ giá liên ngân hàng    : 25.300
```

**Thuật ngữ**:
- **Bid rate** (tỷ giá mua): giá ngân hàng **mua vào** ngoại tệ từ bạn.
- **Ask rate** (tỷ giá bán): giá ngân hàng **bán ra** ngoại tệ cho bạn.
- **Spread**: chênh lệch giữa hai giá — đây là lợi nhuận của bên đổi tiền.
- **Mid rate** (tỷ giá trung bình): trung bình của bid và ask, dùng để tham chiếu, **không dùng để giao dịch thật**.

Quy tắc: **luôn ghi rõ dùng tỷ giá nào, từ nguồn nào, tại thời điểm nào**. Đây là ba thông tin bắt buộc lưu cùng mọi giao dịch quy đổi.

### Vấn đề 2: Quy đổi không có tính đối xứng

```text
   100 USD → VND: 100 × 25.150 = 2.515.000 VND
   2.515.000 VND → USD: 2.515.000 / 25.450 = 98,82 USD

   Đổi đi rồi đổi lại, mất 1,18 USD.
```

Đây **không phải lỗi** — đó là spread. Nhưng hệ thống phải xử lý đúng, và **không được giả định `A→B→A = A`**.

### Vấn đề 3: Làm tròn khi quy đổi

```text
   Quy đổi 3 khoản, mỗi khoản 33,33 USD, tỷ giá 25.150:

   Cách 1 — quy đổi từng khoản rồi cộng:
   33,33 × 25.150 = 838.249,5 → 838.250  (×3) = 2.514.750

   Cách 2 — cộng rồi quy đổi:
   (33,33 × 3) = 99,99 × 25.150 = 2.514.748,5 → 2.514.749

   Lệch 1 đồng.
```

**Quy tắc**: quy định rõ trong tài liệu nghiệp vụ là quy đổi ở mức nào (từng dòng hay tổng), và giữ nhất quán trên toàn hệ thống. Không có đáp án "đúng" tuyệt đối — chỉ có đáp án **nhất quán**.

### Ghi sổ giao dịch đa tiền tệ

Nguyên tắc quan trọng: **sổ cái phải cân bằng theo TỪNG loại tiền tệ**, không phải cân bằng sau khi quy đổi.

```text
   SAI — trộn hai loại tiền trong một bút toán rồi quy đổi:
   ┌──────────────────────────────┬───────────────┬───────────────┐
   │ Ví USD của khách             │    100 USD    │               │
   │ Ví VND của khách             │               │ 2.515.000 VND │
   └──────────────────────────────┴───────────────┴───────────────┘
   → Không kiểm tra được cân bằng bằng máy

   ĐÚNG — mỗi loại tiền cân bằng riêng, nối bằng tài khoản quy đổi:
   ┌──────────────────────────────┬───────────────┬───────────────┐
   │ Ví USD của khách             │    100 USD    │               │
   │ Tài khoản quy đổi (USD)      │               │    100 USD    │
   ├──────────────────────────────┼───────────────┼───────────────┤
   │ Tài khoản quy đổi (VND)      │ 2.515.000 VND │               │
   │ Ví VND của khách             │               │ 2.515.000 VND │
   └──────────────────────────────┴───────────────┴───────────────┘
   → Mỗi loại tiền cân bằng độc lập
   → Chênh lệch tỷ giá hiện rõ ở tài khoản quy đổi
```

**Thuật ngữ**: tài khoản này gọi là **FX position account** hoặc **currency exchange account**. Số dư của nó (sau khi quy đổi về một loại tiền chuẩn) chính là **lãi/lỗ tỷ giá**.

> **Đặc thù Việt Nam**: giao dịch ngoại tệ tại Việt Nam chịu quản lý chặt của pháp luật về quản lý ngoại hối. Không phải tổ chức nào cũng được phép cung cấp dịch vụ đổi ngoại tệ, và có quy định về việc niêm yết, thanh toán trên lãnh thổ Việt Nam phải bằng VND (trừ các trường hợp được phép). Nếu hệ thống của bạn xử lý ngoại tệ, phần này cần tư vấn pháp lý cụ thể — không tự suy diễn.

## Hiển thị khác với lưu trữ

```text
   Lưu trữ  : 2515000  (số nguyên, VND)
   Hiển thị : "2.515.000 ₫"  hoặc  "2,515,000 VND"  hoặc  "₫2,515,000"
```

Quy tắc: **định dạng hiển thị là việc của tầng giao diện**, không bao giờ trộn vào tầng dữ liệu.

Các khác biệt cần lưu ý khi hiển thị:

| Vùng | Dấu phân cách nghìn | Dấu thập phân | Vị trí ký hiệu |
|---|---|---|---|
| Việt Nam | `.` (chấm) | `,` (phẩy) | sau: `1.000,50 ₫` |
| Mỹ | `,` (phẩy) | `.` (chấm) | trước: `$1,000.50` |
| Nhiều nước châu Âu | `.` hoặc khoảng trắng | `,` | sau: `1 000,50 €` |

Sai sót kinh điển: hệ thống parse chuỗi `"1.000"` — ở Việt Nam là một nghìn, theo chuẩn Anh-Mỹ là một phẩy không. **Không bao giờ truyền tiền qua API dưới dạng chuỗi đã định dạng.** Luôn truyền số nguyên (đơn vị nhỏ nhất) kèm mã tiền tệ:

```text
   ĐÚNG:  { "amount": 2515000, "currency": "VND" }
   SAI:   { "amount": "2.515.000 ₫" }
   SAI:   { "amount": 2515000.00 }        ← số thực, có thể mất chính xác
```

## Kiểm tra làm tròn trong hệ thống

Ba phép kiểm tra nên có:

```text
   1. CÂN BẰNG SAU KHI CHIA
      Với mọi giao dịch có chia tỉ lệ:
      tổng các phần chia ra PHẢI BẰNG số tiền gốc.
      → Kiểm tra ngay trong code trước khi ghi sổ, không chờ đối soát.

   2. THEO DÕI TÀI KHOẢN CHÊNH LỆCH LÀM TRÒN
      Số dư tăng đều đặn theo một chiều = có chỗ làm tròn thiên lệch.
      Số dư dao động quanh 0 = bình thường.

   3. TÍNH LẠI ĐỘC LẬP
      Định kỳ tính lại một mẫu giao dịch bằng công thức gốc,
      so với số đã ghi. Lệch nghĩa là có lỗi làm tròn ở đâu đó.
   ```

Phép kiểm tra 1 là quan trọng nhất và rẻ nhất:

```text
   Trước khi ghi bút toán chia tiền:
   assert(phần_1 + phần_2 + ... + phần_n == tổng_gốc)

   Nếu sai → KHÔNG ghi sổ, ném lỗi, cảnh báo.
   Thà từ chối một giao dịch còn hơn làm lệch sổ cái.
```

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Làm tròn ở từng bước tính trung gian | Sai số tích luỹ, có thể lớn đáng kể |
| Tính mọi phần bằng phép nhân khi chia tỉ lệ | Tổng không khớp số gốc → sổ mất cân bằng |
| Dùng HALF_UP cho mọi thứ | Sai lệch tích luỹ theo một chiều |
| Không đặt kiểu làm tròn tường minh | Mỗi ngôn ngữ/database mặc định khác nhau → kết quả khác nhau |
| Quy đổi ngoại tệ mà không lưu tỷ giá và thời điểm | Không đối soát được, không giải thích được |
| Giả định `A→B→A = A` với ngoại tệ | Bỏ qua spread, tính sai |
| Trộn nhiều loại tiền trong một bút toán | Không kiểm tra cân bằng bằng máy được |
| Truyền tiền qua API dưới dạng chuỗi đã định dạng | Parse sai giữa các vùng ngôn ngữ |
| Dùng số thực trong JSON cho tiền | Mất chính xác khi qua các tầng |
| Không kiểm tra tổng sau khi chia | Lệch âm thầm hàng triệu lần |

## Tóm tắt bài 7

- **Làm tròn là bắt buộc** vì tiền có đơn vị nhỏ nhất, nhưng phép tính luôn sinh số lẻ.
- **Làm tròn một lần ở cuối**, giữ độ chính xác cao ở các bước trung gian.
- **HALF_EVEN (banker's rounding)** tránh sai lệch tích luỹ một chiều — nhưng kiểm tra quy định áp dụng, đừng chọn theo sở thích.
- **Đặt kiểu làm tròn tường minh** — mặc định của mỗi ngôn ngữ/database khác nhau.
- Khi chia tỉ lệ: tính n−1 phần bằng phép nhân, **phần cuối bằng phép trừ** để tổng luôn khớp.
- Bốn cách xử lý phần dư: **bên cuối nhận dư, tài khoản chênh lệch, round-robin, thiết kế tránh số lẻ**.
- Quy đổi ngoại tệ: luôn lưu **tỷ giá nào, nguồn nào, thời điểm nào**; và **không giả định A→B→A = A**.
- Sổ cái phải **cân bằng theo từng loại tiền tệ**, nối các loại tiền bằng tài khoản quy đổi.
- Truyền tiền qua API dưới dạng **số nguyên + mã tiền tệ**, không bao giờ dùng chuỗi đã định dạng hay số thực.
- **Kiểm tra tổng sau khi chia ngay trong code** — thà từ chối giao dịch còn hơn làm lệch sổ.

> **Hết phase 1.** Phase 2 (hệ sinh thái thanh toán), phase 3 (tín dụng), phase 4 (rủi ro & tuân thủ),
> phase 5 (case sự cố) và phase 6 (thiết kế hệ thống) đang được viết.

**Quay lại** → [Bài 6: Đối soát](06-doi-soat.md) · **Mục lục** → [README](../README.md) · **Tra thuật ngữ** → [Từ điển](../00-thuat-ngu.md)
