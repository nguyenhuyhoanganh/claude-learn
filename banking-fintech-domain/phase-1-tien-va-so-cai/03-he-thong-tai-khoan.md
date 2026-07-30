# Bài 3: Hệ thống tài khoản — thiết kế danh mục tài khoản cho fintech

## Sự cố mở đầu

Một cổng thanh toán thiết kế sổ cái với đúng ba tài khoản:

```text
   1. Tiền ngân hàng
   2. Ví khách hàng
   3. Doanh thu
```

Gọn gàng. Đủ dùng — trong sáu tháng đầu.

Rồi giám đốc tài chính hỏi những câu sau:

```text
   "Tháng này thu bao nhiêu phí từ giao dịch thẻ, bao nhiêu từ QR?"
   "Tiền đang kẹt ở đối tác NAPAS là bao nhiêu?"
   "Chúng ta đã hoàn cho khách bao nhiêu vì lỗi hệ thống?"
   "Số dư ví của khách chưa xác thực KYC là bao nhiêu?"
   "Trong 8,2 tỷ 'tiền ngân hàng', bao nhiêu ở VCB, bao nhiêu ở Techcombank?"
```

Không câu nào trả lời được, vì mọi thứ bị gộp vào ba cái "thùng" quá lớn.

Sửa lại lúc này rất đắt: phải phân loại lại hàng triệu bút toán lịch sử — và với nhiều bút toán, **thông tin để phân loại đã không còn tồn tại**.

Bài này dạy cách thiết kế **hệ thống tài khoản (chart of accounts)** cho đúng ngay từ đầu.

## Chart of accounts là gì

**Chart of accounts (CoA) — hệ thống tài khoản**: danh mục toàn bộ các "ngăn" trong sổ cái, kèm mã, tên, loại và quy tắc sử dụng.

Nó là **bộ khung phân loại** cho mọi đồng tiền chảy qua hệ thống. Thiết kế tốt thì mọi câu hỏi tài chính đều trả lời được bằng một câu truy vấn. Thiết kế tệ thì phải đọc log và đoán.

```text
   Mỗi tài khoản trả lời một câu hỏi:
   "Bao nhiêu tiền đang ở trạng thái/vị trí/mục đích NÀY?"
```

## Nguyên tắc 1: Tách theo câu hỏi bạn cần trả lời

Đây là nguyên tắc quan trọng nhất, và nó ngược với trực giác của lập trình viên.

Lập trình viên thường nghĩ: *"gộp lại cho gọn, cần thì lọc theo cột."*
Kế toán nghĩ: *"tách ra, vì mỗi tài khoản là một con số cần theo dõi độc lập."*

```text
   Câu hỏi bạn sẽ phải trả lời      →  Tài khoản riêng cần có
   ───────────────────────────────     ─────────────────────────
   "Phí thu từ thẻ là bao nhiêu?"   →  Doanh thu phí - Thẻ
   "Phí thu từ QR là bao nhiêu?"    →  Doanh thu phí - QR
   "Tiền ở VCB là bao nhiêu?"       →  Tiền gửi ngân hàng - VCB
   "Bồi thường lỗi hết bao nhiêu?"  →  Chi phí bồi thường khách hàng
   "Tiền kẹt ở NAPAS?"              →  Phải thu từ NAPAS
```

Cách kiểm tra thiết kế: viết ra **10 câu hỏi mà sếp/kế toán/thanh tra sẽ hỏi trong năm tới**. Nếu có câu nào không trả lời được bằng số dư của một tài khoản, hệ thống tài khoản còn thiếu.

## Nguyên tắc 2: Mã hoá phân cấp

Tài khoản được đánh mã theo cây, để vừa xem chi tiết vừa xem tổng hợp được:

```text
   1        TÀI SẢN
   11       └── Tiền
   111          └── Tiền mặt
   112          └── Tiền gửi ngân hàng
   1121              └── Tiền gửi VCB - Tài khoản đảm bảo
   1122              └── Tiền gửi VCB - Tài khoản hoạt động
   1123              └── Tiền gửi Techcombank - Tài khoản đảm bảo
   13       └── Phải thu
   131          └── Phải thu từ NAPAS
   132          └── Phải thu từ đối tác thẻ
   133          └── Phải thu từ merchant (tạm ứng)

   3        NỢ PHẢI TRẢ
   33       └── Phải trả khách hàng
   331          └── Số dư ví khách hàng - đã KYC
   332          └── Số dư ví khách hàng - chưa KYC
   333          └── Số dư ví bị phong toả
   334          └── Tiền chờ hoàn cho khách
   34       └── Phải trả merchant
   341          └── Tiền đã thu hộ, chưa quyết toán cho merchant

   5        DOANH THU
   51       └── Doanh thu phí dịch vụ
   511          └── Phí giao dịch thẻ
   512          └── Phí giao dịch QR
   513          └── Phí chuyển khoản
   514          └── Phí rút tiền
   52       └── Doanh thu tài chính
   521          └── Lãi tiền gửi

   6        CHI PHÍ
   64       └── Chi phí hoạt động
   641          └── Phí trả cho ngân hàng
   642          └── Phí trả cho NAPAS
   643          └── Chi phí bồi thường khách hàng
   644          └── Chi phí xử lý tranh chấp
```

Lợi ích: hỏi "tổng doanh thu phí dịch vụ" thì cộng mọi tài khoản bắt đầu bằng `51`. Hỏi chi tiết thì xem từng mã con.

> **Đặc thù Việt Nam**: Doanh nghiệp Việt Nam phải theo **hệ thống tài khoản kế toán do Bộ Tài chính ban hành** (Thông tư 200 cho doanh nghiệp lớn, Thông tư 133 cho doanh nghiệp nhỏ và vừa), với các nhóm đầu quy định sẵn: loại 1-2 là Tài sản, loại 3 là Nợ phải trả, loại 4 là Vốn chủ sở hữu, loại 5-7 là Doanh thu/Thu nhập, loại 6-8 là Chi phí.
>
> Điều này tạo ra một tình huống thực tế quan trọng: **hệ thống của bạn thường cần hai lớp tài khoản** — một lớp chi tiết phục vụ vận hành (bạn tự thiết kế), và một ánh xạ sang hệ thống tài khoản kế toán chính thức để lên báo cáo tài chính. Hãy thiết kế lớp chi tiết sao cho ánh xạ được, đừng để tới lúc quyết toán mới phát hiện không map được.

## Nguyên tắc 3: Mỗi khách hàng là một tài khoản (hoặc không)

Đây là quyết định thiết kế lớn, có hai trường phái:

### Cách A: Mỗi ví khách hàng là một tài khoản riêng trong sổ cái

```text
   331001  Ví khách hàng - Nguyễn Văn A
   331002  Ví khách hàng - Trần Thị B
   331003  Ví khách hàng - Lê Văn C
   ... (10 triệu tài khoản)
```

| Ưu | Nhược |
|---|---|
| Số dư từng khách là số dư tài khoản, tính trực tiếp | Bảng `accounts` khổng lồ (chục triệu dòng) |
| Hạch toán kép áp dụng đồng nhất | Báo cáo tổng hợp phải cộng hàng triệu tài khoản |
| Dễ kiểm toán từng khách | Hệ thống tài khoản kế toán truyền thống không thiết kế cho quy mô này |

### Cách B: Một tài khoản gộp + chiều phụ (dimension)

```text
   331  Số dư ví khách hàng      ← MỘT tài khoản duy nhất
        └── mỗi dòng bút toán có thêm trường `customer_id`
```

| Ưu | Nhược |
|---|---|
| Hệ thống tài khoản nhỏ gọn, đúng chuẩn kế toán | Số dư từng khách phải tính bằng cách lọc theo `customer_id` |
| Báo cáo tổng hợp nhanh | Cần index tốt và bảng số dư tính sẵn (bài 6) |

### Cách được dùng phổ biến nhất: kết hợp

```text
   SỔ CÁI KẾ TOÁN (dùng cho báo cáo tài chính)
   └── 331  Số dư ví khách hàng   =  8.200.000.000     ← tài khoản gộp

   SỔ PHỤ / SUBSIDIARY LEDGER (dùng cho vận hành)
   ├── Nguyễn Văn A : 1.500.000
   ├── Trần Thị B   : 2.300.000
   └── ...
        └── Tổng PHẢI bằng số dư tài khoản 331
```

**Thuật ngữ**: **subsidiary ledger** (sổ phụ / sổ chi tiết) là sổ ghi chi tiết cho một tài khoản tổng hợp. **Control account** (tài khoản kiểm soát) là tài khoản tổng hợp trên sổ cái chính.

Quy tắc bắt buộc: **tổng sổ phụ luôn phải khớp tài khoản kiểm soát**. Việc kiểm tra này chạy tự động hằng ngày — đây là một trong những chốt kiểm soát quan trọng nhất của hệ thống tài chính.

## Các tài khoản đặc biệt mà fintech nào cũng cần

Đây là danh sách những tài khoản mà đội kỹ thuật hay quên, và thiếu chúng thì sau này rất khó vá.

### 1. Tài khoản trung gian (suspense / clearing account)

**Suspense account — tài khoản treo/chờ xử lý**: nơi tạm ghi những khoản chưa biết phân loại vào đâu.

```text
   Tình huống: ngân hàng báo có 5.000.000đ vào tài khoản đảm bảo,
   nhưng nội dung chuyển khoản sai cú pháp, không biết của khách nào.

   ┌──────────────────────────────────────┬───────────┬───────────┐
   │ Tiền gửi ngân hàng (Tài sản)         │ 5.000.000 │           │
   │ Tài khoản treo chờ xử lý (Nợ p/trả)  │           │ 5.000.000 │
   └──────────────────────────────────────┴───────────┴───────────┘

   Sau khi xác định được là của anh A:
   ┌──────────────────────────────────────┬───────────┬───────────┐
   │ Tài khoản treo chờ xử lý             │ 5.000.000 │           │
   │ Ví khách hàng - A                    │           │ 5.000.000 │
   └──────────────────────────────────────┴───────────┴───────────┘
```

**Quy tắc vận hành**: số dư tài khoản treo phải được **rà soát hằng ngày** và về 0 càng nhanh càng tốt. Số dư treo lâu là dấu hiệu quy trình có vấn đề.

**Clearing account — tài khoản bù trừ**: dùng cho tiền đang trên đường giữa hai hệ thống.

```text
   Khách rút 500.000 về ngân hàng — quá trình mất 30 giây tới vài giờ:

   Bước 1 (ngay khi khách bấm rút):
   ┌──────────────────────────────────────┬───────────┬───────────┐
   │ Ví khách hàng - A                    │   500.000 │           │
   │ Tiền chờ chuyển đi (bù trừ)          │           │   500.000 │
   └──────────────────────────────────────┴───────────┴───────────┘

   Bước 2 (khi ngân hàng xác nhận đã chuyển thành công):
   ┌──────────────────────────────────────┬───────────┬───────────┐
   │ Tiền chờ chuyển đi (bù trừ)          │   500.000 │           │
   │ Tiền gửi ngân hàng                   │           │   500.000 │
   └──────────────────────────────────────┴───────────┴───────────┘
```

Nhờ tài khoản bù trừ, tại **mọi thời điểm** bạn biết chính xác có bao nhiêu tiền "đang trên đường". Không có nó, tiền sẽ biến mất khỏi ví khách mà chưa xuất hiện ở ngân hàng — nhìn như mất tiền.

### 2. Tài khoản phong toả

```text
   333  Số dư ví bị phong toả
```

Khi tiền bị giữ chỗ (mua hàng chờ giao, tranh chấp, yêu cầu cơ quan chức năng), nó **chuyển từ tài khoản khả dụng sang tài khoản phong toả** thay vì chỉ đánh dấu bằng một cờ.

```text
   ┌──────────────────────────────────────┬───────────┬───────────┐
   │ Ví khách hàng - A (khả dụng)         │   700.000 │           │
   │ Ví khách hàng - A (phong toả)        │           │   700.000 │
   └──────────────────────────────────────┴───────────┴───────────┘
```

Lợi ích: số dư khả dụng và số dư phong toả đều là **số dư tài khoản thật**, tính bằng cùng một cơ chế, không cần logic đặc biệt. Bài 4 nói kỹ.

### 3. Tài khoản chênh lệch đối soát

```text
   139  Chênh lệch đối soát chờ xử lý
```

Khi file đối soát từ đối tác lệch với sổ của bạn, khoản lệch đó phải **được ghi nhận ở đâu đó** trong lúc chờ điều tra — nếu không, sổ mất cân bằng. Bài 6 nói kỹ.

### 4. Tài khoản làm tròn

```text
   638  Chênh lệch làm tròn
```

Khi chia tiền cho nhiều bên mà không chia hết (ví dụ chia 1.000đ cho 3 bên), phần lẻ phải đi đâu đó. Bài 7 nói kỹ.

### 5. Tài khoản đối ứng cho hệ thống

```text
   Khi hệ thống tạo tiền "từ hư không" trong các nghiệp vụ hợp lệ:
   ├── Khuyến mãi, tặng điểm  → Chi phí marketing
   ├── Hoàn tiền do lỗi       → Chi phí bồi thường
   ├── Điều chỉnh thủ công    → Chi phí/Thu nhập khác
   └── Số dư mở đầu khi migrate hệ thống → Vốn/Số dư đầu kỳ
```

Không có các tài khoản này, nhân viên vận hành sẽ "sáng tạo" ra cách ghi — và sổ sẽ loạn.

## Bảng tổng hợp: hệ thống tài khoản tối thiểu cho một ví điện tử

| Mã | Tên | Loại | Ý nghĩa |
|---|---|---|---|
| 1121 | Tiền gửi NH - TK đảm bảo | Tài sản | Tiền thật giữ hộ khách |
| 1122 | Tiền gửi NH - TK hoạt động | Tài sản | Tiền của chính công ty |
| 131 | Phải thu từ đối tác thanh toán | Tài sản | Tiền đối tác chưa chuyển về |
| 138 | Tiền chờ chuyển đi (bù trừ) | Tài sản | Tiền đang trên đường ra |
| 139 | Chênh lệch đối soát chờ xử lý | Tài sản | Khoản lệch đang điều tra |
| 331 | Ví khách hàng - khả dụng | Nợ phải trả | Tiền khách dùng được |
| 333 | Ví khách hàng - phong toả | Nợ phải trả | Tiền khách bị giữ chỗ |
| 334 | Tiền chờ hoàn cho khách | Nợ phải trả | Đã duyệt hoàn, chưa chuyển |
| 338 | Tài khoản treo chờ xử lý | Nợ phải trả | Tiền chưa rõ chủ |
| 341 | Phải trả merchant | Nợ phải trả | Thu hộ, chưa quyết toán |
| 511-514 | Doanh thu phí (theo loại) | Doanh thu | Tách theo kênh để phân tích |
| 641-642 | Phí trả ngân hàng / đối tác | Chi phí | Chi phí đầu vào |
| 643 | Bồi thường khách hàng | Chi phí | Chỉ số chất lượng hệ thống |
| 638 | Chênh lệch làm tròn | Chi phí/Thu nhập | Phần lẻ không chia hết |

Khoảng 15-20 tài khoản là đủ để khởi động. Quan trọng là **có sẵn từ đầu**, vì thêm tài khoản mới thì dễ, còn phân loại lại lịch sử thì gần như không làm được.

## Kiểm tra sức khoẻ hệ thống tài khoản

Ba phép kiểm tra nên chạy tự động hằng ngày:

```text
   1. CÂN BẰNG TỔNG THỂ
      Tổng số dư mọi tài khoản Nợ = Tổng số dư mọi tài khoản Có
      → Lệch nghĩa là có bút toán không cân bằng lọt vào

   2. SỔ PHỤ KHỚP TÀI KHOẢN KIỂM SOÁT
      Tổng số dư mọi ví khách = Số dư tài khoản 331
      → Lệch nghĩa là có giao dịch ghi thiếu một bên

   3. TÀI SẢN ĐẢM BẢO ĐỦ CHE PHỦ
      Số dư TK 1121 (ngân hàng) + 131 (phải thu) + 138 (đang chuyển)
        ≥ Số dư 331 + 333 + 334 (tổng nợ với khách)
      → Nếu không đủ, công ty đang thiếu tiền để trả khách
```

Phép kiểm tra thứ 3 là chốt kiểm soát quan trọng nhất về mặt pháp lý và đạo đức. Nó phải có cảnh báo ngay lập tức nếu vi phạm.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Chỉ có 3-4 tài khoản "cho gọn" | Không trả lời được câu hỏi tài chính, sửa về sau rất đắt |
| Không có tài khoản bù trừ cho tiền đang chuyển | Tiền "biến mất" trong lúc chuyển, gây hoang mang |
| Không có tài khoản treo | Nhân viên tự ghi bừa vào tài khoản gần nhất |
| Không có tài khoản chênh lệch đối soát | Sổ mất cân bằng mỗi khi đối soát lệch |
| Gộp phí các kênh vào một tài khoản | Không biết kênh nào lời, kênh nào lỗ |
| Không tách tài khoản đảm bảo và tài khoản hoạt động | Vi phạm quy định tách bạch nguồn tiền |
| Không kiểm tra sổ phụ khớp tài khoản kiểm soát | Lệch tích luỹ âm thầm hàng tháng |
| Thiết kế không ánh xạ được sang hệ thống tài khoản kế toán chính thức | Không lên được báo cáo tài chính, phải làm thủ công |

## Tóm tắt bài 3

- **Chart of accounts** là bộ khung phân loại mọi đồng tiền. Thiết kế tốt = mọi câu hỏi tài chính trả lời được bằng một truy vấn.
- Nguyên tắc thiết kế: **tách tài khoản theo những câu hỏi bạn sẽ phải trả lời**, không phải theo cái gì gọn cho code.
- **Mã hoá phân cấp** để vừa xem chi tiết vừa tổng hợp được.
- Ví khách hàng: dùng **tài khoản kiểm soát + sổ phụ**, và kiểm tra hai bên khớp nhau hằng ngày.
- Bốn nhóm tài khoản đặc biệt hay bị quên: **treo (suspense), bù trừ (clearing), phong toả, chênh lệch đối soát/làm tròn**.
- Tài khoản bù trừ cho phép trả lời chính xác **"bao nhiêu tiền đang trên đường"** tại mọi thời điểm.
- Ba phép kiểm tra hằng ngày: **cân bằng tổng thể, sổ phụ khớp tài khoản kiểm soát, tài sản đủ che phủ nợ với khách**.
- Doanh nghiệp Việt Nam cần **ánh xạ được sang hệ thống tài khoản của Bộ Tài chính** — thiết kế điều này từ đầu.

**Bài kế tiếp** → [Bài 4: Số dư khả dụng, phong toả và giữ chỗ](04-so-du-kha-dung-va-phong-toa.md)
