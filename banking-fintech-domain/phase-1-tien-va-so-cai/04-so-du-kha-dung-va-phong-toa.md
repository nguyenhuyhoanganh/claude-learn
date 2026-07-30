# Bài 4: Số dư khả dụng, phong toả và giữ chỗ

## Sự cố mở đầu

Một ứng dụng đặt xe tích hợp ví điện tử. Luồng như sau:

```text
   1. Khách đặt chuyến, giá ước tính 120.000đ
   2. Hệ thống KIỂM TRA ví khách có đủ 120.000 không → có
   3. Tài xế nhận chuyến, chở khách
   4. Kết thúc chuyến, hệ thống TRỪ 120.000
```

Vấn đề xuất hiện ngay tuần đầu:

```text
   14:00  Khách đặt xe (ví có 130.000, đủ 120.000)  ✓
   14:05  Khách mở app khác, chuyển 100.000 cho bạn ✓ (ví còn 30.000)
   14:35  Chuyến kết thúc, hệ thống trừ 120.000
          → VÍ CHỈ CÒN 30.000 → TRỪ THẤT BẠI

   Tài xế đã chở xong. Không thu được tiền.
   Mỗi ngày mất hàng chục triệu.
```

Lỗi ở đâu? Ở việc **kiểm tra tiền và trừ tiền cách nhau 35 phút, mà không giữ chỗ khoản tiền đó**.

Bài này giải thích cơ chế **phong toả/giữ chỗ** — một trong những khái niệm nghiệp vụ quan trọng nhất mà lập trình viên hay bỏ qua.

## Ba loại số dư, nhắc lại chi tiết

```text
   ┌─────────────────────────────────────────────────────────────┐
   │ SỐ DƯ SỔ SÁCH (ledger balance / book balance / actual)      │
   │ Tổng mọi bút toán đã ghi nhận. Đây là "tiền thực sự có".    │
   ├─────────────────────────────────────────────────────────────┤
   │ SỐ DƯ ĐANG BỊ GIỮ (held / blocked / reserved)               │
   │ Tiền đã cam kết cho một giao dịch chưa hoàn tất.            │
   ├─────────────────────────────────────────────────────────────┤
   │ SỐ DƯ KHẢ DỤNG (available balance)                          │
   │ = Số dư sổ sách − Số dư đang bị giữ                         │
   │ Đây là con số dùng để QUYẾT ĐỊNH cho phép giao dịch mới.    │
   └─────────────────────────────────────────────────────────────┘
```

Ví dụ cụ thể:

```text
   Ví của anh A:
   ├── Số dư sổ sách       : 500.000
   ├── Đang giữ cho chuyến xe: 120.000
   └── SỐ DƯ KHẢ DỤNG      : 380.000   ← chỉ được tiêu tối đa từng này
```

**Quy tắc**: mọi quyết định "có đủ tiền không" phải dựa trên **số dư khả dụng**, không bao giờ dựa trên số dư sổ sách.

## Cơ chế giữ chỗ (hold / authorization)

**Hold — giữ chỗ / phong toả tạm**: đánh dấu một khoản tiền là "đã cam kết", làm giảm số dư khả dụng nhưng **chưa** trừ số dư sổ sách.

Vòng đời của một khoản giữ chỗ:

```text
   ┌──────────────┐
   │  TẠO GIỮ CHỖ │  Số dư khả dụng giảm. Sổ sách chưa đổi.
   └──────┬───────┘
          │
    ┌─────┴─────┬────────────────┬──────────────────┐
    ▼           ▼                ▼                  ▼
┌────────┐ ┌─────────┐  ┌──────────────┐  ┌────────────────┐
│ THU    │ │ HUỶ     │  │ THU MỘT PHẦN │  │ HẾT HẠN        │
│(capture)│ │(release)│  │(partial)     │  │(expire)        │
├────────┤ ├─────────┤  ├──────────────┤  ├────────────────┤
│Trừ thật│ │Trả lại  │  │Trừ phần thu, │  │Tự trả lại sau  │
│số tiền │ │khả dụng │  │trả lại phần dư│  │N ngày          │
└────────┘ └─────────┘  └──────────────┘  └────────────────┘
```

Áp dụng vào case đặt xe:

```text
   14:00  Đặt chuyến, giá ước tính 120.000
          → TẠO GIỮ CHỖ 120.000
          → Số dư khả dụng: 130.000 − 120.000 = 10.000

   14:05  Khách muốn chuyển 100.000 cho bạn
          → Kiểm tra số dư khả dụng: chỉ 10.000
          → TỪ CHỐI. Khách được báo "số dư không đủ"    ← ĐÚNG

   14:35  Chuyến kết thúc, cước thực tế 95.000 (ngắn hơn dự kiến)
          → THU MỘT PHẦN: trừ thật 95.000, trả lại 25.000
          → Số dư sổ sách: 130.000 − 95.000 = 35.000
          → Số dư khả dụng: 35.000
```

## Vì sao "giữ chỗ" khác "trừ luôn"

Câu hỏi hợp lý: *sao không trừ luôn 120.000 lúc đặt xe, rồi hoàn lại nếu thừa?*

| Tiêu chí | Giữ chỗ | Trừ luôn rồi hoàn |
|---|---|---|
| Số dư sổ sách của khách | Không đổi tới khi hoàn tất | Đổi hai lần |
| Sao kê của khách | Sạch, chỉ một dòng cuối | Rối: trừ 120k rồi hoàn 25k |
| Nếu hệ thống lỗi giữa chừng | Giữ chỗ hết hạn, tiền tự về | Tiền bị trừ mà không hoàn → khiếu nại |
| Kế toán | Chưa ghi nhận doanh thu (đúng) | Ghi nhận rồi lại đảo (rối) |
| Chi phí xử lý | 1 giao dịch tài chính | 2 giao dịch |

Với thẻ ngân hàng, chênh lệch còn lớn hơn: mỗi lần "trừ thật" là một giao dịch phải trả phí cho mạng thẻ, còn giữ chỗ thì không.

**Kết luận**: khi thời điểm biết số tiền chính xác **khác** thời điểm cần đảm bảo có tiền, luôn dùng giữ chỗ.

## Các tình huống bắt buộc phải giữ chỗ

```text
   ├── Đặt xe, giao đồ ăn      : giá ước tính, chốt sau
   ├── Đổ xăng tự động          : giữ 2.000.000, thu theo lượng thực
   ├── Đặt phòng khách sạn      : giữ tiền cọc, thu khi nhận phòng
   ├── Thuê xe                  : giữ tiền đặt cọc hư hỏng
   ├── Đặt hàng chờ giao        : giữ tiền tới khi giao thành công
   ├── Rút tiền                 : giữ tiền trong lúc chờ ngân hàng xác nhận
   └── Giao dịch chờ xác thực   : giữ trong lúc chờ OTP
```

Mẫu hình chung: **có khoảng thời gian giữa "cam kết" và "hoàn tất"**.

## Hai cách cài đặt giữ chỗ

### Cách A: Cột riêng trên bảng số dư

```text
   wallets
   ├── user_id
   ├── balance        500.000     ← số dư sổ sách
   └── held_amount    120.000     ← tổng đang giữ

   Số dư khả dụng = balance − held_amount
```

| Ưu | Nhược |
|---|---|
| Đơn giản, đọc nhanh | Không biết khoản giữ nào của giao dịch nào |
| | Khó xử lý hết hạn từng khoản riêng |
| | Vẫn cần bảng chi tiết các khoản giữ |

### Cách B: Chuyển giữa hai tài khoản trong sổ cái (khuyến nghị)

Như đã đề cập ở bài 3:

```text
   Tạo giữ chỗ 120.000:
   ┌──────────────────────────────────────┬───────────┬───────────┐
   │ Ví khách A - khả dụng (TK 331)       │   120.000 │           │
   │ Ví khách A - phong toả (TK 333)      │           │   120.000 │
   └──────────────────────────────────────┴───────────┴───────────┘

   Thu thật 95.000 và trả lại 25.000:
   ┌──────────────────────────────────────┬───────────┬───────────┐
   │ Ví khách A - phong toả (TK 333)      │   120.000 │           │
   │ Doanh thu / Phải trả tài xế          │           │    95.000 │
   │ Ví khách A - khả dụng (TK 331)       │           │    25.000 │
   └──────────────────────────────────────┴───────────┴───────────┘
```

| Ưu | Nhược |
|---|---|
| Số dư khả dụng và phong toả đều là **số dư tài khoản thật** | Nhiều bút toán hơn |
| Hạch toán kép áp dụng đồng nhất, luôn cân bằng | Cần hiểu kế toán |
| Kiểm toán được: biết chính xác tiền phong toả ở đâu | |
| Không cần logic đặc biệt để tính số dư khả dụng | |

Cách B là cách các hệ thống nghiêm túc dùng, vì nó không tạo ra "trạng thái ngoài sổ cái".

Dù chọn cách nào, vẫn cần một **bảng chi tiết các khoản giữ chỗ**:

```text
   holds
   ├── id
   ├── account_id       ví của ai
   ├── amount           số tiền giữ
   ├── reference        giao dịch nghiệp vụ nào (mã chuyến xe, mã đơn hàng)
   ├── status           ACTIVE | CAPTURED | RELEASED | EXPIRED
   ├── created_at
   └── expires_at       BẮT BUỘC PHẢI CÓ
```

## Hết hạn — trường bắt buộc mà ai cũng quên

Đây là bài học đắt giá nhất của bài này.

```text
   Nếu khoản giữ chỗ KHÔNG có thời hạn:

   Hệ thống lỗi giữa chừng / tài xế huỷ mà không báo / bug trong code
   → Khoản giữ 120.000 tồn tại VĨNH VIỄN
   → Khách hàng không tiêu được 120.000 của chính mình
   → Không ai biết vì sao
   → Khiếu nại, mất uy tín
```

Mọi khoản giữ chỗ **phải có `expires_at`**, và phải có tiến trình tự động giải phóng khoản đã hết hạn.

Thời hạn tham khảo trong ngành:

| Loại giao dịch | Thời hạn giữ chỗ điển hình |
|---|---|
| Đặt xe, giao đồ ăn | 1-4 giờ |
| Thanh toán thẻ thông thường | 7 ngày |
| Đổ xăng, khách sạn | 7-30 ngày |
| Thuê xe (cọc) | 30 ngày |
| Chờ xác thực OTP | 5-15 phút |

> **Lưu ý về thẻ ngân hàng**: khoản giữ chỗ trên thẻ (**authorization hold**) do **ngân hàng phát hành thẻ** quản lý, không phải bạn. Nếu merchant không thu tiền (capture) trong thời hạn, ngân hàng tự giải phóng. Nhưng thời hạn này **khác nhau giữa các ngân hàng**, và khách hàng thường không hiểu vì sao "tiền bị treo" — đây là nguồn khiếu nại rất phổ biến. Nếu bạn làm merchant, hãy capture hoặc huỷ (void) càng sớm càng tốt, đừng để hết hạn tự nhiên.

## Thu nhiều hơn số đã giữ

Tình huống thực tế: giữ 120.000 nhưng cước thực tế là 150.000 (khách đi đường vòng).

```text
   Ba cách xử lý, theo mức độ an toàn:

   1. CHỈ THU ĐÚNG SỐ ĐÃ GIỮ (120.000), phần chênh ghi nợ khách
      → An toàn nhất về mặt pháp lý, nhưng phải có cơ chế thu nợ

   2. THU THÊM từ số dư khả dụng còn lại
      → Cần kiểm tra khả dụng tại thời điểm thu, có thể không đủ

   3. GIỮ CHỖ DƯ RA TỪ ĐẦU (giữ 120% giá ước tính)
      → Phổ biến trong ngành xăng dầu, khách sạn
      → Nhược: giữ nhiều tiền của khách hơn cần thiết
```

Với thẻ ngân hàng, việc thu vượt quá số đã authorize thường **bị mạng thẻ từ chối** hoặc tạo rủi ro chargeback. Quy tắc an toàn: thu **không vượt quá** số đã giữ; phần chênh xử lý bằng một giao dịch mới.

## Nhiều khoản giữ chỗ trên cùng một ví

```text
   Ví anh A: số dư sổ sách 500.000
   ├── Giữ chỗ #1: chuyến xe        120.000
   ├── Giữ chỗ #2: đơn đồ ăn         85.000
   └── Giữ chỗ #3: mua vé xem phim  180.000
   ─────────────────────────────────────────
   Tổng giữ: 385.000
   Khả dụng: 500.000 − 385.000 = 115.000
```

Điểm kỹ thuật quan trọng: **việc tạo khoản giữ chỗ mới phải nguyên tử với việc kiểm tra số dư khả dụng**. Nếu không:

```text
   Hai request đồng thời, ví còn khả dụng 115.000:
   Request A: kiểm tra 100.000 ≤ 115.000  ✓
   Request B: kiểm tra 100.000 ≤ 115.000  ✓   (chưa thấy A)
   Cả hai cùng tạo giữ chỗ
   → Tổng giữ 585.000 > số dư 500.000  → SAI
```

Cách đảm bảo: khoá dòng ví khi kiểm tra và tạo giữ chỗ trong cùng một transaction, hoặc dùng câu lệnh có điều kiện để database tự chặn. Phase-5 bài 4 và phase-6 bài 2 sẽ nói kỹ.

## Phong toả theo yêu cầu pháp lý — khác với giữ chỗ

Đừng nhầm hai khái niệm:

| | Giữ chỗ (hold/authorization) | Phong toả pháp lý (freeze/legal block) |
|---|---|---|
| Ai tạo | Hệ thống, tự động theo giao dịch | Bộ phận tuân thủ, cơ quan chức năng |
| Có thời hạn | Có, tự hết hạn | Không, tới khi có lệnh gỡ |
| Khách có biết | Có, gắn với giao dịch cụ thể | Thường **không được thông báo lý do** |
| Phạm vi | Một khoản tiền cụ thể | Có thể toàn bộ tài khoản |
| Gỡ bởi | Hệ thống | Chỉ người có thẩm quyền, có phê duyệt |

> **Đặc thù Việt Nam**: việc phong toả tài khoản theo yêu cầu cơ quan có thẩm quyền được quy định trong pháp luật về phòng chống rửa tiền và các văn bản liên quan. Hệ thống phải hỗ trợ: phong toả toàn bộ hoặc một phần, ghi nhận căn cứ pháp lý, người thực hiện, và **không cho phép bất kỳ ai gỡ mà không qua quy trình phê duyệt**. Mọi thao tác phải nằm trong audit trail (phase-4 bài 5).

Vì sự khác biệt này, nên có **tài khoản riêng** cho hai loại:

```text
   333  Ví khách hàng - phong toả do giao dịch (hold)
   335  Ví khách hàng - phong toả theo yêu cầu pháp lý
```

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Kiểm tra số dư rồi trừ tiền sau, không giữ chỗ | Không thu được tiền dù đã cung cấp dịch vụ |
| Dùng số dư sổ sách để quyết định cho phép giao dịch | Cho tiêu tiền đang bị giữ → số dư âm |
| Khoản giữ chỗ không có thời hạn | Tiền khách bị treo vĩnh viễn |
| Không có tiến trình tự giải phóng khoản hết hạn | Như trên |
| Kiểm tra khả dụng và tạo giữ chỗ không nguyên tử | Tổng giữ vượt số dư thật |
| Thu vượt quá số đã giữ chỗ | Bị từ chối, hoặc rủi ro tranh chấp |
| Gộp phong toả pháp lý và giữ chỗ giao dịch làm một | Gỡ nhầm phong toả pháp lý — hậu quả nghiêm trọng |
| Không hiển thị rõ cho khách vì sao tiền bị giữ | Khiếu nại, mất niềm tin |

## Tóm tắt bài 4

- **Ba số dư khác nhau**: sổ sách, đang giữ, khả dụng. Mọi quyết định cho phép giao dịch dựa trên **số dư khả dụng**.
- **Giữ chỗ (hold)** làm giảm khả dụng nhưng chưa đổi sổ sách — dùng khi thời điểm cam kết khác thời điểm biết số tiền chính xác.
- Vòng đời khoản giữ: **tạo → thu (capture) / huỷ (release) / thu một phần / hết hạn**.
- Cách cài đặt tốt nhất: **chuyển tiền giữa tài khoản khả dụng và tài khoản phong toả trong sổ cái**, không dùng cờ đánh dấu.
- **`expires_at` là trường bắt buộc**, kèm tiến trình tự động giải phóng — thiếu nó thì tiền khách bị treo vĩnh viễn.
- **Kiểm tra khả dụng và tạo giữ chỗ phải nguyên tử**, nếu không tổng giữ sẽ vượt số dư thật.
- **Phong toả pháp lý khác hẳn giữ chỗ giao dịch** — tách tài khoản riêng, có quy trình phê duyệt và audit trail.

**Bài kế tiếp** → [Bài 5: Vòng đời một giao dịch — từ khởi tạo tới đối soát](05-vong-doi-giao-dich.md)
